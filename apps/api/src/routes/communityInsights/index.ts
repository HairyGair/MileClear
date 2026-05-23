import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { getCommunityInsights } from "../../services/communityInsights.js";
import { getNearbyStations } from "../../services/fuel.js";
import { cacheGet, cacheSet } from "../../lib/redis.js";

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
const CACHE_TTL_SECONDS = 5 * 60;
const GRID_PRECISION = 0.05; // ~3.5 mi at UK latitudes

function gridKey(lat: number, lng: number): string {
  const gridLat = Math.round(lat / GRID_PRECISION) * GRID_PRECISION;
  const gridLng = Math.round(lng / GRID_PRECISION) * GRID_PRECISION;
  return `community-insights:${gridLat.toFixed(2)}:${gridLng.toFixed(2)}`;
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
    const cacheLookupKey = gridKey(lat, lng);

    // Cache hit fast path - return stored response payload directly.
    try {
      const cached = await cacheGet(cacheLookupKey);
      if (cached) {
        const parsedCache = JSON.parse(cached);
        return reply.send(parsedCache);
      }
    } catch {
      // Cache read failure shouldn't block the request - fall through to
      // fresh computation.
    }

    try {
      const insights = await getCommunityInsights(lat, lng, userId);

      // Enrich with nearby fuel tip (cheapest unleaded or diesel within 5 miles)
      try {
        const { stations } = await getNearbyStations(lat, lng, 5);
        // Find cheapest by E5 (unleaded) price
        let cheapest: typeof stations[0] | null = null;
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

      const payload = { data: insights };

      // Best-effort cache write - never block the response on cache failure.
      cacheSet(cacheLookupKey, JSON.stringify(payload), CACHE_TTL_SECONDS).catch(() => {});

      return reply.send(payload);
    } catch (err) {
      request.log.error(err, "Failed to fetch community insights");
      return reply.status(500).send({ error: "Failed to fetch community insights" });
    }
  });
}
