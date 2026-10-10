import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { getCommunityInsights, getLastKnownGlobalStats } from "../../services/communityInsights.js";
import { getNearbyStations } from "../../services/fuel.js";
import {
  BASE_RADIUS_MILES,
  fuelPathForVehicle,
  pickPrimaryVehicle,
  tripFuelTip,
} from "../../services/cheapestFuelRule.js";
import { prisma } from "../../lib/prisma.js";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

// 5-min cache per geographic grid cell, NOT per user. The /community-insights
// query was observed averaging 7-28 seconds in production (450 slow_request
// events across 14 days) because each call runs 5 expensive queries including
// a JOIN against trip_coordinates (~100k+ rows per active user).
//
// Earlier the key included userId for "correctness" because the service
// filters out the requester's own trips from area-earnings/peak-hours. In
// practice that key was almost never reused (each user is a 1-of-1 cohort
// for their own location) so the cache effectively never hit. Two drivers
// in the same city centre paid the full query cost separately.
//
// Switched to grid-only keying. The privacy floor (MIN_DRIVERS_THRESHOLD = 5)
// already prevents anyone being identified inside an aggregate, so the
// requester appearing as 1/N of their local cohort introduces no privacy
// concern and at most a ~20% noise on per-platform numbers in cells where
// they're a top contributor — well inside the "directional, not precise"
// promise the card makes anyway.
const GRID_PRECISION = 0.05; // ~3.5 mi at UK latitudes
const FRESH_MS = 15 * 60 * 1000; // serve cached payload without refreshing
// Hard ceiling on how long a caller will EVER block on a cold (never-seen)
// grid cell. The per-query MAX_EXECUTION_TIME caps query *execution*, but not
// the time a request spends waiting for a DB connection when the pool is
// saturated during peak driving hours — that queueing is what produced the
// 85s tail (1,800+ slow 200s/day). Past this deadline we return a valid
// minimal payload and let the compute finish in the background to warm the
// cache, so the next caller for that cell gets the full data instantly.
const COLD_WAIT_MS = 4000;

function gridKey(lat: number, lng: number): string {
  const gridLat = Math.round(lat / GRID_PRECISION) * GRID_PRECISION;
  const gridLng = Math.round(lng / GRID_PRECISION) * GRID_PRECISION;
  return `community-insights:${gridLat.toFixed(2)}:${gridLng.toFixed(2)}`;
}

// Process-local stale-while-revalidate cache + single-flight. The underlying
// query is expensive (a JOIN against trip_coordinates that has hit 85s in
// prod). Single-flight stops a cold cache from firing N identical heavy
// queries at once — the thundering herd that exhausted the DB pool and stalled
// the whole API (the "app won't load" incident). Stale-while-revalidate means
// users get an instant response off the last good payload while a fresh one
// computes in the background, so only the very first request for a grid cell
// ever waits, and even that is capped by MAX_EXECUTION_TIME in the service.
type CacheEntry = { payload: unknown; computedAt: number };
const insightsCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

async function computePayload(lat: number, lng: number, userId: string): Promise<unknown> {
  const insights = await getCommunityInsights(lat, lng, userId);
  return { data: insights };
}

// The fuel tip depends on the driver's vehicle, so it is added per request on
// top of the shared grid payload rather than cached with it. Station prices
// are already cached in memory by the fuel service.
async function withFuelTip(payload: unknown, lat: number, lng: number, userId: string): Promise<unknown> {
  const p = payload as { data?: Record<string, unknown> } | null;
  if (!p?.data) return payload;
  let fuelTipNearby: string | null = null;
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId },
      select: { fuelType: true, isPrimary: true, createdAt: true },
    });
    const v = pickPrimaryVehicle(vehicles);
    const path = v ? fuelPathForVehicle(v.fuelType) : null;
    if (path?.path === "fuel") {
      const { stations } = await getNearbyStations(lat, lng, BASE_RADIUS_MILES);
      fuelTipNearby = tripFuelTip(stations, path);
    }
  } catch {
    // Fuel data optional
  }
  return { ...p, data: { ...p.data, fuelTipNearby } };
}

function refresh(key: string, lat: number, lng: number, userId: string): Promise<unknown> {
  const existing = inflight.get(key);
  if (existing) return existing; // single-flight: join the in-progress compute
  const p = computePayload(lat, lng, userId)
    .then((payload) => {
      insightsCache.set(key, { payload, computedAt: Date.now() });
      return payload;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

// Valid payload for a cold cell whose compute overran COLD_WAIT_MS. Real
// headline stats (separately cached, cheap) + empty local aggregates — the
// same shape sparse areas already return, so the client renders it fine. The
// background compute keeps running and warms the cache for the next request.
function coldFallbackPayload(): unknown {
  const g = getLastKnownGlobalStats();
  return {
    data: {
      stats: {
        totalDrivers: g?.totalDrivers ?? 0,
        totalMilesTracked: g?.totalMilesTracked ?? 0,
        totalTripsLogged: g?.totalTripsLogged ?? 0,
        totalTaxSavedPence: g?.totalTaxSavedPence ?? 0,
        driversNearby: 0,
      },
      areaEarnings: [],
      peakHours: [],
      nearbyAnomalies: [],
      routeSpeeds: [],
      bestPlatformNearby: null,
      bestTimeNearby: null,
      fuelTipNearby: null,
    },
  };
}

export async function communityInsightRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // GET /community-insights?lat=54.9&lng=-1.38
  app.get("/", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "lat and lng query parameters are required",
      });
    }

    const { lat, lng } = parsed.data;
    const userId = request.userId!;
    const key = gridKey(lat, lng);

    const entry = insightsCache.get(key);
    const age = entry ? Date.now() - entry.computedAt : Infinity;

    // Fresh — serve immediately.
    if (entry && age < FRESH_MS) {
      return reply.send(await withFuelTip(entry.payload, lat, lng, userId));
    }

    // Any cached payload (however old) — serve instantly and refresh in the
    // background (deduped via single-flight). Serving a directional aggregate
    // that's a few hours old always beats blocking the caller, and the card
    // is explicitly "directional, not precise".
    if (entry) {
      refresh(key, lat, lng, userId).catch((err) =>
        request.log.error(err, "community insights background refresh failed")
      );
      return reply.send(await withFuelTip(entry.payload, lat, lng, userId));
    }

    // Truly cold (never computed in this process). Kick off the compute but
    // never block the caller longer than COLD_WAIT_MS — under peak DB-pool
    // contention this compute can queue for tens of seconds, so we cap the
    // wait and return a valid minimal payload, letting it warm the cache.
    const DEGRADED = Symbol("degraded");
    // Already logged inside refresh()'s caller chain; resolve (never reject)
    // so the race below always yields a value we can send.
    const safeCompute = refresh(key, lat, lng, userId).then(
      (payload) => payload,
      (err) => {
        request.log.error(err, "community insights cold compute failed");
        return DEGRADED;
      }
    );

    let timer: NodeJS.Timeout | undefined;
    const result = await Promise.race([
      safeCompute,
      new Promise<typeof DEGRADED>((resolve) => {
        timer = setTimeout(() => resolve(DEGRADED), COLD_WAIT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);

    // Timed out or errored — return a valid minimal payload; the background
    // compute (still tracked in `inflight`) will warm the cache for next time.
    if (result === DEGRADED) {
      return reply.send(await withFuelTip(coldFallbackPayload(), lat, lng, userId));
    }
    return reply.send(await withFuelTip(result, lat, lng, userId));
  });
}
