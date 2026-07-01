import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { searchGeocode } from "../../services/geocoding.js";

export async function geocodeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // GET /geocode/search?q=... — UK-biased forward geocoding for free-text
  // place / POI queries. Returns [] on any provider failure so the client
  // can fall back to its on-device geocoder.
  app.get("/search", async (request, reply) => {
    const { q, limit } = z
      .object({
        q: z.string().min(2).max(200),
        limit: z.coerce.number().int().min(1).max(10).default(6),
      })
      .parse(request.query);

    const results = await searchGeocode(q, limit);
    return reply.send({ data: results });
  });
}
