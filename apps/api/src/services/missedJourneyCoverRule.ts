import { haversineDistance } from "@mileclear/shared";

/**
 * Is a "journey to check" already a trip? (pure, unit-tested)
 *
 * 26 Sep 2026: two drivers had an offer waiting for a drive that was already
 * in their account. Sunny recorded his Evesham -> Mickleton drive himself with
 * Start Trip (22:55-23:20Z) and still had a gap offer for 23:00-23:25Z; support
 * added Jenkins's Fleetwood -> Liverpool drive by hand (12:40-13:40Z) and his
 * gap offer for 12:09-14:25Z stayed open. Accepting either counts the miles
 * twice, which is a tax figure, not a cosmetic one.
 *
 * The scan only cleared its own gap rows when it happened to run again, and
 * only when the new trip sorted between the two trips that made the gap. The
 * evidence rows (recorded, dropped_*) were checked once, when they arrived,
 * and never again. So this rule looks at time, not at how the covering trip
 * was made: auto, Start Trip, typed in, CSV, or added by support all count.
 *
 * Two tests, because the two kinds of offer mean different things by their
 * window:
 *
 *  1. Window mostly covered (every source). Trips together overlap at least
 *     COVER_WINDOW_FRACTION of the offer's own window. Sunny: 20 of 25 min.
 *     This is the only test for the evidence sources ("recorded", the
 *     "dropped_*" family): their window IS the drive, so a trip that fills
 *     most of it is that drive. A trip sitting in a small corner of it is not
 *     enough, because a discarded Start Trip can be a whole day and a short
 *     auto trip inside it does not account for the rest.
 *
 *  2. A trip now sits in the hole (inferred sources, "gap" and "trip_start").
 *     Their window is the time between two trips, parked time included, so a
 *     real drive only ever fills part of it. A trip whose own time lies
 *     mostly (COVER_TRIP_INSIDE_FRACTION) inside the window, and that ends
 *     where the offer ends (below), made that journey.
 *
 * Both tests, for the inferred sources, also need the trip to have got
 * there: the LAST overlapping trip (the one that ends latest) must end within
 * COVER_DESTINATION_KM of the offer's to-point. Dry run on prod, 26 Sep 2026
 * (155 rows would have been hidden across 94 drivers): Oleksandr had a gap
 * 73 Dawberry Road -> 5 Poplar Avenue overlapped by a trip that ENDED at 73
 * Dawberry Road, the gap's start, so the hop to Poplar Avenue was still
 * unexplained; Nicholas had one whose trip ended in Kettering, not at the
 * gap's Digby Street. A trip that stops short leaves a real hole, so the
 * offer stays. If that trip sits between A and B the scan's own prune retires
 * the A:B row on the next visit and offers the remainder (trip -> B) under a
 * new key; that is what happens to Jenkins, whose added trip ends at L9 0NB,
 * about 2 km short of the gap's Long Lane. If it sorts before A, A:B is still
 * the scan's pair and stays offered, which is right: the hop is unexplained.
 * The evidence sources skip this check: their window is the drive, and time
 * alone read right in the same dry run.
 *
 * Touching the edge never counts. A gap window runs from trip A's end to trip
 * B's start exactly, and a "trip_start" offer is by design the stretch just
 * before B that "extend" joins onto it, so both A and B overlap it by zero.
 * An auto trip that overlaps an evidence window by a minute at either end is
 * a fraction of that window and fails test 1. Trips still in progress (no
 * endedAt) are ignored: there is no end to measure against yet.
 */

/** Share of the offer's window that trips must cover to hide it (test 1). */
export const COVER_WINDOW_FRACTION = 0.5;
/** Share of one trip's own time that must fall inside a gap window (test 2). */
export const COVER_TRIP_INSIDE_FRACTION = 0.5;

/** How close to an inferred offer's to-point the last covering trip must end. */
export const COVER_DESTINATION_KM = 1;
const KM_PER_MILE = 1.609344;

/** Sources inferred from a hole between two trips, where test 2 applies. */
export const INFERRED_PROPOSAL_SOURCES: ReadonlySet<string> = new Set(["gap", "trip_start"]);

export interface CoverProposalInput {
  source: string;
  departedAt: Date;
  arrivedAt: Date;
  toLat: number;
  toLng: number;
}

export interface CoverTripInput {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  endLat: number | null;
  endLng: number | null;
}

export interface ProposalCover {
  /** The trip with the largest overlap: the one to show a human. */
  tripId: string;
  /** Which test hid it. */
  rule: "window_covered" | "trip_inside_gap";
  /** Share of the offer's window covered by all overlapping trips, 0-1, 2 dp. */
  windowCoveredFraction: number;
  /** Share of the chosen trip's own time inside the window, 0-1, 2 dp. */
  tripInsideFraction: number;
  /** Inferred sources: km from the last covering trip's end to the offer's
   *  to-point, 1 dp. Null for evidence sources, which do not check it. */
  destinationKm: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The trip that already covers this offer, or null when it should still be
 * offered. `trips` may be any trips of the same driver in any order; trips
 * that do not overlap the window are ignored.
 */
export function findCoveringTrip(
  proposal: CoverProposalInput,
  trips: readonly CoverTripInput[],
): ProposalCover | null {
  const winStart = proposal.departedAt.getTime();
  const winEnd = proposal.arrivedAt.getTime();
  const winLen = winEnd - winStart;
  if (!(winLen > 0)) return null;

  type Hit = { trip: CoverTripInput; from: number; to: number; inside: number };
  const hits: Hit[] = [];
  for (const t of trips) {
    if (t.endedAt == null) continue;
    const tStart = t.startedAt.getTime();
    const tEnd = t.endedAt.getTime();
    if (tEnd < tStart) continue;
    const from = Math.max(winStart, tStart);
    const to = Math.min(winEnd, tEnd);
    const tripLen = tEnd - tStart;
    if (tripLen === 0) {
      // A trip typed in with the same start and end time: it has no length
      // to measure, so it counts as inside only strictly within the window
      // (never on the edge a gap shares with its own A and B).
      if (tStart > winStart && tStart < winEnd) hits.push({ trip: t, from: tStart, to: tStart, inside: 1 });
      continue;
    }
    if (to <= from) continue; // no overlap, or touching at an instant
    hits.push({ trip: t, from, to, inside: (to - from) / tripLen });
  }
  if (hits.length === 0) return null;

  // Union of the overlaps, so two trips that split the drive between them
  // (an auto-split, or a trip plus its continuation) are counted once each
  // and never twice where they overlap one another.
  const spans = hits.map((h) => [h.from, h.to] as const).sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let curFrom = spans[0][0];
  let curTo = spans[0][1];
  for (let i = 1; i < spans.length; i++) {
    const [f, t] = spans[i];
    if (f <= curTo) {
      if (t > curTo) curTo = t;
    } else {
      covered += curTo - curFrom;
      curFrom = f;
      curTo = t;
    }
  }
  covered += curTo - curFrom;
  const windowCoveredFraction = covered / winLen;

  const biggest = hits.reduce((best, h) => (h.to - h.from > best.to - best.from ? h : best));
  const inferred = INFERRED_PROPOSAL_SOURCES.has(proposal.source);

  if (!inferred) {
    if (windowCoveredFraction < COVER_WINDOW_FRACTION) return null;
    return {
      tripId: biggest.trip.id,
      rule: "window_covered",
      windowCoveredFraction: round2(windowCoveredFraction),
      tripInsideFraction: round2(biggest.inside),
      destinationKm: null,
    };
  }

  // Inferred: whichever test fires, the trip that ends last must have ended
  // where the offer says the car went. No end point, no proof: keep the offer.
  const last = hits.reduce((best, h) =>
    (h.trip.endedAt as Date).getTime() > (best.trip.endedAt as Date).getTime() ? h : best,
  );
  if (last.trip.endLat == null || last.trip.endLng == null) return null;
  const destinationKm =
    haversineDistance(last.trip.endLat, last.trip.endLng, proposal.toLat, proposal.toLng) * KM_PER_MILE;
  if (destinationKm > COVER_DESTINATION_KM) return null;

  let rule: ProposalCover["rule"] | null = null;
  if (windowCoveredFraction >= COVER_WINDOW_FRACTION) rule = "window_covered";
  else if (hits.some((h) => h.inside >= COVER_TRIP_INSIDE_FRACTION)) rule = "trip_inside_gap";
  if (rule == null) return null;
  return {
    tripId: last.trip.id,
    rule,
    windowCoveredFraction: round2(windowCoveredFraction),
    tripInsideFraction: round2(last.inside),
    destinationKm: Math.round(destinationKm * 10) / 10,
  };
}
