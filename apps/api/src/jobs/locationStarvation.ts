// Location-starvation push: tell an Android driver their phone is holding back
// MileClear's location, once, when the pattern is unmistakable.
//
//   "Android is holding back your trips"
//   "Your phone is limiting MileClear's battery, so drives aren't saving. Tap
//    to set MileClear to Unrestricted."
//
// Why (12 Oct 2026): the phone reports every recording it throws away as
// `trip.recording_dropped` (sent since 10 Oct). In the first 2.5 days there
// were 196 Android drops of reason too_short / detail no_driving_speed with a
// median of 2 location points, about 30 of them lasting 5+ minutes, plus 128
// no_coords. Those are phones that START recording when the driver sets off
// and then get one or two location points per drive, because Android's battery
// restrictions starve the app. Two support cases that week were exactly this.
// Generic battery advice has had no measured effect before, so this is
// targeted (only phones showing the pattern) and measured (see
// scripts/location-starvation-effect.mjs).
//
// Who (all must hold):
//   - Android (the drop event says so);
//   - 3 or more "starved" drops in the last 72h: reason too_short or no_coords,
//     3 location points or fewer, and 60 seconds or longer where the phone
//     said how long (a 10 second blip is a pocket wobble, not starvation);
//   - no automatic trip saved since the newest starved drop (a phone that
//     recovered on its own is left alone);
//   - the latest diagnostic dump does not already say MileClear is
//     unrestricted (batteryOptimisation.ignoring === true), and the driver has
//     not flipped it since (battery_opt_nudge.resolved in the last 30 days);
//   - support has not replied to them in the last 7 days (a person is already
//     on it, and a push cutting across the conversation helps nobody);
//   - one push per driver per 30 days (notification.location_starvation).
//
// Respect: nothing goes out in push quiet hours (the job simply waits for the
// next run). A driver who has no push token is skipped.
//
// Gate: LOCATION_STARVATION_PUSH. Nothing sends unless it is exactly "1".
// Unset, the job runs as a DRY RUN: it logs who it WOULD push, writes one
// `location_starvation.dry_run` event per driver per 30 days (which doubles as
// the comparison group for the effect script) and sends nothing.
//
// Tap: data.action "open_battery_settings". The app opens the Android battery
// screen for MileClear. Builds without that case fall through to Home.

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { isPushQuietHours } from "../services/pushQuietHoursRule.js";
import { logEvent } from "../services/appEvents.js";

export const LOCATION_STARVATION_EVENT = "notification.location_starvation";
export const LOCATION_STARVATION_OPENED_EVENT = "notification.location_starvation_opened";
export const LOCATION_STARVATION_DRY_RUN_EVENT = "location_starvation.dry_run";
export const LOCATION_STARVATION_ACTION = "open_battery_settings";
export const LOCATION_STARVATION_TITLE = "Android is holding back your trips";
export const LOCATION_STARVATION_BODY =
  "Your phone is limiting MileClear's battery, so drives aren't saving. Tap to set MileClear to Unrestricted.";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const STARVATION_WINDOW_MS = 72 * HOUR_MS;
export const STARVATION_MIN_DROPS = 3;
export const STARVATION_MAX_COORDS = 3;
export const STARVATION_MIN_DURATION_SEC = 60;
export const STARVATION_COOLDOWN_MS = 30 * DAY_MS;
export const STARVATION_SUPPORT_QUIET_MS = 7 * DAY_MS;
/** Safety valve: one run never pushes more than this many drivers. */
export const STARVATION_MAX_PER_RUN = 100;

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/** True only when LOCATION_STARVATION_PUSH is exactly "1". Unset = dry run. */
export function locationStarvationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LOCATION_STARVATION_PUSH === "1";
}

/** Is this `trip.recording_dropped` metadata a starved recording? */
export function isStarvedDrop(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const m = metadata as Record<string, unknown>;
  if (m.platform !== "android") return false;
  if (m.reason !== "too_short" && m.reason !== "no_coords") return false;
  // Missing coords on a no_coords drop means none; missing on too_short is
  // unknowable, so it does not count.
  const coords = typeof m.coords === "number" ? m.coords : m.reason === "no_coords" ? 0 : null;
  if (coords === null || coords > STARVATION_MAX_COORDS) return false;
  if (typeof m.durationSec === "number" && m.durationSec < STARVATION_MIN_DURATION_SEC) return false;
  return true;
}

/** Read `batteryOptimisation.ignoring` from a diagnostic dump's statusJson. */
export function dumpBatteryIgnoring(statusJson: unknown): boolean | null {
  if (!statusJson || typeof statusJson !== "object" || Array.isArray(statusJson)) return null;
  const bo = (statusJson as Record<string, unknown>).batteryOptimisation;
  if (!bo || typeof bo !== "object" || Array.isArray(bo)) return null;
  const v = (bo as Record<string, unknown>).ignoring;
  return typeof v === "boolean" ? v : null;
}

export interface StarvationCandidate {
  hasPushToken: boolean;
  /** Times (ms) of this driver's starved drops. */
  starvedDropTimes: number[];
  /** When the newest automatic trip was saved (ms), if any in the window. */
  lastAutoTripAt: number | null;
  /** From the latest diagnostic dump; null when unknown. */
  batteryIgnoring: boolean | null;
  /** battery_opt_nudge.resolved in the last 30 days: they already fixed it. */
  batteryResolvedRecently: boolean;
  /** Newest support.reply_sent to them (ms). */
  lastSupportReplyAt: number | null;
  /** Newest notification.location_starvation (ms). */
  lastPushAt: number | null;
  /** Newest location_starvation.dry_run (ms). Dry runs dedupe the same way. */
  lastDryRunAt: number | null;
}

export type StarvationSkip =
  | "no_token"
  | "too_few_drops"
  | "trip_saved_since"
  | "already_unrestricted"
  | "support_contacted"
  | "cooldown";

export type StarvationDecision =
  | { send: true; starvedDrops: number; lastStarvedAt: number }
  | { send: false; reason: StarvationSkip };

/** The whole targeting rule. Order matters only for which reason is logged. */
export function decideLocationStarvation(
  c: StarvationCandidate,
  now: number,
  live: boolean
): StarvationDecision {
  const inWindow = c.starvedDropTimes.filter((t) => t >= now - STARVATION_WINDOW_MS && t <= now);
  if (inWindow.length < STARVATION_MIN_DROPS) return { send: false, reason: "too_few_drops" };
  const lastStarvedAt = Math.max(...inWindow);
  if (c.lastAutoTripAt !== null && c.lastAutoTripAt > lastStarvedAt) {
    return { send: false, reason: "trip_saved_since" };
  }
  if (c.batteryIgnoring === true || c.batteryResolvedRecently) {
    return { send: false, reason: "already_unrestricted" };
  }
  if (c.lastSupportReplyAt !== null && now - c.lastSupportReplyAt < STARVATION_SUPPORT_QUIET_MS) {
    return { send: false, reason: "support_contacted" };
  }
  // A live run is held back by earlier pushes only. A dry run is held back by
  // earlier dry runs too, so it writes one marker per driver per 30 days.
  const lastSeen = live
    ? c.lastPushAt
    : Math.max(c.lastPushAt ?? 0, c.lastDryRunAt ?? 0) || null;
  if (lastSeen !== null && now - lastSeen < STARVATION_COOLDOWN_MS) {
    return { send: false, reason: "cooldown" };
  }
  if (!c.hasPushToken) return { send: false, reason: "no_token" };
  return { send: true, starvedDrops: inWindow.length, lastStarvedAt };
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface StarvationPlanItem {
  userId: string;
  pushToken: string;
  starvedDrops: number;
  lastStarvedAt: number;
}

export interface StarvationPlan {
  send: StarvationPlanItem[];
  considered: number;
  skipped: Record<StarvationSkip, number>;
}

function newestByUser(rows: { userId: string | null; createdAt: Date }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.userId) continue;
    const t = r.createdAt.getTime();
    if (t > (out.get(r.userId) ?? 0)) out.set(r.userId, t);
  }
  return out;
}

/** Selection only: reads, no writes. Shared by the job and any probe. */
export async function planLocationStarvation(
  now: Date = new Date(),
  live: boolean = locationStarvationEnabled()
): Promise<StarvationPlan> {
  const nowMs = now.getTime();
  const since = new Date(nowMs - STARVATION_WINDOW_MS);
  const skipped: Record<StarvationSkip, number> = {
    no_token: 0,
    too_few_drops: 0,
    trip_saved_since: 0,
    already_unrestricted: 0,
    support_contacted: 0,
    cooldown: 0,
  };

  const drops = await prisma.appEvent.findMany({
    where: {
      type: "trip.recording_dropped",
      createdAt: { gte: since },
      userId: { not: null },
      metadata: { path: "$.platform", equals: "android" },
    },
    select: { userId: true, metadata: true, createdAt: true },
  });
  const dropTimes = new Map<string, number[]>();
  for (const d of drops) {
    if (!d.userId || !isStarvedDrop(d.metadata)) continue;
    const a = dropTimes.get(d.userId) ?? [];
    a.push(d.createdAt.getTime());
    dropTimes.set(d.userId, a);
  }
  const ids: string[] = [];
  for (const [id, times] of dropTimes) {
    if (times.length >= STARVATION_MIN_DROPS) ids.push(id);
    else skipped.too_few_drops++;
  }
  if (ids.length === 0) return { send: [], considered: dropTimes.size, skipped };

  const thirtyDays = new Date(nowMs - STARVATION_COOLDOWN_MS);
  const [users, trips, dumps, resolved, support, pushed, dryRuns] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, pushToken: true } }),
    // "Automatic" = not a manual entry; phantom trips are not real drives.
    prisma.trip.groupBy({
      by: ["userId"],
      where: {
        userId: { in: ids },
        isManualEntry: false,
        isPhantomTrip: false,
        createdAt: { gte: since },
      },
      _max: { createdAt: true },
    }),
    // One dump row per user (userId is unique), so no orderBy while selecting
    // statusJson: that throws MysqlError 1038 on prod.
    prisma.diagnosticDump.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, statusJson: true },
    }),
    prisma.appEvent.findMany({
      where: { type: "battery_opt_nudge.resolved", userId: { in: ids }, createdAt: { gte: thirtyDays } },
      select: { userId: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: {
        type: "support.reply_sent",
        userId: { in: ids },
        createdAt: { gte: new Date(nowMs - STARVATION_SUPPORT_QUIET_MS) },
      },
      select: { userId: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: { type: LOCATION_STARVATION_EVENT, userId: { in: ids }, createdAt: { gte: thirtyDays } },
      select: { userId: true, createdAt: true },
    }),
    prisma.appEvent.findMany({
      where: { type: LOCATION_STARVATION_DRY_RUN_EVENT, userId: { in: ids }, createdAt: { gte: thirtyDays } },
      select: { userId: true, createdAt: true },
    }),
  ]);

  const lastTrip = new Map<string, number>();
  for (const t of trips) {
    if (t._max.createdAt) lastTrip.set(t.userId, t._max.createdAt.getTime());
  }
  const ignoring = new Map(dumps.map((d) => [d.userId, dumpBatteryIgnoring(d.statusJson)]));
  const resolvedSet = new Set(resolved.map((r) => r.userId));
  const supportAt = newestByUser(support);
  const pushedAt = newestByUser(pushed);
  const dryAt = newestByUser(dryRuns);

  const send: StarvationPlanItem[] = [];
  for (const u of users) {
    const decision = decideLocationStarvation(
      {
        hasPushToken: !!u.pushToken,
        starvedDropTimes: dropTimes.get(u.id) ?? [],
        lastAutoTripAt: lastTrip.get(u.id) ?? null,
        batteryIgnoring: ignoring.get(u.id) ?? null,
        batteryResolvedRecently: resolvedSet.has(u.id),
        lastSupportReplyAt: supportAt.get(u.id) ?? null,
        lastPushAt: pushedAt.get(u.id) ?? null,
        lastDryRunAt: dryAt.get(u.id) ?? null,
      },
      nowMs,
      live
    );
    if (decision.send) {
      send.push({
        userId: u.id,
        pushToken: u.pushToken!,
        starvedDrops: decision.starvedDrops,
        lastStarvedAt: decision.lastStarvedAt,
      });
    } else {
      skipped[decision.reason]++;
    }
  }
  return { send, considered: dropTimes.size, skipped };
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export async function runLocationStarvationJob(now: Date = new Date()): Promise<Record<string, unknown>> {
  // Quiet hours: wait for the next run rather than record a send that never
  // went out. The dry run is silent, so it is not held.
  const live = locationStarvationEnabled();
  if (live && isPushQuietHours(now)) return { skipped: "quiet_hours" };

  const plan = await planLocationStarvation(now, live);
  const capped = plan.send.slice(0, STARVATION_MAX_PER_RUN);
  const skips = Object.entries(plan.skipped)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");

  if (!live) {
    for (const s of capped) {
      logEvent(LOCATION_STARVATION_DRY_RUN_EVENT, s.userId, {
        starvedDrops: s.starvedDrops,
        lastStarvedAt: new Date(s.lastStarvedAt).toISOString(),
      });
    }
    console.log(
      `[jobs/locationStarvation] DRY RUN: would push ${plan.send.length} ` +
        `(drivers with starved drops ${plan.considered}; skipped ${skips}). ` +
        `Drivers: ${capped.slice(0, 5).map((s) => `${s.userId.slice(0, 8)} x${s.starvedDrops}`).join(", ") || "none"}`
    );
    return { dryRun: true, wouldSend: plan.send.length, skipped: plan.skipped };
  }

  const messages: ExpoPushMessage[] = capped.map((s) => ({
    to: s.pushToken,
    title: LOCATION_STARVATION_TITLE,
    body: LOCATION_STARVATION_BODY,
    sound: "default",
    // Builds without the open_battery_settings case land on Home.
    data: { type: "location_starvation", action: LOCATION_STARVATION_ACTION },
  }));
  // Log before sending so a crash mid-send cannot lead to a second push on
  // the next run (the cooldown reads these rows).
  for (const s of capped) {
    logEvent(LOCATION_STARVATION_EVENT, s.userId, {
      starvedDrops: s.starvedDrops,
      lastStarvedAt: new Date(s.lastStarvedAt).toISOString(),
    });
  }
  if (messages.length > 0) await sendPushNotifications(messages);
  console.log(`[jobs/locationStarvation] sent ${messages.length} (skipped ${skips}).`);
  return { sent: messages.length, skipped: plan.skipped };
}
