// Backfill missing trip addresses
//
// Support-side trip splits (tripSplit.ts) keep the parent's addresses on the
// outer legs but leave the interior boundaries null, because the stop point is
// unknown server-side. Device reverse-geocode failures leave the same hole.
// The app then shows the raw coordinates ("53.689, -0.313 -> 53.686, -0.317")
// where a driver expects a street name.
//
// This job sweeps recent trips with a coordinate but no address on either
// side and fills them through the same Nominatim reverse geocoder the trip
// save path already uses (services/geocoding.ts), including its 30-day
// coordinate cache. Nominatim asks for at most one request a second, so
// uncached lookups are paced, and a run stops early after a streak of
// failures so a broken provider response cannot burn a whole run.
//
// Only ever FILLS a null. A trip whose lookup fails is left null and picked
// up again on the next run (oldest first, so nothing starves).

import { prisma } from "../lib/prisma.js";
import { reverseGeocode } from "../services/geocoding.js";
import { logEvent } from "../services/appEvents.js";
import { haversineDistance } from "@mileclear/shared";

const LOOKBACK_DAYS = 60;
const DEFAULT_LIMIT = 50;
// Stop the run after this many consecutive lookup failures. Nominatim being
// down or rate-limiting us looks like an unbroken run of nulls; a single
// point in the sea does not.
const MAX_CONSECUTIVE_FAILURES = 5;
// Nominatim usage policy: <= 1 request a second. Cache hits return well under
// this, so pacing is applied per lookup rather than per trip.
const LOOKUP_PACE_MS = 1100;
/** Same buffer the classifier allows for GPS drift at a saved location. */
const SAVED_LOCATION_DRIFT_BUFFER_M = 50;
const METERS_TO_MILES = 0.000621371;

export interface GeocodeMissingAddressesResult {
  scanned: number;
  filled: number;
  failed: number;
  /** True when the consecutive-failure cap ended the run early. */
  aborted: boolean;
}

export interface GeocodeMissingAddressesOptions {
  userId?: string;
  limit?: number;
  /** Test hook: skip the Nominatim pacing sleep. */
  pace?: boolean;
}

// 0,0 is the established "no coordinates" sentinel and is never a candidate.
function hasValidCoords(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !(Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runGeocodeMissingAddresses(
  opts: GeocodeMissingAddressesOptions = {}
): Promise<GeocodeMissingAddressesResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 500));
  const pace = opts.pace ?? true;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const trips = await prisma.trip.findMany({
    where: {
      ...(opts.userId ? { userId: opts.userId } : {}),
      isPhantomTrip: false,
      OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }],
      AND: [
        {
          OR: [
            { startAddress: null },
            { endAddress: null, endLat: { not: null }, endLng: { not: null } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      startLat: true,
      startLng: true,
      endLat: true,
      endLng: true,
      startAddress: true,
      endAddress: true,
    },
  });

  const result: GeocodeMissingAddressesResult = {
    scanned: trips.length,
    filled: 0,
    failed: 0,
    aborted: false,
  };

  // A driver names the places they go, and the app shows those names
  // everywhere else. Nominatim called the stop at the end of one of Rachel
  // Thorndyke's split legs "South End, DN19 7NE"; she calls it Michelle
  // Atkin, and so does every other trip that ends there. Ask her own list
  // first, and only fall back to the street.
  const userIds = [...new Set(trips.map((t) => t.userId))];
  const savedByUser = new Map<string, Array<{ name: string; latitude: number; longitude: number; radiusMeters: number }>>();
  if (userIds.length > 0) {
    const saved = await prisma.savedLocation.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, name: true, latitude: true, longitude: true, radiusMeters: true },
    });
    for (const row of saved) {
      const list = savedByUser.get(row.userId) ?? [];
      list.push(row);
      savedByUser.set(row.userId, list);
    }
  }
  const namedPlace = (userId: string, lat: number | null, lng: number | null): string | null => {
    if (!hasValidCoords(lat, lng)) return null;
    let best: string | null = null;
    let bestMiles = Infinity;
    for (const loc of savedByUser.get(userId) ?? []) {
      const miles = haversineDistance(lat!, lng!, loc.latitude, loc.longitude);
      const limit = (loc.radiusMeters + SAVED_LOCATION_DRIFT_BUFFER_M) * METERS_TO_MILES;
      if (miles <= limit && miles < bestMiles) {
        best = loc.name;
        bestMiles = miles;
      }
    }
    return best;
  };

  let consecutiveFailures = 0;

  for (const trip of trips) {
    const wantStart = trip.startAddress == null && hasValidCoords(trip.startLat, trip.startLng);
    const wantEnd = trip.endAddress == null && hasValidCoords(trip.endLat, trip.endLng);
    if (!wantStart && !wantEnd) continue;

    let start: string | null = null;
    let end: string | null = null;
    let sideFailed = false;

    if (wantStart) {
      start = namedPlace(trip.userId, trip.startLat, trip.startLng);
      if (!start) {
        start = await reverseGeocode(trip.startLat, trip.startLng);
        if (!start) sideFailed = true;
        if (pace) await sleep(LOOKUP_PACE_MS);
      }
    }
    if (wantEnd) {
      end = namedPlace(trip.userId, trip.endLat, trip.endLng);
      if (!end) {
        end = await reverseGeocode(trip.endLat!, trip.endLng!);
        if (!end) sideFailed = true;
        if (pace) await sleep(LOOKUP_PACE_MS);
      }
    }

    if (start || end) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: {
          ...(start ? { startAddress: start } : {}),
          ...(end ? { endAddress: end } : {}),
        },
      });
      result.filled += 1;
      logEvent("trip.address_backfilled", trip.userId, {
        tripId: trip.id,
        filledStart: Boolean(start),
        filledEnd: Boolean(end),
        source: "job",
      });
    }

    if (sideFailed) {
      result.failed += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        result.aborted = true;
        break;
      }
    } else {
      consecutiveFailures = 0;
    }
  }

  if (result.scanned > 0) {
    logEvent("job.geocode_missing_addresses", null, {
      scanned: result.scanned,
      filled: result.filled,
      failed: result.failed,
      ...(result.aborted ? { aborted: true } : {}),
      ...(opts.userId ? { userId: opts.userId } : {}),
    });
  }

  return result;
}

export async function runGeocodeMissingAddressesJob(): Promise<GeocodeMissingAddressesResult> {
  return runGeocodeMissingAddresses();
}
