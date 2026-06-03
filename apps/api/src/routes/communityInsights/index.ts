import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { getCommunityInsights } from "../../services/communityInsights.js";
import { getNearbyStations } from "../../services/fuel.js";

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
const STALE_MS = 6 * 60 * 60 * 1000; // serve stale instantly + refresh in background

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

  // Enrich with nearby fuel tip (cheapest unleaded or diesel within 5 miles)
  try {
    const { stations } = await getNearbyStations(lat, lng, 5);
    let cheapest: (typeof stations)[0] | null = null;
    let cheapestPrice = Infinity;
    for (const s of stations) {
      const price = s.prices.E5 ?? s.prices.B7 ?? null;
      if (price != null && price < cheapestPrice) {
        cheapestPrice = price;
        cheapest = s;
      }
    }
    if (cheapest) {
      const price = cheapest.prices.E5 ?? cheapest.prices.B7;
      const fuelType = cheapest.prices.E5 ? "unleaded" : "diesel";
      if (price != null) {
        insights.fuelTipNearby = `${cheapest.brand ?? cheapest.stationName}: ${price.toFixed(1)}p/L ${fuelType}`;
      }
    }
  } catch {
    // Fuel data optional
  }

  return { data: insights };
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
      return reply.send(entry.payload);
    }

    // Stale but usable — serve instantly, refresh in the background (deduped).
    if (entry && age < STALE_MS) {
      refresh(key, lat, lng, userId).catch((err) =>
        request.log.error(err, "community insights background refresh failed")
      );
      return reply.send(entry.payload);
    }

    // Cold — compute once (single-flight), shared by all concurrent callers.
    try {
      const payload = await refresh(key, lat, lng, userId);
      return reply.send(payload);
    } catch (err) {
      request.log.error(err, "Failed to fetch community insights");
      return reply.status(500).send({ error: "Failed to fetch community insights" });
    }
  });
}
