// Wake-lag start reconciliation.
//
// The mobile auto-detect engine needs roughly 0.3 to 0.4 miles of driving
// before it arms, so an auto-recorded trip's START sits a few hundred metres
// down the road from where the drive really began. Two things go wrong:
//
//   1. Every leg is short by the wake lag, so HMRC mileage is understated.
//   2. The start label names wherever the engine happened to wake. Rachel
//      (25 Aug 2026) leaves Home, the engine wakes as she passes a client's
//      house 0.3 mi away (a saved location), and the trip is recorded as
//      starting at a place she only drove past.
//
// The server knows something the engine does not: where the previous trip
// ENDED. If the previous trip ended at a real stop (a saved location, or at
// least a geocoded address) a short while ago, and the new trip starts a
// wake-lag-sized hop away from it, the drive almost certainly began there.
// We move the start back to the previous end, prepend a breadcrumb there,
// and add the ROUTED road distance for the missing stretch.
//
// Everything here is deliberately conservative:
//   - crow-flies gap must be in [0.15, 0.6) miles: below that it is a
//     restart from the same place, above it is a different journey;
//   - the previous end must be a real stop, not wherever a capture died;
//   - the distance added is the routed figure, never haversine, and if
//     routing is unavailable we change nothing at all;
//   - distance is only ever increased, never reduced.
//
// The pure decision lives in resolveWakeLagStart so it can be unit-tested
// without a database; reconcileWakeLagStart does the lookups around it.

import { prisma } from "../lib/prisma.js";
import { haversineDistance } from "@mileclear/shared";
import { resolveRouteDistance } from "./routing.js";
import { logEvent } from "./appEvents.js";

export const WAKE_LAG_MIN_MILES = 0.15;
// 0.6, raised to 0.9 on 27 Aug 2026 and PUT BACK the next morning.
//
// The case for 0.9 was real: Rachel Thorndyke's engine armed 0.79 and 0.80 mi
// out on consecutive days, so those drives lost their opening mileage. The
// case against it arrived within twelve hours. Her Co-op-to-home leg was never
// captured, so the last thing the server knew was a trip ending at the Co-op;
// next morning she set off from home, 0.74 mi away, and the extension moved
// the start of her day to a shop she had left the night before and added a
// mile she had not driven. She spotted it herself.
//
// Audited across the fleet: six extensions used the 0.6-0.9 band in its one
// day, and five of them looked right (someone parks, and later drives off from
// where they parked). So the band is not mostly wrong. It is reverted anyway,
// because the two failures are not equal. Refusing to extend leaves a gap that
// surfaces on the Missed Journeys card, where the driver can accept it: visible
// and correctable. Extending wrongly writes a journey the driver never made
// into a tax record, silently, and it does so exactly when capture has already
// failed once - which is our most common defect, not a rare one.
//
// Reopening this needs a way to tell "drove off from where they parked" from
// "drove somewhere unrecorded first", which the server does not have today.
// Neither distance nor elapsed time separates them: of the four extensions that
// bridged an overnight gap, three were correct.
export const WAKE_LAG_MAX_MILES = 0.6;
export const WAKE_LAG_MIN_GAP_MS = 5 * 60 * 1000;
export const WAKE_LAG_MAX_GAP_MS = 24 * 60 * 60 * 1000;

/** Same buffer tripClassification.ts applies for GPS drift at a geofence. */
const SAVED_LOCATION_DRIFT_BUFFER_M = 50;
const METERS_TO_MILES = 0.000621371;

/** Assumed pace for the prepended breadcrumb when the router gave no duration. */
const FALLBACK_URBAN_MPH = 20;

export interface WakeLagPrevTrip {
  id: string;
  endedAt: Date | null;
  endLat: number | null;
  endLng: number | null;
  endAddress: string | null;
}

export interface WakeLagNewTrip {
  startedAt: Date;
  startLat: number;
  startLng: number;
  isManualEntry: boolean;
  hasCoordinates: boolean;
}

export interface WakeLagSavedLocation {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export type WakeLagSkipReason =
  | "manual_entry"
  | "no_coordinates"
  | "no_prev_trip"
  | "prev_end_missing"
  | "gap_too_short"
  | "gap_too_long"
  | "gap_below_min"
  | "gap_above_max"
  | "same_saved_location"
  | "prev_end_not_a_stop"
  | "route_unavailable"
  | "route_implausible";

export interface WakeLagExtension {
  ok: true;
  startLat: number;
  startLng: number;
  /** Previous trip's end address, or null when it had none. */
  startAddress: string | null;
  /** Routed road miles for the missing stretch, rounded to 2 dp. */
  addedMiles: number;
  /** Crow-flies gap between prev end and the original start, 2 dp. */
  crowMiles: number;
  /** Minutes between prev end and the new start, 1 dp. */
  gapMin: number;
  /** Breadcrumb to prepend at the previous end. */
  prependCoordinate: { lat: number; lng: number; recordedAt: Date };
  /** Saved location the previous end matched, if any. */
  savedLocationId: string | null;
}

export interface WakeLagSkip {
  ok: false;
  reason: WakeLagSkipReason;
  crowMiles?: number;
  gapMin?: number;
}

export type WakeLagDecision = WakeLagExtension | WakeLagSkip;

function withinSavedLocation(
  lat: number,
  lng: number,
  loc: WakeLagSavedLocation
): boolean {
  const effectiveRadiusMiles = (loc.radiusMeters + SAVED_LOCATION_DRIFT_BUFFER_M) * METERS_TO_MILES;
  return haversineDistance(lat, lng, loc.latitude, loc.longitude) <= effectiveRadiusMiles;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure decision: given the previous trip, the incoming trip and the routed
 * distance for the missing stretch, decide whether to move the start back.
 *
 * routeMiles is the ROUTED distance from prev.end to new.start (null when
 * every engine failed). routeSecs, when known, times the prepended crumb.
 */
export function resolveWakeLagStart(args: {
  prevTrip: WakeLagPrevTrip | null;
  newTrip: WakeLagNewTrip;
  savedLocations: WakeLagSavedLocation[];
  routeMiles: number | null;
  routeSecs?: number | null;
}): WakeLagDecision {
  const { prevTrip, newTrip, savedLocations, routeMiles, routeSecs } = args;

  if (newTrip.isManualEntry) return { ok: false, reason: "manual_entry" };
  if (!newTrip.hasCoordinates) return { ok: false, reason: "no_coordinates" };
  if (!prevTrip) return { ok: false, reason: "no_prev_trip" };
  if (prevTrip.endedAt == null || prevTrip.endLat == null || prevTrip.endLng == null) {
    return { ok: false, reason: "prev_end_missing" };
  }

  const gapMs = newTrip.startedAt.getTime() - prevTrip.endedAt.getTime();
  const gapMin = Math.round((gapMs / 60000) * 10) / 10;
  if (gapMs < WAKE_LAG_MIN_GAP_MS) return { ok: false, reason: "gap_too_short", gapMin };
  if (gapMs > WAKE_LAG_MAX_GAP_MS) return { ok: false, reason: "gap_too_long", gapMin };

  const crow = haversineDistance(prevTrip.endLat, prevTrip.endLng, newTrip.startLat, newTrip.startLng);
  const crowMiles = round2(crow);
  if (crow < WAKE_LAG_MIN_MILES) return { ok: false, reason: "gap_below_min", crowMiles, gapMin };
  if (crow >= WAKE_LAG_MAX_MILES) return { ok: false, reason: "gap_above_max", crowMiles, gapMin };

  // The previous end has to be somewhere the driver actually stopped.
  const prevEndLocation =
    savedLocations.find((loc) => withinSavedLocation(prevTrip.endLat!, prevTrip.endLng!, loc)) ?? null;
  if (prevEndLocation && withinSavedLocation(newTrip.startLat, newTrip.startLng, prevEndLocation)) {
    // Genuine restart from the same place; nothing to reconcile.
    return { ok: false, reason: "same_saved_location", crowMiles, gapMin };
  }
  const prevEndIsStop = prevEndLocation != null || Boolean(prevTrip.endAddress?.trim());
  if (!prevEndIsStop) return { ok: false, reason: "prev_end_not_a_stop", crowMiles, gapMin };

  if (routeMiles == null || !Number.isFinite(routeMiles) || routeMiles <= 0) {
    return { ok: false, reason: "route_unavailable", crowMiles, gapMin };
  }
  // A road route between two points this close should be at most a few
  // times the crow-flies figure. Anything wilder is a routing glitch, and we
  // will not put it on someone's tax return.
  if (routeMiles < crow * 0.95 || routeMiles > Math.max(crow * 4, WAKE_LAG_MAX_MILES * 2)) {
    return { ok: false, reason: "route_implausible", crowMiles, gapMin };
  }

  const addedMiles = round2(routeMiles);
  const secs =
    routeSecs != null && Number.isFinite(routeSecs) && routeSecs > 0
      ? routeSecs
      : (routeMiles / FALLBACK_URBAN_MPH) * 3600;
  const recordedAt = new Date(newTrip.startedAt.getTime() - Math.round(secs * 1000));

  return {
    ok: true,
    startLat: prevTrip.endLat,
    startLng: prevTrip.endLng,
    startAddress: prevTrip.endAddress?.trim() ? prevTrip.endAddress : null,
    addedMiles,
    crowMiles,
    gapMin,
    prependCoordinate: { lat: prevTrip.endLat, lng: prevTrip.endLng, recordedAt },
    savedLocationId: prevEndLocation?.id ?? null,
  };
}

/**
 * Database-backed wrapper used by POST /trips. Finds the candidate previous
 * trip, fetches the user's saved locations, routes the missing stretch only
 * when the cheap checks pass, and logs the outcome. Never throws: any
 * failure is a skip, because a trip save must not depend on this.
 */
export async function reconcileWakeLagStart(args: {
  userId: string;
  newTrip: WakeLagNewTrip;
}): Promise<(WakeLagExtension & { prevTripId: string }) | null> {
  const { userId, newTrip } = args;
  if (newTrip.isManualEntry || !newTrip.hasCoordinates) return null;

  try {
    const windowEnd = new Date(newTrip.startedAt.getTime() - WAKE_LAG_MIN_GAP_MS);
    const windowStart = new Date(newTrip.startedAt.getTime() - WAKE_LAG_MAX_GAP_MS);

    const prevTrip = await prisma.trip.findFirst({
      where: {
        userId,
        isPhantomTrip: false,
        endedAt: { gte: windowStart, lte: windowEnd },
        endLat: { not: null },
        endLng: { not: null },
      },
      orderBy: { endedAt: "desc" },
      select: { id: true, endedAt: true, endLat: true, endLng: true, endAddress: true },
    });
    if (!prevTrip) return null;

    const savedLocations = await prisma.savedLocation.findMany({
      where: { userId },
      select: { id: true, latitude: true, longitude: true, radiusMeters: true },
    });

    // Cheap pass first (no routing). Only pay for a route when geometry and
    // timing already say this is a wake-lag start.
    const dryRun = resolveWakeLagStart({
      prevTrip,
      newTrip,
      savedLocations,
      routeMiles: Number.POSITIVE_INFINITY,
    });
    // routeMiles is deliberately Infinity here, which the guard reports as
    // "route_unavailable". That is the pass-through signal, not a failure:
    // until 27 Aug 2026 this line only accepted "route_implausible" (which
    // Infinity can never produce), so every candidate returned null and the
    // extension never fired once in production.
    if (!dryRun.ok && dryRun.reason !== "route_unavailable") return null;

    const route = await resolveRouteDistance({
      startLat: prevTrip.endLat!,
      startLng: prevTrip.endLng!,
      endLat: newTrip.startLat,
      endLng: newTrip.startLng,
      userId,
    });

    const decision = resolveWakeLagStart({
      prevTrip,
      newTrip,
      savedLocations,
      routeMiles: route?.distanceMiles ?? null,
      routeSecs: route?.durationSecs ?? null,
    });

    if (!decision.ok) {
      logEvent("trip.wake_lag_start_skipped", userId, {
        prevTripId: prevTrip.id,
        reason: decision.reason,
        crowMiles: decision.crowMiles ?? null,
        gapMin: decision.gapMin ?? null,
        routeMiles: route?.distanceMiles ?? null,
        routeSource: route?.source ?? null,
      });
      return null;
    }

    return { ...decision, prevTripId: prevTrip.id };
  } catch (err) {
    logEvent("trip.wake_lag_start_skipped", userId, {
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
