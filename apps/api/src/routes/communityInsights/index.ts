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

// 5-min cache per geographic grid cell. The /community-insights query was
// observed averaging 15-28 seconds in production (perf.slow_request events)
// because each call runs 5 expensive queries including a JOIN against the
// trip_coordinates table (~100k+ rows per active user). Two users within the
// same ~3.5-mile grid square within 5 minutes of each other should see the
// SAME insights — they're aggregated nearby data, not personal — so caching
// per grid cell yields cache-hit instant responses for the dominant case.
//
// The cache key intentionally excludes userId because the endpoint
// already excludes the requesting user from area-earnings/peak-hours via
// in-service filtering — but that filter changes per requester, so we keep
// userId-scoped variations separate. After re-reading: actually the service
// DOES vary by userId (filters out their own trips). To keep the cache safe
// we key per-user PER-grid: most users only request their own location and
// most of the hot work is shared globally, so we accept the duplicate
// computation across users in exchange for correctness.
const CACHE_TTL_SECONDS = 5 * 60;
const GRID_PRECISION = 0.05; // ~3.5 mi at UK latitudes

function gridKey(lat: number, lng: number, userId: string): string {
  const gridLat = Math.round(lat / GRID_PRECISION) * GRID_PRECISION;
  const gridLng = Math.round(lng / GRID_PRECISION) * GRID_PRECISION;
  return `community-insights:${userId}:${gridLat.toFixed(2)}:${gridLng.toFixed(2)}`;
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
    const cacheLookupKey = gridKey(lat, lng, userId);

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
