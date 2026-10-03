// What a merged trip's distance and end should be (POST /trips/merge).
// Pure, unit-tested.
//
// The merge used the GPS trail whenever any trip in it had breadcrumbs, and
// took its end from whichever trip STARTED last. That is right for joining
// consecutive recorded legs, and wrong for the duplicate banner's Merge,
// which joins two copies of the SAME drive. Shah Rouf, 3 Oct 2026: he
// reported Canny Cod to NE13 9DB (6.1 mi, typed, no breadcrumbs), the app
// flagged it against a 0.34 mi recording of the same minutes, he tapped
// Merge, and the result was 0.34 mi ending at the A167. His 6.1 miles and
// his destination were gone.
//
// Now:
//   - copies of one drive (any two overlap in time): the longest of the trail
//     and the individual distances, ending where the latest-ending trip ends;
//   - consecutive legs: the trail of the recorded legs plus the distances of
//     legs that have no breadcrumbs (a typed leg is not in the trail), ending
//     where the latest-ending trip ends.

import { haversineDistance } from "@mileclear/shared";

export interface MergeInputTrip {
  startedAt: Date;
  endedAt: Date | null;
  distanceMiles: number;
  coordinates: { lat: number; lng: number; recordedAt: Date }[];
}

export function tripsOverlap(trips: Pick<MergeInputTrip, "startedAt" | "endedAt">[]): boolean {
  for (let i = 0; i < trips.length; i++) {
    for (let j = i + 1; j < trips.length; j++) {
      const a = trips[i], b = trips[j];
      const aEnd = (a.endedAt ?? a.startedAt).getTime();
      const bEnd = (b.endedAt ?? b.startedAt).getTime();
      if (a.startedAt.getTime() < bEnd && b.startedAt.getTime() < aEnd) return true;
    }
  }
  return false;
}

/** Haversine sum over time-ordered breadcrumbs. */
export function trailMiles(coords: { lat: number; lng: number; recordedAt: Date }[]): number {
  const sorted = [...coords].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  let miles = 0;
  for (let i = 1; i < sorted.length; i++) {
    miles += haversineDistance(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
  }
  return miles;
}

export function mergedDistanceMiles(trips: MergeInputTrip[]): number {
  const recorded = trips.filter((t) => t.coordinates.length >= 2);
  const trail = recorded.length > 0 ? trailMiles(recorded.flatMap((t) => t.coordinates)) : 0;
  if (tripsOverlap(trips)) {
    return Math.max(trail, ...trips.map((t) => t.distanceMiles));
  }
  const untracked = trips.filter((t) => t.coordinates.length < 2).reduce((s, t) => s + t.distanceMiles, 0);
  return trail + untracked;
}

/** Index of the trip whose end the merged trip takes: the latest end. */
export function latestEndingIndex(trips: Pick<MergeInputTrip, "startedAt" | "endedAt">[]): number {
  let best = 0;
  for (let i = 1; i < trips.length; i++) {
    const end = (trips[i].endedAt ?? trips[i].startedAt).getTime();
    const bestEnd = (trips[best].endedAt ?? trips[best].startedAt).getTime();
    if (end > bestEnd) best = i;
  }
  return best;
}
