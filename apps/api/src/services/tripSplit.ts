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

  const dwells: DwellSuggestion[] = [];
  let windowStart: number | null = null; // index of first coord of the stopped window

  const closeWindow = (endIdx: number) => {
    if (windowStart == null) return;
    const startIdx = windowStart;
    windowStart = null;
    // Leading/trailing stillness isn't a cut — it's just parking at the ends.
    if (startIdx === 0 || endIdx === coords.length - 1) return;
    const dwellSec =
      (coords[endIdx].recordedAt.getTime() - coords[startIdx].recordedAt.getTime()) / 1000;
    if (dwellSec < MIN_DWELL_SEC) return;
    const cutIndex = Math.floor((startIdx + endIdx) / 2);
    dwells.push({
      cutIndex,
      timestamp: coords[cutIndex].recordedAt,
      lat: coords[cutIndex].lat,
      lng: coords[cutIndex].lng,
      dwellSec: Math.round(dwellSec),
    });
  };

  for (let i = 0; i < coords.length - 1; i++) {
    if (isStoppedInterval(coords[i], coords[i + 1])) {
      if (windowStart == null) windowStart = i;
    } else if (windowStart != null) {
      closeWindow(i); // window spans [windowStart .. i]
    }
  }
  closeWindow(coords.length - 1);

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
