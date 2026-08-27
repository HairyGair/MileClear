// Trip Split — un-merge a multi-drop journey into its real legs.
//
// Delivery drivers doing quick drops (60-90s per stop) get their whole run
// recorded as ONE trip, because capture-time segmentation only breaks on
// stops longer than the stop-detection window (~2min JS / 5min native
// stopTimeout). Will Holland's report, 21 Jul 2026: a 27.0mi 2h43m "trip"
// (start = end = his base) was really 5-8 separate drops. Nothing is lost —
// the stored TripCoordinate breadcrumbs contain the whole run — so the fix
// is a post-hoc split: re-scan the stored coords for low-speed DWELL
// windows, suggest cut points, and let the user confirm.
//
// NOTE the capture-time auto-splitter (detection.ts finalize_multileg_split)
// cuts on time GAPS between buffered coords. A merged multi-drop run has NO
// gaps — the app kept recording through every stop — so that path can never
// catch this case. Dwell detection over the stored route is the only signal.
//
// Free-tier feature (Anthony, 21 Jul 2026): this is capture accuracy, not an
// advanced analytic — "fighting your corner stays free".

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { haversineDistance, getTaxYear } from "@mileclear/shared";
import { upsertMileageSummary } from "./mileage.js";
import { logEvent } from "./appEvents.js";

// ── Tunables ──────────────────────────────────────────────────────────────

/** A coord is "stopped" below this speed. ~1.34 m/s. */
const DWELL_MAX_MPH = 3;
/** A stopped run must last at least this long to count as a real stop.
 *  60s keeps most traffic lights out while catching quick delivery drops
 *  (Will's shortest real drop dwell was 102s). Suggestions carry dwellSec
 *  so the user can always deselect a false positive. */
const MIN_DWELL_SEC = 60;
/** Never suggest more cuts than this — beyond it the UI becomes noise. */
const MAX_SUGGESTIONS = 12;
/** Each resulting leg must keep at least this many breadcrumbs. */
const MIN_LEG_COORDS = 5;
/** A submitted cut timestamp must land within this window of a stored
 *  coord — beyond it the client is talking about a different route. */
const CUT_MATCH_TOLERANCE_MS = 120 * 1000;
/** Adjacent dwell windows this close in time AND space are one physical
 *  stop shattered by a junk interval — coalesce them. */
const WINDOW_MERGE_MAX_GAP_SEC = 90;
const WINDOW_MERGE_MAX_METERS = 120;

const MS_TO_MPH = 2.23694;

// ── Pure core (unit-tested without prisma) ────────────────────────────────

export interface SplitCoord {
  lat: number;
  lng: number;
  /** Stored speed in m/s (RNBG convention) or null for old rows. */
  speed: number | null;
  recordedAt: Date;
}

export interface DwellSuggestion {
  /** Index into the ordered coord array where the cut goes (leg ends here). */
  cutIndex: number;
  /** Timestamp of the cut coord — what the client echoes back to /split. */
  timestamp: Date;
  lat: number;
  lng: number;
  /** How long the vehicle sat below the speed threshold. */
  dwellSec: number;
}

/**
 * Is the interval between coords i and i+1 a "stopped" interval?
 *
 * Judged on IMPLIED speed — displacement over elapsed time — not on the
 * stored per-sample speed. RNBG records with distanceFilter: 20m, so a
 * parked phone emits NO fixes: on real trails a delivery stop shows up as a
 * time GAP with tiny displacement (Will's trail: 102s/34m, 177s/17m,
 * 1114s/652m), which a slow-sample-run scan misses entirely. Implied speed
 * also cleanly rejects signal loss while driving (292s/3549m = 27mph) and
 * subsumes the dense case — a run of slow samples has low implied speed too.
 */
function isStoppedInterval(a: SplitCoord, b: SplitCoord): boolean {
  // Doppler sample speeds are reliable at low speed and immune to position
  // jitter: a parked phone can jump metres between close-together fixes,
  // which reads as a high implied speed over a 1-2s interval and used to
  // shatter one 18-min stop into several windows (Will's 19:24-19:42 stop).
  // If both ends report a valid slow speed, the interval is stopped. (-1 is
  // RNBG's invalid-speed marker; require >= 0.)
  const aMph = a.speed != null && Number.isFinite(a.speed) && a.speed >= 0 ? a.speed * MS_TO_MPH : null;
  const bMph = b.speed != null && Number.isFinite(b.speed) && b.speed >= 0 ? b.speed * MS_TO_MPH : null;
  if (aMph != null && bMph != null && aMph < DWELL_MAX_MPH && bMph < DWELL_MAX_MPH) {
    return true;
  }

  const dtHours = (b.recordedAt.getTime() - a.recordedAt.getTime()) / 3_600_000;
  if (dtHours <= 0) {
    // Same-instant duplicates with no usable sample speed: not evidence of a stop.
    return aMph != null ? aMph < DWELL_MAX_MPH : false;
  }
  const impliedMph = haversineDistance(a.lat, a.lng, b.lat, b.lng) / dtHours;
  return impliedMph < DWELL_MAX_MPH;
}

/**
 * Scan an ordered coordinate trail for dwell windows — maximal runs of
 * consecutive stopped INTERVALS spanning >= MIN_DWELL_SEC of wall clock
 * (gaps included, so a stop the recorder slept through measures its true
 * length). Returns one suggested cut per dwell at the middle of the window,
 * chronological, capped at MAX_SUGGESTIONS longest-first.
 */
export function detectDwells(coords: SplitCoord[]): DwellSuggestion[] {
  if (coords.length < MIN_LEG_COORDS * 2) return [];

  // Pass 1: maximal runs of stopped intervals → candidate windows.
  const windows: Array<{ startIdx: number; endIdx: number }> = [];
  let windowStart: number | null = null;
  for (let i = 0; i < coords.length - 1; i++) {
    if (isStoppedInterval(coords[i], coords[i + 1])) {
      if (windowStart == null) windowStart = i;
    } else if (windowStart != null) {
      windows.push({ startIdx: windowStart, endIdx: i });
      windowStart = null;
    }
  }
  if (windowStart != null) windows.push({ startIdx: windowStart, endIdx: coords.length - 1 });

  // Pass 2: coalesce windows that are really one stop. A single junk
  // interval (RNBG's -1 invalid-speed marker, a jitter spike neither check
  // can vouch for) shatters one physical stop into fragments seconds apart
  // at the same spot — and two cuts at one stop would trap the user into a
  // too-thin middle leg the split endpoint rejects.
  const merged: typeof windows = [];
  for (const w of windows) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const gapSec =
        (coords[w.startIdx].recordedAt.getTime() - coords[prev.endIdx].recordedAt.getTime()) / 1000;
      const gapMiles = haversineDistance(
        coords[prev.endIdx].lat,
        coords[prev.endIdx].lng,
        coords[w.startIdx].lat,
        coords[w.startIdx].lng
      );
      if (gapSec <= WINDOW_MERGE_MAX_GAP_SEC && gapMiles * 1609 < WINDOW_MERGE_MAX_METERS) {
        prev.endIdx = w.endIdx;
        continue;
      }
    }
    merged.push({ ...w });
  }

  // Pass 3: windows → suggestions.
  const dwells: DwellSuggestion[] = [];
  for (const w of merged) {
    // Leading/trailing stillness isn't a cut — it's just parking at the ends.
    if (w.startIdx === 0 || w.endIdx === coords.length - 1) continue;
    const dwellSec =
      (coords[w.endIdx].recordedAt.getTime() - coords[w.startIdx].recordedAt.getTime()) / 1000;
    if (dwellSec < MIN_DWELL_SEC) continue;
    const cutIndex = Math.floor((w.startIdx + w.endIdx) / 2);
    dwells.push({
      cutIndex,
      timestamp: coords[cutIndex].recordedAt,
      lat: coords[cutIndex].lat,
      lng: coords[cutIndex].lng,
      dwellSec: Math.round(dwellSec),
    });
  }

  if (dwells.length > MAX_SUGGESTIONS) {
    // Keep the longest stops (most likely real drops), restore chronology.
    dwells.sort((a, b) => b.dwellSec - a.dwellSec);
    dwells.length = MAX_SUGGESTIONS;
    dwells.sort((a, b) => a.cutIndex - b.cutIndex);
  }
  return dwells;
}

/**
 * Partition coords into legs at the given cut indices (each leg ENDS at its
 * cut coord; the next begins at cut+1). Throws on any leg thinner than
 * MIN_LEG_COORDS — the caller maps that to a 400.
 */
export function partitionAtCuts(coords: SplitCoord[], cutIndices: number[]): SplitCoord[][] {
  const cuts = [...new Set(cutIndices)].sort((a, b) => a - b);
  for (const c of cuts) {
    if (c <= 0 || c >= coords.length - 1) {
      throw new SplitValidationError(`Cut index ${c} is outside the route.`);
    }
  }
  const legs: SplitCoord[][] = [];
  let start = 0;
  for (const c of cuts) {
    legs.push(coords.slice(start, c + 1));
    start = c + 1;
  }
  legs.push(coords.slice(start));
  for (const leg of legs) {
    if (leg.length < MIN_LEG_COORDS) {
      throw new SplitValidationError(
        "A split would create a leg with too few GPS points. Remove a cut and try again."
      );
    }
  }
  return legs;
}

/** Haversine sum over a leg's breadcrumbs — same basis as the capture
 *  engine's gpsSumDistance, so leg totals stay consistent with the parent. */
export function legDistanceMiles(coords: SplitCoord[]): number {
  let miles = 0;
  for (let i = 1; i < coords.length; i++) {
    miles += haversineDistance(
      coords[i - 1].lat,
      coords[i - 1].lng,
      coords[i].lat,
      coords[i].lng
    );
  }
  return Math.round(miles * 100) / 100;
}

/** Google encoded-polyline (precision 5) — inverse of mapMatching's
 *  decodePolyline, so mobile renders leg routes with zero new code. */
export function encodePolyline(points: Array<{ lat: number; lng: number }>): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const encodeValue = (v: number) => {
    let value = v < 0 ? ~(v << 1) : v << 1;
    let chunk = "";
    while (value >= 0x20) {
      chunk += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    chunk += String.fromCharCode(value + 63);
    return chunk;
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

export class SplitValidationError extends Error {}

// ── Automatic visit splitting (27 Aug 2026) ───────────────────────────────
//
// The manual flow above asks the user to confirm each cut. That is right for
// a delivery run with eight 90-second drops, where only the driver knows
// which pauses were drops. It is the wrong shape for the case Rachel
// Thorndyke keeps hitting: she visits a client for a quarter of an hour, and
// the whole afternoon comes back as one trip, because under the native engine
// NOTHING ends a recording except RNBG declaring stationary — and RNBG does
// not declare stationary while she walks round a farmyard with the phone in
// her pocket. Her 27 Aug trip 3e706e24 holds twelve consecutive fixes between
// 0.5 and 3.6 mph over nine minutes at one client's house, inside one trip.
//
// Build 85's gap-stop does not reach these either: it wants silence AND the
// next fix within 250 m of the last, and hers arrives 500 m to 1.4 km down
// the road because the phone only wakes once she is driving again.
//
// So: the same dwell detector, run automatically, at a threshold high enough
// that only a real visit clears it. Measured against her two days —
//   split:  916s (client), 739s (shop), 706s (client), 255s (client)
//   ignored: 229s (roadside pause), 105s (junction), 1180s (arrival, no
//            distance left in the tail leg)
// — 240 seconds plus a minimum leg distance separates them exactly.
//
// This never invents or loses a journey. The breadcrumbs are untouched; they
// are re-attributed to the leg they were recorded on, and each leg's distance
// is re-derived from its own trail, so the shuffling-about at a stop stops
// counting as driving. Totals fall slightly, and that is the correction.

/** A dwell must last this long to split a trip without being asked. */
export const AUTO_SPLIT_MIN_DWELL_SEC = 240;
/** Each resulting leg must cover at least this much ground — kills the
 *  arrival dwell, where the "leg" after the cut is a few metres of jitter. */
export const AUTO_SPLIT_MIN_LEG_MILES = 0.25;
/** More cuts than this on one trip is a delivery run, not a round of visits:
 *  leave it to the user-confirmed flow, which can show them all. */
export const AUTO_SPLIT_MAX_CUTS = 5;

/**
 * Choose the cuts a trip can be split on with no human in the loop. Returns
 * chronological coord indices; each leg ENDS at its cut index.
 *
 * Deliberately stricter than detectDwells on three counts: a longer dwell,
 * a minimum distance either side, and a cap. A candidate that fails any of
 * them is dropped rather than throwing, because there is nobody to tell.
 */
export function planAutoSplit(coords: SplitCoord[]): number[] {
  if (coords.length < MIN_LEG_COORDS * 2) return [];

  const candidates = detectDwells(coords)
    .filter((d) => d.dwellSec >= AUTO_SPLIT_MIN_DWELL_SEC)
    .sort((a, b) => b.dwellSec - a.dwellSec)   // longest stops win the cap
    .slice(0, AUTO_SPLIT_MAX_CUTS)
    .map((d) => d.cutIndex)
    .sort((a, b) => a - b);

  // Validate against the legs each cut would actually produce, dropping the
  // weakest offender until what remains is legal. Checking a cut in isolation
  // is not enough: two cuts close together make a thin middle leg neither of
  // them looks guilty of.
  const accepted = [...candidates];
  for (;;) {
    if (accepted.length === 0) return [];
    const bounds = [0, ...accepted.map((c) => c + 1), coords.length];
    let offender = -1;
    for (let i = 0; i < bounds.length - 1; i++) {
      const leg = coords.slice(bounds[i], bounds[i + 1]);
      if (leg.length >= MIN_LEG_COORDS && legDistanceMiles(leg) >= AUTO_SPLIT_MIN_LEG_MILES) {
        continue;
      }
      // Blame the cut that closes this leg, or the one that opens it for the
      // final leg, which has no closing cut of its own.
      offender = i < accepted.length ? i : i - 1;
      break;
    }
    if (offender === -1) return accepted;
    accepted.splice(offender, 1);
  }
}

// ── Prisma-backed operations ──────────────────────────────────────────────

/** Load a trip's coords in recording order, mapped to the pure-core shape. */
async function loadCoords(tripId: string): Promise<SplitCoord[]> {
  const rows = await prisma.tripCoordinate.findMany({
    where: { tripId },
    orderBy: { recordedAt: "asc" },
    select: { lat: true, lng: true, speed: true, recordedAt: true },
  });
  return rows;
}

export async function getSplitSuggestions(args: {
  userId: string;
  tripId: string;
}): Promise<{ suggestions: DwellSuggestion[]; coordCount: number } | null> {
  const trip = await prisma.trip.findFirst({
    where: { id: args.tripId, userId: args.userId },
    select: { id: true, isManualEntry: true },
  });
  if (!trip) return null;
  if (trip.isManualEntry) return { suggestions: [], coordCount: 0 };
  const coords = await loadCoords(trip.id);
  return { suggestions: detectDwells(coords), coordCount: coords.length };
}

export interface SplitResult {
  deletedTripId: string;
  trips: unknown[];
}

/**
 * Execute a split: partition the parent's coords at the accepted cut
 * timestamps, create one inheriting trip per leg, move the breadcrumbs to
 * their legs, delete the parent — all in one transaction. Distances are
 * RE-DERIVED per leg from its own breadcrumbs; this is an explicit user
 * action, not a background hook, so recomputing the tax-relevant figure is
 * correct here (the geometry-only rule guards silent changes, not this).
 */
export async function executeTripSplit(args: {
  userId: string;
  tripId: string;
  cutTimestamps: Date[];
}): Promise<SplitResult> {
  const { userId, tripId, cutTimestamps } = args;

  const parent = await prisma.trip.findFirst({
    where: { id: tripId, userId },
  });
  if (!parent) throw new SplitValidationError("Trip not found.");
  if (parent.isManualEntry) {
    throw new SplitValidationError("Manual trips have no GPS trail to split.");
  }
  if (cutTimestamps.length < 1 || cutTimestamps.length > MAX_SUGGESTIONS) {
    throw new SplitValidationError(`Choose between 1 and ${MAX_SUGGESTIONS} split points.`);
  }

  const coords = await loadCoords(parent.id);
  if (coords.length < MIN_LEG_COORDS * 2) {
    throw new SplitValidationError("This trip has too few GPS points to split.");
  }

  // Map each timestamp to the nearest coord index (must be within tolerance).
  const cutIndices = cutTimestamps.map((ts) => {
    let best = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const delta = Math.abs(coords[i].recordedAt.getTime() - ts.getTime());
      if (delta < bestDelta) {
        bestDelta = delta;
        best = i;
      }
    }
    if (bestDelta > CUT_MATCH_TOLERANCE_MS) {
      throw new SplitValidationError("A split point didn't match the trip's route.");
    }
    return best;
  });

  const legs = partitionAtCuts(coords, cutIndices); // throws SplitValidationError on thin legs

  const newTrips = await prisma.$transaction(async (tx) => {
    const created: { id: string }[] = [];
    for (let k = 0; k < legs.length; k++) {
      const leg = legs[k];
      const first = leg[0];
      const last = leg[leg.length - 1];
      const legTrip = await tx.trip.create({
        data: {
          userId,
          shiftId: parent.shiftId,
          vehicleId: parent.vehicleId,
          startLat: first.lat,
          startLng: first.lng,
          endLat: last.lat,
          endLng: last.lng,
          // Boundary legs keep the parent's resolved addresses; interior
          // stop addresses are unknown server-side — mobile reverse-geocodes
          // on display exactly as it does for any address-less trip.
          startAddress: k === 0 ? parent.startAddress : null,
          endAddress: k === legs.length - 1 ? parent.endAddress : null,
          distanceMiles: legDistanceMiles(leg),
          startedAt: first.recordedAt,
          endedAt: last.recordedAt,
          isManualEntry: false,
          isPhantomTrip: false,
          // Inherit-then-edit (Anthony, 21 Jul 2026): legs start with the
          // parent's classification; the user reclassifies odd ones out.
          classification: parent.classification,
          platformTag: parent.platformTag,
          businessPurpose: parent.businessPurpose,
          category: parent.category,
          projectLabel: parent.projectLabel,
          // Notes describe the whole journey — carried on the first leg
          // only, never duplicated across all N.
          notes: k === 0 ? parent.notes : null,
          classificationAutoAccepted: null,
          routePolyline: encodePolyline(leg),
          gpsQuality: {
            rawCoords: leg.length,
            keptCoords: leg.length,
            distanceSource: "haversine",
            splitFromTripId: parent.id,
          } as Prisma.InputJsonValue,
        },
      });
      created.push(legTrip);

      // Move this leg's breadcrumbs BEFORE the parent delete — the FK
      // cascade would otherwise take the whole trail down with the parent.
      // Half-open time intervals partition cleanly even with duplicate
      // recordedAt values.
      const nextLegStart = k < legs.length - 1 ? legs[k + 1][0].recordedAt : null;
      await tx.tripCoordinate.updateMany({
        where: {
          tripId: parent.id,
          recordedAt: {
            gte: first.recordedAt,
            ...(nextLegStart ? { lt: nextLegStart } : {}),
          },
        },
        data: { tripId: legTrip.id },
      });
    }

    await tx.trip.delete({ where: { id: parent.id } });

    return tx.trip.findMany({
      where: { id: { in: created.map((t) => t.id) } },
      orderBy: { startedAt: "asc" },
      include: { vehicle: true, shift: true },
    });
  });

  // Refresh every affected tax year. Almost always one, but a run that
  // straddles 6 April midnight puts legs in two years — cover both.
  const taxYears = new Set(newTrips.map((t) => getTaxYear((t as { startedAt: Date }).startedAt)));
  taxYears.add(getTaxYear(parent.startedAt));
  for (const year of taxYears) {
    upsertMileageSummary(userId, year).catch(() => {});
  }
  logEvent("trip.split", userId, {
    parentTripId: parent.id,
    parentMiles: parent.distanceMiles,
    legs: newTrips.length,
    legMiles: newTrips.map((t) => (t as { distanceMiles: number }).distanceMiles),
  });

  return { deletedTripId: parent.id, trips: newTrips };
}

export interface AutoSplitResult {
  tripId: string;
  legs: number;
  /** Distance before the split, and the sum of the legs after it. The
   *  difference is the shuffling-about at the stops, which is not driving. */
  milesBefore: number;
  milesAfter: number;
  newTripIds: string[];
  cutTimestamps: Date[];
}

/**
 * Split a welded trip at its visit boundaries WITHOUT asking, and without
 * deleting anything.
 *
 * The parent survives as leg one. That is not tidiness: the device holds this
 * trip under this id in its own SQLite, and a later PATCH or coordinate
 * append addresses it by id. executeTripSplit deletes the parent because the
 * user is looking at the screen when it happens; here nobody is, so the id
 * has to stay valid.
 *
 * Returns null when the trip has no cut worth making, which is the common
 * case — this runs over every recent trip.
 */
export async function autoSplitVisitWelds(args: {
  userId: string;
  tripId: string;
  dryRun?: boolean;
}): Promise<AutoSplitResult | null> {
  const { userId, tripId, dryRun = false } = args;

  const parent = await prisma.trip.findFirst({ where: { id: tripId, userId } });
  if (!parent) return null;
  if (parent.isManualEntry || parent.isPhantomTrip) return null;
  if (parent.endedAt == null) return null;

  const coords = await loadCoords(parent.id);
  const cutIndices = planAutoSplit(coords);
  if (cutIndices.length === 0) return null;

  const legs = partitionAtCuts(coords, cutIndices);
  const legMiles = legs.map((leg) => legDistanceMiles(leg));
  const result: AutoSplitResult = {
    tripId: parent.id,
    legs: legs.length,
    milesBefore: parent.distanceMiles,
    milesAfter: Math.round(legMiles.reduce((a, b) => a + b, 0) * 100) / 100,
    newTripIds: [],
    cutTimestamps: cutIndices.map((i) => coords[i].recordedAt),
  };
  if (dryRun) return result;

  const created = await prisma.$transaction(async (tx) => {
    const madeIds: string[] = [];

    // Legs two onward become new trips, taking their breadcrumbs with them.
    for (let k = 1; k < legs.length; k++) {
      const leg = legs[k];
      const first = leg[0];
      const last = leg[leg.length - 1];
      const legTrip = await tx.trip.create({
        data: {
          userId,
          shiftId: parent.shiftId,
          vehicleId: parent.vehicleId,
          startLat: first.lat,
          startLng: first.lng,
          endLat: last.lat,
          endLng: last.lng,
          // Interior boundaries are the stop, and only the driver knows what
          // it is called. Left null for the geocode job to name.
          startAddress: null,
          endAddress: k === legs.length - 1 ? parent.endAddress : null,
          distanceMiles: legMiles[k],
          startedAt: first.recordedAt,
          endedAt: last.recordedAt,
          isManualEntry: false,
          isPhantomTrip: false,
          classification: parent.classification,
          platformTag: parent.platformTag,
          businessPurpose: parent.businessPurpose,
          category: parent.category,
          projectLabel: parent.projectLabel,
          notes: null,
          classificationAutoAccepted: null,
          routePolyline: encodePolyline(leg),
          gpsQuality: {
            rawCoords: leg.length,
            keptCoords: leg.length,
            distanceSource: "haversine",
            autoSplitFromTripId: parent.id,
          } as Prisma.InputJsonValue,
        },
      });
      madeIds.push(legTrip.id);

      const nextLegStart = k < legs.length - 1 ? legs[k + 1][0].recordedAt : null;
      await tx.tripCoordinate.updateMany({
        where: {
          tripId: parent.id,
          recordedAt: {
            gte: first.recordedAt,
            ...(nextLegStart ? { lt: nextLegStart } : {}),
          },
        },
        data: { tripId: legTrip.id },
      });
    }

    // The parent keeps leg one's breadcrumbs and shrinks to match them. Its
    // end address belonged to the far end of the welded journey and has moved
    // to the last leg, so null it and let the geocoder name the stop.
    const firstLeg = legs[0];
    await tx.trip.update({
      where: { id: parent.id },
      data: {
        endLat: firstLeg[firstLeg.length - 1].lat,
        endLng: firstLeg[firstLeg.length - 1].lng,
        endAddress: null,
        endedAt: firstLeg[firstLeg.length - 1].recordedAt,
        distanceMiles: legMiles[0],
        routePolyline: encodePolyline(firstLeg),
      },
    });

    return madeIds;
  });

  result.newTripIds = created;

  const taxYears = new Set<string>([getTaxYear(parent.startedAt)]);
  for (const leg of legs) taxYears.add(getTaxYear(leg[0].recordedAt));
  for (const year of taxYears) {
    upsertMileageSummary(userId, year).catch(() => {});
  }

  logEvent("trip.visit_auto_split", userId, {
    tripId: parent.id,
    legs: legs.length,
    milesBefore: result.milesBefore,
    milesAfter: result.milesAfter,
    legMiles,
    newTripIds: created,
  });

  return result;
}
