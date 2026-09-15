/**
 * tripDuplicates: is this new trip the same journey as one the driver
 * already has?
 *
 * In the 14 days to 15 Sep 2026, 104 of 661 hand-added trips overlapped in
 * time with a trip the app recorded for the same driver (3,406 miles counted
 * twice). Two shapes: the driver adds a drive by hand and the real recording
 * lands later (the server watchdog can deliver a trip hours late), or the
 * driver accepts a missed-journey suggestion and the app then fills that gap.
 *
 * Pure. POST /trips calls findDuplicateCandidate with the user's other trips
 * from the surrounding day and, on a hit, marks the NEWER trip with
 * possibleDuplicateOfId. Nothing is deleted: the app offers a merge, and
 * "Keep both" clears the mark.
 */
import { haversineDistance } from "@mileclear/shared";

export interface DuplicateCheckTrip {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  isManualEntry: boolean;
}

/** Share of the shorter trip's duration the two must overlap by. */
export const DUPLICATE_MIN_OVERLAP = 0.5;
/** Both the start and the end must sit this close, in miles, to match,
 *  when both trips were recorded by the app (GPS pins). */
export const DUPLICATE_MAX_ENDPOINT_MILES = 0.5;
/** A hand-added trip is pinned wherever the driver's typed place geocoded,
 *  often a town centre: of 60 manual/recorded pairs in the 14 days to
 *  15 Sep 2026 only 4 sat within 0.5 mi, 45 within 5 mi. So when either
 *  trip is manual the pins only have to agree at this coarser scale; the
 *  time overlap is what identifies the journey. */
export const DUPLICATE_MAX_ENDPOINT_MILES_MANUAL = 5;

function overlapShare(a: DuplicateCheckTrip, b: DuplicateCheckTrip): number {
  const aStart = a.startedAt.getTime();
  const aEnd = a.endedAt!.getTime();
  const bStart = b.startedAt.getTime();
  const bEnd = b.endedAt!.getTime();
  const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
  if (overlap <= 0) return 0;
  const shorter = Math.min(aEnd - aStart, bEnd - bStart);
  // Two zero-length trips at the same instant: overlap is 0, shorter is 0.
  // Treat a positive overlap against a zero-length trip as total.
  if (shorter <= 0) return 1;
  return overlap / shorter;
}

/**
 * True when the two trips overlap in time by at least half the shorter one
 * AND begin and end within 0.5 mi of each other. Trips without an end time
 * or an end point cannot be judged and never match.
 */
export function isDuplicatePair(a: DuplicateCheckTrip, b: DuplicateCheckTrip): boolean {
  if (a.id === b.id) return false;
  if (!a.endedAt || !b.endedAt) return false;
  if (a.endLat == null || a.endLng == null || b.endLat == null || b.endLng == null) return false;
  // Two hand-added trips are never offered as duplicates: merging manual
  // trips sums their distances, so the offer would double the miles rather
  // than remove them. That pair is the driver's to sort by hand.
  if (a.isManualEntry && b.isManualEntry) return false;
  if (overlapShare(a, b) < DUPLICATE_MIN_OVERLAP) return false;
  const radius =
    a.isManualEntry || b.isManualEntry
      ? DUPLICATE_MAX_ENDPOINT_MILES_MANUAL
      : DUPLICATE_MAX_ENDPOINT_MILES;
  const startMiles = haversineDistance(a.startLat, a.startLng, b.startLat, b.startLng);
  if (startMiles > radius) return false;
  const endMiles = haversineDistance(a.endLat, a.endLng, b.endLat, b.endLng);
  return endMiles <= radius;
}

/**
 * The existing trip that looks like the same journey as newTrip, or null.
 * When more than one qualifies, the one that overlaps it most wins.
 */
export function findDuplicateCandidate(
  newTrip: DuplicateCheckTrip,
  existing: DuplicateCheckTrip[]
): DuplicateCheckTrip | null {
  let best: DuplicateCheckTrip | null = null;
  let bestShare = 0;
  for (const candidate of existing) {
    if (!isDuplicatePair(newTrip, candidate)) continue;
    const share = overlapShare(newTrip, candidate);
    if (best == null || share > bestShare) {
      best = candidate;
      bestShare = share;
    }
  }
  return best;
}
