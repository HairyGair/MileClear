import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { FUEL_TYPES, VEHICLE_TYPES } from "@mileclear/shared";

const createVehicleSchema = z.object({
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.number().int().min(1900).max(2100).optional(),
  fuelType: z.enum(FUEL_TYPES),
  vehicleType: z.enum(VEHICLE_TYPES),
  estimatedMpg: z.number().positive().optional(),
  isPrimary: z.boolean().default(true),
});

const updateVehicleSchema = z.object({
  make: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  estimatedMpg: z.number().positive().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

export async function vehicleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Create vehicle
  app.post("/", async (request, reply) => {
    const parsed = createVehicleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const data = parsed.data;

    // If setting as primary, unset existing primary
    if (data.isPrimary) {
      await prisma.vehicle.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const vehicle = await prisma.vehicle.create({
      data: { ...data, userId },
    });

    return reply.status(201).send({ data: vehicle });
  });

  // List user vehicles
  app.get("/", async (request, reply) => {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: request.userId! },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });

    return reply.send({ data: vehicles });
  });

  // Update vehicle
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateVehicleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const data = parsed.data;

    const existing = await prisma.vehicle.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Vehicle not found" });
    }

    // If setting as primary, unset existing primary
    if (data.isPrimary) {
      await prisma.vehicle.updateMany({
        where: { userId, isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      });
    }

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data,
    });

    return reply.send({ data: vehicle });
  });

  // Delete vehicle
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.userId!;

    const existing = await prisma.vehicle.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Vehicle not found" });
    }

    await prisma.vehicle.delete({ where: { id } });

    return reply.send({ message: "Vehicle deleted" });
  });

  // DVLA lookup — post-MVP
  app.get("/lookup", async (_request, reply) => {
    return reply.status(501).send({ error: "Not implemented" });
  });
}
