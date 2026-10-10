// "Ready for 31 January?" reminder pushes (2 Oct 2026).
//
// Four pushes across the Self Assessment season, each naming the driver's
// own biggest gap for the tax year the deadline is for:
//
//   1 December   (61 days to go)
//   2 January    (29 days; the 1 January SA deadline EMAIL goes the day before)
//   20 January   (11 days)
//   29 January   (2 days)
//
//   "Self Assessment: 29 days to go"
//   "You've 37 trips from last tax year still unclassified. Sort them so
//    every business mile counts before 31 January."
//
// Every push opens the "Ready for 31 January?" checklist
// (data.action = open_sa_checklist; older app builds fall through to the
// dashboard, which carries the same checklist card in season).
//
// Respect, in code:
//   - work-mode drivers only: dashboardMode "personal" and workType
//     "employee" are never sent one;
//   - the taxDeadline push preference turns it off (the same switch as the
//     app's own "tax deadline" reminder);
//   - only drivers with something in that tax year (a business mile or an
//     unsorted trip) and something still to do; a finished list gets nothing;
//   - one push per stage per driver (deduped on the sent event), 18:00 UK,
//     outside quiet hours.
//
// Gate: SA_COUNTDOWN_PUSH. Nothing sends unless it is exactly "1". Unset, the
// job still runs in its windows as a DRY RUN: it logs how many it would send
// and three sample bodies, writes no events and sends nothing.

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { pushPrefEnabled } from "../services/pushPrefs.js";
import { logEvent } from "../services/appEvents.js";
import { SA_WALKTHROUGH_EVENT } from "../services/saChecklist.js";
import {
  parseTaxYear,
  saReturnTaxYear,
  daysUntilSaDeadline,
  ukDateParts,
  type UkDateParts,
} from "@mileclear/shared";

export const SA_COUNTDOWN_PUSH_EVENT = "notification.sa_countdown";
export const SA_COUNTDOWN_OPENED_EVENT = "notification.sa_countdown_opened";
export const SA_COUNTDOWN_ACTION = "open_sa_checklist";

/** UK calendar dates (1 = January) the reminders go out, at PUSH_HOUR. */
export const SA_COUNTDOWN_STAGES = [
  { id: "dec01", month: 12, day: 1 },
  { id: "jan02", month: 1, day: 2 },
  { id: "jan20", month: 1, day: 20 },
  { id: "jan29", month: 1, day: 29 },
] as const;
export type SaCountdownStageId = (typeof SA_COUNTDOWN_STAGES)[number]["id"];

/** 18:00 to 18:59 UK: early evening, before the 19:00 Sunday classify nudge
 *  and the 20:30 evening digest, well clear of quiet hours. */
export const SA_COUNTDOWN_PUSH_HOUR = 18;

const DAY_MS = 24 * 60 * 60 * 1000;
const ID_CHUNK = 1000;

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

export function saCountdownPushEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SA_COUNTDOWN_PUSH === "1";
}

/** The stage due right now, or null outside every window. */
export function dueStage(p: Pick<UkDateParts, "month" | "day" | "hour">): SaCountdownStageId | null {
  if (p.hour !== SA_COUNTDOWN_PUSH_HOUR) return null;
  return SA_COUNTDOWN_STAGES.find((s) => s.month === p.month && s.day === p.day)?.id ?? null;
}

/** A stage is keyed by tax year too, so 1 December 2027 is never mistaken
 *  for 1 December 2026's send. */
export function stageKey(taxYear: string, stage: SaCountdownStageId): string {
  return `${taxYear}:${stage}`;
}

export type SaGap =
  | { kind: "unclassified"; trips: number }
  | { kind: "no_earnings" }
  | { kind: "full_name" }
  | { kind: "walkthrough" };

export interface SaPushCandidate {
  hasPushToken: boolean;
  pushPrefs: Prisma.JsonValue | null | undefined;
  dashboardMode: string;
  workType: string;
  unclassifiedTrips: number;
  businessMiles: number;
  earningsCount: number;
  hasFullName: boolean;
  walkthroughOpened: boolean;
  alreadySent: boolean;
}

export type SaPushSkip =
  | "personal_mode"
  | "employee"
  | "no_token"
  | "pref_off"
  | "nothing_logged"
  | "already_sent"
  | "all_done";

export type SaPushDecision = { send: true; gap: SaGap } | { send: false; reason: SaPushSkip };

/** The biggest gap first: unsorted trips cost a driver money, then missing
 *  earnings, then the name on the summary, then the walkthrough. */
export function pickGap(c: Pick<SaPushCandidate, "unclassifiedTrips" | "earningsCount" | "hasFullName" | "walkthroughOpened">): SaGap | null {
  if (c.unclassifiedTrips > 0) return { kind: "unclassified", trips: c.unclassifiedTrips };
  if (c.earningsCount === 0) return { kind: "no_earnings" };
  if (!c.hasFullName) return { kind: "full_name" };
  if (!c.walkthroughOpened) return { kind: "walkthrough" };
  return null;
}

export function decideSaCountdownPush(c: SaPushCandidate): SaPushDecision {
  if (c.dashboardMode === "personal") return { send: false, reason: "personal_mode" };
  if (c.workType === "employee" || c.workType === "company") return { send: false, reason: "employee" };
  if (!c.hasPushToken) return { send: false, reason: "no_token" };
  if (!pushPrefEnabled(c.pushPrefs, "taxDeadline")) return { send: false, reason: "pref_off" };
  if (c.businessMiles <= 0 && c.unclassifiedTrips === 0) return { send: false, reason: "nothing_logged" };
  if (c.alreadySent) return { send: false, reason: "already_sent" };
  const gap = pickGap(c);
  if (!gap) return { send: false, reason: "all_done" };
  return { send: true, gap };
}

export function buildSaCountdownTitle(days: number): string {
  if (days <= 0) return "Self Assessment: deadline today";
  return `Self Assessment: ${days} ${days === 1 ? "day" : "days"} to go`;
}

export function buildSaCountdownBody(gap: SaGap, taxYear: string): string {
  switch (gap.kind) {
    case "unclassified": {
      const n = gap.trips;
      return n === 1
        ? "You've 1 trip from last tax year still unclassified. Sort it so every business mile counts before 31 January."
        : `You've ${n.toLocaleString("en-GB")} trips from last tax year still unclassified. Sort them so every business mile counts before 31 January.`;
    }
    case "no_earnings":
      return `Your ${taxYear} earnings aren't logged yet. Your return needs your total takings, so add them from your platform statements.`;
    case "full_name":
      return `Add your full name so it prints on your ${taxYear} Self Assessment summary.`;
    case "walkthrough":
      return `Your ${taxYear} figures are in. See which box on your return each one goes in.`;
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export interface SaPushPlanItem {
  userId: string;
  pushToken: string;
  gap: SaGap;
}

export interface SaPushPlan {
  taxYear: string;
  daysToDeadline: number;
  send: SaPushPlanItem[];
  considered: number;
  skipped: Record<SaPushSkip, number>;
}

/** Selection only, no side effects. All aggregate queries. */
export async function planSaCountdownPushes(stage: SaCountdownStageId, now: Date = new Date()): Promise<SaPushPlan> {
  const taxYear = saReturnTaxYear(now);
  const { start, end } = parseTaxYear(taxYear);
  const key = stageKey(taxYear, stage);
  const skipped: Record<SaPushSkip, number> = {
    personal_mode: 0,
    employee: 0,
    no_token: 0,
    pref_off: 0,
    nothing_logged: 0,
    already_sent: 0,
    all_done: 0,
  };

  // Work-mode drivers with a push token. Personal-mode and employee
  // accounts are filtered here rather than counted, to keep the read small.
  const users = await prisma.user.findMany({
    where: {
      pushToken: { not: null },
      dashboardMode: { in: ["work", "both"] },
      workType: { notIn: ["employee", "company"] },
    },
    select: { id: true, pushToken: true, pushPrefs: true, dashboardMode: true, workType: true, fullName: true },
  });
  const eligible = users.filter((u) => {
    if (pushPrefEnabled(u.pushPrefs, "taxDeadline")) return true;
    skipped.pref_off++;
    return false;
  });

  const unclassified = new Map<string, number>();
  const businessMiles = new Map<string, number>();
  const earnings = new Map<string, number>();
  const walkthrough = new Set<string>();

  for (const ids of chunks(eligible.map((u) => u.id), ID_CHUNK)) {
    const [trips, earn, walk] = await Promise.all([
      prisma.trip.groupBy({
        by: ["userId", "classification"],
        where: {
          userId: { in: ids },
          isPhantomTrip: false,
          classification: { in: ["business", "unclassified"] },
          startedAt: { gte: start, lte: end },
        },
        _sum: { distanceMiles: true },
        _count: { _all: true },
      }),
      prisma.earning.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, periodStart: { gte: start }, periodEnd: { lte: end } },
        _count: { _all: true },
      }),
      prisma.appEvent.findMany({
        where: { type: SA_WALKTHROUGH_EVENT, userId: { in: ids }, createdAt: { gte: start } },
        select: { userId: true, metadata: true },
      }),
    ]);
    for (const t of trips) {
      if (t.classification === "unclassified") unclassified.set(t.userId, t._count._all);
      else businessMiles.set(t.userId, t._sum.distanceMiles ?? 0);
    }
    for (const e of earn) earnings.set(e.userId, e._count._all);
    for (const w of walk) {
      const m = w.metadata as { taxYear?: unknown } | null;
      if (w.userId && m && typeof m === "object" && m.taxYear === taxYear) walkthrough.add(w.userId);
    }
  }

  // Sends for this stage. 60 days covers the whole season.
  const sentRows = await prisma.appEvent.findMany({
    where: { type: SA_COUNTDOWN_PUSH_EVENT, createdAt: { gte: new Date(now.getTime() - 60 * DAY_MS) } },
    select: { userId: true, metadata: true },
  });
  const alreadySent = new Set<string>();
  for (const r of sentRows) {
    const m = r.metadata as { key?: unknown } | null;
    if (r.userId && m && typeof m === "object" && m.key === key) alreadySent.add(r.userId);
  }

  const send: SaPushPlanItem[] = [];
  for (const u of eligible) {
    const decision = decideSaCountdownPush({
      hasPushToken: !!u.pushToken,
      pushPrefs: u.pushPrefs,
      dashboardMode: u.dashboardMode,
      workType: u.workType,
      unclassifiedTrips: unclassified.get(u.id) ?? 0,
      businessMiles: businessMiles.get(u.id) ?? 0,
      earningsCount: earnings.get(u.id) ?? 0,
      hasFullName: !!u.fullName?.trim(),
      walkthroughOpened: walkthrough.has(u.id),
      alreadySent: alreadySent.has(u.id),
    });
    if (decision.send) send.push({ userId: u.id, pushToken: u.pushToken!, gap: decision.gap });
    else skipped[decision.reason]++;
  }

  return { taxYear, daysToDeadline: daysUntilSaDeadline(now, taxYear), send, considered: users.length, skipped };
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

// Runs on the 30-minute windowed tick, so a dry run would log twice per
// window. Live sends are deduped on the sent events; this only quiets the log.
let lastDryRunKey: string | null = null;

export async function runSaCountdownRemindersJob(now: Date = new Date()): Promise<void> {
  const stage = dueStage(ukDateParts(now));
  if (!stage) return;
  const live = saCountdownPushEnabled();
  const taxYear = saReturnTaxYear(now);
  const key = stageKey(taxYear, stage);
  if (!live && lastDryRunKey === key) return;

  const plan = await planSaCountdownPushes(stage, now);
  const title = buildSaCountdownTitle(plan.daysToDeadline);
  const skips = Object.entries(plan.skipped)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");

  if (!live) {
    lastDryRunKey = key;
    const samples = plan.send
      .slice(0, 3)
      .map((s) => `${s.userId.slice(0, 8)}: ${buildSaCountdownBody(s.gap, plan.taxYear)}`)
      .join(" | ");
    console.log(
      `[jobs/saCountdown] DRY RUN ${key}: would send ${plan.send.length} "${title}" ` +
        `(work-mode drivers with a token ${plan.considered}; skipped ${skips}). Samples: ${samples || "none"}`
    );
    return;
  }

  const messages: ExpoPushMessage[] = plan.send.map((s) => ({
    to: s.pushToken,
    title,
    body: buildSaCountdownBody(s.gap, plan.taxYear),
    sound: "default",
    data: { type: "sa_countdown", action: SA_COUNTDOWN_ACTION, stage, taxYear: plan.taxYear },
  }));
  // Log before sending so a crash mid-send cannot lead to a second push on
  // the next tick (the dedup reads these rows).
  for (const s of plan.send) {
    logEvent(SA_COUNTDOWN_PUSH_EVENT, s.userId, { key, stage, taxYear: plan.taxYear, gap: s.gap.kind });
  }
  if (messages.length > 0) await sendPushNotifications(messages);
  console.log(`[jobs/saCountdown] ${key}: sent ${messages.length} (skipped ${skips}).`);
}
