/**
 * Database side of recordedOverlap.ts: load the driver's other trips that
 * overlap an incoming recording, and breadcrumbs only inside its time range.
 * Bounded three ways (trips starting within a day before the range, newest 50,
 * coordinates inside the range), so it never scans a driver's whole history.
 */
import { prisma } from "../lib/prisma.js";
import { COVER_MAX_GAP_MS, type OverlapFix, type OverlapOtherTrip } from "./recordedOverlap.js";

export type OverlapTrimMode = "off" | "log" | "on";

/** RECORDED_OVERLAP_TRIM: off | log | on. Anything else reads as the default, log. */
export function overlapTrimMode(): OverlapTrimMode {
  const v = (process.env.RECORDED_OVERLAP_TRIM ?? "").trim().toLowerCase();
  return v === "off" || v === "on" || v === "log" ? v : "log";
}

/** Keepers cover a fix only through their own fixes within COVER_MAX_GAP_MS of
 *  it, so fixes are loaded that far past the upload's range. */
const PAD_MS = COVER_MAX_GAP_MS;
/** A trip that started longer ago than this before the range is not a
 *  candidate (recorded trips do not run for a day). */
const MAX_TRIP_AGE_MS = 24 * 60 * 60 * 1000;

/** The driver's non-phantom recorded trips (visit auto-split tails included,
 *  they are ordinary trips) that overlap [fromMs, toMs], with their fixes in
 *  that range plus 5 minutes either side. Newest first, at most 50. */
export async function loadOverlapCandidates(args: {
  userId: string;
  fromMs: number;
  toMs: number;
}): Promise<OverlapOtherTrip[]> {
  const from = new Date(args.fromMs - PAD_MS);
  const to = new Date(args.toMs + PAD_MS);
  const trips = await prisma.trip.findMany({
    where: {
      userId: args.userId,
      isManualEntry: false,
      isPhantomTrip: false,
      startedAt: { gte: new Date(from.getTime() - MAX_TRIP_AGE_MS), lte: to },
      endedAt: { gte: from },
    },
    select: { id: true, shiftId: true },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  if (trips.length === 0) return [];
  const coords = await prisma.tripCoordinate.findMany({
    where: { tripId: { in: trips.map((t) => t.id) }, recordedAt: { gte: from, lte: to } },
    select: { tripId: true, lat: true, lng: true, accuracy: true, speed: true, recordedAt: true },
  });
  const byTrip = new Map<string, OverlapFix[]>();
  for (const c of coords) {
    const list = byTrip.get(c.tripId) ?? [];
    list.push({ t: c.recordedAt.getTime(), lat: c.lat, lng: c.lng, accuracy: c.accuracy ?? null, speed: c.speed ?? null });
    byTrip.set(c.tripId, list);
  }
  return trips.map((t) => ({
    id: t.id,
    shiftId: t.shiftId ?? null,
    fixes: byTrip.get(t.id) ?? [],
  }));
}

/** A trip this same upload was trimmed into on an earlier attempt, or null.
 *  Trimmed trips record the upload's own startedAt in gpsQuality.overlapTrimmed. */
export async function findTrimmedUpload(args: { userId: string; startedAt: Date; endedAt: Date }) {
  return prisma.trip.findFirst({
    where: {
      userId: args.userId,
      isPhantomTrip: false,
      startedAt: { gte: args.startedAt, lte: args.endedAt },
      gpsQuality: { path: "$.overlapTrimmed.originalStartedAt", equals: args.startedAt.toISOString() },
    },
    include: { vehicle: true, shift: true },
  });
}
