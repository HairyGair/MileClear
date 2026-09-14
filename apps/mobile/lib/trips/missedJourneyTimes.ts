// Plausible times for a missed-journey trip.
//
// A gap proposal brackets an uncaptured drive between the END of one trip and
// the START of the next. That bracket is evidence the journey happened; it is
// NOT evidence of how long it took. When the two captured trips are far apart
// in time - the classic case being "ended at the farm at 19:51, next trip
// starts at home at 08:05" - the bracket is 12 hours wide for a drive of a
// mile and a half.
//
// trip-form used to prefill startedAt/endedAt with that bracket verbatim, so
// accepting the offer saved a 1.4 mile trip lasting all night. Fleet check
// 14 Sep 2026: 383 trips under 3 miles lasting over 6 hours, 353 of them
// manual entries, which is the signature of exactly this path. The miles were
// right; the durations corrupted every per-hour figure downstream.
//
// The fix is NOT to stop offering long-bracket journeys. A 2h cap was
// dry-run on 13 Sep 2026 against the sibling wake-lag reach-back and would
// have stopped 3,707 of 7,631 extends and removed 1,589 real miles. The
// journey is real. Only the clock is wrong. So keep the offer and give it a
// duration derived from the distance instead.

/** Matches the server's `extend` branch fallback in routes/trips/index.ts. */
export const ASSUMED_MPH = 20;

/** Below this the bracket is a plausible drive-plus-dwell and is left alone.
 *  No journey short enough to be proposed takes three hours to drive. */
export const MAX_PLAUSIBLE_BRACKET_MS = 3 * 60 * 60 * 1000;

/** Never produce a zero-length trip, however short the distance. */
export const MIN_TRAVEL_MS = 60 * 1000;

export interface MissedJourneyTimes {
  startedAt: Date;
  endedAt: Date;
  /** True when the bracket was implausible and the end time was derived. */
  adjusted: boolean;
}

/**
 * `departedAt` is the previous trip's end and `arrivedAt` the next trip's
 * start. We anchor on `departedAt`: leaving shortly after the previous trip
 * ended is the better assumption, because the next trip's start can be a
 * whole night later.
 */
export function plausibleMissedJourneyTimes(args: {
  departedAt: Date;
  arrivedAt: Date;
  estimatedMiles: number;
}): MissedJourneyTimes {
  const { departedAt, arrivedAt, estimatedMiles } = args;
  const bracketMs = arrivedAt.getTime() - departedAt.getTime();

  if (!Number.isFinite(bracketMs) || bracketMs <= 0) {
    return { startedAt: departedAt, endedAt: arrivedAt, adjusted: false };
  }
  if (bracketMs <= MAX_PLAUSIBLE_BRACKET_MS) {
    return { startedAt: departedAt, endedAt: arrivedAt, adjusted: false };
  }

  const miles = Number.isFinite(estimatedMiles) && estimatedMiles > 0 ? estimatedMiles : 0;
  const travelMs = Math.max(MIN_TRAVEL_MS, Math.round((miles / ASSUMED_MPH) * 3600 * 1000));
  // Never push the end past the bracket we know the journey sits inside.
  const endedAt = new Date(Math.min(departedAt.getTime() + travelMs, arrivedAt.getTime()));
  return { startedAt: departedAt, endedAt, adjusted: true };
}
