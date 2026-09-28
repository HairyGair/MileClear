/**
 * Create-time backstop for a recording that is a second copy of a drive the
 * driver already has. The rule itself (fix-by-fix, never times or end points
 * alone) lives in recordedDuplicate.ts; this module only fetches what it needs.
 *
 * Kept deliberately cheap on the busiest write in the API: one indexed query
 * for recorded trips that touch the new trip's window, and breadcrumbs only
 * when there is such a trip, bounded to that window.
 */
import { prisma } from "../lib/prisma.js";
import {
  coveredShare,
  isRecordedCopy,
  MATCH_WINDOW_MS,
  type CoverageResult,
  type DuplicateFix,
} from "./recordedDuplicate.js";

export interface RecordedCopyMatch {
  keeperId: string;
  coverage: CoverageResult;
  /** Other recorded trips the new one overlapped, for the log line. */
  overlappingTripIds: string[];
}

/**
 * The saved trip whose breadcrumbs already hold (almost) all of `fixes`, or
 * null. Only recorded, non-phantom trips are consulted: a hand-typed trip has
 * no breadcrumbs to compare, and a phantom is never the version worth keeping.
 */
export async function findRecordedCopy(args: {
  userId: string;
  startedAt: Date;
  endedAt: Date;
  fixes: DuplicateFix[];
}): Promise<RecordedCopyMatch | null> {
  const from = new Date(args.startedAt.getTime() - MATCH_WINDOW_MS);
  const to = new Date(args.endedAt.getTime() + MATCH_WINDOW_MS);
  const overlapping = await prisma.trip.findMany({
    where: {
      userId: args.userId,
      isManualEntry: false,
      isPhantomTrip: false,
      startedAt: { lte: to },
      endedAt: { gte: from },
    },
    select: { id: true },
    take: 50,
  });
  if (overlapping.length === 0) return null;

  const ids = overlapping.map((t) => t.id);
  const coords = await prisma.tripCoordinate.findMany({
    where: { tripId: { in: ids }, recordedAt: { gte: from, lte: to } },
    select: { tripId: true, lat: true, lng: true, recordedAt: true },
  });
  const byTrip = new Map<string, DuplicateFix[]>();
  for (const c of coords) {
    const list = byTrip.get(c.tripId) ?? [];
    list.push({ t: c.recordedAt.getTime(), lat: c.lat, lng: c.lng });
    byTrip.set(c.tripId, list);
  }
  const coverage = coveredShare(
    args.fixes,
    [...byTrip].map(([id, fixes]) => ({ id, fixes }))
  );
  if (!isRecordedCopy(coverage) || !coverage.bestTripId) return null;
  return { keeperId: coverage.bestTripId, coverage, overlappingTripIds: ids };
}
