// Late-start backfill for recorded trips (4 Oct 2026).
//
// Some automatically recorded drives begin well into the drive: the first fix
// is 0.2-2 miles from where the same driver's previous trip ended, and the car
// is already moving when it is taken. Driver df0a037d (iPhone, build 93) had
// four of these on 1-3 Oct 2026, 0.4-0.6 mi each (1 Oct 08:04 began on
// Bristol Road South while the 07:48 trip had ended 0.6 mi away). The opening
// stretch of the drive is simply missing from the record.
//
// Two things already try to close the gap, and this covers what they leave:
//   - wakeLagStart.ts moves the start back at create time, but only for a hop
//     under 0.6 mi, at least 5 minutes after the previous trip, from a
//     previous end that is a saved place or has an address, and only against
//     a previous trip the server already holds (a trip synced out of order
//     finds none). It never looks at motion.
//   - the missed-journey scan suppresses every auto gap under 0.6 mi as wake
//     lag, and only OFFERS the 0.6-5 mi moving-at-first-fix gaps
//     ("trip_start"); the miles are added only if the driver taps Extend.
//
// The evidence that separates "the recording started late" from "the driver
// set off from somewhere else" is the first fix: a car doing 9+ mph at the
// moment recording begins did not start there. With that, plus the same
// vehicle, a gap long enough to have driven the stretch, a road route close
// to the straight line and no other trip in the way, the start is moved back
// to the previous trip's end, the routed miles are added, and the old values
// are kept (gpsQuality.lateStartBackfill + AppEvent trip.start_backfilled) so
// it can be undone.
//
// The case it must not repeat is Rachel's (wakeLagStart.ts, 27 Aug 2026): an
// uncaptured evening drive home, then a morning drive whose start was moved to
// the shop she had left the night before. The 12-hour cap and the "a saved
// place is a closer origin" guard are aimed at exactly that.
//
// The pure decision is judgeLateStart (unit-tested); runLateStartBackfill
// does the lookups, the route and the write.

import { Prisma } from "@prisma/client";
import { haversineDistance, getTaxYear } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";
import { resolveRouteDistance } from "./routing.js";
import { upsertMileageSummary } from "./mileage.js";
import { decodePolyline } from "./mapMatching.js";
import { encodePolyline } from "./tripSplit.js";
import { MOVING_AT_WAKE_IMPLIED_MPH, MOVING_AT_WAKE_SPEED_MPS, type FirstFixInput } from "./missedJourneys.js";

/** Below this the wake-lag extension (and GPS drift) own the gap. */
export const LATE_START_MIN_CROW_MILES = 0.2;
/** Above this the gap is long enough to hold a drive of its own. */
export const LATE_START_MAX_CROW_MILES = 2.0;
/** A previous trip ended longer ago than this is not the same outing. */
export const LATE_START_MAX_GAP_MS = 12 * 60 * 60 * 1000;
/** Road route may be at most this times the straight line. */
export const LATE_START_MAX_ROUTE_RATIO = 2.0;
/** And at least this (anything shorter is a routing glitch). */
export const LATE_START_MIN_ROUTE_RATIO = 0.95;
/** Fix accuracy worse than this does not count as a known position. Same
 *  ceiling as sparseRoute.ts uses for waypoints. */
export const LATE_START_MAX_ACCURACY_M = 100;
/** The stored start must be the first recorded fix: within this distance... */
export const LATE_START_FIRST_FIX_MAX_MILES = 0.1;
/** ...and this time. Otherwise something (or someone) already moved it. */
export const LATE_START_FIRST_FIX_MAX_MS = 2 * 60 * 1000;
/** A saved place counts as "on the way" from the previous end when going via
 *  it is at most this times the straight line. */
export const LATE_START_ON_THE_WAY_RATIO = 1.2;

/** The phone's planted departure anchor (nativeLocation.ts
 *  plantNativeAnchorBackfill, geofencing/index.ts): a synthetic first fix at
 *  the parked spot, speed 0, accuracy exactly 50 m, 30 s before the first
 *  real fix. It is not a fix the car recorded. */
export const PLANTED_ANCHOR_SPEED = 0;
export const PLANTED_ANCHOR_ACCURACY_M = 50;
/** An anchor this close to the previous trip's end means the phone already
 *  put the start back there. */
export const LATE_START_ANCHOR_MATCH_MILES = 0.15;
/** Speed implied by the first two real fixes above this is a GPS jump or a
 *  long gap between fixes, not evidence of motion: unknown. */
export const LATE_START_MAX_IMPLIED_MPH = 90;

const SAVED_LOCATION_DRIFT_BUFFER_M = 50;
const METERS_TO_MILES = 0.000621371;

export interface LateStartFix extends FirstFixInput {
  accuracy: number | null;
}

export interface LateStartTrip {
  id: string;
  startedAt: Date;
  startLat: number;
  startLng: number;
  vehicleId: string | null;
  isManualEntry: boolean;
  isPhantomTrip: boolean;
  originalStartLat: number | null;
  gpsQuality: unknown;
  /** First three recorded fixes, oldest first (a planted anchor, if any,
   *  plus the first two real fixes). */
  firstFixes: LateStartFix[];
}

export interface LateStartPrevTrip {
  id: string;
  endedAt: Date | null;
  endLat: number | null;
  endLng: number | null;
  endAddress: string | null;
  vehicleId: string | null;
  /** Accuracy of its last recorded fix, null when not stored. */
  lastFixAccuracy: number | null;
}

export interface LateStartSavedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface LateStartOtherTrip {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
}

export type LateStartSkipReason =
  | "manual_entry"
  | "phantom"
  | "start_already_moved"
  | "already_extended"
  | "offer_decided"
  | "no_prev_trip"
  | "prev_end_missing"
  | "prev_ends_after_start"
  | "gap_too_long"
  | "vehicle_changed"
  | "crow_below_min"
  | "crow_above_max"
  | "anchor_backfilled"
  | "anchor_mismatch"
  | "no_first_fix"
  | "start_not_first_fix"
  | "not_moving_at_first_fix"
  | "first_fix_inaccurate"
  | "prev_end_inaccurate"
  | "closer_saved_place"
  | "route_unavailable"
  | "route_implausible"
  | "route_too_long_for_crow"
  | "gap_shorter_than_drive"
  | "overlaps_other_trip";

export interface LateStartBackfill {
  ok: true;
  newStartedAt: Date;
  startLat: number;
  startLng: number;
  /** Label for the moved start: the saved place's name, else the previous
   *  trip's end address, else null for the address backfill to fill. */
  startAddress: string | null;
  addedMiles: number;
  crowMiles: number;
  gapMin: number;
  routedDurationSecs: number;
}

export interface LateStartSkip {
  ok: false;
  reason: LateStartSkipReason;
  crowMiles?: number;
  gapMin?: number;
}

export type LateStartDecision = LateStartBackfill | LateStartSkip;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function withinSavedLocation(lat: number, lng: number, loc: LateStartSavedLocation): boolean {
  const radiusMiles = (loc.radiusMeters + SAVED_LOCATION_DRIFT_BUFFER_M) * METERS_TO_MILES;
  return haversineDistance(lat, lng, loc.latitude, loc.longitude) <= radiusMiles;
}

export function isPlantedAnchor(fix: { speed: number | null; accuracy: number | null } | undefined): boolean {
  return fix != null && fix.speed === PLANTED_ANCHOR_SPEED && fix.accuracy === PLANTED_ANCHOR_ACCURACY_M;
}

/** Split a planted anchor off the front of the fixes. */
export function splitPlantedAnchor<T extends { speed: number | null; accuracy: number | null }>(
  fixes: T[]
): { anchor: T | null; real: T[] } {
  return isPlantedAnchor(fixes[0]) ? { anchor: fixes[0], real: fixes.slice(1) } : { anchor: null, real: fixes };
}

/**
 * Was the car moving at the first REAL fix? true / false, or null when it
 * cannot be told. Same thresholds as missedJourneys.isMovingAtFirstFix, but
 * an implied speed over LATE_START_MAX_IMPLIED_MPH is unknown rather than
 * moving: 2 mi between fixes 30 s apart is 240 mph, and that is a jump.
 */
export function movingAtFirstRealFix(real: FirstFixInput[]): boolean | null {
  if (real.length === 0) return null;
  const first = real[0];
  if (first.speed != null && first.speed >= MOVING_AT_WAKE_SPEED_MPS) return true;
  if (real.length < 2) return first.speed != null ? false : null;
  const second = real[1];
  const hours = (second.recordedAt.getTime() - first.recordedAt.getTime()) / 3600000;
  if (!(hours > 0)) return first.speed != null ? false : null;
  const mph = haversineDistance(first.lat, first.lng, second.lat, second.lng) / hours;
  if (mph > LATE_START_MAX_IMPLIED_MPH) return null;
  return mph >= MOVING_AT_WAKE_IMPLIED_MPH;
}

/** Has anything already moved this trip's start back? */
export function alreadyExtended(gpsQuality: unknown): boolean {
  const gq = asObject(gpsQuality);
  return gq.startExtendedSource != null || gq.lateStartBackfill != null;
}

/**
 * Cheap checks that need no route: the ones the backfill script and the
 * create hook run before paying for a route. Returns null when the trip is
 * still a candidate, or the skip.
 */
export function precheckLateStart(args: {
  trip: LateStartTrip;
  prev: LateStartPrevTrip | null;
  savedLocations: LateStartSavedLocation[];
  /** A missed-journey offer for this pair was accepted, extended or dismissed. */
  offerDecided: boolean;
}): LateStartSkip | null {
  const { trip, prev, savedLocations, offerDecided } = args;

  if (trip.isManualEntry) return { ok: false, reason: "manual_entry" };
  if (trip.isPhantomTrip) return { ok: false, reason: "phantom" };
  // The wake-lag extension, the leading edge-phantom trim and a driver's own
  // start edit all record the device's start here. Any of them has already
  // decided where this trip begins; this rule does not second-guess them.
  if (trip.originalStartLat != null) return { ok: false, reason: "start_already_moved" };
  if (alreadyExtended(trip.gpsQuality)) return { ok: false, reason: "already_extended" };
  if (!prev) return { ok: false, reason: "no_prev_trip" };
  if (prev.endedAt == null || prev.endLat == null || prev.endLng == null) {
    return { ok: false, reason: "prev_end_missing" };
  }

  const gapMs = trip.startedAt.getTime() - prev.endedAt.getTime();
  const gapMin = Math.round((gapMs / 60000) * 10) / 10;
  if (gapMs < 0) return { ok: false, reason: "prev_ends_after_start", gapMin };
  if (gapMs > LATE_START_MAX_GAP_MS) return { ok: false, reason: "gap_too_long", gapMin };

  const crow = haversineDistance(prev.endLat, prev.endLng, trip.startLat, trip.startLng);
  const crowMiles = round2(crow);
  if (crow < LATE_START_MIN_CROW_MILES) return { ok: false, reason: "crow_below_min", crowMiles, gapMin };
  if (crow > LATE_START_MAX_CROW_MILES) return { ok: false, reason: "crow_above_max", crowMiles, gapMin };

  // Swapping cars between trips is a different journey, whatever the map says.
  if ((prev.vehicleId ?? null) !== (trip.vehicleId ?? null)) {
    return { ok: false, reason: "vehicle_changed", crowMiles, gapMin };
  }
  // The driver already answered for this pair on the Missed Journeys card.
  if (offerDecided) return { ok: false, reason: "offer_decided", crowMiles, gapMin };

  // The phone's planted departure anchor is not a recorded fix. Near the
  // previous end, the phone already put the start back; anywhere else, the
  // phone saw the car parked somewhere other than the previous end, so the
  // previous end is not this drive's origin. Either way, hands off.
  const { anchor, real } = splitPlantedAnchor(trip.firstFixes);
  if (anchor) {
    const anchorToPrev = haversineDistance(anchor.lat, anchor.lng, prev.endLat, prev.endLng);
    return {
      ok: false,
      reason: anchorToPrev <= LATE_START_ANCHOR_MATCH_MILES ? "anchor_backfilled" : "anchor_mismatch",
      crowMiles,
      gapMin,
    };
  }

  const first = real[0];
  if (!first) return { ok: false, reason: "no_first_fix", crowMiles, gapMin };
  if (
    haversineDistance(first.lat, first.lng, trip.startLat, trip.startLng) > LATE_START_FIRST_FIX_MAX_MILES ||
    Math.abs(first.recordedAt.getTime() - trip.startedAt.getTime()) > LATE_START_FIRST_FIX_MAX_MS
  ) {
    return { ok: false, reason: "start_not_first_fix", crowMiles, gapMin };
  }
  // The evidence: a car already doing 9+ mph when recording began did not
  // start there. A stationary first fix could be a walk, a lift or a swap.
  if (movingAtFirstRealFix(real) !== true) {
    return { ok: false, reason: "not_moving_at_first_fix", crowMiles, gapMin };
  }
  if (first.accuracy != null && first.accuracy > LATE_START_MAX_ACCURACY_M) {
    return { ok: false, reason: "first_fix_inaccurate", crowMiles, gapMin };
  }

  const prevEndPlace =
    savedLocations.find((loc) => withinSavedLocation(prev.endLat!, prev.endLng!, loc)) ?? null;
  if (prev.lastFixAccuracy != null && prev.lastFixAccuracy > LATE_START_MAX_ACCURACY_M && !prevEndPlace) {
    return { ok: false, reason: "prev_end_inaccurate", crowMiles, gapMin };
  }

  // Another place the driver keeps, nearer to where recording began than the
  // previous end and not on the way from it, is an equally good origin: the
  // drive there may simply not have been recorded (Rachel, 27 Aug 2026).
  for (const loc of savedLocations) {
    if (loc === prevEndPlace) continue;
    if (withinSavedLocation(prev.endLat, prev.endLng, loc)) continue;
    const toStart = haversineDistance(loc.latitude, loc.longitude, trip.startLat, trip.startLng);
    if (toStart >= crow) continue;
    const viaPlace = haversineDistance(prev.endLat, prev.endLng, loc.latitude, loc.longitude) + toStart;
    if (viaPlace > crow * LATE_START_ON_THE_WAY_RATIO) {
      return { ok: false, reason: "closer_saved_place", crowMiles, gapMin };
    }
  }
  return null;
}

/**
 * Pure decision. routeMiles / routeSecs are the routed figures from the
 * previous end to this trip's start (null when routing failed). otherTrips
 * are the driver's other trips around the gap (never this one or prev).
 */
export function judgeLateStart(args: {
  trip: LateStartTrip;
  prev: LateStartPrevTrip | null;
  savedLocations: LateStartSavedLocation[];
  offerDecided: boolean;
  otherTrips: LateStartOtherTrip[];
  routeMiles: number | null;
  routeSecs: number | null;
}): LateStartDecision {
  const skip = precheckLateStart(args);
  if (skip) return skip;
  const { trip, savedLocations, otherTrips, routeMiles, routeSecs } = args;
  const prev = args.prev!;
  const prevEndedAt = prev.endedAt!;
  const prevEndLat = prev.endLat!;
  const prevEndLng = prev.endLng!;

  const gapMs = trip.startedAt.getTime() - prevEndedAt.getTime();
  const gapMin = Math.round((gapMs / 60000) * 10) / 10;
  const crow = haversineDistance(prevEndLat, prevEndLng, trip.startLat, trip.startLng);
  const crowMiles = round2(crow);

  if (routeMiles == null || !Number.isFinite(routeMiles) || routeMiles <= 0 || routeSecs == null || !(routeSecs > 0)) {
    return { ok: false, reason: "route_unavailable", crowMiles, gapMin };
  }
  if (routeMiles < crow * LATE_START_MIN_ROUTE_RATIO) return { ok: false, reason: "route_implausible", crowMiles, gapMin };
  if (routeMiles > crow * LATE_START_MAX_ROUTE_RATIO) return { ok: false, reason: "route_too_long_for_crow", crowMiles, gapMin };
  // The stretch has to fit in the time between the two trips.
  if (gapMs < routeSecs * 1000) return { ok: false, reason: "gap_shorter_than_drive", crowMiles, gapMin };

  const newStartedAt = new Date(Math.max(prevEndedAt.getTime(), trip.startedAt.getTime() - Math.round(routeSecs * 1000)));
  const from = newStartedAt.getTime();
  const to = trip.startedAt.getTime();
  for (const o of otherTrips) {
    if (o.id === trip.id || o.id === prev.id) continue;
    const oStart = o.startedAt.getTime();
    const oEnd = (o.endedAt ?? o.startedAt).getTime();
    if (oStart < to && oEnd > from) return { ok: false, reason: "overlaps_other_trip", crowMiles, gapMin };
  }

  const place = savedLocations.find((loc) => withinSavedLocation(prevEndLat, prevEndLng, loc));
  const startAddress = place?.name?.trim() || prev.endAddress?.trim() || null;

  return {
    ok: true,
    newStartedAt,
    startLat: prevEndLat,
    startLng: prevEndLng,
    startAddress,
    addedMiles: round2(routeMiles),
    crowMiles,
    gapMin,
    routedDurationSecs: Math.round(routeSecs),
  };
}

/** Join the routed stretch onto the front of a stored polyline. Null when
 *  either is missing, so the map falls back to the breadcrumbs. */
export function prependPolyline(stretch: string | null, existing: string | null): string | null {
  if (!stretch || !existing) return null;
  const a = decodePolyline(stretch);
  const b = decodePolyline(existing);
  if (a.length === 0 || b.length === 0) return null;
  return encodePolyline([...a, ...b]);
}

export interface LateStartRunResult {
  decision: LateStartDecision;
  tripId: string;
  prevTripId: string | null;
  storedMiles: number;
  startedAt: Date;
}

/**
 * Database-backed runner: used by POST /trips (fire-and-forget, after the
 * map-matching / sparse-routing hook has settled the distance) and by
 * scripts/backfill-late-starts.mjs. Never throws. Returns null when the trip
 * does not exist (or on an error), otherwise the decision; a route is only
 * requested once the cheap checks pass. With dryRun nothing is written.
 */
export async function runLateStartBackfill(args: {
  tripId: string;
  userId: string;
  triggeredBy: string;
  dryRun?: boolean;
}): Promise<LateStartRunResult | null> {
  const { tripId, userId, triggeredBy, dryRun } = args;
  try {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
      select: {
        id: true, startedAt: true, startLat: true, startLng: true, startAddress: true,
        vehicleId: true, isManualEntry: true, isPhantomTrip: true, originalStartLat: true,
        originalStartLng: true, gpsQuality: true, distanceMiles: true, routePolyline: true,
      },
    });
    if (!trip || trip.isManualEntry || trip.isPhantomTrip) return null;

    // The previous trip: the latest-ending one at or before this start.
    const prevRow = await prisma.trip.findFirst({
      where: {
        userId,
        id: { not: trip.id },
        isPhantomTrip: false,
        endedAt: { lte: trip.startedAt, gte: new Date(trip.startedAt.getTime() - LATE_START_MAX_GAP_MS) },
      },
      orderBy: { endedAt: "desc" },
      select: { id: true, endedAt: true, endLat: true, endLng: true, endAddress: true, vehicleId: true },
    });

    const [firstFixes, lastPrevFix, savedLocations, offers] = await Promise.all([
      prisma.tripCoordinate.findMany({
        where: { tripId: trip.id },
        orderBy: { recordedAt: "asc" },
        take: 3,
        select: { lat: true, lng: true, speed: true, accuracy: true, recordedAt: true },
      }),
      prevRow
        ? prisma.tripCoordinate.findFirst({
            where: { tripId: prevRow.id },
            orderBy: { recordedAt: "desc" },
            select: { accuracy: true },
          })
        : Promise.resolve(null),
      prisma.savedLocation.findMany({
        where: { userId },
        select: { id: true, name: true, latitude: true, longitude: true, radiusMeters: true },
      }),
      prevRow
        ? prisma.missedJourneyProposal.findMany({
            where: { userId, key: `${prevRow.id}:${trip.id}` },
            select: { id: true, status: true },
          })
        : Promise.resolve([] as { id: string; status: string }[]),
    ]);

    const lateTrip: LateStartTrip = { ...trip, firstFixes };
    const prev: LateStartPrevTrip | null = prevRow ? { ...prevRow, lastFixAccuracy: lastPrevFix?.accuracy ?? null } : null;
    const offerDecided = offers.some((o) => o.status === "accepted" || o.status === "dismissed");
    const base = { tripId: trip.id, prevTripId: prev?.id ?? null, storedMiles: trip.distanceMiles, startedAt: trip.startedAt };

    const pre = precheckLateStart({ trip: lateTrip, prev, savedLocations, offerDecided });
    // Quiet for the everyday skips (no gap to speak of); a candidate that
    // fails a later check is logged so the guards can be measured.
    if (pre) {
      if (!dryRun && pre.crowMiles != null && pre.crowMiles >= LATE_START_MIN_CROW_MILES && pre.crowMiles <= LATE_START_MAX_CROW_MILES) {
        logEvent("trip.start_backfill_skipped", userId, { tripId: trip.id, prevTripId: prev?.id ?? null, reason: pre.reason, crowMiles: pre.crowMiles, gapMin: pre.gapMin ?? null, triggeredBy });
      }
      return { decision: pre, ...base };
    }

    const route = await resolveRouteDistance({
      startLat: prev!.endLat!, startLng: prev!.endLng!,
      endLat: trip.startLat, endLng: trip.startLng,
      userId,
    });
    const others = await prisma.trip.findMany({
      where: {
        userId,
        id: { notIn: [trip.id, prev!.id] },
        isPhantomTrip: false,
        startedAt: { lt: trip.startedAt },
        OR: [{ endedAt: { gt: prev!.endedAt! } }, { endedAt: null, startedAt: { gte: prev!.endedAt! } }],
      },
      select: { id: true, startedAt: true, endedAt: true },
      take: 20,
    });
    const decision = judgeLateStart({
      trip: lateTrip, prev, savedLocations, offerDecided, otherTrips: others,
      routeMiles: route?.distanceMiles ?? null,
      routeSecs: route?.durationSecs ?? null,
    });

    if (!decision.ok) {
      if (!dryRun) {
        logEvent("trip.start_backfill_skipped", userId, {
          tripId: trip.id, prevTripId: prev!.id, reason: decision.reason,
          crowMiles: decision.crowMiles ?? null, gapMin: decision.gapMin ?? null,
          routeMiles: route?.distanceMiles ?? null, triggeredBy,
        });
      }
      return { decision, ...base };
    }
    if (dryRun) return { decision, ...base };

    const newMiles = round2(trip.distanceMiles + decision.addedMiles);
    const undo = {
      source: "late_start",
      prevTripId: prev!.id,
      oldStartedAt: trip.startedAt.toISOString(),
      oldStartLat: trip.startLat,
      oldStartLng: trip.startLng,
      oldStartAddress: trip.startAddress,
      oldMiles: trip.distanceMiles,
      newMiles,
      routedMiles: decision.addedMiles,
      routedDurationSecs: decision.routedDurationSecs,
      triggeredBy,
      at: new Date().toISOString(),
    };
    const openOffers = offers.filter((o) => o.status === "proposed").map((o) => o.id);

    await prisma.$transaction(async (tx) => {
      // Re-check inside the write: another path may have moved it meanwhile.
      const fresh = await tx.trip.findUnique({
        where: { id: trip.id },
        select: { startedAt: true, startLat: true, startLng: true, distanceMiles: true, gpsQuality: true, originalStartLat: true },
      });
      if (
        !fresh ||
        fresh.startedAt.getTime() !== trip.startedAt.getTime() ||
        fresh.startLat !== trip.startLat ||
        fresh.startLng !== trip.startLng ||
        fresh.distanceMiles !== trip.distanceMiles ||
        fresh.originalStartLat != null ||
        alreadyExtended(fresh.gpsQuality)
      ) {
        throw new Error("late_start_trip_changed");
      }
      await tx.tripCoordinate.create({
        data: {
          tripId: trip.id, lat: decision.startLat, lng: decision.startLng,
          speed: null, accuracy: null, recordedAt: decision.newStartedAt,
        },
      });
      await tx.trip.update({
        where: { id: trip.id },
        data: {
          startedAt: decision.newStartedAt,
          startLat: decision.startLat,
          startLng: decision.startLng,
          startAddress: decision.startAddress,
          originalStartLat: trip.startLat,
          originalStartLng: trip.startLng,
          distanceMiles: newMiles,
          coordinateCount: { increment: 1 },
          routePolyline: prependPolyline(route?.encodedPolyline ?? null, trip.routePolyline),
          gpsQuality: { ...asObject(trip.gpsQuality), lateStartBackfill: undo } as Prisma.InputJsonValue,
        },
      });
      // An open offer for this pair would extend the trip a second time.
      if (openOffers.length > 0) {
        await tx.missedJourneyProposal.updateMany({
          where: { id: { in: openOffers }, userId, status: "proposed" },
          data: { status: "covered" },
        });
      }
    });

    logEvent("trip.start_backfilled", userId, {
      tripId: trip.id,
      ...undo,
      crowMiles: decision.crowMiles,
      gapMin: decision.gapMin,
      newStartedAt: decision.newStartedAt.toISOString(),
      routeSource: route?.source ?? null,
      coveredProposalIds: openOffers,
    });
    const oldYear = getTaxYear(trip.startedAt);
    const newYear = getTaxYear(decision.newStartedAt);
    upsertMileageSummary(userId, oldYear).catch(() => {});
    if (newYear !== oldYear) upsertMileageSummary(userId, newYear).catch(() => {});
    return { decision, ...base };
  } catch (err) {
    logEvent("trip.start_backfill_skipped", userId, {
      tripId,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
      triggeredBy,
    });
    return null;
  }
}

/**
 * Create hook: judge the new trip, and the trip after it. A trip that syncs
 * late (offline, or a retry) arrives after the drive that followed it, so
 * that next drive never saw its previous trip when it was saved.
 */
export async function runLateStartAroundNewTrip(args: {
  tripId: string;
  userId: string;
  endedAt: Date | null;
}): Promise<void> {
  // Off until the 30-day dry run has been read and approved (4 Oct 2026):
  // this rewrites trips, so it only runs when LATE_START_BACKFILL=1.
  if (process.env.LATE_START_BACKFILL !== "1") return;
  await runLateStartBackfill({ tripId: args.tripId, userId: args.userId, triggeredBy: "trip_create_hook" });
  if (!args.endedAt) return;
  const next = await prisma.trip.findFirst({
    where: {
      userId: args.userId,
      id: { not: args.tripId },
      isManualEntry: false,
      isPhantomTrip: false,
      startedAt: { gte: args.endedAt, lte: new Date(args.endedAt.getTime() + LATE_START_MAX_GAP_MS) },
    },
    orderBy: { startedAt: "asc" },
    select: { id: true },
  });
  if (next) await runLateStartBackfill({ tripId: next.id, userId: args.userId, triggeredBy: "prev_trip_synced" });
}
