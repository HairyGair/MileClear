import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { cacheGet, cacheSet } from "../../lib/redis.js";
import { FUEL_TYPES, VEHICLE_TYPES } from "@mileclear/shared";
import type { FuelType, VehicleLookupResult } from "@mileclear/shared";
import { fetchMotHistory, DvsaMotError } from "../../services/dvsaMot.js";

const regPlateField = z
  .string()
  .min(2)
  .max(10)
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .optional();

const createVehicleSchema = z.object({
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.number().int().min(1900).max(2100).optional(),
  fuelType: z.enum(FUEL_TYPES),
  vehicleType: z.enum(VEHICLE_TYPES),
  registrationPlate: regPlateField,
  bluetoothName: z.string().max(100).optional(),
  estimatedMpg: z.number().positive().optional(),
  isPrimary: z.boolean().default(true),
});

const updateVehicleSchema = z.object({
  make: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  registrationPlate: z
    .string()
    .max(10)
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .nullable()
    .optional(),
  bluetoothName: z.string().max(100).nullable().optional(),
  estimatedMpg: z.number().positive().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

const lookupSchema = z.object({
  registrationNumber: z
    .string()
    .min(2)
    .max(10)
    .transform((v) => v.replace(/\s+/g, "").toUpperCase()),
});

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapDvlaFuelType(dvlaFuel: string | undefined): FuelType {
  if (!dvlaFuel) return "petrol";
  const upper = dvlaFuel.toUpperCase();
  if (upper === "PETROL") return "petrol";
  if (upper === "DIESEL") return "diesel";
  if (upper === "ELECTRICITY" || upper === "ELECTRIC") return "electric";
  if (
    upper.includes("HYBRID") ||
    upper.includes("PETROL/ELECTRIC") ||
    upper.includes("DIESEL/ELECTRIC")
  )
    return "hybrid";
  return "petrol";
}

const DVLA_CACHE_TTL = 86400; // 24 hours

export async function vehicleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // DVLA reg plate lookup
  app.post("/lookup", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const parsed = lookupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { registrationNumber } = parsed.data;
    const apiKey = process.env.DVLA_API_KEY;

    if (!apiKey) {
      return reply
        .status(503)
        .send({ error: "Vehicle lookup is not configured" });
    }

    // Check cache
    const cacheKey = `dvla:${registrationNumber}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return reply.send({ data: JSON.parse(cached) });
    }

    // Call DVLA VES API
    try {
      const response = await fetch(
        "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
        {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ registrationNumber }),
        }
      );

      if (response.status === 404) {
        return reply
          .status(404)
          .send({ error: "Vehicle not found. Double-check the registration plate and try again." });
      }

      if (response.status === 403) {
        app.log.error("DVLA API returned 403 — key may be invalid");
        return reply
          .status(502)
          .send({ error: "DVLA authentication failed. Please contact support." });
      }

      if (!response.ok) {
        app.log.error(
          `DVLA API error: ${response.status} ${response.statusText}`
        );
        return reply
          .status(502)
          .send({ error: "DVLA service error. Please try again later." });
      }

      const dvla = (await response.json()) as Record<string, unknown>;

      const result: VehicleLookupResult = {
        registrationNumber,
        make: titleCase(String(dvla.make || "")),
        yearOfManufacture:
          typeof dvla.yearOfManufacture === "number"
            ? dvla.yearOfManufacture
            : null,
        fuelType: mapDvlaFuelType(dvla.fuelType as string | undefined),
        colour: dvla.colour ? titleCase(String(dvla.colour)) : null,
        engineCapacity:
          typeof dvla.engineCapacity === "number" ? dvla.engineCapacity : null,
        co2Emissions:
          typeof dvla.co2Emissions === "number" ? dvla.co2Emissions : null,
        taxStatus: dvla.taxStatus ? String(dvla.taxStatus) : null,
        motStatus: dvla.motStatus ? String(dvla.motStatus) : null,
        motExpiryDate: dvla.motExpiryDate ? String(dvla.motExpiryDate) : null,
        taxDueDate: dvla.taxDueDate ? String(dvla.taxDueDate) : null,
      };

      // Cache for 24h
      await cacheSet(cacheKey, JSON.stringify(result), DVLA_CACHE_TTL);

      return reply.send({ data: result });
    } catch (err) {
      app.log.error(err, "DVLA lookup failed");
      return reply
        .status(502)
        .send({ error: "DVLA service error. Please try again later." });
    }
  });

  // Create vehicle
  app.post("/", async (request, reply) => {
    const parsed = createVehicleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const data = parsed.data;

    // Free users limited to 1 vehicle
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPremium: true, premiumExpiresAt: true },
    });
    const isPremium = user?.isPremium && (!user.premiumExpiresAt || user.premiumExpiresAt > new Date());
    if (!isPremium) {
      const count = await prisma.vehicle.count({ where: { userId } });
      if (count >= 1) {
        return reply.status(403).send({ error: "Free accounts can have 1 vehicle. Upgrade to Pro for unlimited vehicles." });
      }
    }

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
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
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
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = request.userId!;

    const existing = await prisma.vehicle.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Vehicle not found" });
    }

    // Unlink vehicle from related records before deleting
    await prisma.$transaction([
      prisma.shift.updateMany({ where: { vehicleId: id }, data: { vehicleId: null } }),
      prisma.trip.updateMany({ where: { vehicleId: id }, data: { vehicleId: null } }),
      prisma.fuelLog.updateMany({ where: { vehicleId: id }, data: { vehicleId: null } }),
      prisma.vehicle.delete({ where: { id } }),
    ]);

    return reply.send({ message: "Vehicle deleted" });
  });

  // MOT history from DVSA. Cached for 24h per registration plate via the
  // in-memory redis-equivalent cache - test history rarely changes.
  app.get(
    "/:id/mot-history",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const userId = request.userId!;

      const vehicle = await prisma.vehicle.findFirst({
        where: { id, userId },
        select: { registrationPlate: true },
      });
      if (!vehicle) {
        return reply.status(404).send({ error: "Vehicle not found" });
      }
      if (!vehicle.registrationPlate) {
        return reply
          .status(400)
          .send({ error: "Add a registration plate to fetch MOT history" });
      }

      const cacheKey = `mot:history:${vehicle.registrationPlate}`;
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return reply.send({ data: JSON.parse(cached) });
      }

      try {
        const history = await fetchMotHistory(vehicle.registrationPlate);
        if (!history) {
          return reply.send({ data: null }); // brand new car / no test record
        }
        await cacheSet(cacheKey, JSON.stringify(history), 24 * 60 * 60);
        return reply.send({ data: history });
      } catch (err) {
        if (err instanceof DvsaMotError && err.status === 503) {
          return reply.status(503).send({ error: "MOT history is not configured" });
        }
        app.log.error({ err }, "MOT history fetch failed");
        return reply
          .status(502)
          .send({ error: "Could not fetch MOT history right now. Please try again." });
      }
    }
  );
}
