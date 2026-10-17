// Roadworks on a recorded trip (17 Oct 2026): the lookups and cache around
// the pure rule in services/tripRoadworksRule.ts. Read only: it never writes
// anything, and never touches the trip.
//
// Street Manager works are deleted two days after they end
// (purgeEndedStreetWorks), and cancelled permits are deleted at once, so the
// list can only name works still stored: on an older trip it is usually
// empty. That is fine for a label that says "if in doubt, say nothing".

import { prisma } from "../lib/prisma.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import type { LatLng } from "./roadCorridor.js";
import { isStreetManagerEnabled } from "./streetManager.js";
import { ATTRIBUTION_STREET_MANAGER } from "./roadAlerts.js";
import {
  TRIP_ROADWORKS_MIN_POINTS,
  TRIP_ROADWORKS_NEAR_M,
  tripRoadworks,
  type TripRoadworksItemOut,
  type TripWorksInput,
} from "./tripRoadworksRule.js";

/** Works arrive late and change, so a cached answer is kept for a few hours
 *  only. The key carries the trip's updatedAt, so an edited trip is looked
 *  at again at once. */
const CACHE_TTL_S = 6 * 3600;
const MAX_WORKS = 500;
const TRAFFIC_TYPES = [
  "road_closure",
  "lane_closure",
  "two_way_signals",
  "multi_way_signals",
  "stop_go_boards",
  "contra_flow",
  "convoy_workings",
];

export interface TripRoadworksResult {
  items: TripRoadworksItemOut[];
  attribution: string | null;
}

const EMPTY: TripRoadworksResult = { items: [], attribution: null };

export const tripRoadworksCacheKey = (tripId: string, updatedAt: Date) =>
  `trip-roadworks:${tripId}:${updatedAt.getTime()}`;

/** Null when the trip is not this driver's. */
export async function loadTripRoadworks(userId: string, tripId: string): Promise<TripRoadworksResult | null> {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId, isPhantomTrip: false },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      isManualEntry: true,
      updatedAt: true,
    },
  });
  if (!trip) return null;
  if (trip.isManualEntry || !isStreetManagerEnabled()) return EMPTY;

  const key = tripRoadworksCacheKey(trip.id, trip.updatedAt);
  const cached = await cacheGet(key);
  if (cached) {
    try {
      return JSON.parse(cached) as TripRoadworksResult;
    } catch {
      // fall through and work it out again
    }
  }

  const result = await compute(trip);
  await cacheSet(key, JSON.stringify(result), CACHE_TTL_S);
  return result;
}

async function compute(trip: {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
}): Promise<TripRoadworksResult> {
  // One trip's breadcrumbs, by the (tripId, recordedAt) index.
  const rows = await prisma.tripCoordinate.findMany({
    where: { tripId: trip.id },
    select: { lat: true, lng: true, recordedAt: true },
    orderBy: { recordedAt: "asc" },
  });
  const points: LatLng[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng) || (r.lat === 0 && r.lng === 0)) continue;
    points.push([r.lat, r.lng]);
  }
  if (points.length < TRIP_ROADWORKS_MIN_POINTS) return EMPTY;

  const endedAt = trip.endedAt ?? rows[rows.length - 1]?.recordedAt ?? trip.startedAt;

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of points) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  const padLat = (TRIP_ROADWORKS_NEAR_M + 10) / 111320;
  const padLng = (TRIP_ROADWORKS_NEAR_M + 10) / (111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));

  let works: TripWorksInput[];
  try {
    // No select: the work category column is being added separately; when it
    // exists it comes back with the row and is read below.
    const found = await prisma.streetWorksEvent.findMany({
      where: {
        trafficManagement: { in: TRAFFIC_TYPES },
        minLat: { lte: maxLat + padLat },
        maxLat: { gte: minLat - padLat },
        minLng: { lte: maxLng + padLng },
        maxLng: { gte: minLng - padLng },
        startAt: { lte: endedAt },
        OR: [{ endAt: null }, { endAt: { gte: trip.startedAt } }],
      },
      take: MAX_WORKS,
    });
    works = found.map((r) => {
      const g = (r.geometry ?? {}) as { lines?: LatLng[][]; points?: LatLng[] };
      const category = (r as Record<string, unknown>).workCategory;
      return {
        reference: r.reference,
        trafficManagement: r.trafficManagement,
        isTrafficSensitive: r.isTrafficSensitive,
        workStatus: r.workStatus,
        streetName: r.streetName,
        town: r.town,
        promoter: r.promoter,
        startAt: r.startAt,
        endAt: r.endAt,
        lines: Array.isArray(g.lines) ? g.lines : [],
        points: Array.isArray(g.points) ? g.points : [],
        workCategory: typeof category === "string" ? category : null,
      };
    });
  } catch (err) {
    console.error("[tripRoadworks] works load failed:", (err as Error).message);
    return EMPTY;
  }
  if (works.length === 0) return EMPTY;

  const items = tripRoadworks({ points, startedAt: trip.startedAt, endedAt }, works);
  return { items, attribution: items.length > 0 ? ATTRIBUTION_STREET_MANAGER : null };
}
