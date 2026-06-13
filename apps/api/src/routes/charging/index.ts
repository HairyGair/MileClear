import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.js";
import { getNearbyChargers, getElectricityRate } from "../../services/evCharging.js";

// EV charging routes — the electric analogue of /fuel.
export async function chargingRoutes(app: FastifyInstance) {
  const nearbyQuery = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radiusMiles: z.coerce.number().positive().max(50).default(5),
  });

  // GET /charging/nearby — public, mirrors /fuel/prices. Open Charge Map.
  app.get("/nearby", async (request, reply) => {
    const parsed = nearbyQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { lat, lng, radiusMiles } = parsed.data;
    const { chargers, attribution } = await getNearbyChargers(lat, lng, radiusMiles);
    return reply.send({ chargers, attribution, lastUpdated: new Date().toISOString() });
  });

  // GET /charging/electricity-rate — the EFFECTIVE home p/kWh: the user's own
  // stored rate if set, otherwise a current suggestion (Octopus Agile average,
  // default fallback). Optionally authed so it can read the user override.
  app.get("/electricity-rate", { preHandler: optionalAuthMiddleware }, async (request, reply) => {
    if (request.userId) {
      const { prisma } = await import("../../lib/prisma.js");
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { electricityPencePerKwh: true },
      });
      if (user?.electricityPencePerKwh != null) {
        return reply.send({
          data: {
            pencePerKwh: user.electricityPencePerKwh,
            source: "user",
            region: null,
            asOf: new Date().toISOString(),
          },
        });
      }
    }
    const rate = await getElectricityRate();
    return reply.send({ data: rate });
  });

  // PATCH /charging/electricity-rate — store the user's own home rate (p/kWh,
  // or null to fall back to the suggestion).
  app.register(async (authApp) => {
    authApp.addHook("preHandler", authMiddleware);
    const bodySchema = z.object({
      pencePerKwh: z.number().positive().max(200).nullable(),
    });
    authApp.patch("/electricity-rate", async (request, reply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const { prisma } = await import("../../lib/prisma.js");
      await prisma.user.update({
        where: { id: request.userId! },
        data: { electricityPencePerKwh: parsed.data.pencePerKwh },
      });
      return reply.send({ data: { pencePerKwh: parsed.data.pencePerKwh } });
    });
  });
}
