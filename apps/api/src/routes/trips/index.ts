import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  TRIP_CLASSIFICATIONS,
  TRIP_CATEGORIES,
  PLATFORM_TAGS,
  BUSINESS_PURPOSE_VALUES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  getTaxYear,
} from "@mileclear/shared";
import { haversineDistance, fetchRouteDistance, computeTripInsights } from "@mileclear/shared";
import { upsertMileageSummary } from "../../services/mileage.js";
import { checkAndAwardAchievements } from "../../services/gamification.js";
import { sendMilestonePush, sendAchievementPush } from "../../jobs/notifications.js";
import { logEvent } from "../../services/appEvents.js";
import { autoClassifyTrip } from "../../services/tripClassification.js";
import { advanceLastTripAt } from "../../services/userActivity.js";

// Server-side geocoding: resolve an address to coordinates via Postcodes.io or Nominatim
async function geocodeAddress(addr: string): Promise<{ lat: number; lng: number } | null> {
  // Extract UK postcode (full or partial outcode)
  const fullMatch = addr.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  const partialMatch = addr.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\b/i);
  const pc = fullMatch
    ? { code: fullMatch[1].replace(/\s+/g, ""), partial: false }
    : partialMatch
      ? { code: partialMatch[1], partial: true }
      : null;

  if (pc) {
    try {
      const endpoint = pc.partial
        ? `https://api.postcodes.io/outcodes/${pc.code}`
        : `https://api.postcodes.io/postcodes/${pc.code}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 200 && data.result) {
          return { lat: data.result.latitude, lng: data.result.longitude };
        }
      }
    } catch { /* fall through */ }
  }

  // Fallback: Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=gb`,
      { headers: { "User-Agent": "MileClear/1.0" } }
    );
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* give up */ }
  return null;
}

// Check if coordinates look like real values (not 0,0 dummy or null-island)
function hasValidCoords(lat: number, lng: number): boolean {
  return !(Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1);
}

const coordinateInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  recordedAt: z.coerce.date(),
});

const createTripSchema = z.object({
  shiftId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLat: z.number().min(-90).max(90).optional(),
  endLng: z.number().min(-180).max(180).optional(),
  startAddress: z.string().max(500).optional(),
  endAddress: z.string().max(500).optional(),
  distanceMiles: z.number().nonnegative().max(2000, "Distance exceeds reasonable limit").optional(),
  startedAt: z.coerce.date().refine((d) => d <= new Date(Date.now() + 86400000), "Start date cannot be in the future"),
  endedAt: z.coerce.date().refine((d) => d <= new Date(Date.now() + 86400000), "End date cannot be in the future").optional(),
  classification: z.enum(TRIP_CLASSIFICATIONS).default("unclassified"),
  platformTag: z.enum(PLATFORM_TAGS).optional(),
  businessPurpose: z.enum(BUSINESS_PURPOSE_VALUES).optional(),
  notes: z.string().max(2000).optional(),
  category: z.enum(TRIP_CATEGORIES).nullable().optional(),
  coordinates: z.array(coordinateInputSchema).max(20000).optional(),
  // Client-computed GPS quality summary. Free-form so we can iterate the
  // shape without a schema migration; admin queries look for known keys.
  gpsQuality: z.record(z.unknown()).optional(),
});

const updateTripSchema = z.object({
  classification: z.enum(TRIP_CLASSIFICATIONS).optional(),
  platformTag: z.enum(PLATFORM_TAGS).nullable().optional(),
  businessPurpose: z.enum(BUSINESS_PURPOSE_VALUES).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  category: z.enum(TRIP_CATEGORIES).nullable().optional(),
  endAddress: z.string().max(500).nullable().optional(),
  endLat: z.number().min(-90).max(90).nullable().optional(),
  endLng: z.number().min(-180).max(180).nullable().optional(),
  endedAt: z.coerce.date().nullable().optional(),
  distanceMiles: z.number().min(0).optional(),
  // Classification feedback: mobile sends this on the first user classification
  // of an auto-classified trip. Server ignores the value if already set, so
  // later PATCHes never overwrite the original accept/reject signal.
  classificationAutoAccepted: z.boolean().optional(),
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

    // Deduplication: reject if an identical trip already exists (same user, start time, start coords)
    const existing = await prisma.trip.findFirst({
      where: {
        userId,
        startedAt: data.startedAt,
        startLat: data.startLat,
        startLng: data.startLng,
      },
      include: { vehicle: true, shift: true },
    });
    if (existing) {
      return reply.send({ data: existing });
    }

    // Server-side geocoding fallback: resolve addresses to coordinates if missing/zero
    let resolvedStartLat = data.startLat;
    let resolvedStartLng = data.startLng;
    let resolvedEndLat = data.endLat ?? null;
    let resolvedEndLng = data.endLng ?? null;

    if (!hasValidCoords(resolvedStartLat, resolvedStartLng) && data.startAddress) {
      const geo = await geocodeAddress(data.startAddress);
      if (geo) {
        resolvedStartLat = geo.lat;
        resolvedStartLng = geo.lng;
      }
    }

    if (data.endAddress && (resolvedEndLat == null || resolvedEndLng == null || !hasValidCoords(resolvedEndLat, resolvedEndLng))) {
      const geo = await geocodeAddress(data.endAddress);
      if (geo) {
        resolvedEndLat = geo.lat;
        resolvedEndLng = geo.lng;
      }
    }

    // Auto-calculate distance if end coords present and distance not provided
    let distanceMiles = data.distanceMiles ?? 0;
    if (resolvedEndLat != null && resolvedEndLng != null && hasValidCoords(resolvedStartLat, resolvedStartLng) && data.distanceMiles == null) {
      const route = await fetchRouteDistance(resolvedStartLat, resolvedStartLng, resolvedEndLat, resolvedEndLng);
      distanceMiles = route
        ? route.distanceMiles
        : haversineDistance(resolvedStartLat, resolvedStartLng, resolvedEndLat, resolvedEndLng);
    }

    const { coordinates, ...tripData } = data;
    const hasCoordinates = coordinates && coordinates.length > 0;

    // Classification is now handled by the mobile classification engine
    // (lib/classification/). The API respects whatever the client sends.
    // The /trips/suggest endpoint is still available for UI suggestions.
    let finalClassification = tripData.classification;
    let finalPlatformTag: string | null = tripData.platformTag ?? null;

    const tripPayload = {
      userId,
      shiftId: tripData.shiftId ?? null,
      vehicleId: tripData.vehicleId ?? null,
      startLat: resolvedStartLat,
      startLng: resolvedStartLng,
      endLat: resolvedEndLat,
      endLng: resolvedEndLng,
      startAddress: tripData.startAddress ?? null,
      endAddress: tripData.endAddress ?? null,
      distanceMiles,
      startedAt: tripData.startedAt,
      endedAt: tripData.endedAt ?? null,
      isManualEntry: !hasCoordinates,
      classification: finalClassification,
      platformTag: finalPlatformTag,
      businessPurpose: tripData.businessPurpose ?? null,
      category: tripData.category ?? null,
      notes: tripData.notes ?? null,
      gpsQuality: (tripData.gpsQuality ?? undefined) as Prisma.InputJsonValue | undefined,
    };

    let trip;

    if (hasCoordinates) {
      trip = await prisma.$transaction(async (tx) => {
        const created = await tx.trip.create({
          data: tripPayload,
        });

        await tx.tripCoordinate.createMany({
          data: coordinates.map((c) => ({
            tripId: created.id,
            lat: c.lat,
            lng: c.lng,
            speed: c.speed ?? null,
            accuracy: c.accuracy ?? null,
            recordedAt: c.recordedAt,
          })),
        });

        return tx.trip.findUniqueOrThrow({
          where: { id: created.id },
          include: { vehicle: true, shift: true },
        });
      });
    } else {
      trip = await prisma.trip.create({
        data: tripPayload,
        include: { vehicle: true, shift: true },
      });
    }

    // Fire-and-forget: update mileage summary + check achievements + push notifications
    const taxYear = getTaxYear(data.startedAt);
    upsertMileageSummary(userId, taxYear).catch(() => {});
    advanceLastTripAt(userId, data.startedAt).catch(() => {});
    checkAndAwardAchievements(userId)
      .then((newAchievements) => {
        sendAchievementPush(userId, newAchievements).catch(() => {});
        sendMilestonePush(userId).catch(() => {});
      })
      .catch(() => {});

    logEvent("trip.created", userId, {
      distanceMiles,
      classification: finalClassification,
      isManualEntry: !hasCoordinates,
      platformTag: finalPlatformTag,
      autoClassified: finalClassification !== data.classification,
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

  // Count of unclassified trips (for inbox badge)
  // Must be registered before /:id to avoid route conflict
  app.get("/unclassified/count", async (request, reply) => {
    const count = await prisma.trip.count({
      where: { userId: request.userId!, classification: "unclassified" },
    });
    return reply.send({ count });
  });

  // Suggest classification based on past trips near a location
  const suggestQuery = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    type: z.enum(["start", "end"]).default("end"),
  });

  app.get("/suggest", async (request, reply) => {
    const parsed = suggestQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { lat, lng, type } = parsed.data;
    const userId = request.userId!;

    // Find classified trips where start or end point is within ~500m
    // Using bounding box approximation: ~0.0045 degrees latitude ≈ 500m
    const latDelta = 0.0045;
    const lngDelta = 0.0045 / Math.cos((lat * Math.PI) / 180);

    const latField = type === "start" ? "startLat" : "endLat";
    const lngField = type === "start" ? "startLng" : "endLng";

    const nearby = await prisma.trip.findMany({
      where: {
        userId,
        classification: { not: "unclassified" },
        [latField]: { gte: lat - latDelta, lte: lat + latDelta },
        [lngField]: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      select: {
        classification: true,
        platformTag: true,
        businessPurpose: true,
        category: true,
      },
      orderBy: { startedAt: "desc" },
      take: 20,
    });

    if (nearby.length < 3) {
      return reply.send({ suggestion: null });
    }

    // Count classifications
    const counts: Record<string, number> = {};
    for (const t of nearby) {
      counts[t.classification] = (counts[t.classification] ?? 0) + 1;
    }
    const topClassification = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const confidence = topClassification[1] / nearby.length;

    // Only suggest if >60% agreement
    if (confidence < 0.6) {
      return reply.send({ suggestion: null });
    }

    // Find most common platform tag / business purpose / category among matching classification
    const matching = nearby.filter((t) => t.classification === topClassification[0]);

    const platformCounts: Record<string, number> = {};
    const purposeCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    for (const t of matching) {
      if (t.platformTag) platformCounts[t.platformTag] = (platformCounts[t.platformTag] ?? 0) + 1;
      if (t.businessPurpose) purposeCounts[t.businessPurpose] = (purposeCounts[t.businessPurpose] ?? 0) + 1;
      if (t.category) categoryCounts[t.category] = (categoryCounts[t.category] ?? 0) + 1;
    }

    const topPlatform = Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0];
    const topPurpose = Object.entries(purposeCounts).sort((a, b) => b[1] - a[1])[0];
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

    return reply.send({
      suggestion: {
        classification: topClassification[0],
        platformTag: topPlatform ? topPlatform[0] : null,
        businessPurpose: topPurpose ? topPurpose[0] : null,
        category: topCategory ? topCategory[0] : null,
        matchCount: nearby.length,
        confidence: Math.round(confidence * 100),
      },
    });
  });

  // Merge multiple trips into one
  const mergeTripSchema = z.object({
    tripIds: z.array(z.string().uuid()).min(2).max(20),
    classification: z.enum(TRIP_CLASSIFICATIONS),
    platformTag: z.enum(PLATFORM_TAGS).nullable().optional(),
    businessPurpose: z.enum(BUSINESS_PURPOSE_VALUES).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    category: z.enum(TRIP_CATEGORIES).nullable().optional(),
  });

  app.post("/merge", async (request, reply) => {
    const parsed = mergeTripSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const { tripIds, classification, platformTag, businessPurpose, notes, category } = parsed.data;

    // Fetch all trips and verify ownership
    const trips = await prisma.trip.findMany({
      where: { id: { in: tripIds }, userId },
      include: { coordinates: { orderBy: { recordedAt: "asc" } } },
      orderBy: { startedAt: "asc" },
    });

    if (trips.length !== tripIds.length) {
      return reply.status(404).send({ error: "One or more trips not found" });
    }

    // Use the first trip's start and last trip's end
    const first = trips[0];
    const last = trips[trips.length - 1];

    // Combine all coordinates from all trips, sorted by time
    const allCoords = trips
      .flatMap((t) => t.coordinates)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    // Calculate total distance from coordinate trail if available, else sum individual trips
    let totalDistance = 0;
    const startLat = first.startLat;
    const startLng = first.startLng;
    const endLat = last.endLat;
    const endLng = last.endLng;

    if (allCoords.length >= 2) {
      // Sum haversine across all GPS breadcrumbs for accurate trail distance
      for (let i = 1; i < allCoords.length; i++) {
        totalDistance += haversineDistance(
          allCoords[i - 1].lat, allCoords[i - 1].lng,
          allCoords[i].lat, allCoords[i].lng
        );
      }
    } else {
      // No coordinates — sum the pre-calculated individual trip distances
      totalDistance = trips.reduce((sum, t) => sum + t.distanceMiles, 0);
    }

    // Create merged trip and delete originals in a transaction
    const mergedTrip = await prisma.$transaction(async (tx) => {
      // Create the merged trip
      const created = await tx.trip.create({
        data: {
          userId,
          shiftId: first.shiftId,
          vehicleId: first.vehicleId,
          startLat,
          startLng,
          endLat: endLat ?? null,
          endLng: endLng ?? null,
          startAddress: first.startAddress,
          endAddress: last.endAddress,
          distanceMiles: totalDistance,
          startedAt: first.startedAt,
          endedAt: last.endedAt,
          isManualEntry: false,
          classification,
          platformTag: platformTag ?? null,
          businessPurpose: businessPurpose ?? null,
          category: category ?? null,
          notes: notes ?? null,
        },
      });

      // Copy all coordinates to the merged trip
      if (allCoords.length > 0) {
        await tx.tripCoordinate.createMany({
          data: allCoords.map((c) => ({
            tripId: created.id,
            lat: c.lat,
            lng: c.lng,
            speed: c.speed,
            accuracy: c.accuracy,
            recordedAt: c.recordedAt,
          })),
        });
      }

      // Delete original trips (cascade deletes their coordinates and anomalies)
      await tx.trip.deleteMany({
        where: { id: { in: tripIds } },
      });

      return tx.trip.findUniqueOrThrow({
        where: { id: created.id },
        include: { vehicle: true, shift: true },
      });
    });

    // Fire-and-forget: update mileage summary + lastTripAt
    const taxYear = getTaxYear(first.startedAt);
    upsertMileageSummary(userId, taxYear).catch(() => {});
    advanceLastTripAt(userId, first.startedAt).catch(() => {});

    request.log.info(
      { userId, mergedTripId: mergedTrip.id, originalIds: tripIds, action: "trip.merge" },
      `Merged ${tripIds.length} trips into ${mergedTrip.id}`
    );

    return reply.status(201).send({ data: mergedTrip });
  });

  // Get single trip
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

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

    // Compute trip insights from coordinates
    let insights = null;
    if (trip.coordinates.length >= 2 && trip.endedAt) {
      const durationSecs = Math.round(
        (trip.endedAt.getTime() - trip.startedAt.getTime()) / 1000
      );
      insights = computeTripInsights(trip.coordinates, trip.distanceMiles, durationSecs);
    }

    return reply.send({ data: { ...trip, insights } });
  });

  // Update trip
  app.patch("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
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

    // Geocode end address if provided without coordinates
    let newEndLat = updates.endLat !== undefined ? updates.endLat : existing.endLat;
    let newEndLng = updates.endLng !== undefined ? updates.endLng : existing.endLng;
    if (updates.endAddress && (newEndLat == null || newEndLng == null)) {
      const geo = await geocodeAddress(updates.endAddress);
      if (geo) {
        newEndLat = geo.lat;
        newEndLng = geo.lng;
        updates.endLat = geo.lat;
        updates.endLng = geo.lng;
      }
    }

    // Use explicit distanceMiles if provided (e.g. merged trip with GPS-measured distance),
    // otherwise recalculate via OSRM if end coords changed
    let distanceMiles: number | undefined = updates.distanceMiles;
    if (distanceMiles === undefined) {
      const endLatChanged = updates.endLat !== undefined && updates.endLat !== existing.endLat;
      const endLngChanged = updates.endLng !== undefined && updates.endLng !== existing.endLng;
      if (
        (endLatChanged || endLngChanged) &&
        newEndLat != null &&
        newEndLng != null
      ) {
        const route = await fetchRouteDistance(existing.startLat, existing.startLng, newEndLat, newEndLng);
        distanceMiles = route
          ? route.distanceMiles
          : haversineDistance(existing.startLat, existing.startLng, newEndLat, newEndLng);
      }
    }

    // classificationAutoAccepted is write-once. Mobile sends it on the first
    // user classification of an auto-classified trip; we never overwrite the
    // original accept/reject signal if the user later changes their mind.
    const { classificationAutoAccepted: incomingAutoAccepted, ...restUpdates } = updates;
    const shouldWriteAutoAccepted =
      incomingAutoAccepted !== undefined &&
      existing.classificationAutoAccepted === null;

    const trip = await prisma.trip.update({
      where: { id },
      data: {
        ...restUpdates,
        ...(distanceMiles !== undefined && { distanceMiles }),
        ...(shouldWriteAutoAccepted && { classificationAutoAccepted: incomingAutoAccepted }),
      },
      include: { vehicle: true, shift: true },
    });

    // Fire-and-forget: update mileage summary + check achievements
    const taxYear = getTaxYear(existing.startedAt);
    upsertMileageSummary(userId, taxYear).catch(() => {});
    checkAndAwardAchievements(userId).catch(() => {});

    logEvent("trip.updated", userId, { classification: updates.classification });

    return reply.send({ data: trip });
  });

  // Delete trip
  app.delete("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = request.userId!;

    const existing = await prisma.trip.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Trip not found" });
    }

    // Capture tax year before deleting
    const taxYear = getTaxYear(existing.startedAt);

    request.log.warn(
      { userId, tripId: id, action: "trip.delete", miles: existing.distanceMiles },
      `Trip deleted: ${id}`
    );

    await prisma.trip.delete({ where: { id } });

    // Fire-and-forget: update mileage summary
    upsertMileageSummary(userId, taxYear).catch(() => {});

    logEvent("trip.deleted", userId, { distanceMiles: existing.distanceMiles });

    return reply.send({ message: "Trip deleted" });
  });

  // Known anomaly types and valid responses per type
  const VALID_ANOMALY_TYPES = [
    "indirect_route", "many_stops", "long_idle", "very_short", "very_long",
    "slow_zone", "long_stop", "sudden_slowdown",
  ] as const;
  const VALID_RESPONSES = new Set([
    // Trip-level anomaly options
    "Multiple deliveries", "Detour/road closure", "Got lost", "Exploring",
    "Multiple drop-offs", "Heavy traffic", "Picking up orders", "Errands",
    "Waiting for order", "Break/rest", "Traffic jam", "Loading/unloading",
    "Short delivery", "Parking relocation", "Wrong destination", "Discard it",
    "Long distance delivery", "Commute", "Road trip", "Intercity transfer",
    // Slow zone options
    "Roadworks", "Accident or breakdown", "Road closure/diversion",
    "School traffic", "Event or market", "Weather conditions", "Busy road",
    // Long stop options
    "Delivery or pickup", "Waiting for passenger/order", "Parked up",
    // Generic
    "Other",
  ]);

  // Submit anomaly response for a trip
  app.post("/:id/anomaly", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const schema = z.object({
      type: z.enum(VALID_ANOMALY_TYPES),
      response: z.string().max(500),
      customNote: z.string().max(1000).nullable().optional(),
      lat: z.number().min(49).max(61).nullable().optional(),   // UK lat range
      lng: z.number().min(-11).max(2).nullable().optional(),    // UK lng range
      placeName: z.string().max(200).nullable().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;

    // Validate each comma-separated response value against known options
    const responseParts = parsed.data.response.split(",").map((s) => s.trim());
    for (const part of responseParts) {
      if (!VALID_RESPONSES.has(part)) {
        return reply.status(400).send({ error: `Invalid response option: ${part}` });
      }
    }

    const trip = await prisma.trip.findFirst({
      where: { id, userId },
      select: { id: true, startLat: true, startLng: true, endLat: true, endLng: true, isManualEntry: true },
    });
    if (!trip) {
      return reply.status(404).send({ error: "Trip not found" });
    }

    // Only allow anomaly submission for GPS-tracked trips (not manual entries)
    if (trip.isManualEntry) {
      return reply.status(400).send({ error: "Anomaly reports are only supported for tracked trips" });
    }

    // Prevent duplicate anomaly submissions (same trip + type)
    const existing = await prisma.tripAnomaly.findFirst({
      where: { tripId: id, userId, type: parsed.data.type },
    });
    if (existing) {
      return reply.status(409).send({ error: "Anomaly already reported for this trip" });
    }

    // Use client-provided lat/lng (for location questions) or trip midpoint
    // Truncate to 3 decimal places (~111m precision) for privacy
    const rawLat = parsed.data.lat ?? (trip.endLat != null ? (trip.startLat + trip.endLat) / 2 : trip.startLat);
    const rawLng = parsed.data.lng ?? (trip.endLng != null ? (trip.startLng + trip.endLng) / 2 : trip.startLng);
    const anomalyLat = Math.round(rawLat * 1000) / 1000;
    const anomalyLng = Math.round(rawLng * 1000) / 1000;

    // Get the question text for the anomaly type
    const questionMap: Record<string, string> = {
      indirect_route: "Your route was quite indirect. What happened?",
      many_stops: "You had quite a few stops. What was happening?",
      long_idle: "You were stationary for a while. Everything OK?",
      very_short: "This was a very short trip. Worth keeping?",
      very_long: "That was a long haul! What type of trip?",
      slow_zone: "Slow zone detected",
      long_stop: "Long stop detected",
      sudden_slowdown: "Sudden slowdown detected",
    };

    // For location questions, build a descriptive question with place name
    let questionText = questionMap[parsed.data.type] || parsed.data.type;
    if (parsed.data.placeName && (parsed.data.type === "slow_zone" || parsed.data.type === "long_stop")) {
      questionText = parsed.data.type === "long_stop"
        ? `Stopped near ${parsed.data.placeName}`
        : `Slow near ${parsed.data.placeName}`;
    }

    const anomaly = await prisma.tripAnomaly.create({
      data: {
        tripId: id,
        userId,
        type: parsed.data.type,
        question: questionText,
        response: parsed.data.response,
        customNote: parsed.data.customNote ?? null,
        lat: anomalyLat,
        lng: anomalyLng,
      },
    });

    return reply.status(201).send({ data: anomaly });
  });
}
