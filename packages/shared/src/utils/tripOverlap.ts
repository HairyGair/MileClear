// "MileClear already has a trip around then" (add-trip PROPOSALS 0.4, Oct 2026).
//
// 104 of 661 hand-added trips in 14 days overlapped a trip MileClear already
// had, usually a drive the phone recorded and saved late. The server's
// possible-double mark only fires when both ends sit within half a mile, so a
// 9.3-mile recording and a hand-typed leg on the same morning were never
// linked. This rule is about time only: any trip whose span overlaps the one
// being added counts, whatever its ends.
//
// One rule for the app, the website and the server, so the three agree.
// Pure: no database, no clock.

const MINUTE_MS = 60 * 1000;

/** A trip with no end counts as this long, from its start. */
export const NO_END_TRIP_MS = MINUTE_MS;

/** How far before a window a trip can start and still overlap it. Drives
 *  longer than a day are not real, so a day of slack is plenty. */
export const OVERLAP_LOOKBACK_MS = 24 * 60 * MINUTE_MS;

/** The longest window GET /trips/around answers (a calendar month plus the
 *  days either side that the month grid shows). */
export const TRIPS_AROUND_MAX_DAYS = 42;

export interface TimedTrip {
  id: string;
  startedAt: string | Date;
  endedAt: string | Date | null;
}

function ms(v: string | Date | null | undefined): number {
  if (v == null) return Number.NaN;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : Number.NaN;
}

/** A trip's span in epoch ms. No end, or an end at or before the start, is a
 *  one-minute trip at its start. Null when the start is unreadable. */
export function tripSpan(t: TimedTrip): { start: number; end: number } | null {
  const start = ms(t.startedAt);
  if (!Number.isFinite(start)) return null;
  const rawEnd = ms(t.endedAt);
  const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + NO_END_TRIP_MS;
  return { start, end };
}

/** How long two spans share, in ms. Touching ends (one ends as the next
 *  starts) share nothing: back-to-back drives are normal. */
export function sharedMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Every trip that overlaps [start, end], the biggest overlap first (then the
 * earliest start). `end` at or before `start` is read as a one-minute window,
 * the same as a trip with no end.
 */
export function overlappingTrips<T extends TimedTrip>(
  trips: T[],
  start: Date,
  end: Date | null,
  opts: { excludeIds?: string[] } = {}
): T[] {
  const s = start.getTime();
  if (!Number.isFinite(s)) return [];
  const rawEnd = end ? end.getTime() : Number.NaN;
  const e = Number.isFinite(rawEnd) && rawEnd > s ? rawEnd : s + NO_END_TRIP_MS;
  const exclude = new Set(opts.excludeIds ?? []);
  const seen = new Set<string>();
  const hits: Array<{ trip: T; shared: number; start: number }> = [];
  for (const t of trips) {
    if (exclude.has(t.id) || seen.has(t.id)) continue;
    const span = tripSpan(t);
    if (!span) continue;
    const shared = sharedMs(s, e, span.start, span.end);
    if (shared <= 0) continue;
    seen.add(t.id);
    hits.push({ trip: t, shared, start: span.start });
  }
  hits.sort((a, b) => b.shared - a.shared || a.start - b.start);
  return hits.map((h) => h.trip);
}

/** The one trip to point out, or null. */
export function firstOverlappingTrip<T extends TimedTrip>(
  trips: T[],
  start: Date,
  end: Date | null,
  opts: { excludeIds?: string[] } = {}
): T | null {
  return overlappingTrips(trips, start, end, opts)[0] ?? null;
}

/**
 * The window GET /trips/around should read for a check on [start, end]: from
 * a day before the start (a long drive that began earlier still overlaps) to
 * the end.
 */
export function overlapLookupWindow(start: Date, end: Date | null): { from: Date; to: Date } {
  const s = start.getTime();
  const rawEnd = end ? end.getTime() : Number.NaN;
  const e = Number.isFinite(rawEnd) && rawEnd > s ? rawEnd : s + NO_END_TRIP_MS;
  return { from: new Date(s - OVERLAP_LOOKBACK_MS), to: new Date(e) };
}
