// Quarterly update deadline reminders (Making Tax Digital, Oct 2026).
//
// For drivers who have connected HMRC (an active connection with a NINO and
// a business chosen): a push and an email 7 days and 1 day before each
// quarterly deadline, while HMRC still shows that quarter open.
//
//   quarter 6 Apr - 5 Jul  -> due 7 Aug
//   quarter 6 Jul - 5 Oct  -> due 7 Nov
//   quarter 6 Oct - 5 Jan  -> due 7 Feb
//   quarter 6 Jan - 5 Apr  -> due 7 May
//
// The due date comes from HMRC's own obligations, not from that table, so a
// driver whose dates differ is reminded on their dates.
//
// "Still open" without calling HMRC: a background job cannot call HMRC for a
// driver, because every MTD call must carry that driver's real phone in the
// fraud-prevention headers. So the job reads the last obligations HMRC showed
// the driver (hmrc.obligations_seen, written whenever the app loads them), and
// treats a quarter as done once HMRC said Fulfilled or once MileClear has a
// successful update covering the quarter's end (hmrc.submission, ok, same tax
// year, period end on or after the quarter's end: updates are cumulative).
// A driver who has never loaded their obligations gets no reminder.
//
// Respect, in code:
//   - HMRC_ENVIRONMENT must be "production" AND the connection must be a
//     production one: sandbox drivers are never reminded about test deadlines;
//   - the push honours the taxDeadline push preference;
//   - the email is sent gated (marketing opt-out + unsubscribe footer), like
//     the Self Assessment deadline email;
//   - once per driver, per quarter, per reminder (7 days, 1 day), per channel,
//     deduped on the sent events; logged before sending so a crash mid-send
//     cannot send twice.
//
// Runs on the 30-minute windowed tick and only does anything 10:00-10:59 UK.

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { pushPrefEnabled } from "../services/pushPrefs.js";
import { logEvent } from "../services/appEvents.js";
import { sendMtdQuarterlyReminderEmail } from "../services/email.js";
import { HMRC_SUBMISSION_EVENT } from "../services/hmrc/audit.js";
import { MTD_OBLIGATIONS_SEEN_EVENT } from "../services/hmrc/obligations.js";
import { ukDateParts, type UkDateParts } from "@mileclear/shared";
import { UK_ONLY_USER } from "../lib/ukOnly.js";

export const MTD_REMINDER_EVENT = "notification.mtd_deadline";
export const MTD_REMINDER_ACTION = "open_mtd";
export const MTD_REMINDER_HOUR = 10;

export type MtdReminderStage = "7d" | "1d";
const STAGE_DAYS: Record<MtdReminderStage, number> = { "7d": 7, "1d": 1 };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Obligations older than this are ignored; HMRC returns the whole year at once. */
const SNAPSHOT_LOOKBACK_MS = 400 * DAY_MS;

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/** Only against HMRC's live service; never for test (sandbox) deadlines. */
export function mtdRemindersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.HMRC_ENVIRONMENT ?? "").trim().toLowerCase() === "production";
}

function isoDay(p: Pick<UkDateParts, "year" | "month" | "day">): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Whole days from the UK calendar date `todayIso` to `dueIso` (both YYYY-MM-DD). */
export function daysBetween(todayIso: string, dueIso: string): number {
  const a = Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10));
  const b = Date.UTC(+dueIso.slice(0, 4), +dueIso.slice(5, 7) - 1, +dueIso.slice(8, 10));
  return Math.round((b - a) / DAY_MS);
}

/** Which reminder (if any) a due date gets today. */
export function reminderStageFor(todayIso: string, dueIso: string): MtdReminderStage | null {
  const d = daysBetween(todayIso, dueIso.slice(0, 10));
  if (d === STAGE_DAYS["7d"]) return "7d";
  if (d === STAGE_DAYS["1d"]) return "1d";
  return null;
}

/** "2026-27" for a quarter starting 2026-07-06; the tax year starts 6 April. */
export function taxYearOfDate(iso: string): string {
  const y = +iso.slice(0, 4);
  const md = iso.slice(5, 10);
  const start = md >= "04-06" ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function reminderKey(periodEnd: string, stage: MtdReminderStage, channel: "push" | "email"): string {
  return `${periodEnd.slice(0, 10)}:${stage}:${channel}`;
}

export interface SeenObligation {
  start: string;
  end: string;
  due: string;
  status: "Open" | "Fulfilled";
}

/**
 * The latest status HMRC showed for each quarter, across every snapshot.
 * Snapshots arrive newest first; the first sighting of a quarter wins.
 */
export function latestObligations(snapshots: Array<{ obligations: SeenObligation[] }>): SeenObligation[] {
  const byPeriod = new Map<string, SeenObligation>();
  for (const s of snapshots) {
    for (const o of s.obligations) {
      const key = `${o.start.slice(0, 10)}:${o.end.slice(0, 10)}`;
      if (!byPeriod.has(key)) byPeriod.set(key, o);
    }
  }
  return [...byPeriod.values()];
}

export interface OkSubmission {
  taxYear: string;
  periodEnd: string;
}

/** Open per HMRC's last word, and not since covered by an update sent from MileClear. */
export function isStillOpen(o: SeenObligation, okSubmissions: OkSubmission[]): boolean {
  if (o.status !== "Open") return false;
  const taxYear = taxYearOfDate(o.start.slice(0, 10));
  const end = o.end.slice(0, 10);
  return !okSubmissions.some((s) => s.taxYear === taxYear && s.periodEnd.slice(0, 10) >= end);
}

/** "6 July to 5 October 2026" */
export function periodLabel(startIso: string, endIso: string): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  const sameYear = startIso.slice(0, 4) === endIso.slice(0, 4);
  return `${fmt(startIso, !sameYear)} to ${fmt(endIso, true)}`;
}

/** "Saturday 7 November 2026" */
export function dueLabel(dueIso: string): string {
  return new Date(`${dueIso.slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
    .replace(",", "");
}

export function buildMtdReminderPush(o: Pick<SeenObligation, "start" | "end" | "due">, stage: MtdReminderStage): {
  title: string;
  body: string;
} {
  const title = stage === "1d" ? "Quarterly update due tomorrow" : "Quarterly update due in 7 days";
  const due = new Date(`${o.due.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return {
    title,
    body: `Your update for ${periodLabel(o.start, o.end)} is due by ${due} and HMRC still shows it as not sent. Check your figures and send it from MileClear.`,
  };
}

export interface MtdReminderCandidate {
  hasPushToken: boolean;
  pushPrefs: Prisma.JsonValue | null | undefined;
  hasEmail: boolean;
  pushSent: boolean;
  emailSent: boolean;
}

/** Which channels to use for one driver and one due reminder. */
export function decideMtdReminder(c: MtdReminderCandidate): { push: boolean; email: boolean } {
  return {
    push: c.hasPushToken && pushPrefEnabled(c.pushPrefs, "taxDeadline") && !c.pushSent,
    email: c.hasEmail && !c.emailSent,
  };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function asObligations(meta: Prisma.JsonValue | null): SeenObligation[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const list = (meta as { obligations?: unknown }).obligations;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (o): o is SeenObligation =>
      !!o &&
      typeof o === "object" &&
      typeof (o as SeenObligation).start === "string" &&
      typeof (o as SeenObligation).end === "string" &&
      typeof (o as SeenObligation).due === "string" &&
      ((o as SeenObligation).status === "Open" || (o as SeenObligation).status === "Fulfilled")
  );
}

export interface MtdReminderSend {
  userId: string;
  obligation: SeenObligation;
  stage: MtdReminderStage;
  push: string | null; // push token, when the push goes
  email: { address: string; displayName: string | null } | null;
}

/** Selection only, no side effects. */
export async function planMtdReminders(now: Date = new Date()): Promise<MtdReminderSend[]> {
  const today = isoDay(ukDateParts(now));

  const connections = await prisma.hmrcConnection.findMany({
    where: {
      environment: "production",
      disconnectedAt: null,
      businessId: { not: null },
      nino: { not: null },
      // HMRC: UK drivers only (23 Oct 2026).
      user: UK_ONLY_USER,
    },
    select: {
      userId: true,
      user: { select: { email: true, displayName: true, pushToken: true, pushPrefs: true } },
    },
  });
  if (connections.length === 0) return [];
  const userIds = connections.map((c) => c.userId);
  const since = new Date(now.getTime() - SNAPSHOT_LOOKBACK_MS);

  const [snapshots, submissions, sent] = await Promise.all([
    prisma.appEvent.findMany({
      where: { type: MTD_OBLIGATIONS_SEEN_EVENT, userId: { in: userIds }, createdAt: { gte: since } },
      select: { userId: true, metadata: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: { type: HMRC_SUBMISSION_EVENT, userId: { in: userIds }, createdAt: { gte: since } },
      select: { userId: true, metadata: true },
    }),
    prisma.appEvent.findMany({
      where: { type: MTD_REMINDER_EVENT, userId: { in: userIds }, createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      select: { userId: true, metadata: true },
    }),
  ]);

  // Newest first, in JS (sorting a JSON-selecting query in MySQL can run out
  // of sort memory on prod).
  snapshots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const snapshotsByUser = new Map<string, Array<{ obligations: SeenObligation[] }>>();
  for (const s of snapshots) {
    if (!s.userId) continue;
    const list = snapshotsByUser.get(s.userId) ?? [];
    list.push({ obligations: asObligations(s.metadata) });
    snapshotsByUser.set(s.userId, list);
  }

  const okByUser = new Map<string, OkSubmission[]>();
  for (const s of submissions) {
    const m = s.metadata as Record<string, unknown> | null;
    if (!s.userId || !m || m.ok !== true || m.environment !== "production") continue;
    if (m.operation !== "period_submit" && m.operation !== "period_amend") continue;
    if (typeof m.taxYear !== "string" || typeof m.periodEnd !== "string") continue;
    const list = okByUser.get(s.userId) ?? [];
    list.push({ taxYear: m.taxYear, periodEnd: m.periodEnd });
    okByUser.set(s.userId, list);
  }

  const sentKeys = new Set<string>();
  for (const r of sent) {
    const m = r.metadata as { key?: unknown } | null;
    if (r.userId && m && typeof m.key === "string") sentKeys.add(`${r.userId}|${m.key}`);
  }

  const out: MtdReminderSend[] = [];
  for (const c of connections) {
    const obligations = latestObligations(snapshotsByUser.get(c.userId) ?? []);
    for (const o of obligations) {
      const stage = reminderStageFor(today, o.due);
      if (!stage) continue;
      if (!isStillOpen(o, okByUser.get(c.userId) ?? [])) continue;
      const decision = decideMtdReminder({
        hasPushToken: !!c.user.pushToken,
        pushPrefs: c.user.pushPrefs,
        hasEmail: !!c.user.email,
        pushSent: sentKeys.has(`${c.userId}|${reminderKey(o.end, stage, "push")}`),
        emailSent: sentKeys.has(`${c.userId}|${reminderKey(o.end, stage, "email")}`),
      });
      if (!decision.push && !decision.email) continue;
      out.push({
        userId: c.userId,
        obligation: o,
        stage,
        push: decision.push ? c.user.pushToken : null,
        email: decision.email ? { address: c.user.email, displayName: c.user.displayName } : null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

const SEND_DELAY_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runMtdDeadlineRemindersJob(now: Date = new Date()): Promise<void> {
  if (!mtdRemindersEnabled()) return;
  if (ukDateParts(now).hour !== MTD_REMINDER_HOUR) return;

  const plan = await planMtdReminders(now);
  if (plan.length === 0) return;

  const messages: ExpoPushMessage[] = [];
  for (const s of plan) {
    if (!s.push) continue;
    const { title, body } = buildMtdReminderPush(s.obligation, s.stage);
    // Logged before sending so a crash mid-send cannot push twice.
    logEvent(MTD_REMINDER_EVENT, s.userId, {
      key: reminderKey(s.obligation.end, s.stage, "push"),
      channel: "push",
      stage: s.stage,
      periodEnd: s.obligation.end,
      due: s.obligation.due,
    });
    messages.push({
      to: s.push,
      title,
      body,
      sound: "default",
      data: {
        type: "mtd_deadline",
        action: MTD_REMINDER_ACTION,
        stage: s.stage,
        periodEnd: s.obligation.end,
      },
    });
  }
  if (messages.length > 0) await sendPushNotifications(messages);

  let emails = 0;
  for (const s of plan) {
    if (!s.email) continue;
    logEvent(MTD_REMINDER_EVENT, s.userId, {
      key: reminderKey(s.obligation.end, s.stage, "email"),
      channel: "email",
      stage: s.stage,
      periodEnd: s.obligation.end,
      due: s.obligation.due,
    });
    try {
      await sendMtdQuarterlyReminderEmail(
        s.email.address,
        s.email.displayName,
        {
          periodLabel: periodLabel(s.obligation.start, s.obligation.end),
          dueLabel: dueLabel(s.obligation.due),
          daysLeft: STAGE_DAYS[s.stage],
        },
        s.userId
      );
      emails++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[jobs/mtdDeadline] email failed for ${s.userId}:`, err);
    }
  }
  console.log(`[jobs/mtdDeadline] sent ${messages.length} push, ${emails} email.`);
}
