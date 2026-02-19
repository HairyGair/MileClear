import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  TRIP_CLASSIFICATIONS,
  PLATFORM_TAGS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@mileclear/shared";
import { haversineDistance } from "@mileclear/shared";

const createTripSchema = z.object({
  shiftId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLat: z.number().min(-90).max(90).optional(),
  endLng: z.number().min(-180).max(180).optional(),
  startAddress: z.string().max(500).optional(),
  endAddress: z.string().max(500).optional(),
  distanceMiles: z.number().nonnegative().optional(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().optional(),
  classification: z.enum(TRIP_CLASSIFICATIONS).default("business"),
  platformTag: z.enum(PLATFORM_TAGS).optional(),
  notes: z.string().max(2000).optional(),
});

const updateTripSchema = z.object({
  classification: z.enum(TRIP_CLASSIFICATIONS).optional(),
  platformTag: z.enum(PLATFORM_TAGS).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  endAddress: z.string().max(500).nullable().optional(),
  endLat: z.number().min(-90).max(90).nullable().optional(),
  endLng: z.number().min(-180).max(180).nullable().optional(),
  endedAt: z.coerce.date().nullable().optional(),
});

const listTripsQuery = z.object({
  classification: z.enum(TRIP_CLASSIFICATIONS).optional(),
  shiftId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export async function tripRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Create trip (manual entry)
  app.post("/", async (request, reply) => {
    const parsed = createTripSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const data = parsed.data;

    // Verify vehicle ownership if provided
    if (data.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: data.vehicleId, userId },
      });
      if (!vehicle) {
        return reply.status(404).send({ error: "Vehicle not found" });
      }
    }

    // Verify shift ownership if provided
    if (data.shiftId) {
      const shift = await prisma.shift.findFirst({
        where: { id: data.shiftId, userId },
      });
      if (!shift) {
        return reply.status(404).send({ error: "Shift not found" });
      }
    }

    // Auto-calculate distance if end coords present and distance not provided
    let distanceMiles = data.distanceMiles ?? 0;
    if (data.endLat != null && data.endLng != null && data.distanceMiles == null) {
      distanceMiles = haversineDistance(data.startLat, data.startLng, data.endLat, data.endLng);
    }

    const trip = await prisma.trip.create({
      data: {
        userId,
        shiftId: data.shiftId ?? null,
        vehicleId: data.vehicleId ?? null,
        startLat: data.startLat,
        startLng: data.startLng,
        endLat: data.endLat ?? null,
        endLng: data.endLng ?? null,
        startAddress: data.startAddress ?? null,
        endAddress: data.endAddress ?? null,
        distanceMiles,
        startedAt: data.startedAt,
        endedAt: data.endedAt ?? null,
        isManualEntry: true,
        classification: data.classification,
        platformTag: data.platformTag ?? null,
        notes: data.notes ?? null,
      },
      include: { vehicle: true, shift: true },
    });

    return reply.status(201).send({ data: trip });
  });

  // List trips with pagination
  app.get("/", async (request, reply) => {
    const parsed = listTripsQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { classification, shiftId, from, to, page, pageSize } = parsed.data;
    const userId = request.userId!;

    const where: Record<string, unknown> = { userId };
    if (classification) where.classification = classification;
    if (shiftId) where.shiftId = shiftId;
    if (from || to) {
      where.startedAt = {
        ...(from && { gte: from }),
        ...(to && { lte: to }),
      };
    }

    const [data, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        orderBy: { startedAt: "desc" },
        include: { vehicle: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.trip.count({ where }),
    ]);

    return reply.send({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // Get single trip
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const trip = await prisma.trip.findFirst({
      where: { id, userId: request.userId! },
      include: {
        vehicle: true,
        shift: true,
        coordinates: { orderBy: { recordedAt: "asc" } },
      },
    });

    if (!trip) {
      return reply.status(404).send({ error: "Trip not found" });
    }

    return reply.send({ data: trip });
  });

  // Update trip
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateTripSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const updates = parsed.data;

    const existing = await prisma.trip.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Trip not found" });
    }

    // Recalculate distance if end coords updated
    let distanceMiles: number | undefined;
    const newEndLat = updates.endLat !== undefined ? updates.endLat : existing.endLat;
    const newEndLng = updates.endLng !== undefined ? updates.endLng : existing.endLng;
    if (
      (updates.endLat !== undefined || updates.endLng !== undefined) &&
      newEndLat != null &&
      newEndLng != null
    ) {
      distanceMiles = haversineDistance(existing.startLat, existing.startLng, newEndLat, newEndLng);
    }

    const trip = await prisma.trip.update({
      where: { id },
      data: {
        ...updates,
        ...(distanceMiles !== undefined && { distanceMiles }),
      },
      include: { vehicle: true, shift: true },
    });

    return reply.send({ data: trip });
  });

  // Delete trip
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;

    const existing = await prisma.trip.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Trip not found" });
    }

    await prisma.trip.delete({ where: { id } });

    return reply.send({ message: "Trip deleted" });
  });
}
