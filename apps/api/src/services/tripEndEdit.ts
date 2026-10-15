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
import { prisma } from "../lib/prisma.js";
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
//
// The note is only trusted while the trip still looks like the one it was
// written for (see noteStillHolds). Trips whose end was edited before the
// note existed are recognised from their stand-in points and the edit events
// (see inferLegacyExtension). Whenever either is in doubt, the edit falls back
// to pricing the stretch from the end as it stands.

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

/** gpsQuality keys only the server writes. Stripped from anything a client sends. */
export const SERVER_OWNED_GPS_QUALITY_KEYS = ["endExtension", "appendOutlierCut"] as const;

/** A client's gpsQuality with the server-owned keys taken out. */
export function stripServerOwnedGpsQuality<T extends Record<string, unknown> | undefined>(gq: T): T {
  if (!gq) return gq;
  const out: Record<string, unknown> = { ...gq };
  for (const k of SERVER_OWNED_GPS_QUALITY_KEYS) delete out[k];
  return out as T;
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

/**
 * gpsQuality with the end-edit note retired, for anything that rewrites a
 * trip's end or distance (a split, a recalc, a typed distance, a merge): the
 * note describes a trip that no longer exists. A retired note is left as
 * endExtension: null rather than deleted, so the next end edit knows the
 * trip's distance has been set since and does not go looking for old edits
 * to take off it either. Undefined when there is no live note, so the caller
 * writes nothing.
 */
export function gpsQualityRetiringEndNote(gpsQuality: unknown): Record<string, unknown> | undefined {
  const gq = asObject(gpsQuality);
  if (gq.endExtension === undefined || gq.endExtension === null) return undefined;
  return { ...gq, endExtension: null };
}

/**
 * The same for a distance set outright on a recorded trip, which may also be
 * a trip whose end was edited before the note existed: if its trail still
 * ends on a stand-in point, the retired marker goes on too, so those old
 * edits are not taken off the new figure later. Undefined: write nothing.
 */
export async function retireEndNoteForNewDistance(trip: {
  id: string;
  isManualEntry: boolean;
  gpsQuality?: unknown;
}): Promise<Record<string, unknown> | undefined> {
  if (trip.isManualEntry) return undefined;
  const retired = gpsQualityRetiringEndNote(trip.gpsQuality);
  if (retired) return retired;
  const gq = asObject(trip.gpsQuality);
  if (gq.endExtension === null) return undefined;
  const last = await prisma.tripCoordinate.findFirst({
    where: { tripId: trip.id },
    orderBy: { recordedAt: "desc" },
    select: { speed: true, accuracy: true },
  });
  if (!last || last.speed != null || last.accuracy != null) return undefined;
  return { ...gq, endExtension: null };
}

/** An earlier extension the next edit replaces, however we learned of it. */
export interface PriorExtension {
  recordedEndLat: number;
  recordedEndLng: number;
  recordedEndedAt: Date | null;
  addedMiles: number;
  /** The stand-in points for it, all to go when it is replaced. */
  breadcrumbs: Date[];
  source: "note" | "legacy";
}

/** Rounding slack when comparing stored miles. */
const MILES_SLACK = 0.01;

/**
 * Is the note still about this trip? A split, a restore, a recalc or anything
 * else that rewrote the trip without retiring the note leaves one whose miles
 * are not in the distance (taking them off would sink the trip, possibly to
 * 0), or whose stand-in point has gone elsewhere. Either and the note is
 * ignored.
 *
 * The trip's end TIME is deliberately not checked. A driver may set an end
 * time earlier than the recording's last fix (odd, but allowed), and the note
 * is still right about where the recording stopped and what was added after
 * it; ignoring it then would stack the next stretch on the last one, the
 * very bug the note exists to stop. A split, which does move the end time,
 * retires the note and takes the stand-in point to another leg, so the two
 * checks here catch it anyway.
 */
export function noteStillHolds(
  note: EndExtension,
  trip: { distanceMiles: number },
  breadcrumbPresent: boolean
): boolean {
  if (trip.distanceMiles + MILES_SLACK < note.addedMiles) return false;
  if (note.breadcrumbAt && !breadcrumbPresent) return false;
  return true;
}

/** Straight-line miles along a run of points. */
export function straightLineMiles(points: ReadonlyArray<{ lat: number; lng: number }>): number {
  let miles = 0;
  for (let i = 1; i < points.length; i++) {
    miles += haversineDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return round2(miles);
}

/**
 * How close the trip's distance, less the old stretches, must sit to its real
 * trail before the old stretches are trusted. Before notes, a website save
 * that moved the end AND sent its own miles left a stand-in point and an
 * event with miles added, while the stored figure was the client's: there,
 * taking the stretch off would cut the driver's own number.
 */
export const LEGACY_TRAIL_TOLERANCE = 0.1;

export interface TrailFix {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: Date;
}

/**
 * A trip whose end was edited before the note existed. Each such edit left a
 * stand-in point (no speed, no accuracy) after the trail and a trip.end_edited
 * event with the miles it added. Only when the stand-ins at the end of the
 * trail and the events that added miles agree one for one is it read as an
 * earlier extension: recorded stop = the last real fix, earlier stretch = the
 * miles all those edits added. Tom's two edits left two stand-ins and two
 * events, and both stretches are in his distance, so both come off.
 *
 * lastFixesDesc is the end of the trail, newest first. Anything that does not
 * fit (no stand-in, no real fix before them, counts that differ, miles the
 * trip does not hold, a stop after the trip's end) gives null.
 */
export function inferLegacyExtension(args: {
  lastFixesDesc: ReadonlyArray<TrailFix>;
  eventAddedMiles: ReadonlyArray<number>;
  trip: { distanceMiles: number; endedAt: Date | null; endLat: number | null; endLng: number | null };
  /** Straight-line miles of the trail without the trailing stand-ins. */
  realTrailMiles: number | null;
}): PriorExtension | null {
  const { lastFixesDesc, eventAddedMiles, trip, realTrailMiles } = args;
  const isStandIn = (f: TrailFix) => f.speed == null && f.accuracy == null;
  let n = 0;
  while (n < lastFixesDesc.length && isStandIn(lastFixesDesc[n])) n++;
  if (n === 0 || n >= lastFixesDesc.length) return null;
  const lastReal = lastFixesDesc[n];
  const added = eventAddedMiles.filter((m) => Number.isFinite(m) && m > 0);
  if (added.length !== n) return null;
  const sum = round2(added.reduce((a, b) => a + b, 0));
  if (trip.distanceMiles + MILES_SLACK < sum) return null;
  if (trip.endedAt && lastReal.recordedAt.getTime() > trip.endedAt.getTime()) return null;
  // The newest stand-in is where the trip ends now, exactly: the last edit
  // left it there and nothing has moved the end since.
  const newest = lastFixesDesc[0];
  if (newest.lat !== trip.endLat || newest.lng !== trip.endLng) return null;
  // What is left once the old stretches come off must look like the trail.
  if (realTrailMiles == null || !(realTrailMiles > 0)) return null;
  const left = trip.distanceMiles - sum;
  if (left < realTrailMiles * (1 - LEGACY_TRAIL_TOLERANCE) || left > realTrailMiles * (1 + LEGACY_TRAIL_TOLERANCE)) {
    return null;
  }
  return {
    recordedEndLat: lastReal.lat,
    recordedEndLng: lastReal.lng,
    recordedEndedAt: lastReal.recordedAt,
    addedMiles: sum,
    breadcrumbs: lastFixesDesc.slice(0, n).map((f) => f.recordedAt),
    source: "legacy",
  };
}

/** How many fixes from the end of the trail the legacy check reads. */
const LEGACY_TAIL_FIXES = 8;

/**
 * The extension the next end edit replaces, or null to price from the end as
 * it stands. Reads the note first, then falls back to recognising a pre-note
 * edit. A note that no longer holds is not replaced by the legacy guess: the
 * trip has been rewritten since, so neither can be trusted.
 */
export async function findPriorExtension(args: {
  userId: string;
  trip: {
    id: string;
    distanceMiles: number;
    endedAt: Date | null;
    endLat: number | null;
    endLng: number | null;
    gpsQuality?: unknown;
  };
}): Promise<{ prior: PriorExtension | null; noteIgnored: boolean }> {
  const { userId, trip } = args;
  const note = readEndExtension(trip.gpsQuality);
  if (note) {
    const breadcrumbPresent = note.breadcrumbAt
      ? (await prisma.tripCoordinate.findFirst({
          where: { tripId: trip.id, recordedAt: new Date(note.breadcrumbAt), speed: null, accuracy: null },
          select: { id: true },
        })) != null
      : true;
    if (!noteStillHolds(note, trip, breadcrumbPresent)) return { prior: null, noteIgnored: true };
    return {
      prior: {
        recordedEndLat: note.recordedEndLat,
        recordedEndLng: note.recordedEndLng,
        recordedEndedAt: note.recordedEndedAt ? new Date(note.recordedEndedAt) : null,
        addedMiles: note.addedMiles,
        breadcrumbs: note.breadcrumbAt ? [new Date(note.breadcrumbAt)] : [],
        source: "note",
      },
      noteIgnored: false,
    };
  }
  const raw = asObject(trip.gpsQuality).endExtension;
  // Retired: the distance has been set since, so old edits are not guessed at.
  if (raw === null) return { prior: null, noteIgnored: false };
  if (raw !== undefined) return { prior: null, noteIgnored: true };

  const lastFixesDesc = await prisma.tripCoordinate.findMany({
    where: { tripId: trip.id },
    orderBy: { recordedAt: "desc" },
    take: LEGACY_TAIL_FIXES,
    select: { lat: true, lng: true, speed: true, accuracy: true, recordedAt: true },
  });
  const tail = lastFixesDesc[0];
  if (!tail || tail.speed != null || tail.accuracy != null) return { prior: null, noteIgnored: false };

  const events = await prisma.appEvent.findMany({
    where: { type: "trip.end_edited", userId, metadata: { path: "$.tripId", equals: trip.id } },
    select: { metadata: true },
  });
  const eventAddedMiles = events.map((e) => Number(asObject(e.metadata).addedMiles));
  if (!eventAddedMiles.some((m) => m > 0)) return { prior: null, noteIgnored: false };

  // The whole trail, less the trailing stand-ins, for the distance check.
  const trail = await prisma.tripCoordinate.findMany({
    where: { tripId: trip.id },
    orderBy: { recordedAt: "asc" },
    select: { lat: true, lng: true, speed: true, accuracy: true, recordedAt: true },
  });
  let end = trail.length;
  while (end > 0 && trail[end - 1].speed == null && trail[end - 1].accuracy == null) end--;
  return {
    prior: inferLegacyExtension({
      lastFixesDesc,
      eventAddedMiles,
      trip,
      realTrailMiles: straightLineMiles(trail.slice(0, end)),
    }),
    noteIgnored: false,
  };
}

// ── Prisma/routing wrapper ────────────────────────────────────────────────

export interface PlannedEndEdit {
  endLat: number;
  endLng: number;
  /** Routed miles to add after the recorded trail; 0 when the distance stays. */
  addedMiles: number;
  /**
   * Miles earlier end edits added that this one replaces, to take off the
   * stored distance before addedMiles goes on. 0 when there is nothing to undo
   * or the distance is being left alone.
   */
  replacedMiles: number;
  crowMiles: number;
  appendCoordinate: { lat: number; lng: number; recordedAt: Date } | null;
  /** Earlier stand-in breadcrumbs to remove. */
  removeBreadcrumbsAt: Date[];
  /**
   * The note to keep in gpsQuality.endExtension: an object writes it, null
   * removes it, undefined leaves whatever is there.
   */
  extension: EndExtension | null | undefined;
  /** Where the earlier stretch was learned from, for the event. */
  priorSource: "note" | "legacy" | "note_ignored" | null;
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
 * The stretch is priced from where the RECORDING stopped, which after an
 * earlier end edit is not the current end pin; the earlier stretch is handed
 * back as replacedMiles.
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
    distanceMiles: number;
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

  // A pin nudged a few metres from where it already sits is a label change,
  // whether or not the end has been edited before.
  if (haversineDistance(trip.endLat, trip.endLng, newLat, newLng) < END_EDIT_MIN_MILES) return null;

  const { prior, noteIgnored } = await findPriorExtension({ userId, trip });
  const priorSource: PlannedEndEdit["priorSource"] = prior ? prior.source : noteIgnored ? "note_ignored" : null;

  const recordedEnd = prior
    ? {
        endLat: prior.recordedEndLat,
        endLng: prior.recordedEndLng,
        endedAt: prior.recordedEndedAt ?? trip.endedAt,
      }
    : { endLat: trip.endLat, endLng: trip.endLng, endedAt: trip.endedAt };

  const base = {
    trip: { ...recordedEnd, startedAt: trip.startedAt },
    newLat,
    newLng,
    newEndedAt,
  };
  const recordedEndedAtIso = recordedEnd.endedAt ? recordedEnd.endedAt.toISOString() : null;
  const freshNote = (addedMiles: number, breadcrumbAt: string | null): EndExtension => ({
    recordedEndLat: recordedEnd.endLat,
    recordedEndLng: recordedEnd.endLng,
    recordedEndedAt: recordedEndedAtIso,
    addedMiles,
    breadcrumbAt,
  });

  /** The pin moves, the miles stay: any earlier stretch is still in them. */
  const leaveDistance = (reason: EndEditSkipReason, crowMiles: number): PlannedEndEdit => ({
    endLat: newLat,
    endLng: newLng,
    addedMiles: 0,
    replacedMiles: 0,
    crowMiles,
    appendCoordinate: null,
    removeBreadcrumbsAt: [],
    // A trusted note stays as it is, and a stretch inferred from old edits is
    // left for the next edit to work out again. Otherwise note where the
    // trip now ends, so the next edit prices from there.
    extension: prior ? undefined : freshNote(0, null),
    priorSource,
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
      removeBreadcrumbsAt: prior.breadcrumbs,
      extension: null,
      priorSource,
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
    removeBreadcrumbsAt: prior?.breadcrumbs ?? [],
    extension: freshNote(decision.addedMiles, decision.appendCoordinate.recordedAt.toISOString()),
    priorSource,
    distanceUnchangedReason: null,
  };
}
