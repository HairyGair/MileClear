// Road-distance routing service.
//
// Replaces the previous direct call to public router.project-osrm.org
// (which silently fell back to haversine on intermittent failure,
// causing identical-address trips to return inconsistent mileages —
// see Laura Joyce report 10 May 2026).
//
// Architecture (in order of preference):
//
//   1. Persistent cache (RouteCache table). Keyed on coords rounded to
//      4 decimal places (~11 m). Once any user gets a route from A→B,
//      every future A→B request returns the cached value. This makes
//      "manual trip A→B is always the same mileage" a structural
//      guarantee, not a hopeful coincidence.
//
//   2. Self-hosted GraphHopper on Pixelish (or wherever GRAPHHOPPER_URL
//      points). Open-source routing engine, OSM data. Zero ongoing
//      cost, deterministic, privacy-clean (routes never leave our
//      infrastructure).
//
//   3. Google Maps Routes API. Industry-best accuracy, near-zero ops.
//      Used only when GraphHopper is unreachable or returns no route.
//      Free at MileClear's volume ($200/mo Google Cloud credit covers
//      ~40k requests/mo; cache hit rate keeps us well under).
//
//   4. NULL. If all engines fail, we surface a "couldn't calculate"
//      result rather than silently returning a haversine value the
//      user has no way to know is wrong.
//
// The previous "if the engine is down, return crow-flies and pretend
// everything's fine" pattern is the bug we're explicitly killing.

import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";
import { haversineDistance } from "@mileclear/shared";

/** Result returned to callers — distance + provenance. */
export interface RouteResult {
  distanceMiles: number;
  durationSecs: number;
  source: "cache" | "graphhopper" | "google";
  /** Sanity-check: ratio of road distance to crow-flies. Real routes
   *  are typically 1.1-1.6×; <0.95 or >5 is suspicious. */
  routeToHaversineRatio: number;
}

/** Cache key precision: 4 decimal places ≈ 11 m at UK latitudes. */
function roundCoord(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clampReasonable(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) > 0.001;
}

/**
 * Resolve a road distance for the given coordinate pair. Returns null
 * only if every engine has failed AND the cache has no entry.
 *
 * @param userId - for diagnostic logging only; routing decisions are not user-scoped
 */
export async function resolveRouteDistance(args: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  userId?: string;
}): Promise<RouteResult | null> {
  const { startLat, startLng, endLat, endLng, userId } = args;

  if (
    !clampReasonable(startLat) ||
    !clampReasonable(startLng) ||
    !clampReasonable(endLat) ||
    !clampReasonable(endLng)
  ) {
    return null;
  }

  const startLatR = roundCoord(startLat);
  const startLngR = roundCoord(startLng);
  const endLatR = roundCoord(endLat);
  const endLngR = roundCoord(endLng);

  const haversine = haversineDistance(startLat, startLng, endLat, endLng);

  // 1. Cache lookup.
  const cached = await prisma.routeCache
    .findUnique({
      where: {
        startLatRounded_startLngRounded_endLatRounded_endLngRounded: {
          startLatRounded: startLatR,
          startLngRounded: startLngR,
          endLatRounded: endLatR,
          endLngRounded: endLngR,
        },
      },
    })
    .catch(() => null);

  if (cached) {
    // Bump hit counter — best-effort; if it fails the read result is
    // still good. Don't block the response on the write.
    prisma.routeCache
      .update({
        where: { id: cached.id },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      })
      .catch(() => {});

    return {
      distanceMiles: cached.distanceMiles,
      durationSecs: cached.durationSecs,
      source: "cache",
      routeToHaversineRatio: haversine > 0 ? cached.distanceMiles / haversine : 1,
    };
  }

  // 2. GraphHopper.
  const ghResult = await tryGraphHopper(startLat, startLng, endLat, endLng).catch(() => null);
  if (ghResult) {
    await persistRoute({
      startLatR,
      startLngR,
      endLatR,
      endLngR,
      distanceMiles: ghResult.distanceMiles,
      durationSecs: ghResult.durationSecs,
      source: "graphhopper",
    });
    if (userId) {
      logEvent("routing.computed", userId, {
        source: "graphhopper",
        distanceMiles: ghResult.distanceMiles,
        haversineMiles: haversine,
      });
    }
    return {
      ...ghResult,
      source: "graphhopper",
      routeToHaversineRatio: haversine > 0 ? ghResult.distanceMiles / haversine : 1,
    };
  }

  // 3. Google Maps Routes API.
  const googleResult = await tryGoogleMaps(startLat, startLng, endLat, endLng).catch(() => null);
  if (googleResult) {
    await persistRoute({
      startLatR,
      startLngR,
      endLatR,
      endLngR,
      distanceMiles: googleResult.distanceMiles,
      durationSecs: googleResult.durationSecs,
      source: "google",
    });
    if (userId) {
      logEvent("routing.computed", userId, {
        source: "google",
        distanceMiles: googleResult.distanceMiles,
        haversineMiles: haversine,
      });
    }
    return {
      ...googleResult,
      source: "google",
      routeToHaversineRatio: haversine > 0 ? googleResult.distanceMiles / haversine : 1,
    };
  }

  // 4. Failure. Caller decides what to do.
  if (userId) {
    logEvent("routing.unavailable", userId, {
      startLat: startLatR,
      startLng: startLngR,
      endLat: endLatR,
      endLng: endLngR,
      haversineMiles: haversine,
    });
  }
  return null;
}

async function persistRoute(args: {
  startLatR: number;
  startLngR: number;
  endLatR: number;
  endLngR: number;
  distanceMiles: number;
  durationSecs: number;
  source: "graphhopper" | "google";
}): Promise<void> {
  // Use upsert so concurrent computes for the same pair don't race into
  // a unique-constraint violation.
  try {
    await prisma.routeCache.upsert({
      where: {
        startLatRounded_startLngRounded_endLatRounded_endLngRounded: {
          startLatRounded: args.startLatR,
          startLngRounded: args.startLngR,
          endLatRounded: args.endLatR,
          endLngRounded: args.endLngR,
        },
      },
      create: {
        startLatRounded: args.startLatR,
        startLngRounded: args.startLngR,
        endLatRounded: args.endLatR,
        endLngRounded: args.endLngR,
        distanceMiles: args.distanceMiles,
        durationSecs: args.durationSecs,
        source: args.source,
      },
      update: {
        // Refresh the value if a newer-source computation came in.
        // GraphHopper wins ties (cheaper, privacy-clean); Google overwrites
        // older GraphHopper values only if a manual op clears the cache.
        distanceMiles: args.distanceMiles,
        durationSecs: args.durationSecs,
        source: args.source,
        computedAt: new Date(),
      },
    });
  } catch {
    // Cache writes are best-effort. The route still resolved — return it.
  }
}

// ── GraphHopper ──────────────────────────────────────────────────────

interface GraphHopperRoute {
  distanceMiles: number;
  durationSecs: number;
}

async function tryGraphHopper(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<GraphHopperRoute | null> {
  const baseUrl = process.env.GRAPHHOPPER_URL;
  if (!baseUrl) return null;

  // GraphHopper's HTTP API:
  //   /route?point=lat,lng&point=lat,lng&profile=car&calc_points=false
  // calc_points=false skips polyline geometry — we only need distance.
  const url =
    `${baseUrl.replace(/\/$/, "")}/route` +
    `?point=${startLat},${startLng}` +
    `&point=${endLat},${endLng}` +
    `&profile=car` +
    `&calc_points=false` +
    `&instructions=false`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const data = await res.json() as {
    paths?: { distance?: number; time?: number }[];
  };
  const path = data.paths?.[0];
  if (!path || typeof path.distance !== "number" || typeof path.time !== "number") {
    return null;
  }
  return {
    distanceMiles: Math.round((path.distance / 1609.344) * 100) / 100,
    durationSecs: Math.round(path.time / 1000),
  };
}

// ── Google Maps Routes API ───────────────────────────────────────────

interface GoogleRoute {
  distanceMiles: number;
  durationSecs: number;
}

async function tryGoogleMaps(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<GoogleRoute | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  // Routes API v2: POST with X-Goog-Api-Key + X-Goog-FieldMask.
  // FieldMask is mandatory and limits the response size (which Google
  // bills against). We only need distance + duration.
  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: startLat, longitude: startLng } } },
        destination: { location: { latLng: { latitude: endLat, longitude: endLng } } },
        travelMode: "DRIVE",
        // Use TRAFFIC_UNAWARE: we want stable distances, not traffic-
        // dependent routes. Mileage tracking is about distance covered,
        // not journey time.
        routingPreference: "TRAFFIC_UNAWARE",
        // Region biases the routing engine to UK road norms.
        regionCode: "GB",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(5000),
    }
  );

  if (!res.ok) return null;

  const data = (await res.json()) as {
    routes?: { distanceMeters?: number; duration?: string }[];
  };
  const route = data.routes?.[0];
  if (!route || typeof route.distanceMeters !== "number") return null;

  // Google returns duration as "123s" (ISO 8601-ish). Strip the trailing
  // letter and parse as integer seconds.
  const durationSecs = parseInt((route.duration ?? "0s").replace(/[^0-9]/g, ""), 10) || 0;

  return {
    distanceMiles: Math.round((route.distanceMeters / 1609.344) * 100) / 100,
    durationSecs,
  };
}
