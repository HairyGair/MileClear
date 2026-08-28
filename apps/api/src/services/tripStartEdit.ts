// Correcting where a journey began.
//
// The end of a trip has always been editable and the start has not, which was
// never a decision anybody made. It falls out of create-time dedup keying on
// (userId, startedAt, startLat, startLng): move the start and a retried create
// no longer matches. Trip.originalStartLat/Lng now keeps the device's figure so
// the dedup can match either, which is what makes this safe to offer.
//
// Rachel Thorndyke asked for it twice (27 and 28 Aug 2026). Her case is the
// common one: the engine arms a few hundred metres into a drive, so the trip is
// recorded as starting at the roadside rather than at the farm she left, and
// the opening stretch is missing from her mileage.
//
// That shape decides the behaviour. A driver moving the start is saying "it
// began further back than you think", so on a TRACKED trip the recorded route
// is kept and the missing stretch is ADDED in front of it, exactly as the
// wake-lag extension does. Recomputing the whole trip as a straight route
// between two points would throw away the GPS trail they actually drove.
//
// A MANUAL trip has no trail, so there is nothing to preserve and the distance
// is simply re-routed between the new start and the end - the same thing an
// edit to the end already does.
//
// The pure decision lives here so it can be unit-tested without a database.

import { haversineDistance } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { resolveRouteDistance } from "./routing.js";

/** Below this the pin has not really moved; treat it as a label-only change. */
export const START_EDIT_MIN_MILES = 0.02;
/**
 * A correction, not a relocation. Past this the likeliest explanation is a
 * dropped pin or a fat finger on a zoomed-out map, and the cost of being wrong
 * is inflated mileage on a tax return. The label still moves; the distance does
 * not, and the event says so.
 */
export const START_EDIT_MAX_MILES = 25;
/** Assumed pace for timing the prepended breadcrumb when routing gave none. */
const FALLBACK_URBAN_MPH = 20;

export type StartEditSkipReason =
  | "same_place"
  | "too_far"
  | "route_unavailable"
  | "route_implausible";

export interface StartEditPlan {
  ok: true;
  /** Routed miles from the corrected start to where the recording began.
   *  Zero for a manual trip, whose distance is recomputed end to end instead. */
  addedMiles: number;
  crowMiles: number;
  /** Breadcrumb to put in front of the trail. Null for a manual trip. */
  prependCoordinate: { lat: number; lng: number; recordedAt: Date } | null;
}

export interface StartEditSkip {
  ok: false;
  reason: StartEditSkipReason;
  crowMiles: number;
}

export type StartEditDecision = StartEditPlan | StartEditSkip;

export interface StartEditTrip {
  startLat: number;
  startLng: number;
  startedAt: Date;
  /** A trip with breadcrumbs keeps them; one without is re-routed end to end. */
  hasCoordinates: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Decide what moving a trip's start to (newLat, newLng) should do to its
 * distance and its trail.
 *
 * routeMiles is the ROUTED distance from the new start to the old one, or null
 * when every routing engine failed. A skip is not a refusal to move the pin:
 * the caller still writes the new start and its address. It only means the
 * distance is left alone, because we would be guessing at it.
 */
export function resolveStartEdit(args: {
  trip: StartEditTrip;
  newLat: number;
  newLng: number;
  routeMiles: number | null;
  routeSecs?: number | null;
}): StartEditDecision {
  const { trip, newLat, newLng, routeMiles, routeSecs } = args;

  const crow = haversineDistance(trip.startLat, trip.startLng, newLat, newLng);
  const crowMiles = round2(crow);

  if (crow < START_EDIT_MIN_MILES) return { ok: false, reason: "same_place", crowMiles };
  if (crow > START_EDIT_MAX_MILES) return { ok: false, reason: "too_far", crowMiles };

  // Manual trips carry no trail to extend. The caller re-routes them end to end.
  if (!trip.hasCoordinates) {
    return { ok: true, addedMiles: 0, crowMiles, prependCoordinate: null };
  }

  if (routeMiles == null || !Number.isFinite(routeMiles) || routeMiles <= 0) {
    return { ok: false, reason: "route_unavailable", crowMiles };
  }
  // A road route between two points cannot be shorter than the straight line,
  // and should not be several times longer over a distance like this. Anything
  // wilder is a routing glitch, and it is not going on a tax return.
  if (routeMiles < crow * 0.95 || routeMiles > Math.max(crow * 4, 1)) {
    return { ok: false, reason: "route_implausible", crowMiles };
  }

  const secs =
    routeSecs != null && Number.isFinite(routeSecs) && routeSecs > 0
      ? routeSecs
      : (routeMiles / FALLBACK_URBAN_MPH) * 3600;

  return {
    ok: true,
    addedMiles: round2(routeMiles),
    crowMiles,
    prependCoordinate: {
      lat: newLat,
      lng: newLng,
      // Dated back from where recording began, so the trail stays in order.
      // startedAt itself does NOT move: it is half the dedup key, and the
      // driver is correcting where they set off, not when.
      recordedAt: new Date(trip.startedAt.getTime() - Math.round(secs * 1000)),
    },
  };
}


// ── Prisma/routing wrapper ────────────────────────────────────────────────

export interface PlannedStartEdit {
  startLat: number;
  startLng: number;
  /** Routed miles to add in front of a tracked trip; 0 for a manual one. */
  addedMiles: number;
  crowMiles: number;
  prependCoordinate: { lat: number; lng: number; recordedAt: Date } | null;
  /** Set when the pin moved but the distance deliberately did not. */
  distanceUnchangedReason: StartEditSkipReason | null;
  /**
   * Only a MANUAL trip gets its distance re-derived as a route between its two
   * ends. Never inferred from addedMiles being zero: that is also true when a
   * tracked trip's new pin was too far away to price, and re-routing there
   * would replace a recorded GPS trail with a straight line - it turned a
   * 1.91-mile tracked trip into 1.32 in the first end-to-end run.
   */
  rerouteEndToEnd: boolean;
}

/**
 * Work out what moving this trip's start should do, doing the lookups the pure
 * decision cannot.
 *
 * Returns null only when the pin did not really move. Every other outcome moves
 * the start - the driver asked for that and it is their journey - and differs
 * only in whether the DISTANCE changes with it. Where we cannot price the
 * missing stretch honestly, the label moves and the mileage is left alone,
 * with the reason recorded on the event.
 */
export async function planTripStartEdit(args: {
  userId: string;
  trip: {
    id: string;
    startLat: number;
    startLng: number;
    startedAt: Date;
    isManualEntry: boolean;
  };
  newLat: number;
  newLng: number;
}): Promise<PlannedStartEdit | null> {
  const { userId, trip, newLat, newLng } = args;
  if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) return null;

  const coordCount = await prisma.tripCoordinate.count({ where: { tripId: trip.id } });
  const hasCoordinates = coordCount > 0;

  const base = {
    trip: {
      startLat: trip.startLat,
      startLng: trip.startLng,
      startedAt: trip.startedAt,
      hasCoordinates,
    },
    newLat,
    newLng,
  };

  // Cheap pass first: no routing call for a pin that has not moved, is wildly
  // far, or belongs to a manual trip that gets re-routed end to end anyway.
  const dry = resolveStartEdit({ ...base, routeMiles: null });
  if (!dry.ok && dry.reason === "same_place") return null;
  if (!dry.ok && dry.reason === "too_far") {
    return {
      startLat: newLat,
      startLng: newLng,
      addedMiles: 0,
      crowMiles: dry.crowMiles,
      prependCoordinate: null,
      distanceUnchangedReason: "too_far",
      rerouteEndToEnd: false,
    };
  }
  if (dry.ok) {
    // Manual trip: nothing to extend, the caller re-routes it end to end.
    return {
      startLat: newLat,
      startLng: newLng,
      addedMiles: 0,
      crowMiles: dry.crowMiles,
      prependCoordinate: null,
      distanceUnchangedReason: null,
      rerouteEndToEnd: true,
    };
  }

  const route = await resolveRouteDistance({
    startLat: newLat,
    startLng: newLng,
    endLat: trip.startLat,
    endLng: trip.startLng,
    userId,
  });
  const decision = resolveStartEdit({
    ...base,
    routeMiles: route?.distanceMiles ?? null,
    routeSecs: route?.durationSecs ?? null,
  });

  if (!decision.ok) {
    return {
      startLat: newLat,
      startLng: newLng,
      addedMiles: 0,
      crowMiles: decision.crowMiles,
      prependCoordinate: null,
      distanceUnchangedReason: decision.reason,
      rerouteEndToEnd: false,
    };
  }
  return {
    startLat: newLat,
    startLng: newLng,
    addedMiles: decision.addedMiles,
    crowMiles: decision.crowMiles,
    prependCoordinate: decision.prependCoordinate,
    distanceUnchangedReason: null,
    rerouteEndToEnd: false,
  };
}
