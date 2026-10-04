// Tax payment reminder pushes (4 Oct 2026), from the tax bill planner.
//
// 14 days and 3 days before each Self Assessment payment date (31 January,
// 31 July), at 12:00 UK, to drivers whose planner shows money due that day:
//
//   "Tax payment due 31 January"
//   "MileClear estimates about £4,500: the balancing payment for 2025-26
//    and your first payment on account for 2026-27. See your plan."
//
// Every push opens the planner (data.action = open_tax_planner; older app
// builds fall through to the dashboard, which has the Tax Readiness card).
//
// Respect, in code:
//   - work-mode drivers only: dashboardMode "personal" and workType
//     "employee" are never sent one;
//   - the taxDeadline push preference turns it off (the same switch as the
//     other tax deadline reminders; on unless the driver turned it off,
//     like every taxDeadline reminder);
//   - only when the planner's payment for that date is known and above £0
//     (an unknown is never pushed as a figure);
//   - one push per stage per driver (deduped on the sent event), outside
//     quiet hours.
//
// Gate: TAX_PAYMENT_PUSH. Nothing sends unless it is exactly "1". Unset, the
// job still runs in its windows as a DRY RUN: it logs how many it would send
// and three sample bodies, writes no events and sends nothing. Same pattern
// as the SA countdown (jobs/saCountdownReminders.ts).

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { pushPrefEnabled } from "../services/pushPrefs.js";
import { isPushQuietHours } from "../services/pushQuietHoursRule.js";
import { logEvent } from "../services/appEvents.js";
import { loadTaxPlan } from "../services/taxPlanner.js";
import { shiftTaxYear, taxYearOfDay } from "../services/taxPlannerMath.js";
import { formatPence, parseTaxYear, ukDateParts, type TaxPlannerPayment, type UkDateParts } from "@mileclear/shared";

export const TAX_PAYMENT_PUSH_EVENT = "notification.tax_payment";
export const TAX_PAYMENT_ACTION = "open_tax_planner";

/** Days before a payment date the reminders go. */
export const TAX_PAYMENT_LEAD_DAYS = [14, 3] as const;
/** 12:00 to 12:59 UK: clear of the 18:00 SA countdown and quiet hours. */
export const TAX_PAYMENT_PUSH_HOUR = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
const ID_CHUNK = 1000;
/** Plans are a dozen queries each; a few at a time keeps the pool free. */
const PLAN_CONCURRENCY = 4;

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

export function taxPaymentPushEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TAX_PAYMENT_PUSH === "1";
}

export interface TaxPaymentStage {
  /** "2027-01-31" */
  dueDate: string;
  leadDays: (typeof TAX_PAYMENT_LEAD_DAYS)[number];
}

/** The stage due right now (UK date + hour), or null outside every window.
 *  17 and 28 January / July at 12:00. */
export function dueTaxPaymentStage(p: Pick<UkDateParts, "year" | "month" | "day" | "hour">): TaxPaymentStage | null {
  if (p.hour !== TAX_PAYMENT_PUSH_HOUR) return null;
  if (p.month !== 1 && p.month !== 7) return null;
  for (const leadDays of TAX_PAYMENT_LEAD_DAYS) {
    if (p.day === 31 - leadDays) {
      return { dueDate: `${p.year}-${String(p.month).padStart(2, "0")}-31`, leadDays };
    }
  }
  return null;
}

export function stageKey(stage: TaxPaymentStage): string {
  return `${stage.dueDate}:${stage.leadDays}`;
}

export interface TaxPaymentCandidate {
  hasPushToken: boolean;
  pushPrefs: Prisma.JsonValue | null | undefined;
  dashboardMode: string;
  workType: string;
  alreadySent: boolean;
  /** The planner's payment for the stage's date, if it lists one. */
  payment: TaxPlannerPayment | null;
}

export type TaxPaymentSkip =
  | "personal_mode"
  | "employee"
  | "no_token"
  | "pref_off"
  | "already_sent"
  | "unknown_amount"
  | "nothing_due";

export type TaxPaymentDecision = { send: true; amountPence: number } | { send: false; reason: TaxPaymentSkip };

export function decideTaxPaymentPush(c: TaxPaymentCandidate): TaxPaymentDecision {
  if (c.dashboardMode === "personal") return { send: false, reason: "personal_mode" };
  if (c.workType === "employee") return { send: false, reason: "employee" };
  if (!c.hasPushToken) return { send: false, reason: "no_token" };
  if (!pushPrefEnabled(c.pushPrefs, "taxDeadline")) return { send: false, reason: "pref_off" };
  if (c.alreadySent) return { send: false, reason: "already_sent" };
  if (!c.payment || c.payment.amountPence == null) return { send: false, reason: "unknown_amount" };
  if (c.payment.amountPence <= 0) return { send: false, reason: "nothing_due" };
  return { send: true, amountPence: c.payment.amountPence };
}

/** "31 January" from "2027-01-31". */
function dayMonth(dueDate: string): string {
  return dueDate.slice(5, 7) === "01" ? "31 January" : "31 July";
}

export function buildTaxPaymentTitle(stage: TaxPaymentStage): string {
  return stage.leadDays === 3
    ? `Tax payment due in 3 days`
    : `Tax payment due ${dayMonth(stage.dueDate)}`;
}

/** Plain list of what the payment is for, from its non-zero parts. */
export function describeParts(payment: TaxPlannerPayment): string {
  const lines = payment.parts
    .filter((p) => (p.amountPence ?? 0) > 0)
    .map((p) => {
      if (p.kind === "balancing") return `the balancing payment for ${p.taxYear}`;
      if (p.kind === "poa1") return `your first payment on account for ${p.taxYear}`;
      return `your second payment on account for ${p.taxYear}`;
    });
  return lines.join(" and ");
}

export function buildTaxPaymentBody(payment: TaxPlannerPayment, stage: TaxPaymentStage): string {
  const amount = formatPence(payment.amountPence ?? 0);
  const what = describeParts(payment);
  const when = stage.leadDays === 3 ? ` on ${dayMonth(stage.dueDate)}` : "";
  return `MileClear estimates about ${amount}${when}: ${what}. See your plan.`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export interface TaxPaymentPlanItem {
  userId: string;
  pushToken: string;
  payment: TaxPlannerPayment;
}

export interface TaxPaymentPushPlan {
  send: TaxPaymentPlanItem[];
  considered: number;
  skipped: Record<TaxPaymentSkip, number>;
}

/** Selection only, no side effects. */
export async function planTaxPaymentPushes(stage: TaxPaymentStage, now: Date = new Date()): Promise<TaxPaymentPushPlan> {
  const key = stageKey(stage);
  const skipped: Record<TaxPaymentSkip, number> = {
    personal_mode: 0,
    employee: 0,
    no_token: 0,
    pref_off: 0,
    already_sent: 0,
    unknown_amount: 0,
    nothing_due: 0,
  };

  const users = await prisma.user.findMany({
    where: {
      pushToken: { not: null },
      dashboardMode: { in: ["work", "both"] },
      workType: { not: "employee" },
    },
    select: { id: true, pushToken: true, pushPrefs: true, dashboardMode: true, workType: true, taxPlanner: true },
  });
  const eligible = users.filter((u) => {
    if (pushPrefEnabled(u.pushPrefs, "taxDeadline")) return true;
    skipped.pref_off++;
    return false;
  });

  // Only drivers with something to plan from: earnings in the planner's
  // three tax years, or a bill they typed in. Everyone else would come out
  // "unknown" anyway, so skip the dozen queries a plan costs.
  const p = ukDateParts(now);
  const current = taxYearOfDay({ year: p.year, month: p.month, day: p.day });
  const since = parseTaxYear(shiftTaxYear(current, -2)).start;
  const withEarnings = new Set<string>();
  for (const ids of chunks(eligible.map((u) => u.id), ID_CHUNK)) {
    const rows = await prisma.earning.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, periodStart: { gte: since } },
      _count: { _all: true },
    });
    for (const r of rows) withEarnings.add(r.userId);
  }
  const plannable = eligible.filter((u) => {
    if (withEarnings.has(u.id) || u.taxPlanner != null) return true;
    skipped.unknown_amount++;
    return false;
  });

  // Sends for this stage. 30 days covers both lead days.
  const sentRows = await prisma.appEvent.findMany({
    where: { type: TAX_PAYMENT_PUSH_EVENT, createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
    select: { userId: true, metadata: true },
  });
  const alreadySent = new Set<string>();
  for (const r of sentRows) {
    const m = r.metadata as { key?: unknown } | null;
    if (r.userId && m && typeof m === "object" && m.key === key) alreadySent.add(r.userId);
  }

  const send: TaxPaymentPlanItem[] = [];
  for (const batch of chunks(plannable, PLAN_CONCURRENCY)) {
    const plans = await Promise.all(
      batch.map((u) => (alreadySent.has(u.id) ? Promise.resolve(null) : loadTaxPlan(u.id, now).catch(() => null)))
    );
    batch.forEach((u, i) => {
      const payment = plans[i]?.payments.find((pm) => pm.dueDate === stage.dueDate) ?? null;
      const decision = decideTaxPaymentPush({
        hasPushToken: !!u.pushToken,
        pushPrefs: u.pushPrefs,
        dashboardMode: u.dashboardMode,
        workType: u.workType,
        alreadySent: alreadySent.has(u.id),
        payment,
      });
      if (decision.send && payment) send.push({ userId: u.id, pushToken: u.pushToken!, payment });
      else if (!decision.send) skipped[decision.reason]++;
    });
  }

  return { send, considered: users.length, skipped };
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

// Runs on the 30-minute windowed tick, so a dry run would log twice per
// window. Live sends are deduped on the sent events; this only quiets the log.
let lastDryRunKey: string | null = null;

export async function runTaxPaymentRemindersJob(now: Date = new Date()): Promise<void> {
  const stage = dueTaxPaymentStage(ukDateParts(now));
  if (!stage) return;
  // Never log a send that lib/push.ts would then drop for quiet hours.
  if (isPushQuietHours(now)) return;
  const live = taxPaymentPushEnabled();
  const key = stageKey(stage);
  if (!live && lastDryRunKey === key) return;

  const plan = await planTaxPaymentPushes(stage, now);
  const title = buildTaxPaymentTitle(stage);
  const skips = Object.entries(plan.skipped)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");

  if (!live) {
    lastDryRunKey = key;
    const samples = plan.send
      .slice(0, 3)
      .map((s) => `${s.userId.slice(0, 8)}: ${buildTaxPaymentBody(s.payment, stage)}`)
      .join(" | ");
    console.log(
      `[jobs/taxPayment] DRY RUN ${key}: would send ${plan.send.length} "${title}" ` +
        `(work-mode drivers with a token ${plan.considered}; skipped ${skips}). Samples: ${samples || "none"}`
    );
    return;
  }

  const messages: ExpoPushMessage[] = plan.send.map((s) => ({
    to: s.pushToken,
    title,
    body: buildTaxPaymentBody(s.payment, stage),
    sound: "default",
    data: { type: "tax_payment", action: TAX_PAYMENT_ACTION, dueDate: stage.dueDate, leadDays: stage.leadDays },
  }));
  // Log before sending so a crash mid-send cannot lead to a second push on
  // the next tick (the dedup reads these rows).
  for (const s of plan.send) {
    logEvent(TAX_PAYMENT_PUSH_EVENT, s.userId, {
      key,
      dueDate: stage.dueDate,
      leadDays: stage.leadDays,
      amountPence: s.payment.amountPence,
    });
  }
  if (messages.length > 0) await sendPushNotifications(messages);
  console.log(`[jobs/taxPayment] ${key}: sent ${messages.length} (skipped ${skips}).`);
}
