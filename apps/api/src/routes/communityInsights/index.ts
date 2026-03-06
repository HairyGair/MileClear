import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { getCommunityInsights } from "../../services/communityInsights.js";
import { getNearbyStations } from "../../services/fuel.js";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

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

    try {
      const insights = await getCommunityInsights(lat, lng, request.userId!);

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
            insights.fuelTipNearby = `${cheapest.brand ?? cheapest.stationName}: ${(price / 10).toFixed(1)}p/L ${fuelType}`;
          }
        }
      } catch {
        // Fuel data optional
      }

      return reply.send({ data: insights });
    } catch (err) {
      request.log.error(err, "Failed to fetch community insights");
      return reply.status(500).send({ error: "Failed to fetch community insights" });
    }
  });
}
