import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

const LOCATION_TYPES = ["home", "work", "depot", "custom"] as const;

const FREE_TIER_LIMIT = 2;

const createSavedLocationSchema = z.object({
  name: z.string().min(1).max(100),
  locationType: z.enum(LOCATION_TYPES),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().positive().default(150),
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
}
