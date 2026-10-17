// "Add a past shift" (Oct 2026): a whole earlier work session typed in at
// once, its times and every trip in it, instead of one trip at a time. A gig
// driver asked for it to catch up on days the app did not record.
//
// One set of rules for the app (checked before the save button does anything)
// and the server (POST /shifts/past), so the two never disagree about what a
// valid past shift is. Pure: no database, no clock (callers pass `now`).

import { haversineDistance } from "./index.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** The longest past shift, as a driver would say it. */
export const PAST_SHIFT_MAX_HOURS = 24;
/** The cap actually applied: one hour more, because the night the clocks go
 *  back has 25 hours and a shift across it is 24 hours on the clock. */
export const PAST_SHIFT_MAX_MS = (PAST_SHIFT_MAX_HOURS + 1) * HOUR_MS;
/** The most trips one past shift can carry. */
export const PAST_SHIFT_MAX_TRIPS = 40;
/** The most miles one past shift can add up to. */
export const PAST_SHIFT_MAX_MILES = 1000;
/** A phone clock a little ahead of the server's is not "in the future". */
export const PAST_SHIFT_CLOCK_SLACK_MS = 5 * MINUTE_MS;

export interface PastShiftTripTimes {
  startedAt: Date;
  endedAt?: Date | null;
  /** Counted towards the shift's miles when known. */
  distanceMiles?: number | null;
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
  if (e - s > PAST_SHIFT_MAX_MS) return `A shift can be up to ${PAST_SHIFT_MAX_HOURS} hours long.`;
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
  return pastShiftMilesProblem(trips.map((t) => t.distanceMiles ?? 0));
}

/** Too many miles for one shift: almost always a wrong place picked. */
export function pastShiftMilesProblem(miles: number[]): string | null {
  const total = miles.reduce((sum, m) => sum + (Number.isFinite(m) ? m : 0), 0);
  return total > PAST_SHIFT_MAX_MILES
    ? "That's over 1,000 miles for one shift. Check where each trip started and ended."
    : null;
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

/**
 * The end the server gives a trip that arrived without one: set-off plus the
 * routed drive time (or one minute without a route), never past the shift's
 * end or now, and never before the set-off.
 */
export function clampedTripEnd(args: {
  startedAt: Date;
  routedSecs: number | null;
  shiftEnd: Date;
  now: number;
}): Date {
  const s = args.startedAt.getTime();
  const secs = args.routedSecs != null && Number.isFinite(args.routedSecs) && args.routedSecs > 0 ? args.routedSecs : 60;
  const end = Math.min(s + secs * 1000, args.shiftEnd.getTime(), args.now);
  return new Date(Math.max(end, s));
}

// ── The same save twice ─────────────────────────────────────────────────────

/** Two pins this close are the same place typed twice. */
export const SAME_PIN_MILES = 0.03; // about 50 m

export interface PastShiftContent {
  trips: Array<{ startedAt: Date; startLat: number; startLng: number }>;
  earning: { platform: string; amountPence: number } | null;
}

/**
 * Is `incoming` the shift already saved as `saved`, sent again? Only when
 * everything matches: the number of trips, each trip's set-off time and start
 * pin, and the earning. Anything different is a different save, never merged
 * into the old one (a re-entered shift with a 4th trip must not lose it).
 */
export function isSamePastShift(saved: PastShiftContent, incoming: PastShiftContent): boolean {
  if (saved.trips.length !== incoming.trips.length) return false;
  const byTime = (a: { startedAt: Date }, b: { startedAt: Date }) => a.startedAt.getTime() - b.startedAt.getTime();
  const a = [...saved.trips].sort(byTime);
  const b = [...incoming.trips].sort(byTime);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startedAt.getTime() !== b[i].startedAt.getTime()) return false;
    if (haversineDistance(a[i].startLat, a[i].startLng, b[i].startLat, b[i].startLng) > SAME_PIN_MILES) return false;
  }
  if (!saved.earning || !incoming.earning) return !saved.earning && !incoming.earning;
  return saved.earning.platform === incoming.earning.platform && saved.earning.amountPence === incoming.earning.amountPence;
}
