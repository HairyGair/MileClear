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


// ── What an earlier end edit left behind ─────────────────────────────────
//
// Tom (14-15 Oct 2026) moved the end of a 1.17 mile recording about 15 miles
// away, then moved it again the next morning. Each edit routed from wherever
// the end pin sat at that moment and ADDED the result to the stored distance,
// which already held the first edit's stretch, so the trip came to 42.84
// miles: 1.17 + 20.82 + 20.85. An edit can also only ever add: moving the end
// back towards where the recording stopped routed that way and added it too.
//
// So the first end edit now keeps a note in gpsQuality.endExtension of where
// the RECORDING stopped and how many routed miles the edited end adds after
// it. Every later edit routes from the recording's own end, takes the earlier
// stretch off, and puts the new one on: recorded miles plus one stretch, never
// two. Moving the end back to where the recording stopped gives the recorded
// miles back.

export interface EndExtension {
  /** Where the recording itself stopped, before any end edit. */
  recordedEndLat: number;
  recordedEndLng: number;
  /** When it stopped (ISO), so a stand-in breadcrumb sits after the trail. */
  recordedEndedAt: string | null;
  /** Routed miles after the recording that the trip's distance now includes. */
  addedMiles: number;
  /** When the stand-in breadcrumb for that stretch is dated (ISO), or null. */
  breadcrumbAt: string | null;
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** The trip's note of an earlier end edit, or null when there is none. */
export function readEndExtension(gpsQuality: unknown): EndExtension | null {
  const e = asObject(asObject(gpsQuality).endExtension);
  const lat = Number(e.recordedEndLat);
  const lng = Number(e.recordedEndLng);
  const added = Number(e.addedMiles);
  if (e.recordedEndLat == null || e.recordedEndLng == null || e.addedMiles == null) return null;
  if (![lat, lng, added].every(Number.isFinite) || added < 0) return null;
  const iso = (v: unknown): string | null =>
    typeof v === "string" && Number.isFinite(new Date(v).getTime()) ? v : null;
  return {
    recordedEndLat: lat,
    recordedEndLng: lng,
    recordedEndedAt: iso(e.recordedEndedAt),
    addedMiles: added,
    breadcrumbAt: iso(e.breadcrumbAt),
  };
}

// ── Prisma/routing wrapper ────────────────────────────────────────────────

export interface PlannedEndEdit {
  endLat: number;
  endLng: number;
  /** Routed miles to add after the recorded trail; 0 when the distance stays. */
  addedMiles: number;
  /**
   * Miles an earlier end edit added that this one replaces, to take off the
   * stored distance before addedMiles goes on. 0 when there is nothing to undo
   * or the distance is being left alone.
   */
  replacedMiles: number;
  crowMiles: number;
  appendCoordinate: { lat: number; lng: number; recordedAt: Date } | null;
  /** The earlier edit's stand-in breadcrumb, to remove; null to keep it. */
  removeBreadcrumbAt: Date | null;
  /** The note to keep in gpsQuality.endExtension; null removes it. */
  extension: EndExtension | null;
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
 *
 * The stretch is always priced from where the RECORDING stopped, which after
 * an earlier end edit is the note in gpsQuality.endExtension, not the current
 * end pin; the earlier stretch is handed back as replacedMiles.
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
    gpsQuality?: unknown;
  };
  newLat: number;
  newLng: number;
  newEndedAt?: Date | null;
}): Promise<PlannedEndEdit | null> {
  const { userId, trip, newLat, newLng, newEndedAt } = args;
  if (trip.isManualEntry) return null;
  if (trip.endLat == null || trip.endLng == null) return null;
  if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) return null;

  const prior = readEndExtension(trip.gpsQuality);

  // A pin nudged a few metres from where it already sits is a label change,
  // whether or not the end has been edited before.
  if (haversineDistance(trip.endLat, trip.endLng, newLat, newLng) < END_EDIT_MIN_MILES) return null;

  const recordedEnd = prior
    ? {
        endLat: prior.recordedEndLat,
        endLng: prior.recordedEndLng,
        endedAt: prior.recordedEndedAt ? new Date(prior.recordedEndedAt) : trip.endedAt,
      }
    : { endLat: trip.endLat, endLng: trip.endLng, endedAt: trip.endedAt };

  const base = {
    trip: { ...recordedEnd, startedAt: trip.startedAt },
    newLat,
    newLng,
    newEndedAt,
  };
  const recordedEndedAtIso = recordedEnd.endedAt ? recordedEnd.endedAt.toISOString() : null;
  const priorBreadcrumb = prior?.breadcrumbAt ? new Date(prior.breadcrumbAt) : null;

  /** The pin moves, the miles stay: any earlier stretch is still in them. */
  const leaveDistance = (reason: EndEditSkipReason, crowMiles: number): PlannedEndEdit => ({
    endLat: newLat,
    endLng: newLng,
    addedMiles: 0,
    replacedMiles: 0,
    crowMiles,
    appendCoordinate: null,
    removeBreadcrumbAt: null,
    extension: prior ?? {
      recordedEndLat: recordedEnd.endLat,
      recordedEndLng: recordedEnd.endLng,
      recordedEndedAt: recordedEndedAtIso,
      addedMiles: 0,
      breadcrumbAt: null,
    },
    distanceUnchangedReason: reason,
  });

  // Cheap pass first: no routing call for a pin that has not moved or is
  // wildly far.
  const dry = resolveEndEdit({ ...base, routeMiles: null });
  if (!dry.ok && dry.reason === "same_place") {
    if (!prior) return null;
    // Back where the recording stopped: the recorded miles, and nothing else.
    return {
      endLat: newLat,
      endLng: newLng,
      addedMiles: 0,
      replacedMiles: prior.addedMiles,
      crowMiles: dry.crowMiles,
      appendCoordinate: null,
      removeBreadcrumbAt: priorBreadcrumb,
      extension: null,
      distanceUnchangedReason: null,
    };
  }
  if (!dry.ok && dry.reason === "too_far") return leaveDistance("too_far", dry.crowMiles);

  const route = await resolveRouteDistance({
    startLat: recordedEnd.endLat,
    startLng: recordedEnd.endLng,
    endLat: newLat,
    endLng: newLng,
    userId,
  });
  const decision = resolveEndEdit({
    ...base,
    routeMiles: route?.distanceMiles ?? null,
    routeSecs: route?.durationSecs ?? null,
  });

  if (!decision.ok) return leaveDistance(decision.reason, decision.crowMiles);
  return {
    endLat: newLat,
    endLng: newLng,
    addedMiles: decision.addedMiles,
    replacedMiles: prior?.addedMiles ?? 0,
    crowMiles: decision.crowMiles,
    appendCoordinate: decision.appendCoordinate,
    removeBreadcrumbAt: priorBreadcrumb,
    extension: {
      recordedEndLat: recordedEnd.endLat,
      recordedEndLng: recordedEnd.endLng,
      recordedEndedAt: recordedEndedAtIso,
      addedMiles: decision.addedMiles,
      breadcrumbAt: decision.appendCoordinate.recordedAt.toISOString(),
    },
    distanceUnchangedReason: null,
  };
}
