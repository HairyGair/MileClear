// Weekly classify nudge: one push on Sunday evening for drivers with a real
// pile of this week's trips still to sort.
//
//   "This week's trips"
//   "You've got 23 trips from this week to sort. Two minutes now keeps your
//    tax figure right."
//
// Why (28 Sep 2026): 48% of the last 14 days' trips were unclassified (13,386
// of 27,835) and an unclassified trip adds nothing to a driver's Self
// Assessment figure. The evening digest already says "N to sort" every night,
// but it only counts TODAY's trips, and a day's two or three never looks like
// a job worth doing. This names the week's total once, on the evening the
// probe showed drivers already sort trips (19:00 to 22:00 UK is the busiest
// stretch for classifying), and lands on the Trips Inbox, where repeat routes
// are grouped so a whole run of them is one tap.
//
// Respect, in code:
//   - at most one a week (6-day cooldown on the sent event);
//   - only this week's unclassified trips count, and fewer than 3 is not
//     worth a push (the nightly digest covers a trip or two);
//   - personal-mode drivers with no business trips are left alone: their
//     trips never reach a tax figure;
//   - the unclassifiedNudge push preference turns it off (the same switch as
//     the app's own "Trips to classify" reminder);
//   - three nudges in a row with no trip classified afterwards and it stops
//     asking. Silence is an answer. It starts again the week they classify.
//   - the evening digest stands down for that driver that evening, so the
//     night they get this they get one push, not two.
//
// Measurement: every send is `notification.classify_nudge` {count, week}; a
// tap is `notification.classify_nudge_opened` (logged by the app); each run
// logs `notification.classify_nudge_effect` with how many of the previous
// week's recipients classified a trip within 48 hours of the push.
//
// Gate: CLASSIFY_NUDGE. Nothing sends unless it is exactly "1". Unset, the
// job still runs in its window as a DRY RUN: it logs how many it would send
// and three sample bodies, writes no events and sends nothing.

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { pushPrefEnabled } from "../services/pushPrefs.js";
import { logEvent } from "../services/appEvents.js";

export const CLASSIFY_NUDGE_EVENT = "notification.classify_nudge";
export const CLASSIFY_NUDGE_OPENED_EVENT = "notification.classify_nudge_opened";
export const CLASSIFY_NUDGE_EFFECT_EVENT = "notification.classify_nudge_effect";
/** Carried in the push data so the app can log the tap against this nudge. */
export const CLASSIFY_NUDGE_DATA_TAG = "classify_weekly";

export const CLASSIFY_NUDGE_TZ = "Europe/London";
export const CLASSIFY_NUDGE_MIN_TRIPS = 3;
/** Above this, "two minutes" stops being honest. */
export const CLASSIFY_NUDGE_QUICK_MAX = 30;
export const CLASSIFY_NUDGE_BACKOFF_AFTER = 3;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
/** Weekly, with a day of slack so a late tick one week never blocks the next. */
export const CLASSIFY_NUDGE_COOLDOWN_MS = 6 * DAY_MS;
/** How far back sends are read for the back-off rule. */
const BACKOFF_LOOKBACK_MS = 5 * WEEK_MS;
/** A classification this soon after a push counts as a response to it. */
export const CLASSIFY_NUDGE_RESPONSE_MS = 2 * DAY_MS;

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/** True only when CLASSIFY_NUDGE is exactly "1". Unset = dry run. */
export function classifyNudgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLASSIFY_NUDGE === "1";
}

export interface WeekClock {
  weekday: number; // 0 = Sunday
  hour: number; // 0-23
  /** "YYYY-MM-DD" of the local day, used as the week key on a Sunday. */
  dayKey: string;
}

export function weekClock(now: Date, tz: string = CLASSIFY_NUDGE_TZ): WeekClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: days[get("weekday")] ?? -1,
    hour: parseInt(get("hour"), 10) % 24,
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Sunday 19:00 to 19:59 UK: before the 20:30 evening digest, inside the
 *  evening stretch when drivers already sort their trips. */
export function inClassifyNudgeWindow(c: Pick<WeekClock, "weekday" | "hour">): boolean {
  return c.weekday === 0 && c.hour === 19;
}

export function buildClassifyNudgeBody(count: number): string {
  const tail =
    count <= CLASSIFY_NUDGE_QUICK_MAX
      ? "Two minutes now keeps your tax figure right."
      : "A few minutes now keeps your tax figure right.";
  return `You've got ${count} trips from this week to sort. ${tail}`;
}

export const CLASSIFY_NUDGE_TITLE = "This week's trips";

/**
 * How many of the driver's most recent nudges, counting back from the newest,
 * went by with no trip classified within the response window. Stops at the
 * first nudge that got a response.
 */
export function countUnansweredNudges(
  nudgeTimes: number[],
  classifyTimes: number[],
  responseMs: number = CLASSIFY_NUDGE_RESPONSE_MS
): number {
  const nudges = [...nudgeTimes].sort((a, b) => b - a);
  let n = 0;
  for (const t of nudges) {
    const answered = classifyTimes.some((c) => c >= t && c < t + responseMs);
    if (answered) break;
    n++;
  }
  return n;
}

export interface ClassifyNudgeCandidate {
  hasPushToken: boolean;
  pushPrefs: Prisma.JsonValue | null | undefined;
  /** "work" | "personal" | "both" (default "both"). */
  dashboardMode: string;
  /** Any business trip on the account, however it was classified. */
  hasBusinessTrips: boolean;
  /** Unclassified, finished, non-phantom trips that started in the last 7 days. */
  unclassifiedThisWeek: number;
  /** Newest classify nudge sent to this driver, if any. */
  lastNudgeAt: Date | null;
  /** From countUnansweredNudges. */
  unansweredInARow: number;
  /** Any trip classified since the newest nudge (restarts a backed-off driver). */
  classifiedSinceLastNudge: boolean;
}

export type ClassifyNudgeSkip =
  | "no_token"
  | "pref_off"
  | "personal_only"
  | "too_few"
  | "cooldown"
  | "backed_off";

export type ClassifyNudgeDecision = { send: true } | { send: false; reason: ClassifyNudgeSkip };

/** The whole targeting rule. Order matters only for which reason is logged. */
export function decideClassifyNudge(c: ClassifyNudgeCandidate, now: Date): ClassifyNudgeDecision {
  if (c.unclassifiedThisWeek < CLASSIFY_NUDGE_MIN_TRIPS) return { send: false, reason: "too_few" };
  // Personal mode and never a business trip: nothing of theirs reaches a tax
  // figure, so sorting is not a job they are behind on.
  if (c.dashboardMode === "personal" && !c.hasBusinessTrips) {
    return { send: false, reason: "personal_only" };
  }
  if (!c.hasPushToken) return { send: false, reason: "no_token" };
  if (!pushPrefEnabled(c.pushPrefs, "unclassifiedNudge")) return { send: false, reason: "pref_off" };
  if (c.lastNudgeAt && now.getTime() - c.lastNudgeAt.getTime() < CLASSIFY_NUDGE_COOLDOWN_MS) {
    return { send: false, reason: "cooldown" };
  }
  if (c.unansweredInARow >= CLASSIFY_NUDGE_BACKOFF_AFTER && !c.classifiedSinceLastNudge) {
    return { send: false, reason: "backed_off" };
  }
  return { send: true };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function isClassifyAction(metadata: Prisma.JsonValue | null): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const v = (metadata as Record<string, unknown>).classification;
  return v === "business" || v === "personal";
}

/** Times (ms) each user classified a trip since `since`, from the trip.updated
 *  events the PATCH route writes (the Inbox, lock-screen buttons and web all
 *  go through it). */
async function classifyTimesByUser(userIds: string[], since: Date): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (userIds.length === 0) return out;
  const rows = await prisma.appEvent.findMany({
    where: { type: "trip.updated", userId: { in: userIds }, createdAt: { gte: since } },
    select: { userId: true, metadata: true, createdAt: true },
  });
  for (const r of rows) {
    if (!r.userId || !isClassifyAction(r.metadata)) continue;
    const a = out.get(r.userId) ?? [];
    a.push(r.createdAt.getTime());
    out.set(r.userId, a);
  }
  return out;
}

export interface ClassifyNudgePlanItem {
  userId: string;
  pushToken: string;
  count: number;
}

export interface ClassifyNudgePlan {
  send: ClassifyNudgePlanItem[];
  considered: number;
  skipped: Record<ClassifyNudgeSkip, number>;
}

/** Selection only, no side effects. Shared by the job and any dry-run probe. */
export async function planClassifyNudges(now: Date = new Date()): Promise<ClassifyNudgePlan> {
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const counts = await prisma.trip.groupBy({
    by: ["userId"],
    where: {
      classification: "unclassified",
      isPhantomTrip: false,
      endedAt: { not: null },
      startedAt: { gte: weekAgo, lt: now },
    },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((r) => [r.userId, r._count._all]));
  const skipped: Record<ClassifyNudgeSkip, number> = {
    no_token: 0,
    pref_off: 0,
    personal_only: 0,
    too_few: 0,
    cooldown: 0,
    backed_off: 0,
  };
  const ids = [...countMap.entries()]
    .filter(([, n]) => {
      if (n >= CLASSIFY_NUDGE_MIN_TRIPS) return true;
      skipped.too_few++;
      return false;
    })
    .map(([id]) => id);
  if (ids.length === 0) return { send: [], considered: counts.length, skipped };

  const lookback = new Date(now.getTime() - BACKOFF_LOOKBACK_MS);
  const [users, business, nudges] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, pushToken: true, pushPrefs: true, dashboardMode: true },
    }),
    prisma.trip.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, classification: "business", isPhantomTrip: false },
      _count: { _all: true },
    }),
    prisma.appEvent.findMany({
      where: { type: CLASSIFY_NUDGE_EVENT, userId: { in: ids }, createdAt: { gte: lookback } },
      select: { userId: true, createdAt: true },
    }),
  ]);
  const hasBusiness = new Set(business.map((b) => b.userId));
  const nudgeTimes = new Map<string, number[]>();
  for (const e of nudges) {
    if (!e.userId) continue;
    const a = nudgeTimes.get(e.userId) ?? [];
    a.push(e.createdAt.getTime());
    nudgeTimes.set(e.userId, a);
  }
  const classifyTimes = await classifyTimesByUser([...nudgeTimes.keys()], lookback);

  const send: ClassifyNudgePlanItem[] = [];
  for (const u of users) {
    const times = nudgeTimes.get(u.id) ?? [];
    const last = times.length ? Math.max(...times) : null;
    const cls = classifyTimes.get(u.id) ?? [];
    const decision = decideClassifyNudge(
      {
        hasPushToken: !!u.pushToken,
        pushPrefs: u.pushPrefs,
        dashboardMode: u.dashboardMode,
        hasBusinessTrips: hasBusiness.has(u.id),
        unclassifiedThisWeek: countMap.get(u.id) ?? 0,
        lastNudgeAt: last === null ? null : new Date(last),
        unansweredInARow: countUnansweredNudges(times, cls),
        classifiedSinceLastNudge: last !== null && cls.some((t) => t >= last),
      },
      now
    );
    if (decision.send) send.push({ userId: u.id, pushToken: u.pushToken!, count: countMap.get(u.id)! });
    else skipped[decision.reason]++;
  }
  return { send, considered: counts.length, skipped };
}

export interface ClassifyNudgeEffect {
  sent: number;
  responded: number;
  tripsClassified: number;
}

/** Last week's sends and how many drivers classified a trip within 48h of
 *  theirs. Reads sends from 6 to 8 days ago, so the window is complete. */
export async function measureLastWeek(now: Date = new Date()): Promise<ClassifyNudgeEffect> {
  const sends = await prisma.appEvent.findMany({
    where: {
      type: CLASSIFY_NUDGE_EVENT,
      createdAt: { gte: new Date(now.getTime() - 8 * DAY_MS), lt: new Date(now.getTime() - 6 * DAY_MS) },
    },
    select: { userId: true, createdAt: true },
  });
  const ids = [...new Set(sends.map((s) => s.userId).filter((x): x is string => !!x))];
  const earliest = sends.reduce((m, s) => Math.min(m, s.createdAt.getTime()), now.getTime());
  const cls = await classifyTimesByUser(ids, new Date(earliest));
  let responded = 0;
  let tripsClassified = 0;
  for (const s of sends) {
    if (!s.userId) continue;
    const t = s.createdAt.getTime();
    const hits = (cls.get(s.userId) ?? []).filter((c) => c >= t && c < t + CLASSIFY_NUDGE_RESPONSE_MS).length;
    if (hits > 0) responded++;
    tripsClassified += hits;
  }
  return { sent: sends.length, responded, tripsClassified };
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

// The windowed tick runs every 30 minutes, so a dry run would log twice per
// window. Live sends are deduped by the cooldown; this only quiets the log.
let lastDryRunDay: string | null = null;

export async function runClassifyNudgeJob(now: Date = new Date()): Promise<void> {
  const clock = weekClock(now);
  if (!inClassifyNudgeWindow(clock)) return;
  const live = classifyNudgeEnabled();
  if (!live && lastDryRunDay === clock.dayKey) return;

  const plan = await planClassifyNudges(now);
  const effect = await measureLastWeek(now);
  const skips = Object.entries(plan.skipped)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");

  if (!live) {
    lastDryRunDay = clock.dayKey;
    const samples = plan.send
      .slice(0, 3)
      .map((s) => `${s.userId.slice(0, 8)}: ${buildClassifyNudgeBody(s.count)}`)
      .join(" | ");
    console.log(
      `[jobs/classifyNudge] DRY RUN ${clock.dayKey}: would send ${plan.send.length} ` +
        `(drivers with unclassified trips this week ${plan.considered}; skipped ${skips}). ` +
        `Samples: ${samples || "none"}`
    );
    return;
  }

  const messages: ExpoPushMessage[] = plan.send.map((s) => ({
    to: s.pushToken,
    title: CLASSIFY_NUDGE_TITLE,
    body: buildClassifyNudgeBody(s.count),
    sound: "default",
    // open_unclassified_trips is routed by every app build in the field, so a
    // driver on an older update still lands in the Inbox.
    data: { type: "classify_nudge", action: "open_unclassified_trips", nudge: CLASSIFY_NUDGE_DATA_TAG },
  }));
  // Log before sending so a crash mid-send cannot lead to a second push on
  // the next tick (the cooldown reads these rows).
  for (const s of plan.send) {
    logEvent(CLASSIFY_NUDGE_EVENT, s.userId, { count: s.count, week: clock.dayKey });
  }
  logEvent(CLASSIFY_NUDGE_EFFECT_EVENT, null, { week: clock.dayKey, lastWeek: effect, planned: plan.send.length, skipped: plan.skipped });
  if (messages.length > 0) await sendPushNotifications(messages);
  console.log(
    `[jobs/classifyNudge] ${clock.dayKey}: sent ${messages.length} (skipped ${skips}). ` +
      `Last week: ${effect.responded} of ${effect.sent} classified within 48h (${effect.tripsClassified} trips).`
  );
}
