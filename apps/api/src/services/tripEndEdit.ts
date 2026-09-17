// Correcting where a journey ended.
//
// The counterpart of tripStartEdit.ts. Chris Saunders (17 Sep 2026) sat at a
// long red light on West Wycombe Road, the phone decided the trip was over
// and saved it there, and he drove the last 0.8 miles home unrecorded. He
// moved the end pin to Home in the app, and the pin moved but nothing else
// did: the distance stayed at 3.4 and the drawn route still ended at the
// lights, because the end-move branch in PATCH /trips/:id only ever handled
// manual trips.
//
// The shape is the same as the start edit. A driver moving the end of a
// RECORDED trip is saying "it went on further than you think", so the recorded
// trail is kept and the missing stretch is ADDED after it, routed from where
// the recording stopped to the new end. Never a re-route between the two ends:
// that would throw away the GPS they actually drove.
//
// A MANUAL trip is not handled here at all. It has no trail to extend, and the
// route handler already re-derives its distance end to end when the end moves.
//
// The pure decision lives here so it can be unit-tested without a database.

import { haversineDistance } from "@mileclear/shared";
import { resolveRouteDistance } from "./routing.js";
import { START_EDIT_MAX_MILES, START_EDIT_MIN_MILES } from "./tripStartEdit.js";

/** Below this the pin has not really moved; treat it as a label-only change. */
export const END_EDIT_MIN_MILES = START_EDIT_MIN_MILES;
/**
 * Same ceiling as the start edit. Past this the likeliest explanation is a
 * dropped pin on a zoomed-out map, and the cost of being wrong is inflated
 * mileage on a tax return. The pin still moves; the distance does not, and
 * the event says why.
 */
export const END_EDIT_MAX_MILES = START_EDIT_MAX_MILES;
/** Assumed pace for timing the appended breadcrumb when routing gave none. */
const FALLBACK_URBAN_MPH = 20;

export type EndEditSkipReason =
  | "same_place"
  | "too_far"
  | "route_unavailable"
  | "route_implausible";

export interface EndEditPlan {
  ok: true;
  /** Routed miles from where the recording stopped to the corrected end. */
  addedMiles: number;
  crowMiles: number;
  /** Breadcrumb to put after the trail, dated so the trail stays in order. */
  appendCoordinate: { lat: number; lng: number; recordedAt: Date };
}

export interface EndEditSkip {
  ok: false;
  reason: EndEditSkipReason;
  crowMiles: number;
}

export type EndEditDecision = EndEditPlan | EndEditSkip;

export interface EndEditTrip {
  endLat: number;
  endLng: number;
  /** When the recording stopped. Falls back to startedAt when never set. */
  endedAt: Date | null;
  startedAt: Date;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * When to date the breadcrumb that stands in for the unrecorded stretch.
 *
 * The trail must stay monotonic, so the new point can never sit before the
 * recording's last one (recordedEnd). Left to itself it lands routeSecs after
 * that. When the PATCH also brings a new end time the driver has told us when
 * they arrived, so the breadcrumb takes the later of the two and is then
 * capped at that new end time: a breadcrumb after the trip's own end would be
 * a contradiction on the map. If the new end time is at or before the
 * recording's last point (an odd edit, but allowed) the cap would break the
 * ordering, so the floor wins and the point is dated just after the trail.
 */
export function appendedBreadcrumbTime(args: {
  recordedEnd: Date;
  routeSecs: number;
  newEndedAt?: Date | null;
}): Date {
  const { recordedEnd, routeSecs, newEndedAt } = args;
  const floor = recordedEnd.getTime() + 1000;
  let at = recordedEnd.getTime() + Math.round(routeSecs * 1000);
  if (newEndedAt != null) {
    at = Math.max(at, newEndedAt.getTime());
    at = Math.min(at, newEndedAt.getTime());
  }
  return new Date(Math.max(at, floor));
}

/**
 * Decide what moving a recorded trip's end to (newLat, newLng) should do to
 * its distance and its trail.
 *
 * routeMiles is the ROUTED distance from the old end to the new one, or null
 * when every routing engine failed. A skip is not a refusal to move the pin:
 * the caller still writes the new end and its address. It only means the
 * distance is left alone, because we would be guessing at it.
 */
export function resolveEndEdit(args: {
  trip: EndEditTrip;
  newLat: number;
  newLng: number;
  newEndedAt?: Date | null;
  routeMiles: number | null;
  routeSecs?: number | null;
}): EndEditDecision {
  const { trip, newLat, newLng, newEndedAt, routeMiles, routeSecs } = args;

  const crow = haversineDistance(trip.endLat, trip.endLng, newLat, newLng);
  const crowMiles = round2(crow);

  if (crow < END_EDIT_MIN_MILES) return { ok: false, reason: "same_place", crowMiles };
  if (crow > END_EDIT_MAX_MILES) return { ok: false, reason: "too_far", crowMiles };

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
    appendCoordinate: {
      lat: newLat,
      lng: newLng,
      recordedAt: appendedBreadcrumbTime({
        recordedEnd: trip.endedAt ?? trip.startedAt,
        routeSecs: secs,
        newEndedAt,
      }),
    },
  };
}


// ── Prisma/routing wrapper ────────────────────────────────────────────────

export interface PlannedEndEdit {
  endLat: number;
  endLng: number;
  /** Routed miles to add after the recorded trail; 0 when the distance stays. */
  addedMiles: number;
  crowMiles: number;
  appendCoordinate: { lat: number; lng: number; recordedAt: Date } | null;
  /** Set when the pin moved but the distance deliberately did not. */
  distanceUnchangedReason: EndEditSkipReason | null;
}

/**
 * Work out what moving this RECORDED trip's end should do, doing the routing
 * lookup the pure decision cannot.
 *
 * Returns null when there is nothing for this service to do: a manual trip
 * (the handler re-routes those end to end), a trip with no stored end to
 * route from, or a pin that did not really move. Every other outcome moves
 * the end and differs only in whether the DISTANCE changes with it. Where the
 * missing stretch cannot be priced honestly the pin moves, the mileage is
 * left alone, and the reason is recorded on the event.
 */
export async function planTripEndEdit(args: {
  userId: string;
  trip: {
    id: string;
    endLat: number | null;
    endLng: number | null;
    endedAt: Date | null;
    startedAt: Date;
    isManualEntry: boolean;
  };
  newLat: number;
  newLng: number;
  newEndedAt?: Date | null;
}): Promise<PlannedEndEdit | null> {
  const { userId, trip, newLat, newLng, newEndedAt } = args;
  if (trip.isManualEntry) return null;
  if (trip.endLat == null || trip.endLng == null) return null;
  if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) return null;

  const base = {
    trip: {
      endLat: trip.endLat,
      endLng: trip.endLng,
      endedAt: trip.endedAt,
      startedAt: trip.startedAt,
    },
    newLat,
    newLng,
    newEndedAt,
  };

  // Cheap pass first: no routing call for a pin that has not moved or is
  // wildly far.
  const dry = resolveEndEdit({ ...base, routeMiles: null });
  if (!dry.ok && dry.reason === "same_place") return null;
  if (!dry.ok && dry.reason === "too_far") {
    return {
      endLat: newLat,
      endLng: newLng,
      addedMiles: 0,
      crowMiles: dry.crowMiles,
      appendCoordinate: null,
      distanceUnchangedReason: "too_far",
    };
  }

  const route = await resolveRouteDistance({
    startLat: trip.endLat,
    startLng: trip.endLng,
    endLat: newLat,
    endLng: newLng,
    userId,
  });
  const decision = resolveEndEdit({
    ...base,
    routeMiles: route?.distanceMiles ?? null,
    routeSecs: route?.durationSecs ?? null,
  });

  if (!decision.ok) {
    return {
      endLat: newLat,
      endLng: newLng,
      addedMiles: 0,
      crowMiles: decision.crowMiles,
      appendCoordinate: null,
      distanceUnchangedReason: decision.reason,
    };
  }
  return {
    endLat: newLat,
    endLng: newLng,
    addedMiles: decision.addedMiles,
    crowMiles: decision.crowMiles,
    appendCoordinate: decision.appendCoordinate,
    distanceUnchangedReason: null,
  };
}
