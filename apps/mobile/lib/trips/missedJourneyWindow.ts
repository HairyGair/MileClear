// When did a "journey to check" happen? Pure rules for the card and the
// "When did you make this drive?" sheet in components/MissedJourneys.tsx.
//
// 28 Sep 2026, Elisa Barone: a gap offer runs from the moment one trip ended
// (07:07, just after she got to work) to the moment the next one began. The
// drive happened somewhere in there; accepting the offer saved it at 07:07,
// the only time we could NOT be right about, because she had only just
// parked. She drove at 17:30. She then typed the real trip in too, and the
// journey home counted twice.
//
// So a gap offer now says in words when the drive could have been, and when
// that window is wider than the drive by more than ASK_WHEN_SLACK_OVER_MS the
// app asks when the driver set off, with a picker held inside the window, and
// the trip lasts as long as the route takes. Evidence offers (a drive the
// engine recorded, then dropped) keep the times it recorded: those are known.
// "trip_start" offers do not add a trip at all (they extend the next one), so
// they never ask.
//
// Memory, "fix the CLOCK, never cap the gap": the offer is right that a drive
// happened. Only its time was wrong.

import { shortDay } from "../tracking/pauseRule";
import { clockTime } from "./manualTimeRule";
import { ASSUMED_MPH } from "./missedJourneyTimes";

const MINUTE_MS = 60 * 1000;

/** A window no wider than the drive plus this is close enough to known: the
 *  trip starts at the window's start and nobody is asked. */
export const ASK_WHEN_SLACK_OVER_MS = 30 * MINUTE_MS;

/** Offers whose window is the time between two trips, not the drive. */
export const TIME_UNCERTAIN_SOURCES: ReadonlySet<string> = new Set(["gap"]);

export interface OfferWindow {
  departedAt: Date;
  arrivedAt: Date;
}

/**
 * How long the drive takes: the routed duration when we have one (rounded up
 * to the minute), otherwise the offer's miles at ASSUMED_MPH. Never under a
 * minute.
 */
export function travelMsFor(args: { routedSecs: number | null; estimatedMiles: number }): number {
  const { routedSecs, estimatedMiles } = args;
  if (routedSecs != null && Number.isFinite(routedSecs) && routedSecs > 0) {
    return Math.max(MINUTE_MS, Math.ceil(routedSecs / 60) * MINUTE_MS);
  }
  const miles = Number.isFinite(estimatedMiles) && estimatedMiles > 0 ? estimatedMiles : 0;
  return Math.max(MINUTE_MS, Math.ceil(((miles / ASSUMED_MPH) * 60)) * MINUTE_MS);
}

export interface StartBounds {
  /** Earliest set-off, on a whole minute at or after the window opens. */
  earliest: Date;
  /** Latest set-off that still arrives before the window closes, on a whole
   *  minute. Never before `earliest`. */
  latest: Date;
}

const ceilMinute = (ms: number) => Math.ceil(ms / MINUTE_MS) * MINUTE_MS;
const floorMinute = (ms: number) => Math.floor(ms / MINUTE_MS) * MINUTE_MS;

export function startBounds(window: OfferWindow, travelMs: number): StartBounds {
  const earliest = ceilMinute(window.departedAt.getTime());
  const latest = Math.max(earliest, floorMinute(window.arrivedAt.getTime() - travelMs));
  return { earliest: new Date(earliest), latest: new Date(latest) };
}

/** Should the app ask when this drive happened? */
export function needsTimeChoice(source: string | undefined, window: OfferWindow, travelMs: number): boolean {
  if (!source || !TIME_UNCERTAIN_SOURCES.has(source)) return false;
  const span = window.arrivedAt.getTime() - window.departedAt.getTime();
  if (!Number.isFinite(span) || span <= 0) return false;
  return span - travelMs > ASK_WHEN_SLACK_OVER_MS;
}

export type ChosenStartVerdict = "ok" | "too_early" | "too_late";

/** Is a picked set-off time inside the bounds? Compared to the minute. */
export function checkChosenStart(chosen: Date, bounds: StartBounds): ChosenStartVerdict {
  const t = floorMinute(chosen.getTime());
  if (t < bounds.earliest.getTime()) return "too_early";
  if (t > bounds.latest.getTime()) return "too_late";
  return "ok";
}

/**
 * The trip's times for a set-off: the route's length after it, but never past
 * the window's close (the next trip had already started by then).
 */
export function tripTimesFor(start: Date, travelMs: number, window: OfferWindow): { startedAt: Date; endedAt: Date } {
  const s = floorMinute(start.getTime());
  const end = Math.min(s + Math.max(MINUTE_MS, travelMs), window.arrivedAt.getTime());
  return { startedAt: new Date(s), endedAt: new Date(Math.max(end, s + MINUTE_MS)) };
}

/** A point in time as words, with the day only when it is needed. */
function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "sometime between 07:07 and 17:30 on Mon 28 Sep", or across midnight
 *  "sometime between 19:51 on Mon 28 Sep and 08:05 on Tue 29 Sep". */
export function describeWindow(window: OfferWindow): string {
  const { departedAt: a, arrivedAt: b } = window;
  if (sameLocalDay(a, b)) return `sometime between ${clockTime(a)} and ${clockTime(b)} on ${shortDay(a)}`;
  return `sometime between ${clockTime(a)} on ${shortDay(a)} and ${clockTime(b)} on ${shortDay(b)}`;
}

/** A recorded drive's own times: "Mon 28 Sep, 07:07 to 07:25". */
export function describeRecordedTimes(window: OfferWindow): string {
  const { departedAt: a, arrivedAt: b } = window;
  if (sameLocalDay(a, b)) return `${shortDay(a)}, ${clockTime(a)} to ${clockTime(b)}`;
  return `${shortDay(a)} ${clockTime(a)} to ${shortDay(b)} ${clockTime(b)}`;
}

/** "any time from 07:07 to 17:05", with days when the range crosses one. */
export function describeStartRange(bounds: StartBounds): string {
  const { earliest: a, latest: b } = bounds;
  if (sameLocalDay(a, b)) return `any time from ${clockTime(a)} to ${clockTime(b)}`;
  return `any time from ${clockTime(a)} on ${shortDay(a)} to ${clockTime(b)} on ${shortDay(b)}`;
}

/** A drive's length in words: "about 25 min", "about 1 hr 10 min". */
export function describeTravel(travelMs: number): string {
  const mins = Math.max(1, Math.round(travelMs / MINUTE_MS));
  if (mins < 60) return `about ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `about ${h} hr` : `about ${h} hr ${m} min`;
}
