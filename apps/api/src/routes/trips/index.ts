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
import { qualifyReferralOnFirstTrip } from "../../services/referral.js";
import { looksLikePhantomTrip, hasRealMovementEvidence } from "../../lib/phantomTrip.js";
import { resolveRouteDistance } from "../../services/routing.js";
import { matchTripRoute, decodePolyline, isMatchPlausible } from "../../services/mapMatching.js";
import { computeTripConfidence } from "../../services/tripConfidence.js";
import { sendLiveActivityStartPush, isApnsConfigured } from "../../services/apns.js";

// In-memory per-user cooldown for /trips/signal-start so a double-signal can't
// start two Live Activities. Per-process is fine: a duplicate within the window
// is the case we guard, and a process restart only ever risks one extra push.
const signalStartCooldown = new Map<string, number>();
const SIGNAL_START_COOLDOWN_MS = 90 * 1000;

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
  projectLabel: z.string().max(100).optional(),
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
  projectLabel: z.string().max(100).nullable().optional(),
  endAddress: z.string().max(500).nullable().optional(),
  endLat: z.number().min(-90).max(90).nullable().optional(),
  endLng: z.number().min(-180).max(180).nullable().optional(),
  endedAt: z.coerce.date().nullable().optional(),
  distanceMiles: z.number().min(0).optional(),
  // Correct a wrong vehicle after the fact. Was missing from the update schema,
  // so the PATCH silently stripped it and a corrected vehicle reverted on the
  // next hydration (audit point 5). Ownership is validated in the handler.
  vehicleId: z.string().uuid().nullable().optional(),
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

  // POST /trips/report-missing — user taps "Missing a trip?" on the Trips
  // screen. We already have their diagnostic dumps server-side, so the report
  // just carries one line of context; we attach the latest dump's verdict +
  // time so a glance at #trip-reports tells us whether the engine logged
  // anything for that drive. Posts to Discord (best-effort), never blocks.
  const reportMissingSchema = z.object({
    note: z.string().trim().max(1000).optional(),
  });
  app.post("/report-missing", async (request, reply) => {
    const userId = request.userId!;
    const parsed = reportMissingSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid report" });
    }
    const note = parsed.data.note?.trim() || "(no details given)";

    const [user, latestDump] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } }),
      prisma.diagnosticDump.findFirst({
        where: { userId },
        orderBy: { capturedAt: "desc" },
        select: { verdict: true, buildNumber: true, capturedAt: true },
      }),
    ]);

    const dumpLine = latestDump
      ? `Latest diagnostic: verdict "${latestDump.verdict}", build ${latestDump.buildNumber}, ${latestDump.capturedAt.toISOString()}`
      : "No diagnostic dump on file for this user.";

    logEvent("trip.report_missing", userId, { hasNote: note !== "(no details given)" });

    // Best-effort Discord post — import locally to avoid widening the route's
    // import surface, and never let a Discord failure fail the user's report.
    try {
      const { postToChannel } = await import("../../services/discord.js");
      await postToChannel("tripReports", {
        embeds: [
          {
            title: "Missing trip reported",
            description: `**${user?.displayName || user?.email || userId}**\n\n> ${note}\n\n${dumpLine}`,
            color: 0xf5a623,
            fields: [{ name: "User ID", value: userId, inline: true }],
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch {
      // swallow - the report is logged via logEvent regardless
    }

    return reply.send({ ok: true });
  });

  // POST /trips/signal-start — fired by the app when ClearTrack starts a
  // recording in the BACKGROUND. iOS won't let the app start a Live Activity
  // from the background ("Target is not foreground"), so the server sends an
  // APNs push-to-start to the device's stored push-to-start token, which makes
  // the Dynamic Island / Live Activity appear on its own (~2-5s). The app then
  // self-updates and ends the running activity (both allowed from background).
  // Best-effort: never blocks recording, swallows all failures.
  const signalStartSchema = z.object({
    activityType: z.enum(["trip", "shift"]).default("trip"),
    vehicleName: z.string().max(60).default(""),
    isBusinessMode: z.boolean().default(true),
    tripContextLabel: z.string().max(60).optional(),
    startedAtMs: z.number().int().positive().optional(),
    distanceMiles: z.number().min(0).default(0),
    speedMph: z.number().min(0).default(0),
    tripCount: z.number().int().min(0).default(0),
    dailyTotalMiles: z.number().min(0).default(0),
  });
  app.post("/signal-start", async (request, reply) => {
    const userId = request.userId!;

    if (!isApnsConfigured) {
      return reply.send({ sent: false, reason: "apns_not_configured" });
    }

    const parsed = signalStartSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }
    const d = parsed.data;

    // Idempotency / cooldown: a flaky double-signal (retry, dup detection)
    // must not start two activities. A user can't begin two drives within the
    // window, so a short per-user cooldown is a safe guard.
    const now = Date.now();
    const last = signalStartCooldown.get(userId);
    if (last && now - last < SIGNAL_START_COOLDOWN_MS) {
      return reply.send({ sent: false, reason: "cooldown" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { liveActivityPushToStartToken: true },
    });
    const token = user?.liveActivityPushToStartToken;
    if (!token) {
      return reply.send({ sent: false, reason: "no_token" });
    }

    const startedAtMs = d.startedAtMs ?? now;
    signalStartCooldown.set(userId, now);

    logEvent("trip.signal_start", userId, { activityType: d.activityType });

    const result = await sendLiveActivityStartPush({
      pushToStartToken: token,
      attributes: {
        activityType: d.activityType,
        startedAt: startedAtMs,
        vehicleName: d.vehicleName,
        isBusinessMode: d.isBusinessMode,
        tripContextLabel: d.tripContextLabel,
      },
      contentState: {
        distanceMiles: d.distanceMiles,
        speedMph: d.speedMph,
        tripCount: d.tripCount,
        startDate: startedAtMs,
        dailyTotalMiles: d.dailyTotalMiles,
      },
      alert: { title: "Recording your trip", body: "MileClear is tracking your drive." },
      // Auto-clear after 4h if the app never ends it (failsafe).
      staleDate: startedAtMs + 4 * 60 * 60 * 1000,
    });

    // BadDeviceToken / Unregistered => the stored token is dead; clear it so we
    // don't keep pushing to it. The app re-registers a fresh one on next launch.
    if (
      !result.ok &&
      (result.reason === "BadDeviceToken" || result.reason === "Unregistered")
    ) {
      await prisma.user
        .update({ where: { id: userId }, data: { liveActivityPushToStartToken: null } })
        .catch(() => {});
    }

    return reply.send({ sent: result.ok, reason: result.reason });
  });

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
      // Audit fix #6 (29 May 2026): a previously-saved PHANTOM must NOT block a
      // re-POST of the real drive. Phantoms are excluded from every user-facing
      // read, so replacing one is always safe — and it recovers a genuine drive
      // whose first capture was sparse (the native engine, especially early,
      // can emit a sparse shape that gets phantom-flagged, then a fuller
      // version later). Delete the phantom (+ its coords) and fall through to
      // create the incoming trip normally. A genuine duplicate of a REAL trip
      // still dedups as before.
      if (existing.isPhantomTrip) {
        await prisma.tripCoordinate.deleteMany({ where: { tripId: existing.id } }).catch(() => {});
        await prisma.trip.delete({ where: { id: existing.id } }).catch(() => {});
        logEvent("trip.phantom_superseded", userId, { phantomTripId: existing.id });
      } else {
        return reply.send({ data: existing });
      }
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
    let finalClassification = tripData.classification;
    let finalPlatformTag: string | null = tripData.platformTag ?? null;
    let finalBusinessPurpose: string | null = tripData.businessPurpose ?? null;
    let finalCategory: string | null = tripData.category ?? null;
    let learnedSuggestion: PairSuggestion | null = null;

    // Pattern-learned auto-classification: when a user submits a trip
    // tagged unclassified AND we have ≥3 prior trips with the same A→B
    // pair classified consistently (≥80% agreement), apply that
    // classification automatically. classificationAutoAccepted stays
    // null so the user's first interaction with the trip records
    // accept/reject feedback, not a forced acceptance.
    if (
      tripData.classification === "unclassified" &&
      resolvedEndLat != null &&
      resolvedEndLng != null &&
      hasValidCoords(resolvedStartLat, resolvedStartLng)
    ) {
      learnedSuggestion = await suggestPairClassification({
        userId,
        startLat: resolvedStartLat,
        startLng: resolvedStartLng,
        endLat: resolvedEndLat,
        endLng: resolvedEndLng,
      });

      if (shouldAutoApplySuggestion(learnedSuggestion) && learnedSuggestion) {
        finalClassification = learnedSuggestion.classification as typeof finalClassification;
        if (!finalPlatformTag && learnedSuggestion.platformTag) {
          finalPlatformTag = learnedSuggestion.platformTag;
        }
        if (!finalBusinessPurpose && learnedSuggestion.businessPurpose) {
          finalBusinessPurpose = learnedSuggestion.businessPurpose;
        }
        if (!finalCategory && learnedSuggestion.category) {
          finalCategory = learnedSuggestion.category;
        }
      }
    }

    const isManualEntry = !hasCoordinates;
    const gq = tripData.gpsQuality as
      | { maxSpeedMph?: number | null; lowConfidence?: boolean }
      | null
      | undefined;
    const isPhantomTrip = looksLikePhantomTrip({
      distanceMiles,
      startedAt: tripData.startedAt,
      endedAt: tripData.endedAt,
      isManualEntry,
      coordinateCount: coordinates?.length ?? 0,
      hasRealMovementEvidence: hasRealMovementEvidence(tripData.gpsQuality),
      maxSpeedMph: typeof gq?.maxSpeedMph === "number" ? gq.maxSpeedMph : null,
      lowConfidence: gq?.lowConfidence === true,
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
      businessPurpose: finalBusinessPurpose,
      category: finalCategory,
      notes: tripData.notes ?? null,
      projectLabel: tripData.projectLabel ?? null,
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

      // Referral qualification: if this user was invited and this is their
      // first real trip, the referrer earns a free month. Idempotent + only
      // acts on a pending referral, so it's safe to call on every non-phantom
      // trip (the helper no-ops after the first qualification).
      qualifyReferralOnFirstTrip(userId).catch(() => {});
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
        autoClassifySource:
          learnedSuggestion && finalClassification !== data.classification
            ? "pattern_learning"
            : null,
        learnedSuggestionConfidence: learnedSuggestion?.confidence ?? null,
        learnedSuggestionMatchCount: learnedSuggestion?.matchCount ?? null,
      });
    }

    return reply.status(201).send({
      data: trip,
      // Tell the client whether we auto-applied a learned classification.
      // Mobile uses this to render an undo-able "Auto-classified as Work
      // (5 similar trips)" toast.
      learnedSuggestion: learnedSuggestion
        ? {
            ...learnedSuggestion,
            autoApplied: finalClassification !== data.classification,
          }
        : null,
    });
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

    const [rawData, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        orderBy: { startedAt: "desc" },
        include: {
          vehicle: true,
          // Include lightweight count + polyline presence so the client
          // can render a confidence badge without a per-row round trip.
          _count: { select: { coordinates: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.trip.count({ where }),
    ]);

    // Compute per-trip confidence inline. computeTripConfidence is pure
    // and ~microseconds per call, so doing it for a 100-row page is
    // negligible vs the DB query cost.
    const data = rawData.map((trip) => {
      const durationSecs = trip.endedAt
        ? Math.round((trip.endedAt.getTime() - trip.startedAt.getTime()) / 1000)
        : null;
      const confidence = computeTripConfidence({
        isManualEntry: trip.isManualEntry,
        coordinateCount: trip._count.coordinates,
        hasMatchedPolyline: trip.routePolyline != null,
        distanceMiles: trip.distanceMiles,
        durationSecs,
        hasEndCoords: trip.endLat != null && trip.endLng != null,
        gpsQuality: extractGpsQualityForConfidence(trip.gpsQuality),
      });
      // Strip the nested _count from the response — it's an
      // implementation detail not a public field.
      const { _count, ...rest } = trip;
      void _count;
      return { ...rest, confidence };
    });

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

  // GET /trips/suggest-pair?startLat=&startLng=&endLat=&endLng=
  //
  // Pair-based pattern learning. Looks for previous trips with BOTH
  // endpoints within ~500m of the candidate pair, then returns the
  // modal classification. Higher confidence than the single-point
  // /suggest because a complete A→B pair uniquely identifies a route
  // (single-point matching can't tell "ending at Tesco for shopping"
  // from "ending at Tesco for a delivery dropoff").
  //
  // Used by the trip-form to pre-fill classification when the user
  // sets start + end. Also called server-side during trip create to
  // auto-apply when confidence is high enough (see autoClassifyOnCreate).
  const suggestPairQuery = z.object({
    startLat: z.coerce.number().min(-90).max(90),
    startLng: z.coerce.number().min(-180).max(180),
    endLat: z.coerce.number().min(-90).max(90),
    endLng: z.coerce.number().min(-180).max(180),
  });
  app.get("/suggest-pair", async (request, reply) => {
    const parsed = suggestPairQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const suggestion = await suggestPairClassification({
      userId: request.userId!,
      ...parsed.data,
    });
    return reply.send({ suggestion });
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

    // Per-trip confidence — surfaced as a badge on the mobile detail screen
    // and (eventually) explained on tap. HMRC-defence positioning: every
    // claimed mile becomes auditable with a clear quality signal.
    const durationSecs = trip.endedAt
      ? Math.round((trip.endedAt.getTime() - trip.startedAt.getTime()) / 1000)
      : null;
    const confidence = computeTripConfidence({
      isManualEntry: trip.isManualEntry,
      coordinateCount: trip.coordinates.length,
      hasMatchedPolyline: trip.routePolyline != null,
      distanceMiles: trip.distanceMiles,
      durationSecs,
      hasEndCoords: trip.endLat != null && trip.endLng != null,
      gpsQuality: extractGpsQualityForConfidence(trip.gpsQuality),
    });

    // Merge suggestion: look for an adjacent trip of the same vehicle
    // ending where this one starts (or starting where this one ends)
    // within a 10-minute, 1km tolerance. That's the signature of a
    // single drive that got split by a fuel stop, drive-through, or
    // quick errand. Mobile shows "merge?" banner; user taps → existing
    // /trips/merge endpoint runs.
    let mergeSuggestion: {
      otherTripId: string;
      direction: "before" | "after";
      gapMinutes: number;
      gapMeters: number;
    } | null = null;

    if (trip.endLat != null && trip.endLng != null) {
      // Look for "next trip" — same user + vehicle, starts shortly after
      // this one ends, near this trip's end coords.
      const after = await prisma.trip.findFirst({
        where: {
          userId: request.userId!,
          vehicleId: trip.vehicleId,
          isPhantomTrip: false,
          id: { not: trip.id },
          startedAt: {
            gt: trip.endedAt ?? trip.startedAt,
            lt: new Date((trip.endedAt ?? trip.startedAt).getTime() + 15 * 60 * 1000),
          },
        },
        orderBy: { startedAt: "asc" },
        select: { id: true, startedAt: true, startLat: true, startLng: true },
      });
      if (after) {
        const gapMs = after.startedAt.getTime() - (trip.endedAt ?? trip.startedAt).getTime();
        const gapMinutes = gapMs / 60_000;
        const gapMeters = approximateMeters(
          trip.endLat,
          trip.endLng,
          after.startLat,
          after.startLng
        );
        if (gapMinutes <= 15 && gapMeters <= 1000) {
          mergeSuggestion = {
            otherTripId: after.id,
            direction: "after",
            gapMinutes: Math.round(gapMinutes * 10) / 10,
            gapMeters: Math.round(gapMeters),
          };
        }
      }
    }

    if (!mergeSuggestion) {
      // Look for "previous trip" — ends shortly before this one starts.
      const before = await prisma.trip.findFirst({
        where: {
          userId: request.userId!,
          vehicleId: trip.vehicleId,
          isPhantomTrip: false,
          id: { not: trip.id },
          endedAt: {
            gt: new Date(trip.startedAt.getTime() - 15 * 60 * 1000),
            lt: trip.startedAt,
          },
        },
        orderBy: { endedAt: "desc" },
        select: { id: true, endedAt: true, endLat: true, endLng: true },
      });
      if (before && before.endLat != null && before.endLng != null && before.endedAt) {
        const gapMs = trip.startedAt.getTime() - before.endedAt.getTime();
        const gapMinutes = gapMs / 60_000;
        const gapMeters = approximateMeters(
          before.endLat,
          before.endLng,
          trip.startLat,
          trip.startLng
        );
        if (gapMinutes <= 15 && gapMeters <= 1000) {
          mergeSuggestion = {
            otherTripId: before.id,
            direction: "before",
            gapMinutes: Math.round(gapMinutes * 10) / 10,
            gapMeters: Math.round(gapMeters),
          };
        }
      }
    }

    return reply.send({
      data: { ...trip, insights, matchedCoordinates, confidence, mergeSuggestion },
    });
  });

  // POST /trips/scan-low-confidence — user-initiated bulk recalc.
  // Finds the user's trips with low or medium confidence, re-runs the
  // routing service or map-matcher per trip, returns a summary. Same
  // conservative rules as the admin backfill: never reduces stored
  // distance, plausibility-guards against bad map matches.
  //
  // Designed to be hit from a single-tap "Fix suspicious trips" button
  // in Settings → Tools. Includes a `scanOnly` flag so the client can
  // first surface "we found N trips" + a confirm step before applying.
  const scanSchema = z.object({
    scanOnly: z.boolean().optional(),
    sinceDays: z.number().int().min(1).max(365).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  });
  app.post("/scan-low-confidence", async (request, reply) => {
    const parsed = scanSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { scanOnly = false, sinceDays, limit = 100 } = parsed.data;
    const userId = request.userId!;

    const where = {
      userId,
      isPhantomTrip: false,
      ...(sinceDays
        ? { startedAt: { gte: new Date(Date.now() - sinceDays * 86_400_000) } }
        : {}),
    };

    const trips = await prisma.trip.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit * 3, // over-fetch since most will be filtered as high-confidence
      select: {
        id: true,
        startLat: true,
        startLng: true,
        endLat: true,
        endLng: true,
        distanceMiles: true,
        startedAt: true,
        endedAt: true,
        isManualEntry: true,
        routePolyline: true,
        gpsQuality: true,
        _count: { select: { coordinates: true } },
      },
    });

    // Filter to low/medium-confidence trips with end coords (we can only
    // recalc when there's something to route between).
    const candidates: typeof trips = [];
    for (const t of trips) {
      if (t.endLat == null || t.endLng == null) continue;
      const durationSecs = t.endedAt
        ? Math.round((t.endedAt.getTime() - t.startedAt.getTime()) / 1000)
        : null;
      const c = computeTripConfidence({
        isManualEntry: t.isManualEntry,
        coordinateCount: t._count.coordinates,
        hasMatchedPolyline: t.routePolyline != null,
        distanceMiles: t.distanceMiles,
        durationSecs,
        hasEndCoords: true,
        gpsQuality: extractGpsQualityForConfidence(t.gpsQuality),
      });
      if (c.level === "high") continue;
      candidates.push(t);
      if (candidates.length >= limit) break;
    }

    if (scanOnly) {
      return reply.send({
        data: {
          scanned: trips.length,
          candidateCount: candidates.length,
          applied: 0,
          improved: 0,
        },
      });
    }

    // Apply the same logic as the admin backfill, scoped to this user.
    let improved = 0;
    let totalMilesGained = 0;
    let polylinesAdded = 0;

    for (const t of candidates) {
      if (t.endLat == null || t.endLng == null) continue;
      let polyline: string | null = null;
      let newMiles: number | null = null;

      // Tracked trip with breadcrumbs → map-match
      if (t._count.coordinates >= 10) {
        const coords = await prisma.tripCoordinate.findMany({
          where: { tripId: t.id },
          orderBy: { recordedAt: "asc" },
          select: { lat: true, lng: true, accuracy: true, recordedAt: true },
        });
        const result = await matchTripRoute(coords);
        if (result && isMatchPlausible(result.distanceMiles, t.distanceMiles)) {
          polyline = result.encodedPolyline;
          if (result.distanceMiles > t.distanceMiles * 1.05) {
            newMiles = result.distanceMiles;
          }
        }
      }

      // Falls back to routing service for manual or low-breadcrumb trips
      if (newMiles === null && polyline === null) {
        const route = await resolveRouteDistance({
          startLat: t.startLat,
          startLng: t.startLng,
          endLat: t.endLat,
          endLng: t.endLng,
          userId,
        });
        if (route && route.distanceMiles > t.distanceMiles * 1.05) {
          newMiles = route.distanceMiles;
        }
      }

      if (newMiles === null && polyline === null) continue;

      await prisma.trip.update({
        where: { id: t.id },
        data: {
          ...(newMiles !== null ? { distanceMiles: newMiles } : {}),
          ...(polyline !== null ? { routePolyline: polyline } : {}),
        },
      });

      if (newMiles !== null) {
        const gained = newMiles - t.distanceMiles;
        totalMilesGained += gained;
        logEvent("trip.distance_recalculated", userId, {
          tripId: t.id,
          oldMiles: t.distanceMiles,
          newMiles,
          ratio: Math.round((newMiles / t.distanceMiles) * 100) / 100,
          source: polyline ? "map_match" : "routing",
          triggeredBy: "user_bulk_scan",
        });
      }
      if (polyline !== null) polylinesAdded += 1;
      improved += 1;
    }

    if (totalMilesGained > 0) {
      // Refresh MileageSummary for current tax year so the user's Tax
      // Readiness card immediately reflects the recovered miles.
      upsertMileageSummary(userId, getTaxYear(new Date())).catch(() => {});
    }

    return reply.send({
      data: {
        scanned: trips.length,
        candidateCount: candidates.length,
        applied: candidates.length,
        improved,
        totalMilesGained: Math.round(totalMilesGained * 100) / 100,
        polylinesAdded,
      },
    });
  });

  // POST /trips/:id/recalc — user-initiated re-routing of a single trip.
  // Runs the routing service against the trip's start/end (manual trips)
  // OR runs map-matching against its breadcrumbs (tracked trips), updates
  // distance + polyline accordingly, and returns the updated trip.
  //
  // Used by the "Recalculate distance" button on the trip detail screen.
  // Self-service fix for any trip the user thinks shows the wrong number,
  // without admin involvement. Same conservative rules as the backfill
  // scripts: never reduces distance, never overwrites with implausible
  // map-match results.
  app.post("/:id/recalc", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const userId = request.userId!;

    const trip = await prisma.trip.findFirst({
      where: { id, userId, isPhantomTrip: false },
      include: {
        coordinates: { orderBy: { recordedAt: "asc" } },
      },
    });
    if (!trip) {
      return reply.status(404).send({ error: "Trip not found" });
    }

    const oldMiles = trip.distanceMiles;
    let newMiles: number | null = null;
    let newPolyline: string | null = null;
    let source: "routing" | "map_match" | null = null;

    // Tracked trip with breadcrumbs → map-match.
    if (trip.coordinates.length >= 10) {
      const result = await matchTripRoute(
        trip.coordinates.map((c) => ({
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          recordedAt: c.recordedAt,
        }))
      );

      if (result && isMatchPlausible(result.distanceMiles, oldMiles)) {
        newPolyline = result.encodedPolyline;
        if (result.distanceMiles > oldMiles * 1.05) {
          newMiles = result.distanceMiles;
        }
        source = "map_match";
      }
    }

    // Manual trip OR tracked trip the matcher couldn't help with → run
    // the routing service against the start/end coords.
    if (newMiles === null && trip.endLat != null && trip.endLng != null) {
      const route = await resolveRouteDistance({
        startLat: trip.startLat,
        startLng: trip.startLng,
        endLat: trip.endLat,
        endLng: trip.endLng,
        userId,
      });
      if (route && route.distanceMiles > oldMiles * 1.05) {
        newMiles = route.distanceMiles;
        source = source ?? "routing";
      }
    }

    if (newMiles === null && newPolyline === null) {
      // Nothing changed — tell the client so it can show "Already accurate".
      return reply.send({
        data: {
          changed: false,
          oldMiles,
          newMiles: oldMiles,
          source: null,
        },
      });
    }

    const updated = await prisma.trip.update({
      where: { id },
      data: {
        ...(newMiles !== null ? { distanceMiles: newMiles } : {}),
        ...(newPolyline !== null ? { routePolyline: newPolyline } : {}),
      },
      include: { vehicle: true, shift: true, coordinates: { orderBy: { recordedAt: "asc" } } },
    });

    if (newMiles !== null) {
      logEvent("trip.distance_recalculated", userId, {
        tripId: id,
        oldMiles,
        newMiles,
        ratio: Math.round((newMiles / oldMiles) * 100) / 100,
        source: source ?? "routing",
        triggeredBy: "user_recalc",
      });
      // Refresh the user's MileageSummary for the trip's tax year so
      // their Tax Readiness card reflects the corrected total.
      upsertMileageSummary(userId, getTaxYear(trip.startedAt)).catch(() => {});
    }

    let matchedCoordinates: { lat: number; lng: number }[] | null = null;
    if (updated.routePolyline) {
      try {
        matchedCoordinates = decodePolyline(updated.routePolyline);
        if (matchedCoordinates.length === 0) matchedCoordinates = null;
      } catch {
        matchedCoordinates = null;
      }
    }

    return reply.send({
      data: {
        changed: true,
        oldMiles,
        newMiles: newMiles ?? oldMiles,
        source,
        trip: { ...updated, matchedCoordinates },
      },
    });
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

    // Vehicle correction: if reassigning to a vehicle, it must belong to this
    // user (never let a trip be tagged with someone else's vehicle).
    if (updates.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: updates.vehicleId, userId },
        select: { id: true },
      });
      if (!vehicle) {
        return reply.status(400).send({ error: "Vehicle not found" });
      }
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
 * Suggest a classification for a candidate (start, end) coordinate pair
 * by finding previous trips of this user with BOTH endpoints within
 * ~500m of the candidate. Returns null when there's not enough history,
 * or when no single classification has majority support.
 *
 * 500m radius is forgiving enough that the same A→B route always hits
 * even with GPS jitter, but tight enough that "Tesco shopping" doesn't
 * blend into "Tesco delivery dropoff" — those are usually different
 * physical doors.
 */
export interface PairSuggestion {
  classification: string;
  platformTag: string | null;
  businessPurpose: string | null;
  category: string | null;
  matchCount: number;
  /** Integer 0-100 — share of nearby trips that agree on classification. */
  confidence: number;
}

export async function suggestPairClassification(args: {
  userId: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}): Promise<PairSuggestion | null> {
  const { userId, startLat, startLng, endLat, endLng } = args;

  // ~500m bounding box at UK latitudes
  const startLatDelta = 0.0045;
  const startLngDelta = 0.0045 / Math.cos((startLat * Math.PI) / 180);
  const endLatDelta = 0.0045;
  const endLngDelta = 0.0045 / Math.cos((endLat * Math.PI) / 180);

  const nearby = await prisma.trip.findMany({
    where: {
      userId,
      isPhantomTrip: false,
      classification: { not: "unclassified" },
      startLat: { gte: startLat - startLatDelta, lte: startLat + startLatDelta },
      startLng: { gte: startLng - startLngDelta, lte: startLng + startLngDelta },
      endLat: { gte: endLat - endLatDelta, lte: endLat + endLatDelta },
      endLng: { gte: endLng - endLngDelta, lte: endLng + endLngDelta },
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

  if (nearby.length < 3) return null;

  const counts: Record<string, number> = {};
  for (const t of nearby) {
    counts[t.classification] = (counts[t.classification] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const confidence = top[1] / nearby.length;
  if (confidence < 0.6) return null;

  const matching = nearby.filter((t) => t.classification === top[0]);

  const modeOf = <K extends keyof typeof matching[number]>(key: K): string | null => {
    const c: Record<string, number> = {};
    for (const t of matching) {
      const v = t[key];
      if (typeof v === "string" && v.length > 0) c[v] = (c[v] ?? 0) + 1;
    }
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  };

  return {
    classification: top[0],
    platformTag: modeOf("platformTag"),
    businessPurpose: modeOf("businessPurpose"),
    category: modeOf("category"),
    matchCount: nearby.length,
    confidence: Math.round(confidence * 100),
  };
}

/**
 * Threshold above which we silently auto-apply a learned classification
 * to a brand-new trip. Below this, the suggestion is just a hint to the
 * client UI. Conservative — we'd rather under-apply than wrongly tag a
 * personal trip as work for HMRC purposes.
 */
const AUTO_APPLY_CONFIDENCE_PCT = 80;
const AUTO_APPLY_MIN_MATCHES = 3;

export function shouldAutoApplySuggestion(s: PairSuggestion | null): boolean {
  if (!s) return false;
  return s.confidence >= AUTO_APPLY_CONFIDENCE_PCT && s.matchCount >= AUTO_APPLY_MIN_MATCHES;
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

  // Plausibility gate: skip the match entirely if the matched distance is
  // wildly off the stored value. GraphHopper occasionally takes a shortcut
  // through a junction loop or gets thrown by a mid-trip GPS gap; we don't
  // want to overwrite the polyline with a route that doesn't represent the
  // actual trip.
  if (!isMatchPlausible(result.distanceMiles, args.currentDistanceMiles)) {
    logEvent("trip.map_match_skipped_implausible", args.userId, {
      tripId: args.tripId,
      currentDistanceMiles: args.currentDistanceMiles,
      matchedDistanceMiles: result.distanceMiles,
      ratio: Math.round((result.distanceMiles / args.currentDistanceMiles) * 100) / 100,
    });
    return;
  }

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

/**
 * Approximate distance in metres between two coordinates using a
 * spherical-earth formula. Cheaper than full haversine and fine at
 * the small distances we use it for (merge-suggestion proximity check
 * — never need accuracy beyond a few hundred metres).
 */
function approximateMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Pull just the fields the confidence calculator cares about out of the
 * gpsQuality JSON blob (the schema is loose because mobile evolves it
 * without server-side migrations). Returns null on any malformed shape.
 */
function extractGpsQualityForConfidence(
  raw: unknown
): { avgAccuracyMeters?: number; rawCount?: number; keptCount?: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: { avgAccuracyMeters?: number; rawCount?: number; keptCount?: number } = {};
  if (typeof r.avgAccuracyMeters === "number") out.avgAccuracyMeters = r.avgAccuracyMeters;
  if (typeof r.avgAccuracyM === "number") out.avgAccuracyMeters = r.avgAccuracyM;
  if (typeof r.rawCount === "number") out.rawCount = r.rawCount;
  if (typeof r.keptCount === "number") out.keptCount = r.keptCount;
  return out;
}
