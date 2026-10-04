// Road distance for recorded trips with only a few GPS points (4 Oct 2026).
//
// Map-matching needs 10 breadcrumbs (mapMatching.ts MIN_POINTS), so a trip
// the phone caught at only its two ends, or at a handful of points, kept the
// straight-line sum of those points. In the 30 days to 4 Oct 2026, 266
// recorded trips with 5 or fewer points were stored within 5% of the
// straight line; a sample of 25 came to 70.0 mi stored against 109.5 mi by
// road, so those drivers were short of about a third of their miles. Many
// came from the iPhone shift fault of 29 Sep - 3 Oct (thin shift trips), the
// rest from battery saving, poor signal and short hops.
//
// The fix routes along the roads between each recorded point in turn and
// adopts that distance ONLY when it is plausible:
//   - it is at least 5% more than the stored figure (never lowers a trip),
//   - it is no more than 2.5x the straight line between the ends (a GPS jump
//     must never turn into a long drive),
//   - the speed it implies over the trip's recorded duration is 80 mph or
//     less, and the routed drive time fits inside that duration (plus slack).
// Every change logs the old figure (trip.distance_recalculated, source
// "sparse_route") so it can be audited and undone.

import { haversineDistance } from "@mileclear/shared";
import { resolveRouteDistance } from "./routing.js";

export const SPARSE_MIN_POINTS = 2;
/** At 10+ points map-matching takes over. */
export const SPARSE_MAX_POINTS = 9;
/** Below this straight-line span there is nothing worth routing. */
export const SPARSE_MIN_CROW_MILES = 0.3;
export const SPARSE_MIN_GAIN = 1.05;
export const SPARSE_MAX_CROW_RATIO = 2.5;
export const SPARSE_MAX_MPH = 80;
/** Routed drive time may exceed the recorded span by this factor plus slack
 *  (recorded times start and end a little late or early). */
export const SPARSE_DURATION_FACTOR = 1.5;
export const SPARSE_DURATION_SLACK_SECS = 10 * 60;
/** Hops shorter than this are taken as straight: routing two points 50 m
 *  apart can snap them to opposite carriageways and add a U-turn. */
export const SPARSE_MIN_SEGMENT_MILES = 0.15;

export interface SparsePoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

/** Points worse than this are not used as waypoints. The dry run of 4 Oct
 *  2026 found a trip whose last fix was 2,252 m out (a GPS jump) adding
 *  miles never driven. */
export const SPARSE_MAX_ACCURACY_M = 100;
/** A single hop whose road route is more than this times its straight line
 *  is a snapping artefact (one-way systems, the wrong carriageway): the dry
 *  run had 0.35 mi hops priced at 0.99 mi in a city centre. Such a hop counts
 *  at a typical road factor instead. */
export const SPARSE_MAX_HOP_RATIO = 1.8;
export const SPARSE_TYPICAL_HOP_RATIO = 1.3;

/** Drop points too inaccurate to steer by. Unknown accuracy is kept. */
export function usablePoints<T extends SparsePoint>(points: T[]): T[] {
  return points.filter((p) => p.accuracy == null || p.accuracy <= SPARSE_MAX_ACCURACY_M);
}

/** Miles to count for one hop. */
export function hopMiles(crowMiles: number, roadMiles: number | null): number {
  if (roadMiles == null) return crowMiles * SPARSE_TYPICAL_HOP_RATIO;
  if (crowMiles > 0 && roadMiles / crowMiles > SPARSE_MAX_HOP_RATIO) return crowMiles * SPARSE_TYPICAL_HOP_RATIO;
  return roadMiles;
}

export function isSparseCandidate(args: {
  isManualEntry: boolean;
  coordinateCount: number;
  crowMiles: number;
}): boolean {
  return (
    !args.isManualEntry &&
    args.coordinateCount >= SPARSE_MIN_POINTS &&
    args.coordinateCount <= SPARSE_MAX_POINTS &&
    args.crowMiles >= SPARSE_MIN_CROW_MILES
  );
}

export type SparseVerdict =
  | { accept: true; miles: number }
  | { accept: false; reason: "no_gain" | "too_long_for_crow" | "too_fast" | "too_slow_for_span" };

export function judgeSparseRoute(args: {
  routedMiles: number;
  routedDurationSecs: number | null;
  storedMiles: number;
  crowMiles: number;
  /** endedAt - startedAt in seconds, or null when the trip has no end. */
  spanSecs: number | null;
}): SparseVerdict {
  const { routedMiles, routedDurationSecs, storedMiles, crowMiles, spanSecs } = args;
  if (routedMiles < storedMiles * SPARSE_MIN_GAIN) return { accept: false, reason: "no_gain" };
  if (crowMiles > 0 && routedMiles / crowMiles > SPARSE_MAX_CROW_RATIO) return { accept: false, reason: "too_long_for_crow" };
  if (spanSecs != null && spanSecs > 0) {
    const mph = routedMiles / (spanSecs / 3600);
    if (mph > SPARSE_MAX_MPH) return { accept: false, reason: "too_fast" };
    if (routedDurationSecs != null && routedDurationSecs > spanSecs * SPARSE_DURATION_FACTOR + SPARSE_DURATION_SLACK_SECS) {
      return { accept: false, reason: "too_slow_for_span" };
    }
  }
  return { accept: true, miles: Math.round(routedMiles * 100) / 100 };
}

/** Road distance along the recorded points in order, hop by hop. Short hops
 *  count as straight. Null if any hop cannot be routed. */
export async function routeThroughPoints(
  points: SparsePoint[],
  userId?: string
): Promise<{ miles: number; durationSecs: number } | null> {
  let miles = 0;
  let durationSecs = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const crow = haversineDistance(a.lat, a.lng, b.lat, b.lng);
    if (crow < SPARSE_MIN_SEGMENT_MILES) {
      miles += crow;
      continue;
    }
    const r = await resolveRouteDistance({ startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng, userId });
    if (!r) return null;
    const counted = hopMiles(crow, r.distanceMiles);
    miles += counted;
    durationSecs += counted === r.distanceMiles ? r.durationSecs : (counted / Math.max(r.distanceMiles, 0.01)) * r.durationSecs;
  }
  return { miles, durationSecs };
}
