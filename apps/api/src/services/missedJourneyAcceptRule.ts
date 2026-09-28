/**
 * The times a driver gives when they accept a "journey to check" (pure,
 * unit-tested).
 *
 * 28 Sep 2026, Elisa Barone: accepting a gap offer made a trip stamped at the
 * offer's departedAt, which for a gap is the moment the PREVIOUS trip ended
 * (07:07, just after she got to work), not when she drove (17:30). She then
 * typed the real trip too, and the journey home was counted twice.
 *
 * A gap offer only knows the drive happened somewhere between trip A ending
 * and trip B starting, so the app now asks when, and sends the trip's times
 * with the accept. The drive cannot have happened outside that window: the car
 * was at A's end when A ended and at B's start when B started. So times
 * outside it are refused, and the offer stays open rather than being marked as
 * added with a trip that is not this journey.
 *
 * Evidence offers (recorded, dropped_*) have a window that IS the recording,
 * so the same test holds for them. Older apps send no times; that is still
 * accepted, as before.
 */

/** Allowance either side of the window. Pickers work in whole minutes, so a
 *  window that opens at 07:07:43 is shown and picked as 07:07. */
export const ACCEPT_WINDOW_SLACK_MS = 2 * 60 * 1000;

export interface AcceptWindow {
  departedAt: Date;
  arrivedAt: Date;
}

export interface AcceptedTimes {
  startedAt?: Date;
  endedAt?: Date;
}

export type AcceptTimesVerdict =
  | { ok: true; given: boolean }
  | { ok: false; reason: "end_before_start" | "starts_before_window" | "ends_after_window" | "outside_window" };

export function checkAcceptedTimes(window: AcceptWindow, times: AcceptedTimes): AcceptTimesVerdict {
  const { startedAt, endedAt } = times;
  if (!startedAt && !endedAt) return { ok: true, given: false };
  const lo = window.departedAt.getTime() - ACCEPT_WINDOW_SLACK_MS;
  const hi = window.arrivedAt.getTime() + ACCEPT_WINDOW_SLACK_MS;
  const s = startedAt?.getTime();
  const e = endedAt?.getTime();
  if (s != null && e != null && e < s) return { ok: false, reason: "end_before_start" };
  if (s != null && (s < lo || s > hi)) return { ok: false, reason: s < lo ? "starts_before_window" : "outside_window" };
  if (e != null && (e > hi || e < lo)) return { ok: false, reason: e > hi ? "ends_after_window" : "outside_window" };
  return { ok: true, given: true };
}
