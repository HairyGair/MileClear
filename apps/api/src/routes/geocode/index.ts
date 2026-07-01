import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { searchGeocode, placesAutocomplete, placeDetails } from "../../services/geocoding.js";

export async function geocodeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // GET /geocode/autocomplete?q=&session=&lat=&lng= — Google Places
  // type-ahead predictions (primary search path). Returns [] if the Google
  // key is absent / errors so the client falls back to /geocode/search.
  app.get("/autocomplete", async (request, reply) => {
    const { q, session, lat, lng } = z
      .object({
        q: z.string().min(2).max(200),
        session: z.string().min(1).max(80),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
      })
      .parse(request.query);

    const near = lat != null && lng != null ? { lat, lng } : undefined;
    const predictions = await placesAutocomplete(q, session, near);
    return reply.send({ data: predictions });
  });

  // GET /geocode/place?placeId=&session= — resolve a picked prediction to
  // coordinates + address (closes the billing session).
  app.get("/place", async (request, reply) => {
    const { placeId, session } = z
      .object({ placeId: z.string().min(1).max(400), session: z.string().min(1).max(80) })
      .parse(request.query);

    const result = await placeDetails(placeId, session);
    if (!result) return reply.status(404).send({ error: "Place not found" });
    return reply.send({ data: result });
  });

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
