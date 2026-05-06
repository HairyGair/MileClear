import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { attachIdempotency } from "../../middleware/idempotency.js";
import { prisma } from "../../lib/prisma.js";

const LOCATION_TYPES = ["home", "work", "depot", "custom"] as const;

const FREE_TIER_LIMIT = 2;

const createSavedLocationSchema = z.object({
  name: z.string().min(1).max(100),
  locationType: z.enum(LOCATION_TYPES),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().positive().default(100),
  geofenceEnabled: z.boolean().default(true),
});

const updateSavedLocationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  locationType: z.enum(LOCATION_TYPES).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().positive().optional(),
  geofenceEnabled: z.boolean().optional(),
});

export async function savedLocationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  attachIdempotency(app);

  // List saved locations
  app.get("/", async (request, reply) => {
    const locations = await prisma.savedLocation.findMany({
      where: { userId: request.userId! },
      orderBy: { createdAt: "asc" },
    });

    return reply.send({ data: locations });
  });

  // Get single saved location
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const location = await prisma.savedLocation.findFirst({
      where: { id, userId: request.userId! },
    });
    if (!location) {
      return reply.status(404).send({ error: "Saved location not found" });
    }
    return reply.send({ data: location });
  });

  // Create saved location
  app.post("/", async (request, reply) => {
    const parsed = createSavedLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;

    // Enforce free-tier limit
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPremium: true, premiumExpiresAt: true },
    });

    const isPremiumActive =
      !!user?.isPremium &&
      (!user.premiumExpiresAt || user.premiumExpiresAt > new Date());

    if (!isPremiumActive) {
      const existingCount = await prisma.savedLocation.count({
        where: { userId },
      });

      if (existingCount >= FREE_TIER_LIMIT) {
        return reply.status(403).send({
          error:
            "Free accounts are limited to 2 saved locations. Upgrade to Pro for unlimited.",
        });
      }
    }

    const location = await prisma.savedLocation.create({
      data: { ...parsed.data, userId },
    });

    return reply.status(201).send({ data: location });
  });

  // Update saved location
  app.patch("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsed = updateSavedLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;

    const existing = await prisma.savedLocation.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Saved location not found" });
    }

    const location = await prisma.savedLocation.update({
      where: { id },
      data: parsed.data,
    });

    return reply.send({ data: location });
  });

  // Delete saved location
  app.delete("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = request.userId!;

    const existing = await prisma.savedLocation.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Saved location not found" });
    }

    await prisma.savedLocation.delete({ where: { id } });

    return reply.send({ message: "Saved location deleted" });
  });

  // ── Crowd-sourced recommended radius ──────────────────────────────
  //
  // GET /saved-locations/recommended-radius?type=home
  //
  // Returns the rolled-up p75 recommendation for a given location type,
  // computed weekly from all users' observed first-driving-speed
  // distances. Mobile reads this when creating a saved location and
  // pre-fills the radius slider. Falls back gracefully when there's not
  // enough data (returns null + the static default).
  //
  // Auth-only (no premium gate) — every user benefits, including free.
  app.get("/recommended-radius", async (request, reply) => {
    const schema = z.object({
      type: z.enum(LOCATION_TYPES),
    });
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const recommendation = await prisma.geofenceRadiusRecommendation.findUnique({
      where: { locationType: parsed.data.type },
    });

    if (!recommendation) {
      // No data yet for this type. Mobile falls back to its static default.
      return reply.send({
        data: {
          locationType: parsed.data.type,
          recommendedRadiusMeters: null,
          fallbackRadiusMeters: 200,
          sampleSize: 0,
          note: "Not enough community data yet — using the 200m default.",
        },
      });
    }

    return reply.send({
      data: {
        locationType: parsed.data.type,
        recommendedRadiusMeters: Math.round(recommendation.p75Meters),
        fallbackRadiusMeters: 200,
        sampleSize: recommendation.sampleSize,
        computedAt: recommendation.computedAt.toISOString(),
      },
    });
  });

  // ── Mobile-side observation report ────────────────────────────────
  //
  // POST /saved-locations/observe-radius
  //   { savedLocationId, distanceMeters }
  //
  // Mobile calls this once per geofence-triggered finalised trip,
  // reporting how far from the saved-location pin the first driving-
  // speed coord landed. Server appends to GeofenceRadiusObservation;
  // the weekly cron rolls these up into the percentile recommendation.
  //
  // Auth-only. We don't store anything PII-equivalent — just type and
  // distance. The userId is kept on the row for future per-user dedup
  // / abuse mitigation but never returned in the recommendation API.
  app.post("/observe-radius", async (request, reply) => {
    const schema = z.object({
      savedLocationId: z.string().uuid(),
      distanceMeters: z.number().min(0).max(5000),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const location = await prisma.savedLocation.findFirst({
      where: { id: parsed.data.savedLocationId, userId },
      select: { locationType: true },
    });
    if (!location) {
      return reply.status(404).send({ error: "Saved location not found" });
    }

    await prisma.geofenceRadiusObservation.create({
      data: {
        userId,
        locationType: location.locationType,
        distanceMeters: parsed.data.distanceMeters,
      },
    });

    return reply.send({ data: { recorded: true } });
  });
}
