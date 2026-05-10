import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authMiddleware } from "../../middleware/auth.js";
import { attachIdempotency } from "../../middleware/idempotency.js";
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
import { haversineDistance, computeTripInsights } from "@mileclear/shared";
import { upsertMileageSummary } from "../../services/mileage.js";
import { checkAndAwardAchievements } from "../../services/gamification.js";
import { sendMilestonePush, sendAchievementPush } from "../../jobs/notifications.js";
import { logEvent } from "../../services/appEvents.js";
import { advanceLastTripAt } from "../../services/userActivity.js";
import { looksLikePhantomTrip } from "../../lib/phantomTrip.js";
import { resolveRouteDistance } from "../../services/routing.js";
import { matchTripRoute, decodePolyline } from "../../services/mapMatching.js";

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
  platformTag: z.enum(PLATFORM_TAGS).optional(),
  shiftId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export async function tripRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  attachIdempotency(app);

  // GET /trips/route-distance — server-side road-distance calc that
  // the mobile manual-trip form calls when picking start/end points.
  // Replaces the previous direct-to-public-OSRM call which silently
  // fell back to haversine on rate-limit / timeout, causing identical
  // addresses to return inconsistent miles. Returns provenance so the
  // mobile UI can show "Calculated via GraphHopper / cached / Google".
  const routeDistanceQuery = z.object({
    startLat: z.coerce.number().min(-90).max(90),
    startLng: z.coerce.number().min(-180).max(180),
    endLat: z.coerce.number().min(-90).max(90),
    endLng: z.coerce.number().min(-180).max(180),
  });
  app.get("/route-distance", async (request, reply) => {
    const parsed = routeDistanceQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: "INVALID_REQUEST", message: parsed.error.issues[0].message, retryable: false },
      });
    }
    const result = await resolveRouteDistance({
      ...parsed.data,
      userId: request.userId!,
    });
    if (!result) {
      // All routing engines unavailable. Return 503 — mobile UI shows
      // "Couldn't calculate, enter manually" instead of inventing a
      // crow-flies number.
      return reply.status(503).send({
        error: {
          code: "ROUTING_UNAVAILABLE",
          message: "Road routing is temporarily unavailable. Try again or enter the distance manually.",
          retryable: true,
        },
      });
    }
    return reply.send({ data: result });
  });

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

    // Auto-calculate distance if end coords present and distance not provided.
    // Use the routing service (cache → GraphHopper → Google) — never silently
    // falls back to haversine, which previously caused identical-address
    // trips to return inconsistent miles (Laura Joyce report 10 May 2026).
    let distanceMiles = data.distanceMiles ?? 0;
    if (resolvedEndLat != null && resolvedEndLng != null && hasValidCoords(resolvedStartLat, resolvedStartLng) && data.distanceMiles == null) {
      const route = await resolveRouteDistance({
        startLat: resolvedStartLat,
        startLng: resolvedStartLng,
        endLat: resolvedEndLat,
        endLng: resolvedEndLng,
        userId,
      });
      if (route) {
        distanceMiles = route.distanceMiles;
      } else {
        // All routing engines unavailable. Use haversine as the explicit
        // last resort and flag it so we can audit how often it fires.
        distanceMiles = haversineDistance(resolvedStartLat, resolvedStartLng, resolvedEndLat, resolvedEndLng);
        logEvent("routing.haversine_fallback_used", userId, {
          startLat: resolvedStartLat,
          startLng: resolvedStartLng,
          endLat: resolvedEndLat,
          endLng: resolvedEndLng,
          distanceMiles,
        });
      }
    }

    const { coordinates, ...tripData } = data;
    const hasCoordinates = coordinates && coordinates.length > 0;

    // Classification is now handled by the mobile classification engine
    // (lib/classification/). The API respects whatever the client sends.
    // The /trips/suggest endpoint is still available for UI suggestions.
    const finalClassification = tripData.classification;
    const finalPlatformTag: string | null = tripData.platformTag ?? null;

    const isManualEntry = !hasCoordinates;
    const isPhantomTrip = looksLikePhantomTrip({
      distanceMiles,
      startedAt: tripData.startedAt,
      endedAt: tripData.endedAt,
      isManualEntry,
      coordinateCount: coordinates?.length ?? 0,
    });

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
      isManualEntry,
      isPhantomTrip,
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

    if (isPhantomTrip) {
      // Skip mileage / achievements / push side-effects — the trip is
      // a misfire and shouldn't count toward streaks, HMRC totals, or
      // milestones. Telemetry only.
      const startMs = new Date(data.startedAt).getTime();
      const endMs = data.endedAt ? new Date(data.endedAt).getTime() : startMs;
      const durationSec = (endMs - startMs) / 1000;
      const avgMph = durationSec > 0 ? distanceMiles / (durationSec / 3600) : 0;
      logEvent("trip.phantom_dropped", userId, {
        tripId: trip.id,
        distanceMiles,
        durationSec,
        avgMph: Math.round(avgMph * 10) / 10,
        startAddress: tripData.startAddress ?? null,
        endAddress: tripData.endAddress ?? null,
      });
    } else {
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

      // Map-match the GPS breadcrumbs to road segments via GraphHopper.
      // Snaps the route to actual roads (no GPS jitter, no driving-through-
      // buildings artefacts) and stores the cleaned polyline. Fire-and-
      // forget — never blocks the trip-create response. If GraphHopper is
      // down or the trip has too few breadcrumbs, the polyline stays null
      // and the trip detail screen falls back to the raw breadcrumbs.
      if (hasCoordinates && coordinates && coordinates.length >= 10) {
        runMapMatchingForTrip({
          tripId: trip.id,
          breadcrumbs: coordinates,
          currentDistanceMiles: distanceMiles,
          userId,
        }).catch(() => {});
      }

      logEvent("trip.created", userId, {
        distanceMiles,
        classification: finalClassification,
        isManualEntry: !hasCoordinates,
        platformTag: finalPlatformTag,
        autoClassified: finalClassification !== data.classification,
      });
    }

    return reply.status(201).send({ data: trip });
  });

  // List trips with pagination
  app.get("/", async (request, reply) => {
    const parsed = listTripsQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { classification, platformTag, shiftId, from, to, page, pageSize } = parsed.data;
    const userId = request.userId!;

    const where: Record<string, unknown> = { userId, isPhantomTrip: false };
    if (classification) where.classification = classification;
    if (platformTag) where.platformTag = platformTag;
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
      where: { userId: request.userId!, classification: "unclassified", isPhantomTrip: false },
    });
    return reply.send({ count });
  });

  // Aggregate trip stats over a date range. Lets the dashboard cards
  // get totalTrips + totalMiles in one round trip without paginating
  // through the full trip list. Same filters as GET /trips, just an
  // aggregate.
  const summaryQuery = z.object({
    classification: z.enum(TRIP_CLASSIFICATIONS).optional(),
    platformTag: z.enum(PLATFORM_TAGS).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  });

  app.get("/summary", async (request, reply) => {
    const parsed = summaryQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { classification, platformTag, from, to } = parsed.data;
    const baseWhere: Record<string, unknown> = { userId: request.userId!, isPhantomTrip: false };
    if (platformTag) baseWhere.platformTag = platformTag;
    if (from || to) {
      baseWhere.startedAt = {
        ...(from && { gte: from }),
        ...(to && { lte: to }),
      };
    }

    // Stats card on the trips screen wants the per-classification split
    // (business/personal/total) regardless of which classification is
    // currently filtered in the list view, so the card stays informative
    // even when you flip between "All / Business / Personal" chips.
    // groupBy gives us all three in a single round-trip.
    const grouped = await prisma.trip.groupBy({
      by: ["classification"],
      where: baseWhere,
      _count: { id: true },
      _sum: { distanceMiles: true },
    });

    let businessTrips = 0;
    let businessMiles = 0;
    let personalTrips = 0;
    let personalMiles = 0;
    let unclassifiedTrips = 0;
    let unclassifiedMiles = 0;
    for (const row of grouped) {
      const trips = row._count.id;
      const miles = row._sum.distanceMiles ?? 0;
      if (row.classification === "business") {
        businessTrips = trips;
        businessMiles = miles;
      } else if (row.classification === "personal") {
        personalTrips = trips;
        personalMiles = miles;
      } else {
        unclassifiedTrips += trips;
        unclassifiedMiles += miles;
      }
    }

    const totalTrips = businessTrips + personalTrips + unclassifiedTrips;
    const totalMiles = businessMiles + personalMiles + unclassifiedMiles;

    // If the caller filtered to a specific classification, the totalTrips/
    // totalMiles fields reflect just that subset (mirrors the /trips list
    // behaviour). The per-classification splits stay as-is so the stats
    // card can still show the broader picture without a second request.
    if (classification === "business") {
      return reply.send({
        data: {
          totalTrips: businessTrips,
          totalMiles: businessMiles,
          businessTrips,
          businessMiles,
          personalTrips,
          personalMiles,
        },
      });
    }
    if (classification === "personal") {
      return reply.send({
        data: {
          totalTrips: personalTrips,
          totalMiles: personalMiles,
          businessTrips,
          businessMiles,
          personalTrips,
          personalMiles,
        },
      });
    }
    if (classification === "unclassified") {
      return reply.send({
        data: {
          totalTrips: unclassifiedTrips,
          totalMiles: unclassifiedMiles,
          businessTrips,
          businessMiles,
          personalTrips,
          personalMiles,
        },
      });
    }
    return reply.send({
      data: {
        totalTrips,
        totalMiles,
        businessTrips,
        businessMiles,
        personalTrips,
        personalMiles,
      },
    });
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
        isPhantomTrip: false,
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
      where: { id, userId: request.userId!, isPhantomTrip: false },
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

    // Decode the matched polyline (Google-encoded; produced by GraphHopper
    // /match) to a coordinate array so the mobile map widget can render it
    // directly without needing a polyline-decoding lib. Falls back to null
    // when no match has been computed yet — client uses raw coordinates.
    let matchedCoordinates: { lat: number; lng: number }[] | null = null;
    if (trip.routePolyline) {
      try {
        matchedCoordinates = decodePolyline(trip.routePolyline);
        if (matchedCoordinates.length === 0) matchedCoordinates = null;
      } catch {
        matchedCoordinates = null;
      }
    }

    return reply.send({ data: { ...trip, insights, matchedCoordinates } });
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
    // otherwise recalculate via the routing service if end coords changed.
    let distanceMiles: number | undefined = updates.distanceMiles;
    if (distanceMiles === undefined) {
      const endLatChanged = updates.endLat !== undefined && updates.endLat !== existing.endLat;
      const endLngChanged = updates.endLng !== undefined && updates.endLng !== existing.endLng;
      if (
        (endLatChanged || endLngChanged) &&
        newEndLat != null &&
        newEndLng != null
      ) {
        const route = await resolveRouteDistance({
          startLat: existing.startLat,
          startLng: existing.startLng,
          endLat: newEndLat,
          endLng: newEndLng,
          userId,
        });
        if (route) {
          distanceMiles = route.distanceMiles;
        } else {
          distanceMiles = haversineDistance(existing.startLat, existing.startLng, newEndLat, newEndLng);
          logEvent("routing.haversine_fallback_used", userId, {
            startLat: existing.startLat,
            startLng: existing.startLng,
            endLat: newEndLat,
            endLng: newEndLng,
            distanceMiles,
          });
        }
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

/**
 * Run map-matching against a trip's GPS breadcrumbs and persist the
 * results. Called fire-and-forget after trip create / update — never
 * blocks the response. If GraphHopper is unreachable, returns null and
 * the trip's routePolyline stays unset; the detail screen falls back
 * to raw breadcrumbs and nothing breaks.
 *
 * Distance update rule: if the matched road distance is meaningfully
 * higher than the breadcrumb-summed value (5%+ threshold), update
 * Trip.distanceMiles to the matched figure. Same conservative rule as
 * the recalc-distances script — never reduces a stored distance.
 */
async function runMapMatchingForTrip(args: {
  tripId: string;
  breadcrumbs: { lat: number; lng: number; accuracy?: number | null; recordedAt?: string | Date }[];
  currentDistanceMiles: number;
  userId: string;
}): Promise<void> {
  const result = await matchTripRoute(args.breadcrumbs);
  if (!result) return;

  const updates: { routePolyline: string; distanceMiles?: number } = {
    routePolyline: result.encodedPolyline,
  };

  // Threshold: 5% increase. Map-matching is more accurate than the
  // breadcrumb haversine sum (snaps to roads, follows actual curves)
  // so when it disagrees by a meaningful margin in the user's favour,
  // adopt it.
  if (result.distanceMiles > args.currentDistanceMiles * 1.05) {
    updates.distanceMiles = result.distanceMiles;
  }

  await prisma.trip.update({
    where: { id: args.tripId },
    data: updates,
  });

  if (updates.distanceMiles !== undefined) {
    logEvent("trip.distance_recalculated", args.userId, {
      tripId: args.tripId,
      oldMiles: args.currentDistanceMiles,
      newMiles: updates.distanceMiles,
      ratio: Math.round((updates.distanceMiles / args.currentDistanceMiles) * 100) / 100,
      source: "map_match",
      triggeredBy: "trip_create_hook",
    });
  } else {
    logEvent("trip.map_matched", args.userId, {
      tripId: args.tripId,
      pointsUsed: result.pointsUsed,
      pointsFilteredOut: result.pointsFilteredOut,
      matchedDistanceMiles: result.distanceMiles,
      currentDistanceMiles: args.currentDistanceMiles,
    });
  }
}
