// Evening digest: one short push at the end of the day so a new driver can
// see the app worked without emailing to ask.
//
//   "Today: 4 trips, 21.3 miles. 2 walks ignored. 1 to sort."
//
// Differs from the morning briefing (07-09 UTC, yesterday's driving plus
// earnings and the weekly goal, action open_dashboard) in three ways: it
// covers TODAY, it is sent the same evening while the driver still remembers
// the drives, and it names the work the driver never sees (walks the engine
// recorded and threw away). The admin "daily_briefing" in briefing.ts is an
// email to admins and unrelated.
//
// Scheduling: hourly tick from startNotificationJobs, self-gated to the
// 20:30-21:29 Europe/London window (every user is treated as UK for now).
// One tick lands in that window per day; the AppEvent
// `notification.evening_digest` dedups within the local day so a restart
// inside the window cannot send twice.
//
// Gate: EVENING_DIGEST_DRY_RUN. Dry run unless the env var is exactly "0",
// so the first deploy logs and sends nothing. In dry run the window still
// applies, nothing is sent and no AppEvent is written; the log line says
// how many would have gone and shows three sample bodies.

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { pushPrefEnabled } from "../services/pushPrefs.js";
import { logEvent } from "../services/appEvents.js";

export const EVENING_DIGEST_EVENT = "notification.evening_digest";
export const EVENING_DIGEST_TZ = "Europe/London";

/** Proposal sources that mean "the engine recorded a walk and dropped it".
 *  Written by the client's discarded-recording report (see
 *  discardedRecordingSource in services/missedJourneys.ts). */
export const DROPPED_WALK_SOURCES = ["dropped_walk", "dropped_phantom"] as const;

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

export interface LocalClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

/** Wall-clock parts of `now` in `tz`. No TZ library: Intl handles BST/GMT. */
export function localClock(now: Date, tz: string = EVENING_DIGEST_TZ): LocalClock {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  });
  const parts = fmt.formatToParts(now);
  const pick = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour") % 24,
    minute: pick("minute"),
  };
}

/** The send window: 20:30 to 21:29 inclusive, local time. Hourly ticks hit it
 *  exactly once a day whatever minute of the hour the daemon booted on. */
export function inDigestWindow(clock: Pick<LocalClock, "hour" | "minute">): boolean {
  if (clock.hour === 20) return clock.minute >= 30;
  if (clock.hour === 21) return clock.minute < 30;
  return false;
}

/** UTC instant of local midnight on the given local calendar day. */
function zonedMidnightUtc(year: number, month: number, day: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const c = localClock(new Date(guess), tz);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, 0);
  const offsetMs = asUtc - guess; // how far local wall-clock runs ahead of UTC
  return new Date(guess - offsetMs);
}

export interface LocalDayBounds {
  /** "YYYY-MM-DD" of the local day, for logs. */
  key: string;
  start: Date; // inclusive, UTC instant of local 00:00
  end: Date; // exclusive, UTC instant of the next local 00:00
}

/** Bounds of the local calendar day containing `now`, as UTC instants. Uses
 *  the next local midnight for the end, so a 23- or 25-hour DST day is right. */
export function localDayBounds(now: Date, tz: string = EVENING_DIGEST_TZ): LocalDayBounds {
  const c = localClock(now, tz);
  const start = zonedMidnightUtc(c.year, c.month, c.day, tz);
  // Step 36h forward (safely into the next local day, whatever DST does) and
  // take that day's midnight as the end.
  const n = localClock(new Date(start.getTime() + 36 * 60 * 60 * 1000), tz);
  const end = zonedMidnightUtc(n.year, n.month, n.day, tz);
  const pad = (v: number) => String(v).padStart(2, "0");
  return { key: `${c.year}-${pad(c.month)}-${pad(c.day)}`, start, end };
}

export interface DigestCounts {
  trips: number;
  miles: number;
  walks: number;
  unclassified: number;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Miles as the app shows them: one decimal at most, en-GB grouping. */
export function formatDigestMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

/**
 * The push body. "Today: {n} trip(s), {miles} miles." then " {w} walk(s)
 * ignored." if any, then " {u} to sort." if any unclassified. A day with no
 * trips but a dropped walk reads "Today: no trips. 1 walk ignored." because
 * that is the whole point: the app was awake and made a decision.
 */
export function buildDigestBody(c: DigestCounts): string {
  const parts: string[] = [];
  if (c.trips > 0) {
    const m = formatDigestMiles(c.miles);
    parts.push(`Today: ${plural(c.trips, "trip", "trips")}, ${m} ${m === "1" ? "mile" : "miles"}.`);
  } else {
    parts.push("Today: no trips.");
  }
  if (c.walks > 0) parts.push(`${plural(c.walks, "walk", "walks")} ignored.`);
  if (c.unclassified > 0) parts.push(`${c.unclassified} to sort.`);
  return parts.join(" ");
}

/** Where a tap lands. Both actions exist in the app's notification router. */
export function digestAction(c: DigestCounts): "open_trips" | "open_unclassified_trips" {
  return c.unclassified > 0 ? "open_unclassified_trips" : "open_trips";
}

/** True unless EVENING_DIGEST_DRY_RUN is exactly "0". Unset = dry run. */
export function eveningDigestDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.EVENING_DIGEST_DRY_RUN !== "0";
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** Per-user counts for everyone with a trip or a dropped walk inside the
 *  bounds. Exported so the dry-run probe and the job share one definition. */
export async function collectDigestCounts(bounds: LocalDayBounds): Promise<Map<string, DigestCounts>> {
  const tripWhere = {
    isPhantomTrip: false,
    startedAt: { gte: bounds.start, lt: bounds.end },
  };
  const [trips, unclassified, walks] = await Promise.all([
    prisma.trip.groupBy({
      by: ["userId"],
      where: tripWhere,
      _count: { _all: true },
      _sum: { distanceMiles: true },
    }),
    prisma.trip.groupBy({
      by: ["userId"],
      where: { ...tripWhere, classification: "unclassified" },
      _count: { _all: true },
    }),
    prisma.missedJourneyProposal.groupBy({
      by: ["userId"],
      where: {
        source: { in: [...DROPPED_WALK_SOURCES] },
        createdAt: { gte: bounds.start, lt: bounds.end },
      },
      _count: { _all: true },
    }),
  ]);

  const out = new Map<string, DigestCounts>();
  const get = (userId: string): DigestCounts => {
    let c = out.get(userId);
    if (!c) {
      c = { trips: 0, miles: 0, walks: 0, unclassified: 0 };
      out.set(userId, c);
    }
    return c;
  };
  for (const r of trips) {
    const c = get(r.userId);
    c.trips = r._count._all;
    c.miles = r._sum.distanceMiles ?? 0;
  }
  for (const r of unclassified) get(r.userId).unclassified = r._count._all;
  for (const r of walks) get(r.userId).walks = r._count._all;
  return out;
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export interface EveningDigestResult {
  dryRun: boolean;
  day: string;
  candidates: number;
  sent: number;
  skippedNoToken: number;
  skippedPref: number;
  skippedAlreadySent: number;
}

export async function runEveningDigestJob(now: Date = new Date()): Promise<EveningDigestResult | void> {
  const clock = localClock(now);
  if (!inDigestWindow(clock)) return;

  const dryRun = eveningDigestDryRun();
  const bounds = localDayBounds(now);
  const counts = await collectDigestCounts(bounds);
  const result: EveningDigestResult = {
    dryRun,
    day: bounds.key,
    candidates: counts.size,
    sent: 0,
    skippedNoToken: 0,
    skippedPref: 0,
    skippedAlreadySent: 0,
  };
  if (counts.size === 0) {
    console.log(`[jobs/eveningDigest] ${bounds.key}: nobody drove today, nothing to send`);
    return result;
  }

  const userIds = [...counts.keys()];
  const [users, alreadySent] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, pushToken: true, pushPrefs: true },
    }),
    prisma.appEvent.findMany({
      where: {
        type: EVENING_DIGEST_EVENT,
        userId: { in: userIds },
        createdAt: { gte: bounds.start, lt: bounds.end },
      },
      select: { userId: true },
    }),
  ]);
  const sentToday = new Set(alreadySent.map((e) => e.userId));

  const messages: ExpoPushMessage[] = [];
  const samples: string[] = [];
  for (const user of users) {
    const c = counts.get(user.id)!;
    if (!user.pushToken) {
      result.skippedNoToken++;
      continue;
    }
    if (!pushPrefEnabled(user.pushPrefs, "eveningDigest")) {
      result.skippedPref++;
      continue;
    }
    if (sentToday.has(user.id)) {
      result.skippedAlreadySent++;
      continue;
    }

    const body = buildDigestBody(c);
    if (samples.length < 3) samples.push(`${user.id.slice(0, 8)}: ${body}`);
    messages.push({
      to: user.pushToken,
      title: "Today's driving",
      body,
      sound: "default",
      data: { type: "evening_digest", action: digestAction(c) },
    });
    if (!dryRun) {
      logEvent(EVENING_DIGEST_EVENT, user.id, {
        trips: c.trips,
        miles: Math.round(c.miles * 10) / 10,
        walks: c.walks,
        unclassified: c.unclassified,
      });
    }
  }

  if (dryRun) {
    console.log(
      `[jobs/eveningDigest] DRY RUN ${bounds.key}: would send ${messages.length} ` +
        `(candidates ${counts.size}, no token ${result.skippedNoToken}, opted out ${result.skippedPref}, ` +
        `already sent ${result.skippedAlreadySent}). Samples: ${samples.join(" | ") || "none"}`
    );
    return result;
  }

  if (messages.length > 0) {
    await sendPushNotifications(messages);
    result.sent = messages.length;
    console.log(`[jobs/eveningDigest] ${bounds.key}: sent ${messages.length} push(es)`);
  }
  return result;
}
