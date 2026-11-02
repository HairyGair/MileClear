// Quarterly update deadline reminders (Making Tax Digital, Oct 2026).
//
// For drivers who have connected HMRC (an active connection with a NINO and
// a business chosen): a push and an email the day after each quarter ends
// ("ready to send", Nov 2026), then 7 days and 1 day before each quarterly
// deadline, while the quarter is still not sent.
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
// Only HMRC's dates from the current connection count: a snapshot taken
// before the driver last connected, one tagged with HMRC's test service, or
// one for a different business is ignored. The tax year of a quarter comes
// from its END date, so a calendar quarter starting 1 April belongs to the
// year it is sent in (from its start date it read as the year before, and an
// update sent from MileClear did not count against it).
//
// Respect, in code:
//   - HMRC_ENVIRONMENT must be "production" AND the connection must be a
//     production one: sandbox drivers are never reminded about test deadlines;
//   - the push honours the taxDeadline push preference;
//   - the email carries a working unsubscribe, and is skipped for a driver
//     who turned emails off (marketingEmailsEnabled false: the Unsubscribe
//     link, the inbox button or the settings switch). It defaults to on, so a
//     driver who never chose is still reminded;
//   - drivers without Pro (proEntitlement.ts, the rule the send route uses)
//     are reminded of the deadline but not told to "send it" from MileClear;
//   - once per driver, per quarter, per reminder (ready, 7 days, 1 day), per
//     channel, deduped on the sent events; the row is written (and awaited)
//     before sending, so a crash mid-send cannot send twice and a failed
//     write sends nothing this tick;
//   - only updates for the business the driver sends for now count as sent,
//     and a driver who switched between standard and calendar quarters gets
//     one message per deadline (the newest dates HMRC showed win).
//
// When ("ready" is the day after the period ends, UK date):
//   standard quarter ending 5 October    -> ready 6 October, due 7 November
//   calendar quarter ending 30 September -> ready 1 October, due 7 November
//
// Runs on the 30-minute windowed tick and only does anything 10:00-10:59 UK.

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { pushPrefEnabled } from "../services/pushPrefs.js";
import { getProEntitlement } from "../services/proEntitlement.js";
import { sendMtdQuarterlyReminderEmail, sendMtdQuarterReadyEmail } from "../services/email.js";
import { HMRC_SUBMISSION_EVENT } from "../services/hmrc/audit.js";
import { hmrcSandboxUserIds } from "../services/hmrc/config.js";
import { MTD_OBLIGATIONS_SEEN_EVENT } from "../services/hmrc/obligations.js";
import { driveForOf, ukDateParts, type UkDateParts } from "@mileclear/shared";

export const MTD_REMINDER_EVENT = "notification.mtd_deadline";
export const MTD_REMINDER_ACTION = "open_mtd";
export const MTD_REMINDER_HOUR = 10;

export type MtdReminderStage = "ready" | "7d" | "1d";
type DueStage = Exclude<MtdReminderStage, "ready">;
const STAGE_DAYS: Record<DueStage, number> = { "7d": 7, "1d": 1 };

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

/** Which deadline reminder (if any) a due date gets today. */
export function reminderStageFor(todayIso: string, dueIso: string): DueStage | null {
  const d = daysBetween(todayIso, dueIso.slice(0, 10));
  if (d === STAGE_DAYS["7d"]) return "7d";
  if (d === STAGE_DAYS["1d"]) return "1d";
  return null;
}

/**
 * True on the UK calendar day after the period ends (the 6th for HMRC's
 * standard quarters, the 1st for calendar quarters), while the deadline is
 * still ahead.
 */
export function isReadyDay(todayIso: string, o: Pick<SeenObligation, "end" | "due">): boolean {
  return daysBetween(o.end.slice(0, 10), todayIso) === 1 && daysBetween(todayIso, o.due.slice(0, 10)) > 0;
}

/**
 * The one reminder a quarter gets today, if any. A deadline reminder wins
 * if both fall on the same day, so a driver never gets two in one morning.
 */
export function stageForToday(todayIso: string, o: Pick<SeenObligation, "end" | "due">): MtdReminderStage | null {
  return reminderStageFor(todayIso, o.due) ?? (isReadyDay(todayIso, o) ? "ready" : null);
}

/** "2026-27" for a quarter starting 2026-07-06; the tax year starts 6 April. */
export function taxYearOfDate(iso: string): string {
  const y = +iso.slice(0, 4);
  const md = iso.slice(5, 10);
  const start = md >= "04-06" ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * The tax year a quarter belongs to, from its END date. Every quarter ends
 * inside its tax year (5 July ... 5 April, or 30 June ... 31 March), but a
 * calendar quarter STARTS on 1 April, five days before the year does.
 */
export function obligationTaxYear(o: Pick<SeenObligation, "end">): string {
  return taxYearOfDate(o.end.slice(0, 10));
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
  // One quarter per deadline: a driver who switched between standard and
  // calendar quarters has both sets in older snapshots (6 July to 5 October
  // and 1 July to 30 September are both due 7 November). The newest wins.
  const dues = new Set<string>();
  for (const s of snapshots) {
    const claimed: string[] = [];
    for (const o of s.obligations) {
      const key = `${o.start.slice(0, 10)}:${o.end.slice(0, 10)}`;
      const due = o.due.slice(0, 10);
      if (byPeriod.has(key) || dues.has(due)) continue;
      byPeriod.set(key, o);
      claimed.push(due);
    }
    for (const d of claimed) dues.add(d);
  }
  return [...byPeriod.values()];
}

export interface OkSubmission {
  taxYear: string;
  periodEnd: string;
}

/**
 * Successful quarterly updates from submission-trail metadata (hmrc.submission):
 * ok, from the given HMRC service, a quarterly send or correction, and (when
 * both sides say) for the business the driver sends for now.
 */
export function okSubmissionFrom(
  metadata: unknown,
  conn: { environment: "sandbox" | "production"; businessId: string | null }
): OkSubmission | null {
  const m = metadata as Record<string, unknown> | null;
  if (!m || typeof m !== "object" || m.ok !== true || m.environment !== conn.environment) return null;
  if (m.operation !== "period_submit" && m.operation !== "period_amend") return null;
  if (typeof m.taxYear !== "string" || typeof m.periodEnd !== "string") return null;
  if (typeof m.businessId === "string" && conn.businessId && m.businessId !== conn.businessId) return null;
  return { taxYear: m.taxYear, periodEnd: m.periodEnd };
}

/** Open per HMRC's last word, and not since covered by an update sent from MileClear. */
export function isStillOpen(o: SeenObligation, okSubmissions: OkSubmission[]): boolean {
  if (o.status !== "Open") return false;
  const taxYear = obligationTaxYear(o);
  const end = o.end.slice(0, 10);
  return !okSubmissions.some((s) => s.taxYear === taxYear && s.periodEnd.slice(0, 10) >= end);
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "July to October" (same rule as the app's quarterLabel in lib/tax/mtdQuarters.ts). */
export function quarterLabel(startIso: string, endIso: string): string {
  return `${MONTHS[+startIso.slice(5, 7) - 1]} to ${MONTHS[+endIso.slice(5, 7) - 1]}`;
}

/** "7 November" */
export function dayMonth(iso: string): string {
  return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
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

/** For drivers without Pro, who cannot check or send from MileClear. */
export const MTD_PUSH_NEEDS_PRO = "Sending it from MileClear needs Pro. You can also send it another way.";

export function buildMtdReminderPush(
  o: Pick<SeenObligation, "start" | "end" | "due">,
  stage: MtdReminderStage,
  pro = true
): {
  title: string;
  body: string;
} {
  const due = dayMonth(o.due.slice(0, 10));
  if (stage === "ready") {
    return pro
      ? {
          title: `Your ${quarterLabel(o.start, o.end)} update is ready to send`,
          body: `Your figures are in MileClear. Check them and send by ${due}.`,
        }
      : {
          title: `Your ${quarterLabel(o.start, o.end)} update is due by ${due}`,
          body: MTD_PUSH_NEEDS_PRO,
        };
  }
  const title = stage === "1d" ? "Quarterly update due tomorrow" : "Quarterly update due in 7 days";
  const lead = `Your update for ${periodLabel(o.start, o.end)} is due by ${due} and HMRC still shows it as not sent.`;
  return {
    title,
    body: pro ? `${lead} Check your figures and send it from MileClear.` : `${lead} ${MTD_PUSH_NEEDS_PRO}`,
  };
}

export interface MtdReminderCandidate {
  hasPushToken: boolean;
  pushPrefs: Prisma.JsonValue | null | undefined;
  hasEmail: boolean;
  /** users.marketingEmailsEnabled: false only when the driver turned emails off. */
  emailsEnabled?: boolean | null;
  pushSent: boolean;
  emailSent: boolean;
}

/** Which channels to use for one driver and one due reminder. */
export function decideMtdReminder(c: MtdReminderCandidate): { push: boolean; email: boolean } {
  return {
    push: c.hasPushToken && pushPrefEnabled(c.pushPrefs, "taxDeadline") && !c.pushSent,
    email: c.hasEmail && c.emailsEnabled !== false && !c.emailSent,
  };
}

/** A snapshot with an environment tag must match; older ones have none and rely on the connection date. */
export function snapshotMatches(metadata: unknown, environment: "sandbox" | "production"): boolean {
  const env = (metadata as { environment?: unknown } | null)?.environment;
  return env == null || env === environment;
}

/**
 * Whether a snapshot of HMRC's dates belongs to the driver's current
 * connection: taken since they last connected, from the same HMRC service,
 * and (when it says) for the business they send for now.
 */
export function snapshotFromConnection(
  snap: { metadata: unknown; createdAt: Date },
  conn: { environment: "sandbox" | "production"; connectedAt: Date; businessId: string | null }
): boolean {
  if (snap.createdAt < conn.connectedAt) return false;
  if (!snapshotMatches(snap.metadata, conn.environment)) return false;
  const biz = (snap.metadata as { businessId?: unknown } | null)?.businessId;
  return typeof biz !== "string" || !conn.businessId || biz === conn.businessId;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export function asObligations(meta: Prisma.JsonValue | null): SeenObligation[] {
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
  /** Has Pro now, so can check and send from MileClear. */
  pro: boolean;
  /** "You drive for" is self-employed, so Quarterly updates shows in Settings. */
  selfEmployed: boolean;
  push: string | null; // push token, when the push goes
  email: { address: string; displayName: string | null } | null;
}

/** Selection only, no side effects. */
export async function planMtdReminders(now: Date = new Date()): Promise<MtdReminderSend[]> {
  const today = isoDay(ukDateParts(now));

  const connections = await prisma.hmrcConnection.findMany({
    where: {
      environment: "production",
      // Accounts on HMRC's test service (App Review) are never reminded.
      userId: { notIn: hmrcSandboxUserIds() },
      disconnectedAt: null,
      businessId: { not: null },
      nino: { not: null },
    },
    select: {
      userId: true,
      connectedAt: true,
      businessId: true,
      user: {
        select: {
          email: true,
          displayName: true,
          pushToken: true,
          pushPrefs: true,
          marketingEmailsEnabled: true,
          workType: true,
          dashboardMode: true,
          isPremium: true,
          premiumExpiresAt: true,
          referralProUntil: true,
        },
      },
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
  const connByUser = new Map(connections.map((c) => [c.userId, c]));
  const snapshotsByUser = new Map<string, Array<{ obligations: SeenObligation[] }>>();
  for (const s of snapshots) {
    if (!s.userId) continue;
    const conn = connByUser.get(s.userId);
    if (!conn) continue;
    if (!snapshotFromConnection(s, { environment: "production", connectedAt: conn.connectedAt, businessId: conn.businessId })) {
      continue;
    }
    const list = snapshotsByUser.get(s.userId) ?? [];
    list.push({ obligations: asObligations(s.metadata) });
    snapshotsByUser.set(s.userId, list);
  }

  const okByUser = new Map<string, OkSubmission[]>();
  for (const s of submissions) {
    if (!s.userId) continue;
    const conn = connByUser.get(s.userId);
    if (!conn) continue;
    const ok = okSubmissionFrom(s.metadata, { environment: "production", businessId: conn.businessId });
    if (!ok) continue;
    const list = okByUser.get(s.userId) ?? [];
    list.push(ok);
    okByUser.set(s.userId, list);
  }

  const sentKeys = new Set<string>();
  for (const r of sent) {
    const m = r.metadata as { key?: unknown } | null;
    if (r.userId && m && typeof m.key === "string") sentKeys.add(`${r.userId}|${m.key}`);
  }

  const out: MtdReminderSend[] = [];
  const proByUser = new Map<string, boolean>();
  for (const c of connections) {
    const obligations = latestObligations(snapshotsByUser.get(c.userId) ?? []);
    for (const o of obligations) {
      const stage = stageForToday(today, o);
      if (!stage) continue;
      if (!isStillOpen(o, okByUser.get(c.userId) ?? [])) continue;
      const decision = decideMtdReminder({
        hasPushToken: !!c.user.pushToken,
        pushPrefs: c.user.pushPrefs,
        hasEmail: !!c.user.email,
        emailsEnabled: c.user.marketingEmailsEnabled,
        pushSent: sentKeys.has(`${c.userId}|${reminderKey(o.end, stage, "push")}`),
        emailSent: sentKeys.has(`${c.userId}|${reminderKey(o.end, stage, "email")}`),
      });
      if (!decision.push && !decision.email) continue;
      // Only for drivers who are due something today: the team check is a query.
      let pro = proByUser.get(c.userId);
      if (pro === undefined) {
        pro = (
          await getProEntitlement(c.userId, {
            isPremium: c.user.isPremium,
            premiumExpiresAt: c.user.premiumExpiresAt,
            referralProUntil: c.user.referralProUntil,
          })
        ).isPro;
        proByUser.set(c.userId, pro);
      }
      const driveFor = driveForOf({ workType: c.user.workType, dashboardMode: c.user.dashboardMode });
      out.push({
        userId: c.userId,
        obligation: o,
        stage,
        pro,
        selfEmployed: driveFor === "gig" || driveFor === "both",
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

/**
 * Write the dedupe row and wait for it. Returns false if it could not be
 * written, in which case nothing is sent this tick (the next tick retries).
 */
async function recordSent(s: MtdReminderSend, channel: "push" | "email"): Promise<boolean> {
  try {
    await prisma.appEvent.create({
      data: {
        type: MTD_REMINDER_EVENT,
        userId: s.userId,
        metadata: {
          key: reminderKey(s.obligation.end, s.stage, channel),
          channel,
          stage: s.stage,
          periodEnd: s.obligation.end,
          due: s.obligation.due,
          pro: s.pro,
        },
      },
    });
    return true;
  } catch (err) {
    console.error(`[jobs/mtdDeadline] could not record ${channel} for ${s.userId}, not sending:`, err);
    return false;
  }
}

export async function runMtdDeadlineRemindersJob(now: Date = new Date()): Promise<void> {
  if (!mtdRemindersEnabled()) return;
  if (ukDateParts(now).hour !== MTD_REMINDER_HOUR) return;

  const plan = await planMtdReminders(now);
  if (plan.length === 0) return;

  const messages: ExpoPushMessage[] = [];
  for (const s of plan) {
    if (!s.push) continue;
    // Recorded before sending so a crash mid-send cannot push twice.
    if (!(await recordSent(s, "push"))) continue;
    const { title, body } = buildMtdReminderPush(s.obligation, s.stage, s.pro);
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
    if (!(await recordSent(s, "email"))) continue;
    const audience = { pro: s.pro, selfEmployed: s.selfEmployed };
    try {
      if (s.stage === "ready") {
        await sendMtdQuarterReadyEmail(
          s.email.address,
          s.email.displayName,
          {
            quarterLabel: quarterLabel(s.obligation.start, s.obligation.end),
            periodLabel: periodLabel(s.obligation.start, s.obligation.end),
            dueLabel: dueLabel(s.obligation.due),
            dueShort: dayMonth(s.obligation.due.slice(0, 10)),
            ...audience,
          },
          s.userId
        );
      } else {
        await sendMtdQuarterlyReminderEmail(
          s.email.address,
          s.email.displayName,
          {
            periodLabel: periodLabel(s.obligation.start, s.obligation.end),
            dueLabel: dueLabel(s.obligation.due),
            daysLeft: STAGE_DAYS[s.stage],
            ...audience,
          },
          s.userId
        );
      }
      emails++;
      await sleep(SEND_DELAY_MS);
    } catch (err) {
      console.error(`[jobs/mtdDeadline] email failed for ${s.userId}:`, err);
    }
  }
  console.log(`[jobs/mtdDeadline] sent ${messages.length} push, ${emails} email.`);
}
