// The work a hand-typed trip gets on the way in, shared by POST /trips (one
// manual trip) and POST /shifts/past (a whole past shift of them, Oct 2026):
// turning typed addresses into pins, the road miles between them, the route
// line for the map, the names for unnamed pins, and the trips nearby that the
// possible-double check compares against. Moved here unchanged from
// routes/trips/index.ts so both routes run the same code.

import { Prisma } from "@prisma/client";
import { haversineDistance } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";
import { resolveRouteDistance, routedDurationUsable } from "./routing.js";
import { reverseGeocode } from "./geocoding.js";
import type { DuplicateCheckTrip } from "./tripDuplicates.js";

// Server-side geocoding: resolve an address to coordinates via Postcodes.io or Nominatim
export async function geocodeAddress(addr: string): Promise<{ lat: number; lng: number } | null> {
  // Extract UK postcode (full or partial outcode)
  const fullMatch = addr.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  const partialMatch = addr.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\b/i);
  const pc = fullMatch
    ? { code: fullMatch[1].replace(/\s+/g, ""), partial: false }
    : partialMatch
      ? { code: partialMatch[1], partial: true }
      : null;

  if (pc) {
    try {
      const endpoint = pc.partial
        ? `https://api.postcodes.io/outcodes/${pc.code}`
        : `https://api.postcodes.io/postcodes/${pc.code}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 200 && data.result) {
          return { lat: data.result.latitude, lng: data.result.longitude };
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=gb`,
      { headers: { "User-Agent": "MileClear/1.0" } }
    );
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* give up */ }
  return null;
}

// Check if coordinates look like real values (not 0,0 dummy or null-island)
export function hasValidCoords(lat: number, lng: number): boolean {
  return !(Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1);
}

/**
 * Pins and miles for a typed trip. A pin that is missing or at 0,0 is looked
 * up from its address. With both ends known and no miles given, the miles are
 * the road route (cache, GraphHopper, Google); only when every engine is down
 * is it the straight line, and that is logged so it can be audited.
 */
export async function resolveManualTripPlaces(args: {
  userId: string;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  startAddress?: string | null;
  endAddress?: string | null;
  distanceMiles?: number | null;
}): Promise<{
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  distanceMiles: number;
}> {
  // Server-side geocoding fallback: resolve addresses to coordinates if missing/zero
  let resolvedStartLat = args.startLat;
  let resolvedStartLng = args.startLng;
  let resolvedEndLat = args.endLat ?? null;
  let resolvedEndLng = args.endLng ?? null;

  if (!hasValidCoords(resolvedStartLat, resolvedStartLng) && args.startAddress) {
    const geo = await geocodeAddress(args.startAddress);
    if (geo) {
      resolvedStartLat = geo.lat;
      resolvedStartLng = geo.lng;
    }
  }

  if (args.endAddress && (resolvedEndLat == null || resolvedEndLng == null || !hasValidCoords(resolvedEndLat, resolvedEndLng))) {
    const geo = await geocodeAddress(args.endAddress);
    if (geo) {
      resolvedEndLat = geo.lat;
      resolvedEndLng = geo.lng;
    }
  }

  // Auto-calculate distance if end coords present and distance not provided.
  // Use the routing service (cache → GraphHopper → Google) — never silently
  // falls back to haversine, which previously caused identical-address
  // trips to return inconsistent miles (Laura Joyce report 10 May 2026).
  let distanceMiles = args.distanceMiles ?? 0;
  if (resolvedEndLat != null && resolvedEndLng != null && hasValidCoords(resolvedStartLat, resolvedStartLng) && args.distanceMiles == null) {
    const route = await resolveRouteDistance({
      startLat: resolvedStartLat,
      startLng: resolvedStartLng,
      endLat: resolvedEndLat,
      endLng: resolvedEndLng,
      userId: args.userId,
    });
    if (route) {
      distanceMiles = route.distanceMiles;
    } else {
      // All routing engines unavailable. Use haversine as the explicit
      // last resort and flag it so we can audit how often it fires.
      distanceMiles = haversineDistance(resolvedStartLat, resolvedStartLng, resolvedEndLat, resolvedEndLng);
      logEvent("routing.haversine_fallback_used", args.userId, {
        startLat: resolvedStartLat,
        startLng: resolvedStartLng,
        endLat: resolvedEndLat,
        endLng: resolvedEndLng,
        distanceMiles,
      });
    }
  }

  return {
    startLat: resolvedStartLat,
    startLng: resolvedStartLng,
    endLat: resolvedEndLat,
    endLng: resolvedEndLng,
    distanceMiles,
  };
}

/**
 * The driver's other trips from the day either side of `trip`, for the
 * possible-double check (services/tripDuplicates.ts findDuplicateCandidate).
 */
export async function loadDuplicateNeighbours(
  userId: string,
  trip: { id: string; startedAt: Date }
): Promise<DuplicateCheckTrip[]> {
  const dayMs = 24 * 60 * 60 * 1000;
  return prisma.trip.findMany({
    where: {
      userId,
      id: { not: trip.id },
      isPhantomTrip: false,
      startedAt: {
        gte: new Date(trip.startedAt.getTime() - dayMs),
        lte: new Date(trip.startedAt.getTime() + dayMs),
      },
    },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      startLat: true,
      startLng: true,
      endLat: true,
      endLng: true,
      isManualEntry: true,
    },
  });
}

/**
 * Give a trip a name the driver recognises, when the device could not.
 *
 * Addresses normally arrive from the client. When its reverse geocode fails it
 * sends null, and a trip with BOTH addresses null draws no route line at all in
 * the trips list — a captured drive that reads as a missing one. Six of the
 * people who filed missing-trip reports in the week to 15 Aug had trips in this
 * state; Hanson reported his twice and then tried to re-enter it by hand while
 * it was already saved.
 *
 * Fire-and-forget, after the row is written, exactly like the manual route
 * polyline: trip capture is Priority 1 and must not take on a new external
 * dependency in its critical path. Only ever FILLS a null — whatever the client
 * sent always wins, because the device was there and we were not.
 */
export async function backfillTripAddresses(args: {
  tripId: string;
  userId: string;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  hasStart: boolean;
  hasEnd: boolean;
}): Promise<void> {
  const wantStart = !args.hasStart && hasValidCoords(args.startLat, args.startLng);
  const wantEnd =
    !args.hasEnd &&
    args.endLat != null &&
    args.endLng != null &&
    hasValidCoords(args.endLat, args.endLng);
  if (!wantStart && !wantEnd) return;

  const [start, end] = await Promise.all([
    wantStart ? reverseGeocode(args.startLat, args.startLng) : Promise.resolve(null),
    wantEnd ? reverseGeocode(args.endLat!, args.endLng!) : Promise.resolve(null),
  ]);
  if (!start && !end) return;

  await prisma.trip.update({
    where: { id: args.tripId },
    data: {
      ...(start ? { startAddress: start } : {}),
      ...(end ? { endAddress: end } : {}),
    },
  });

  logEvent("trip.address_backfilled", args.userId, {
    tripId: args.tripId,
    filledStart: Boolean(start),
    filledEnd: Boolean(end),
  });
}

/**
 * Resolve the road-route geometry for a manual trip and store it as
 * routePolyline. Manual entries have no GPS breadcrumbs, so without
 * this every map draws them as a straight dashed line (Sarjit's Trip
 * Map, 16 Jul 2026 — 17 manual trips, all crow-flies). The routing
 * cache is usually warm here (the manual-trip form resolved the same
 * pair for its distance moments earlier), so this is typically a
 * single cache read.
 *
 * Geometry only — NEVER touches distanceMiles. The user saw and
 * accepted a specific figure when they saved the trip; a background
 * hook silently changing a tax-relevant number is not acceptable.
 * Called fire-and-forget; failures leave routePolyline null and the
 * map falls back to the dashed straight line, same as before.
 */
export async function attachManualRoutePolyline(args: {
  tripId: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  userId: string;
}): Promise<void> {
  const route = await resolveRouteDistance({
    startLat: args.startLat,
    startLng: args.startLng,
    endLat: args.endLat,
    endLng: args.endLng,
    userId: args.userId,
  });
  if (!route) return;

  // The same lookup answers "how long does this drive take?", which is the
  // only end time a manually-entered trip can have when the user did not
  // give one. The web form has no end-time field at all and mobile's is
  // optional, so ~11% of manual trips were stored with endedAt NULL and
  // dropped out of every duration-derived figure (shift grades, earnings
  // per hour, golden hours, the weekly P&L). An estimate beats absence
  // there, but it must be labelled, so gpsQuality carries its provenance
  // and the trip is only touched when the user left the field empty.
  const current = await prisma.trip.findUnique({
    where: { id: args.tripId },
    select: { startedAt: true, endedAt: true, distanceMiles: true, gpsQuality: true },
  });
  if (!current) return;

  const inferEndedAt =
    current.endedAt === null &&
    routedDurationUsable({
      routedMiles: route.distanceMiles,
      routedSecs: route.durationSecs,
      storedMiles: current.distanceMiles,
    });

  if (!route.encodedPolyline && !inferEndedAt) return;

  await prisma.trip.update({
    where: { id: args.tripId },
    data: {
      ...(route.encodedPolyline ? { routePolyline: route.encodedPolyline } : {}),
      ...(inferEndedAt
        ? {
            endedAt: new Date(current.startedAt.getTime() + route.durationSecs * 1000),
            gpsQuality: {
              ...(current.gpsQuality && typeof current.gpsQuality === "object" && !Array.isArray(current.gpsQuality)
                ? (current.gpsQuality as Prisma.JsonObject)
                : {}),
              endedAtSource: "routed_duration",
              endedAtDurationSecs: route.durationSecs,
            },
          }
        : {}),
    },
  });

  if (inferEndedAt) {
    logEvent("trip.ended_at_inferred", args.userId, {
      tripId: args.tripId,
      durationSecs: route.durationSecs,
      source: route.source,
    });
  }
}
