import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { attachSoleVehicleToOrphanTrips } from "../../services/vehicleDefaults.js";
import { isProUser } from "../../services/proEntitlement.js";
import { upsertMileageSummary } from "../../services/mileage.js";
import { cacheGet, cacheSet } from "../../lib/redis.js";
import { FUEL_TYPES, VEHICLE_TYPES, assessCleanAirZones, getTaxYear } from "@mileclear/shared";
import type { FuelType, VehicleLookupResult, CazVehicleClass } from "@mileclear/shared";
import { fetchMotHistory, DvsaMotError } from "../../services/dvsaMot.js";
import { loadOdometerInputs, vehicleOdometerSummaries } from "../../services/odometer.js";
import { buildOdometerTimeline, odometerStateAt, ODOMETER_MAX_MILES } from "@mileclear/shared";
import type { OdometerReadingCreated, VehicleOdometerResponse } from "@mileclear/shared";

function freeVehicleLimitMessage(providedByOthers: boolean): string {
  return providedByOthers
    ? "Free accounts can have 1 vehicle that someone else pays for. Upgrade to Pro for unlimited vehicles."
    : "Free accounts can have 1 vehicle. Upgrade to Pro for unlimited vehicles.";
}

async function recomputeSummariesForVehicle(userId: string, vehicleId: string): Promise<void> {
  const span = await prisma.trip.aggregate({
    where: { userId, vehicleId },
    _min: { startedAt: true },
    _max: { startedAt: true },
  });
  if (!span._min.startedAt || !span._max.startedAt) return;
  const first = getTaxYear(span._min.startedAt);
  const last = getTaxYear(span._max.startedAt);
  const years: string[] = [];
  for (let y = Number(first.slice(0, 4)); y <= Number(last.slice(0, 4)); y++) {
    years.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  for (const taxYear of years) await upsertMileageSummary(userId, taxYear);
}

// Map our stored vehicleType to the CAZ engine's vehicle class (it only
// distinguishes car / van / motorcycle for charge + standard purposes).
function toCazVehicleClass(vehicleType: string): CazVehicleClass {
  const t = vehicleType.toLowerCase();
  if (t.includes("van") || t.includes("lgv") || t.includes("truck")) return "van";
  if (t.includes("motor") || t.includes("bike")) return "motorcycle";
  return "car";
}

// Attach the computed Clean Air Zone / ULEZ assessment to a vehicle row, so
// every vehicle response carries compliance without the client re-deriving it.
function withCleanAirZones<T extends { fuelType: string; vehicleType: string; euroStatus?: string | null; firstRegistration?: string | null }>(
  vehicle: T
) {
  return {
    ...vehicle,
    cleanAirZones: assessCleanAirZones({
      euroStatus: vehicle.euroStatus,
      fuelType: vehicle.fuelType,
      firstRegistration: vehicle.firstRegistration,
      vehicleClass: toCazVehicleClass(vehicle.vehicleType),
    }),
  };
}

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
  milesPerKwh: z.number().positive().max(20).optional(),
  isPrimary: z.boolean().default(true),
  providedByOthers: z.boolean().default(false),
  // DVLA emissions data, passed straight from the lookup result so Clean Air
  // Zone compliance can be shown without a second DVLA call.
  euroStatus: z.string().max(20).optional(),
  firstRegistration: z.string().max(7).optional(),
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
  milesPerKwh: z.number().positive().max(20).nullable().optional(),
  isPrimary: z.boolean().optional(),
  providedByOthers: z.boolean().optional(),
  euroStatus: z.string().max(20).nullable().optional(),
  firstRegistration: z.string().max(7).nullable().optional(),
});

// Allow a phone clock this far ahead before "Now" counts as the future.
const ODOMETER_CLOCK_SKEW_MS = 2 * 60 * 1000;
const ODOMETER_BAD_READING = "That doesn't look like an odometer reading. Check it and try again.";

const createOdometerReadingSchema = z.object({
  readingMiles: z
    .number({ invalid_type_error: ODOMETER_BAD_READING, required_error: "Type the reading from your dashboard." })
    .gt(0, ODOMETER_BAD_READING)
    .max(ODOMETER_MAX_MILES, ODOMETER_BAD_READING),
  readAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "That time doesn't look right.")
    .optional(),
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
        euroStatus: dvla.euroStatus ? String(dvla.euroStatus) : null,
        firstRegistration: dvla.monthOfFirstRegistration
          ? String(dvla.monthOfFirstRegistration)
          : null,
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

    // Free users limited to 1 vehicle of their own plus 1 that someone else
    // pays for (a client's van). Pro from any source (subscription, referral
    // credit or an entitled team) lifts the cap.
    const isPremium = await isProUser(userId);
    if (!isPremium) {
      const count = await prisma.vehicle.count({
        where: { userId, providedByOthers: data.providedByOthers },
      });
      if (count >= 1) {
        return reply.status(403).send({ error: freeVehicleLimitMessage(data.providedByOthers) });
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

    // First vehicle: the trips recorded before it was added belong to it,
    // and the tax figure must follow (a motorbike is 24p, not 55p).
    // Not when it's someone else's van: that would take those trips out of
    // the claim.
    const attached = vehicle.providedByOthers ? 0 : await attachSoleVehicleToOrphanTrips(userId);
    if (attached > 0) {
      await upsertMileageSummary(userId, getTaxYear(new Date())).catch(() => {});
    }

    return reply.status(201).send({ data: withCleanAirZones(vehicle) });
  });

  // List user vehicles
  app.get("/", async (request, reply) => {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: request.userId! },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });

    // The running odometer for the list card. Never worth failing the list for.
    let odometer = new Map<string, { miles: number; isEstimated: boolean } | null>();
    try {
      odometer = await vehicleOdometerSummaries(request.userId!, vehicles.map((v) => v.id));
    } catch (err) {
      app.log.warn(err, "vehicle odometer summary failed");
    }

    return reply.send({
      data: vehicles.map((v) => ({ ...withCleanAirZones(v), odometer: odometer.get(v.id) ?? null })),
    });
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

    const providedChanged =
      data.providedByOthers !== undefined && data.providedByOthers !== existing.providedByOthers;

    // Switching sides must not get round the free cap (1 own + 1 provided).
    if (providedChanged && !(await isProUser(userId))) {
      const count = await prisma.vehicle.count({
        where: { userId, providedByOthers: data.providedByOthers, id: { not: id } },
      });
      if (count >= 1) {
        return reply.status(403).send({ error: freeVehicleLimitMessage(data.providedByOthers!) });
      }
    }

    // If setting as primary, unset existing primary
    if (data.isPrimary) {
      await prisma.vehicle.updateMany({
        where: { userId, isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      });
    }

    // A new plate is a different lookup: drop the old plate's DVLA dates and
    // any "check your plate" warning, and let the next reminders run (every
    // 6 h) look the new one up.
    const plateChanged =
      data.registrationPlate !== undefined &&
      (data.registrationPlate || null) !== (existing.registrationPlate || null);

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: plateChanged
        ? {
            ...data,
            lastDvlaCheckAt: null,
            motExpiryDate: null,
            taxDueDate: null,
            motReminderSentAt: null,
            taxReminderSentAt: null,
            dvlaPlateProblem: null,
            dvlaPlateSuggestion: null,
          }
        : data,
    });

    // The claim for every tax year this vehicle drove in has just changed.
    if (providedChanged) {
      await recomputeSummariesForVehicle(userId, id).catch(() => {});
    }

    return reply.send({ data: withCleanAirZones(vehicle) });
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

  // ── Running odometer (9 Oct 2026) ────────────────────────────────

  // The running figure and every real reading for a vehicle (newest first).
  app.get("/:id/odometer", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = request.userId!;

    const vehicle = await prisma.vehicle.findFirst({ where: { id, userId }, select: { id: true } });
    if (!vehicle) {
      return reply.status(404).send({ error: "Vehicle not found" });
    }

    const inputs = (await loadOdometerInputs(userId, [id])).get(id)!;
    const timeline = buildOdometerTimeline(inputs);
    const data: VehicleOdometerResponse = { current: timeline.current, readings: timeline.readings };
    return reply.send({ data });
  });

  // Record a reading from the dashboard.
  app.post("/:id/odometer-readings", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsed = createOdometerReadingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const vehicle = await prisma.vehicle.findFirst({
      where: { id, userId },
      select: { id: true, createdAt: true },
    });
    if (!vehicle) {
      return reply.status(404).send({ error: "Vehicle not found" });
    }

    const now = Date.now();
    const requested = parsed.data.readAt ? new Date(parsed.data.readAt).getTime() : now;
    // A phone clock a few seconds ahead must not turn "Now" into an error.
    if (requested > now + ODOMETER_CLOCK_SKEW_MS) {
      return reply.status(400).send({ error: "That time hasn't happened yet." });
    }
    const readAtMs = Math.min(requested, now);
    if (readAtMs < vehicle.createdAt.getTime() - 365 * 86400000) {
      return reply.status(400).send({ error: "That date is too far back for this vehicle." });
    }
    const readAt = new Date(readAtMs);
    const readingMiles = Math.round(parsed.data.readingMiles * 10) / 10;

    const inputs = (await loadOdometerInputs(userId, [id])).get(id)!;
    const before = odometerStateAt(buildOdometerTimeline(inputs), readAt);

    // Odometers don't go backwards. Whether a reading is a typo is a question
    // for the driver (the app asks); this one is a fact.
    if (before.latestReading && readingMiles < before.latestReading.readingMiles) {
      return reply.status(409).send({
        code: "LOWER_THAN_EARLIER",
        error: "That's lower than an earlier reading",
        earlier: before.latestReading,
      });
    }

    // A backdated reading must not sit higher than a typed reading taken later.
    const timeline = buildOdometerTimeline(inputs);
    const later = timeline.readings
      .filter(
        (r) =>
          r.used &&
          r.source === "user" &&
          new Date(r.readAt).getTime() > readAt.getTime() &&
          r.readingMiles < readingMiles
      )
      .sort((a, b) => a.readAt.localeCompare(b.readAt))[0];
    if (later) {
      const when = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(later.readAt));
      return reply.status(409).send({
        code: "HIGHER_THAN_LATER",
        error: `That's higher than your reading of ${Math.round(later.readingMiles).toLocaleString("en-GB")} on ${when}, which was taken later. Check the reading or the time.`,
        later,
      });
    }

    const created = await prisma.odometerReading.create({
      data: { userId, vehicleId: id, readingMiles, readAt, source: "user" },
    });

    const current = buildOdometerTimeline({
      trips: inputs.trips,
      anchors: [
        ...inputs.anchors,
        { id: created.id, at: created.readAt, readingMiles: created.readingMiles, source: "user", createdAt: created.createdAt },
      ],
    }).current;

    const data: OdometerReadingCreated = {
      reading: {
        id: created.id,
        vehicleId: created.vehicleId,
        readingMiles: created.readingMiles,
        readAt: created.readAt.toISOString(),
        source: created.source,
      },
      estimatedMiles: before.estimate,
      current,
    };
    return reply.status(201).send({ data });
  });

  // Delete a typed reading (trip and fuel readings are changed on the trip or fuel log).
  app.delete("/:id/odometer-readings/:readingId", async (request, reply) => {
    const { id, readingId } = z
      .object({ id: z.string().uuid(), readingId: z.string().uuid() })
      .parse(request.params);
    const userId = request.userId!;

    const existing = await prisma.odometerReading.findFirst({
      where: { id: readingId, vehicleId: id, userId },
      select: { id: true },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Reading not found" });
    }
    await prisma.odometerReading.delete({ where: { id: readingId } });
    return reply.send({ message: "Reading deleted" });
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
