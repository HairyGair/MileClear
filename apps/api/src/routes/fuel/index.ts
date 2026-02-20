import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@mileclear/shared";

const createFuelLogSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  litres: z.number().positive("Litres must be positive"),
  costPence: z.number().int().positive("Cost must be positive"),
  stationName: z.string().min(1).optional(),
  odometerReading: z.number().positive().optional(),
  loggedAt: z.coerce.date().default(() => new Date()),
});

const updateFuelLogSchema = z.object({
  vehicleId: z.string().uuid().nullable().optional(),
  litres: z.number().positive().optional(),
  costPence: z.number().int().positive().optional(),
  stationName: z.string().min(1).nullable().optional(),
  odometerReading: z.number().positive().nullable().optional(),
  loggedAt: z.coerce.date().optional(),
});

const listFuelLogsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export async function fuelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Create fuel log
  app.post("/logs", async (request, reply) => {
    const parsed = createFuelLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { vehicleId, litres, costPence, stationName, odometerReading, loggedAt } = parsed.data;
    const userId = request.userId!;

    // Verify vehicle ownership if provided
    if (vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, userId },
      });
      if (!vehicle) {
        return reply.status(404).send({ error: "Vehicle not found" });
      }
    }

    const fuelLog = await prisma.fuelLog.create({
      data: {
        userId,
        vehicleId: vehicleId ?? null,
        litres,
        costPence,
        stationName: stationName ?? null,
        odometerReading: odometerReading ?? null,
        loggedAt,
      },
      include: {
        vehicle: vehicleId
          ? { select: { id: true, make: true, model: true, fuelType: true } }
          : false,
      },
    });

    return reply.status(201).send({ data: fuelLog });
  });

  // List fuel logs with pagination
  app.get("/logs", async (request, reply) => {
    const parsed = listFuelLogsQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { from, to, page, pageSize } = parsed.data;
    const userId = request.userId!;

    const where: Record<string, unknown> = { userId };
    if (from || to) {
      const loggedAtFilter: Record<string, Date> = {};
      if (from) loggedAtFilter.gte = from;
      if (to) loggedAtFilter.lte = to;
      where.loggedAt = loggedAtFilter;
    }

    const [data, total] = await Promise.all([
      prisma.fuelLog.findMany({
        where,
        orderBy: { loggedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          vehicle: { select: { id: true, make: true, model: true, fuelType: true } },
        },
      }),
      prisma.fuelLog.count({ where }),
    ]);

    return reply.send({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // Update fuel log
  app.patch("/logs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateFuelLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const updates = parsed.data;

    const existing = await prisma.fuelLog.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Fuel log not found" });
    }

    // Verify vehicle ownership if changing vehicle
    if (updates.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: updates.vehicleId, userId },
      });
      if (!vehicle) {
        return reply.status(404).send({ error: "Vehicle not found" });
      }
    }

    const fuelLog = await prisma.fuelLog.update({
      where: { id },
      data: updates,
      include: {
        vehicle: { select: { id: true, make: true, model: true, fuelType: true } },
      },
    });

    return reply.send({ data: fuelLog });
  });

  // Delete fuel log
  app.delete("/logs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;

    const existing = await prisma.fuelLog.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Fuel log not found" });
    }

    await prisma.fuelLog.delete({ where: { id } });

    return reply.send({ message: "Fuel log deleted" });
  });

  // Fuel prices — deferred (requires third-party API)
  app.get("/prices", async (request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
