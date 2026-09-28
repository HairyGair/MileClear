/**
 * Quiet hours for pushes, and when the streak reminder goes (pure,
 * unit-tested).
 *
 * 28 Sep 2026, a shift-only driver got a "Driving today?" streak reminder at
 * about 04:18 UK time. That job ran on a 6-hour timer that the nightly
 * restart phase-locks to ~03/09/15/21 UTC, and its once-a-day check reset at
 * server (UTC) midnight, so the first tick of the day was always the
 * small-hours one. Several other jobs had no hour gate at all.
 *
 * Rule: no reminder push between 21:00 and 08:00 UK time. The check lives in
 * lib/push.ts so every sender gets it; silent (content-available) pushes and
 * pushes answering something a person just did opt out there. UK time comes
 * from Intl, the same way jobs/eveningDigest.ts does it, so BST and GMT are
 * both right without a time-zone library.
 */

export const PUSH_QUIET_TZ = "Europe/London";
/** First quiet hour (21:00 local). */
export const PUSH_QUIET_START_HOUR = 21;
/** First hour pushes may go again (08:00 local). */
export const PUSH_QUIET_END_HOUR = 8;

/** Local hour (0-23) of `now` in `tz`. */
export function localHour(now: Date, tz: string = PUSH_QUIET_TZ): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  });
  const hour = fmt.formatToParts(now).find((p) => p.type === "hour")?.value ?? "0";
  return parseInt(hour, 10) % 24;
}

/** True from 21:00 to 07:59 UK time. */
export function isPushQuietHours(now: Date = new Date()): boolean {
  const h = localHour(now);
  return h >= PUSH_QUIET_START_HOUR || h < PUSH_QUIET_END_HOUR;
}

/** Streak reminder window: 10:00-11:59 UK time. Late enough that a driver who
 *  starts mid-morning has usually set off already (so is not reminded), early
 *  enough to be useful. Two hours wide so the 30-minute runner lands in it
 *  four times, whatever minute the server booted on; the per-UK-day check
 *  keeps it to one push. */
export const STREAK_WINDOW_START_HOUR = 10;
export const STREAK_WINDOW_END_HOUR = 12;

export function inStreakReminderWindow(now: Date = new Date()): boolean {
  const h = localHour(now);
  return h >= STREAK_WINDOW_START_HOUR && h < STREAK_WINDOW_END_HOUR;
}
