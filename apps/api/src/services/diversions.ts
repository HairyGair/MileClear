// Diversion labels (5 Oct 2026): the lookups and the write around the pure
// rule in services/diversionRule.ts.
//
// Runs after a GPS trip is saved (routes/trips/index.ts, after map matching
// and the late-start backfill so the stored distance is final). Off unless
// TRIP_DIVERSIONS=1. Never changes the trip: it only adds a trip_diversions
// row that the trip detail shows as a label, and logs
// trip.diversion_labelled {extraMiles, trafficManagement} (no locations).

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";
import type { LatLng } from "./roadCorridor.js";
import {
  DIVERSION_CLOSURE_TYPES,
  DIVERSION_HISTORY_DAYS,
  DIVERSION_MAX_HISTORY,
  DIVERSION_MIN_POINTS,
  DIVERSION_SAME_PLACE_M,
  closureSearchBox,
  judgeDiversion,
  similarPastTrips,
  type ClosureInput,
  type DiversionDecision,
  type DiversionTripInput,
} from "./diversionRule.js";

export function isTripDiversionsEnabled(): boolean {
  return process.env.TRIP_DIVERSIONS === "1";
}

export interface TripDiversionView {
  streetName: string | null;
  town: string | null;
  promoter: string | null;
  usualMiles: number;
  extraMiles: number;
}

const VIEW_SELECT = {
  tripId: true,
  streetName: true,
  town: true,
  promoter: true,
  usualMiles: true,
  extraMiles: true,
} as const;

/** Diversion labels for a set of trips, in one query. Empty map when the
 *  table is not migrated yet, so trip reads never fail on it. */
export async function loadDiversionsForTrips(tripIds: string[]): Promise<Map<string, TripDiversionView>> {
  const out = new Map<string, TripDiversionView>();
  if (tripIds.length === 0) return out;
  try {
    const rows = await prisma.tripDiversion.findMany({ where: { tripId: { in: tripIds } }, select: VIEW_SELECT });
    for (const r of rows) {
      out.set(r.tripId, {
        streetName: r.streetName,
        town: r.town,
        promoter: r.promoter,
        usualMiles: r.usualMiles,
        extraMiles: r.extraMiles,
      });
    }
  } catch (err) {
    console.error("[diversions] load failed:", (err as Error).message);
  }
  return out;
}

async function loadPoints(tripIds: string[]): Promise<Map<string, LatLng[]>> {
  const out = new Map<string, LatLng[]>();
  if (tripIds.length === 0) return out;
  const rows = await prisma.tripCoordinate.findMany({
    where: { tripId: { in: tripIds } },
    select: { tripId: true, lat: true, lng: true },
    orderBy: [{ tripId: "asc" }, { recordedAt: "asc" }],
  });
  for (const r of rows) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng) || (r.lat === 0 && r.lng === 0)) continue;
    let arr = out.get(r.tripId);
    if (!arr) out.set(r.tripId, (arr = []));
    arr.push([r.lat, r.lng]);
  }
  return out;
}

export interface DiversionRunResult {
  tripId: string;
  decision: DiversionDecision;
  written: boolean;
}

/**
 * Judge one trip and, unless dryRun, store the label. Returns null when the
 * trip is not a finished GPS trip of this driver (or anything fails). Does
 * NOT check TRIP_DIVERSIONS: the save hook (runDiversionHook) does, and the
 * backfill script runs regardless so it can dry-run before the flag is on.
 */
export async function runDiversionLabel(args: {
  tripId: string;
  userId: string;
  dryRun?: boolean;
  triggeredBy?: string;
}): Promise<DiversionRunResult | null> {
  const trip = await prisma.trip.findFirst({
    where: { id: args.tripId, userId: args.userId },
    select: {
      id: true, startLat: true, startLng: true, endLat: true, endLng: true, distanceMiles: true,
      startedAt: true, endedAt: true, isManualEntry: true, isPhantomTrip: true, coordinateCount: true,
      diversion: { select: { id: true } },
    },
  });
  if (!trip || trip.isManualEntry || trip.isPhantomTrip || trip.diversion) return null;
  if (trip.endLat == null || trip.endLng == null || !trip.endedAt) return null;
  if (trip.coordinateCount < DIVERSION_MIN_POINTS) {
    return { tripId: trip.id, decision: { ok: false, reason: "too_few_points", historyCount: 0 }, written: false };
  }

  // Past trips whose start and end both sit in a box around this trip's start
  // and end (the rule then applies the exact 400 m distance).
  const dLat = DIVERSION_SAME_PLACE_M / 111320 + 0.0005;
  const dLng = DIVERSION_SAME_PLACE_M / (111320 * Math.cos((trip.startLat * Math.PI) / 180)) + 0.0008;
  const candidates = await prisma.trip.findMany({
    where: {
      userId: args.userId,
      id: { not: trip.id },
      isManualEntry: false,
      isPhantomTrip: false,
      coordinateCount: { gte: DIVERSION_MIN_POINTS },
      startedAt: { gte: new Date(trip.startedAt.getTime() - DIVERSION_HISTORY_DAYS * 86400000), lt: trip.startedAt },
      startLat: { gte: trip.startLat - dLat, lte: trip.startLat + dLat },
      startLng: { gte: trip.startLng - dLng, lte: trip.startLng + dLng },
      endLat: { gte: trip.endLat - dLat, lte: trip.endLat + dLat },
      endLng: { gte: trip.endLng - dLng, lte: trip.endLng + dLng },
      diversion: { is: null },
    },
    select: {
      id: true, startLat: true, startLng: true, endLat: true, endLng: true, distanceMiles: true,
      startedAt: true, endedAt: true,
    },
    orderBy: { startedAt: "desc" },
    take: DIVERSION_MAX_HISTORY * 2,
  });

  const self: DiversionTripInput = { ...trip, points: [] };
  // Cheap pre-check before any breadcrumbs are read.
  const preliminary = similarPastTrips(self, candidates, false);
  const pointsById = await loadPoints([trip.id, ...preliminary.map((p) => p.id)]);
  self.points = pointsById.get(trip.id) ?? [];
  const past: DiversionTripInput[] = preliminary.map((p) => ({ ...p, points: pointsById.get(p.id) ?? [] }));

  let closures: ClosureInput[] = [];
  const similar = similarPastTrips(self, past);
  const box = closureSearchBox(self, similar);
  if (box && similar.length > 0) {
    const rows = await prisma.streetWorksEvent.findMany({
      where: {
        trafficManagement: { in: [...DIVERSION_CLOSURE_TYPES] },
        minLat: { lte: box.maxLat },
        maxLat: { gte: box.minLat },
        minLng: { lte: box.maxLng },
        maxLng: { gte: box.minLng },
        startAt: { lte: trip.endedAt },
        OR: [{ endAt: null }, { endAt: { gte: trip.startedAt } }],
      },
      select: {
        reference: true, trafficManagement: true, streetName: true, town: true, promoter: true,
        startAt: true, endAt: true, geometry: true,
      },
      take: 500,
    });
    closures = rows.map((r) => {
      const g = (r.geometry ?? {}) as { lines?: LatLng[][]; points?: LatLng[] };
      return {
        reference: r.reference,
        trafficManagement: r.trafficManagement,
        streetName: r.streetName,
        town: r.town,
        promoter: r.promoter,
        startAt: r.startAt,
        endAt: r.endAt,
        lines: Array.isArray(g.lines) ? g.lines : [],
        points: Array.isArray(g.points) ? g.points : [],
      };
    });
  }

  const decision = judgeDiversion(self, past, closures);
  if (!decision.ok || args.dryRun) return { tripId: trip.id, decision, written: false };

  const d = decision.diversion;
  try {
    await prisma.tripDiversion.create({
      data: {
        tripId: trip.id,
        userId: args.userId,
        closureRef: d.closureRef.slice(0, 64),
        streetName: d.streetName?.slice(0, 200) ?? null,
        town: d.town?.slice(0, 100) ?? null,
        promoter: d.promoter?.slice(0, 200) ?? null,
        usualMiles: d.usualMiles,
        extraMiles: d.extraMiles,
      },
    });
  } catch (err) {
    // Already labelled by a concurrent run: fine.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { tripId: trip.id, decision, written: false };
    }
    throw err;
  }
  logEvent("trip.diversion_labelled", args.userId, {
    extraMiles: d.extraMiles,
    trafficManagement: d.trafficManagement,
    triggeredBy: args.triggeredBy ?? "trip_create_hook",
  });
  return { tripId: trip.id, decision, written: true };
}

/** The save hook: off unless TRIP_DIVERSIONS=1, never throws. */
export async function runDiversionHook(args: { tripId: string; userId: string }): Promise<void> {
  if (!isTripDiversionsEnabled()) return;
  try {
    await runDiversionLabel({ ...args, triggeredBy: "trip_create_hook" });
  } catch (err) {
    console.error("[diversions] hook failed:", (err as Error).message);
  }
}
