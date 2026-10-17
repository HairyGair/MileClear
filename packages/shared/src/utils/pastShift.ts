// "Add a past shift" (Oct 2026): a whole earlier work session typed in at
// once, its times and every trip in it, instead of one trip at a time. A gig
// driver asked for it to catch up on days the app did not record.
//
// One set of rules for the app (checked before the save button does anything)
// and the server (POST /shifts/past), so the two never disagree about what a
// valid past shift is. Pure: no database, no clock (callers pass `now`).

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** The longest past shift that can be added. */
export const PAST_SHIFT_MAX_HOURS = 24;
/** The most trips one past shift can carry. */
export const PAST_SHIFT_MAX_TRIPS = 40;
/** A phone clock a little ahead of the server's is not "in the future". */
export const PAST_SHIFT_CLOCK_SLACK_MS = 5 * MINUTE_MS;

export interface PastShiftTripTimes {
  startedAt: Date;
  endedAt?: Date | null;
}

function valid(d: Date | null | undefined): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime());
}

/**
 * The first thing wrong with a past shift, in words a driver can act on, or
 * null when it can be saved. Trips are numbered from 1 in the order given.
 */
export function pastShiftProblem(args: {
  startedAt: Date;
  endedAt: Date;
  trips: PastShiftTripTimes[];
  now: number;
}): string | null {
  const { startedAt, endedAt, trips, now } = args;
  if (!valid(startedAt) || !valid(endedAt)) return "Add when the shift started and ended.";
  const latest = now + PAST_SHIFT_CLOCK_SLACK_MS;
  const s = startedAt.getTime();
  const e = endedAt.getTime();
  if (e <= s) return "The shift has to end after it starts.";
  if (e - s > PAST_SHIFT_MAX_HOURS * HOUR_MS) return `A shift can be up to ${PAST_SHIFT_MAX_HOURS} hours long.`;
  if (e > latest) return "The shift can't end later than now.";
  if (trips.length === 0) return "Add at least one trip.";
  if (trips.length > PAST_SHIFT_MAX_TRIPS) return `A shift can have up to ${PAST_SHIFT_MAX_TRIPS} trips.`;
  for (let i = 0; i < trips.length; i++) {
    const n = i + 1;
    const t = trips[i];
    if (!valid(t.startedAt)) return `Add when trip ${n} set off.`;
    const ts = t.startedAt.getTime();
    const te = valid(t.endedAt) ? t.endedAt.getTime() : null;
    if (te != null && te < ts) return `Trip ${n} can't end before it starts.`;
    if (ts > latest || (te != null && te > latest)) return `Trip ${n} is later than now.`;
    if (ts < s || ts > e || (te != null && te > e)) return `Trip ${n} is outside the shift's times.`;
  }
  return null;
}

/**
 * The shift window stretched to hold every trip: the earliest of the shift
 * start and the trip starts, to the latest of the shift end and the trip
 * ends. Equal to the given window when every trip already fits.
 */
export function windowCoveringTrips(
  startedAt: Date,
  endedAt: Date,
  trips: PastShiftTripTimes[]
): { startedAt: Date; endedAt: Date } {
  let s = startedAt.getTime();
  let e = endedAt.getTime();
  for (const t of trips) {
    if (!valid(t.startedAt)) continue;
    s = Math.min(s, t.startedAt.getTime());
    e = Math.max(e, valid(t.endedAt) ? t.endedAt.getTime() : t.startedAt.getTime());
  }
  return { startedAt: new Date(s), endedAt: new Date(e) };
}
