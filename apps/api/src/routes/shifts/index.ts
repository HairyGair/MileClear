import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { attachIdempotency } from "../../middleware/idempotency.js";
import { prisma } from "../../lib/prisma.js";
import { SHIFT_STATUSES, getTaxYear, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@mileclear/shared";
import { upsertMileageSummary } from "../../services/mileage.js";
import { checkAndAwardAchievements, getShiftScorecard } from "../../services/gamification.js";
import { sendShiftSummaryPush, sendAchievementPush } from "../../jobs/notifications.js";
import { logEvent } from "../../services/appEvents.js";
import {
  clusterTripsIntoSessions,
  SHIFT_SUGGESTION_SCAN_DAYS,
  SHIFT_SUGGESTION_MAX_RESULTS,
  type ShiftSuggestionTripInput,
} from "../../services/shiftSuggestions.js";

const startShiftSchema = z.object({
  vehicleId: z.string().uuid().optional(),
});

const endShiftSchema = z.object({
  status: z.literal("completed"),
});

export async function shiftRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  attachIdempotency(app);

  // Start a new shift
  app.post("/", async (request, reply) => {
    const parsed = startShiftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const { vehicleId } = parsed.data;

    // Verify vehicle ownership if provided
    if (vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, userId },
      });
      if (!vehicle) {
        return reply.status(404).send({ error: "Vehicle not found" });
      }
    }

    // Enforce one active shift at a time
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: "active" },
    });
    if (activeShift) {
      return reply.status(400).send({ error: "You already have an active shift" });
    }

    const shift = await prisma.shift.create({
      data: {
        userId,
        vehicleId: vehicleId ?? null,
        startedAt: new Date(),
        status: "active",
      },
      include: { vehicle: true },
    });

    logEvent("shift.started", userId, { vehicleId: vehicleId ?? null });

    return reply.status(201).send({ data: shift });
  });

  // List shifts
  const listShiftsQuery = z.object({
    status: z.enum(SHIFT_STATUSES).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  });

  app.get("/", async (request, reply) => {
    const parsed = listShiftsQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { status, page, pageSize } = parsed.data;
    const where: { userId: string; status?: string } = {
      userId: request.userId!,
    };

    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        orderBy: { startedAt: "desc" },
        include: {
          vehicle: true,
          _count: { select: { trips: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.shift.count({ where }),
    ]);

    // Aggregate trip miles per shift
    const shiftIds = data.map((s) => s.id);
    const tripAggregates = shiftIds.length > 0
      ? await prisma.trip.groupBy({
          by: ["shiftId"],
          where: { shiftId: { in: shiftIds } },
          _sum: { distanceMiles: true },
        })
      : [];
    const milesByShift = new Map(
      tripAggregates.map((a) => [a.shiftId, a._sum.distanceMiles ?? 0])
    );

    const enriched = data.map((s) => ({
      ...s,
      tripCount: s._count.trips,
      tripMiles: milesByShift.get(s.id) ?? 0,
      _count: undefined,
    }));

    return reply.send({
      data: enriched,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  // Get single shift
  app.get("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const shift = await prisma.shift.findFirst({
      where: { id, userId: request.userId! },
      include: { vehicle: true },
    });

    if (!shift) {
      return reply.status(404).send({ error: "Shift not found" });
    }

    return reply.send({ data: shift });
  });

  // End a shift
  app.patch("/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsed = endShiftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const shift = await prisma.shift.findFirst({
      where: { id, userId: request.userId! },
    });

    if (!shift) {
      return reply.status(404).send({ error: "Shift not found" });
    }

    if (shift.status === "completed") {
      return reply.status(400).send({ error: "Shift is already completed" });
    }

    const updated = await prisma.shift.update({
      where: { id },
      data: {
        status: "completed",
        endedAt: new Date(),
      },
      include: { vehicle: true },
    });

    const scorecard = await afterShiftCompleted(request.userId!, id, shift.startedAt, {
      summaryPush: true,
    });

    logEvent("shift.completed", request.userId!, {
      durationSeconds: scorecard?.durationSeconds,
      tripCount: scorecard?.tripsCompleted,
    });

    return reply.send({ data: updated, scorecard });
  });

  // ── Shift suggestions ─────────────────────────────────────────────
  //
  // Only 152 of the 626 drivers active in the last 30 days (15 Sep 2026)
  // ever pressed Start Shift, so the scorecard and everything built on
  // shifts sat unused for the rest. Their trips already cluster into
  // obvious sessions; this scans the last two weeks, offers each session as
  // a shift, and on accept creates the completed shift and grades it the
  // same way the normal end-shift path does. Same persistence pattern as
  // GET /trips/missed-journeys: create-if-missing with an empty update so a
  // decided row is never resurrected, then prune 'proposed' rows whose key
  // is no longer a candidate.

  app.get("/suggestions", async (request, reply) => {
    const userId = request.userId!;
    const since = new Date(Date.now() - SHIFT_SUGGESTION_SCAN_DAYS * 24 * 60 * 60 * 1000);
    const trips: ShiftSuggestionTripInput[] = await prisma.trip.findMany({
      where: { userId, isPhantomTrip: false, startedAt: { gte: since } },
      orderBy: { startedAt: "asc" },
      select: {
        id: true, startedAt: true, endedAt: true, distanceMiles: true,
        classification: true, platformTag: true, shiftId: true, isManualEntry: true,
      },
    });

    const candidates = clusterTripsIntoSessions(trips);
    const candidateKeys = candidates.map((c) => c.key);
    for (const c of candidates) {
      await prisma.shiftSuggestion.upsert({
        where: { userId_key: { userId, key: c.key } },
        create: {
          userId,
          key: c.key,
          status: "proposed",
          startedAt: c.startedAt,
          endedAt: c.endedAt,
          tripCount: c.tripCount,
          totalMiles: c.totalMiles,
          platformTag: c.platformTag,
          tripIdsJson: c.tripIds,
        },
        update: {},
      });
    }
    await prisma.shiftSuggestion.deleteMany({
      where: {
        userId,
        status: "proposed",
        key: { notIn: candidateKeys.length ? candidateKeys : ["__none__"] },
      },
    });

    const open = await prisma.shiftSuggestion.findMany({
      where: { userId, status: "proposed" },
      orderBy: { endedAt: "desc" },
      take: SHIFT_SUGGESTION_MAX_RESULTS,
    });
    return reply.send({
      suggestions: open.map((s) => ({
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt.toISOString(),
        tripCount: s.tripCount,
        totalMiles: s.totalMiles,
        platformTag: s.platformTag,
      })),
    });
  });

  const suggestionActionSchema = z.object({
    action: z.enum(["accept", "dismiss"]),
  });

  app.post("/suggestions/:id/resolve", async (request, reply) => {
    const userId = request.userId!;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsed = suggestionActionSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "Invalid action" });

    const suggestion = await prisma.shiftSuggestion.findFirst({ where: { id, userId } });
    if (!suggestion) return reply.status(404).send({ error: "Not found" });
    if (suggestion.status !== "proposed") {
      return reply.send({ ok: true, skipped: "already_handled" });
    }

    if (parsed.data.action === "dismiss") {
      await prisma.shiftSuggestion.update({
        where: { id },
        data: { status: "dismissed", decidedAt: new Date() },
      });
      logEvent("shift.suggestion_dismissed", userId, {
        tripCount: suggestion.tripCount,
        totalMiles: suggestion.totalMiles,
      });
      return reply.send({ ok: true });
    }

    const tripIds = Array.isArray(suggestion.tripIdsJson)
      ? (suggestion.tripIdsJson as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    // Only trips the driver still owns and that have not joined another
    // shift since the scan. If none are left, there is nothing to grade.
    const attachable = await prisma.trip.findMany({
      where: { id: { in: tripIds }, userId, shiftId: null },
      select: { id: true, vehicleId: true },
    });
    if (attachable.length === 0) {
      await prisma.shiftSuggestion.update({
        where: { id },
        data: { status: "dismissed", decidedAt: new Date() },
      });
      return reply.status(409).send({ error: "Those trips are no longer available" });
    }

    // The shift takes the vehicle most of its trips were driven in.
    const vehicleCounts = new Map<string, number>();
    for (const t of attachable) {
      if (t.vehicleId) vehicleCounts.set(t.vehicleId, (vehicleCounts.get(t.vehicleId) ?? 0) + 1);
    }
    let vehicleId: string | null = null;
    let vehicleBest = 0;
    for (const [vid, n] of vehicleCounts) {
      if (n > vehicleBest) { vehicleId = vid; vehicleBest = n; }
    }

    const shift = await prisma.$transaction(async (tx) => {
      const created = await tx.shift.create({
        data: {
          userId,
          vehicleId,
          startedAt: suggestion.startedAt,
          endedAt: suggestion.endedAt,
          status: "completed",
        },
      });
      await tx.trip.updateMany({
        where: { id: { in: attachable.map((t) => t.id) }, userId, shiftId: null },
        data: { shiftId: created.id },
      });
      await tx.shiftSuggestion.update({
        where: { id },
        data: { status: "accepted", decidedAt: new Date() },
      });
      return created;
    });

    // The driver is in the app tapping "Grade it", so the scorecard comes
    // back in the response; a "your shift is done" push on top would be
    // noise. Achievement pushes still go out as they do on a normal end.
    const scorecard = await afterShiftCompleted(userId, shift.id, shift.startedAt, {
      summaryPush: false,
    });

    logEvent("shift.suggestion_accepted", userId, {
      tripCount: attachable.length,
      totalMiles: suggestion.totalMiles,
    });

    return reply.send({ ok: true, shiftId: shift.id, scorecard });
  });
}

/**
 * Everything that happens once a shift is marked completed, shared by the
 * normal end-shift path and an accepted shift suggestion: refresh the tax
 * year's mileage summary, award any achievements, build the scorecard, and
 * send the pushes. Each step is best-effort so a failure never blocks the
 * response.
 */
async function afterShiftCompleted(
  userId: string,
  shiftId: string,
  startedAt: Date,
  opts: { summaryPush: boolean }
) {
  const taxYear = getTaxYear(startedAt);
  await upsertMileageSummary(userId, taxYear).catch(() => {});
  const newAchievements = await checkAndAwardAchievements(userId).catch(() => [] as never[]);

  const scorecard = await getShiftScorecard(userId, shiftId).catch(() => null);

  if (scorecard && opts.summaryPush) {
    sendShiftSummaryPush(userId, {
      tripsCompleted: scorecard.tripsCompleted,
      totalMiles: scorecard.totalMiles,
      deductionPence: scorecard.deductionPence,
      durationSeconds: scorecard.durationSeconds,
    }).catch(() => {});
  }
  if (newAchievements && newAchievements.length > 0) {
    sendAchievementPush(userId, newAchievements).catch(() => {});
  }

  return scorecard;
}
