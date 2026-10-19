import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { attachIdempotency } from "../../middleware/idempotency.js";
import { prisma } from "../../lib/prisma.js";
import {
  SHIFT_STATUSES,
  PLATFORM_TAGS,
  getTaxYear,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAST_SHIFT_MAX_TRIPS,
  PAST_SHIFT_MAX_DROPS,
  TYPED_TOTAL_DISTANCE_SOURCE,
  pastShiftProblem,
  pastShiftMilesProblem,
  pastShiftTotalsProblem,
  typedTotalNote,
  clampedTripEnd,
  isSamePastShift,
  resolveRecordedBy,
} from "@mileclear/shared";
import { resolveRouteDistance } from "../../services/routing.js";
import { upsertMileageSummary } from "../../services/mileage.js";
import { checkAndAwardAchievements, getShiftScorecard } from "../../services/gamification.js";
import { sendShiftSummaryPush, sendAchievementPush, sendMilestonePush } from "../../jobs/notifications.js";
import { logEvent } from "../../services/appEvents.js";
import { withKeyLock } from "../../lib/keyedLock.js";
import { defaultVehicleIdForUser } from "../../services/vehicleDefaults.js";
import { advanceLastTripAt } from "../../services/userActivity.js";
import { findDuplicateCandidate } from "../../services/tripDuplicates.js";
import {
  resolveManualTripPlaces,
  hasValidCoords,
  attachManualRoutePolyline,
  backfillTripAddresses,
  loadDuplicateNeighbours,
} from "../../services/manualTripPlaces.js";
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

// A trip in a past shift: typed in, so it has both ends and no breadcrumbs.
// The miles are the app's road figure when it had one; without them the
// server works them out exactly as it does for one typed trip.
const pastShiftTripSchema = z.object({
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
  startAddress: z.string().max(500).optional(),
  endAddress: z.string().max(500).optional(),
  distanceMiles: z.number().nonnegative().max(2000, "Distance exceeds reasonable limit").optional(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().optional(),
  platformTag: z.enum(PLATFORM_TAGS).optional(),
});

// "Just the totals" (Lucian, 19 Oct 2026): the shift's typed total miles,
// how many drops, and where it started and finished, instead of each trip.
// Saved as one Business trip spanning the shift with exactly these miles.
const pastShiftTotalsSchema = z.object({
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
  startAddress: z.string().max(500).optional(),
  endAddress: z.string().max(500).optional(),
  distanceMiles: z.number({
    required_error: "Add the total miles for the shift.",
    invalid_type_error: "Add the total miles for the shift.",
  }),
  drops: z.number({ invalid_type_error: dropsMessage() }).optional(),
  platformTag: z.enum(PLATFORM_TAGS).optional(),
});

function dropsMessage(): string {
  return `The number of drops must be a whole number from 1 to ${PAST_SHIFT_MAX_DROPS}.`;
}

// Today's app sends `trips`; an app with "Just the totals" sends `totals`
// instead. Exactly one of the two.
const pastShiftSchema = z
  .object({
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date(),
    vehicleId: z.string().uuid().optional(),
    trips: z.array(pastShiftTripSchema).min(1, "Add at least one trip.").max(PAST_SHIFT_MAX_TRIPS).optional(),
    totals: pastShiftTotalsSchema.optional(),
    earning: z
      .object({
        platform: z.enum(PLATFORM_TAGS),
        amountPence: z.number().int().positive("Amount must be positive").max(10_000_000),
      })
      .optional(),
  })
  .superRefine((b, ctx) => {
    if (b.trips && b.totals) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Send the trips or the totals, not both.", path: ["totals"] });
    } else if (!b.trips && !b.totals) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Add at least one trip.", path: ["trips"] });
    }
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

  // ── Add a past shift ──────────────────────────────────────────────
  //
  // A driver asked (Oct 2026) to add a whole earlier work session in one go
  // instead of typing each trip on its own. One request carries the shift's
  // times, every trip in it and, optionally, what it earned. The shift, its
  // trips and the earning are written in one transaction, so a failure
  // leaves nothing half saved. Each trip gets what a typed trip gets on
  // POST /trips (pins from addresses, road miles, route line, names,
  // possible-double mark, events) through services/manualTripPlaces.ts, and
  // the shift gets what an ended shift gets (afterShiftCompleted below).
  // Shift trips are work, so every trip is saved as Business.
  const addPastShift = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = pastShiftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const body = parsed.data;

    // Just the totals: one trip from where the shift started to where it
    // finished, across the whole shift, with the typed miles. From here on
    // it goes through the same steps as a shift entered trip by trip, except
    // where marked: its miles are never looked up, checked against a route
    // or a straight line, or replaced (start and finish are often the same
    // place, so either would read 0).
    const totals = body.totals ?? null;
    const inputTrips: Array<z.infer<typeof pastShiftTripSchema>> = totals
      ? [
          {
            startLat: totals.startLat,
            startLng: totals.startLng,
            endLat: totals.endLat,
            endLng: totals.endLng,
            startAddress: totals.startAddress,
            endAddress: totals.endAddress,
            distanceMiles: totals.distanceMiles,
            startedAt: body.startedAt,
            endedAt: body.endedAt,
            platformTag: totals.platformTag,
          },
        ]
      : body.trips!;

    const problem = totals
      ? pastShiftTotalsProblem({
          startedAt: body.startedAt,
          endedAt: body.endedAt,
          distanceMiles: totals.distanceMiles,
          drops: totals.drops ?? null,
          now: Date.now(),
        })
      : pastShiftProblem({
          startedAt: body.startedAt,
          endedAt: body.endedAt,
          trips: inputTrips,
          now: Date.now(),
        });
    if (problem) {
      return reply.status(400).send({ error: problem });
    }

    if (body.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: body.vehicleId, userId },
      });
      if (!vehicle) {
        return reply.status(404).send({ error: "Vehicle not found" });
      }
    }
    const vehicleId = body.vehicleId ?? (await defaultVehicleIdForUser(userId));

    // Shifts already saved that overlap this one, the running one included.
    // Two shifts over the same hours would count the same work twice, so
    // this is refused, with one exception: the same save sent again (a retry
    // after the answer was lost), which is answered with what was saved. A
    // save with the same times but different trips or earnings is a
    // different save and is refused like any other overlap, never merged.
    const overlapping = await prisma.shift.findMany({
      where: {
        userId,
        startedAt: { lt: body.endedAt },
        OR: [{ endedAt: null }, { endedAt: { gt: body.startedAt } }],
      },
      include: { vehicle: true },
      orderBy: { startedAt: "asc" },
    });
    if (overlapping.length > 0) {
      const same = overlapping.find(
        (s) =>
          s.status === "completed" &&
          s.startedAt.getTime() === body.startedAt.getTime() &&
          s.endedAt?.getTime() === body.endedAt.getTime()
      );
      if (same) {
        const [savedTrips, savedEarning] = await Promise.all([
          prisma.trip.findMany({ where: { userId, shiftId: same.id }, orderBy: { startedAt: "asc" } }),
          prisma.earning.findFirst({
            where: { userId, source: "manual", periodStart: same.startedAt, periodEnd: same.endedAt! },
          }),
        ]);
        const repeat =
          isSamePastShift(
            {
              trips: savedTrips,
              earning: savedEarning ? { platform: savedEarning.platform, amountPence: savedEarning.amountPence } : null,
            },
            { trips: inputTrips, earning: body.earning ?? null }
          ) &&
          // A total is its miles: the same hours with different miles is a
          // different save, refused below like any other overlap.
          (!totals || Math.abs(savedTrips[0].distanceMiles - totals.distanceMiles) < 0.005);
        if (repeat) {
          logEvent("shift.past_add_repeated", userId, { shiftId: same.id, tripCount: savedTrips.length });
          return reply.send({ data: same, trips: savedTrips, earning: savedEarning, scorecard: null, duplicate: true });
        }
      }
      const clash = same ?? overlapping[0];
      logEvent("shift.past_add_overlap_refused", userId, {
        existingShiftId: clash.id,
        existingActive: clash.status === "active",
        sameTimes: Boolean(same),
      });
      return reply.status(409).send({ error: shiftClashMessage(clash), existingShiftId: clash.id });
    }

    // Pins and miles first: they can call out to geocoders and routers,
    // which must never run inside the transaction.
    // A total's miles are given, so this only looks up a pin from its address.
    const places: Array<Awaited<ReturnType<typeof resolveManualTripPlaces>>> = [];
    for (const t of inputTrips) {
      const p = await resolveManualTripPlaces({
        userId,
        startLat: t.startLat,
        startLng: t.startLng,
        endLat: t.endLat,
        endLng: t.endLng,
        startAddress: t.startAddress,
        endAddress: t.endAddress,
        distanceMiles: t.distanceMiles,
      });
      places.push(totals ? { ...p, distanceMiles: totals.distanceMiles } : p);
    }
    // Checked again here: miles the server worked out count too. A total
    // was checked against its own cap above, with its own words.
    const milesProblem = totals ? null : pastShiftMilesProblem(places.map((p) => p.distanceMiles));
    if (milesProblem) {
      return reply.status(400).send({ error: milesProblem });
    }

    // A trip sent without an end gets one here, from its route, held inside
    // the shift and before now. Left empty, the route-line hook would fill it
    // later with no regard for the shift's end.
    const tripEnds: Date[] = [];
    for (let i = 0; i < inputTrips.length; i++) {
      const t = inputTrips[i];
      if (t.endedAt) {
        tripEnds.push(t.endedAt);
        continue;
      }
      const p = places[i];
      let routedSecs: number | null = null;
      if (p.endLat != null && p.endLng != null && hasValidCoords(p.startLat, p.startLng) && hasValidCoords(p.endLat, p.endLng)) {
        const route = await resolveRouteDistance({
          startLat: p.startLat,
          startLng: p.startLng,
          endLat: p.endLat,
          endLng: p.endLng,
          userId,
        }).catch(() => null);
        routedSecs = route?.durationSecs ?? null;
      }
      tripEnds.push(clampedTripEnd({ startedAt: t.startedAt, routedSecs, shiftEnd: body.endedAt, now: Date.now() }));
    }

    const saved = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({
        data: {
          userId,
          vehicleId,
          startedAt: body.startedAt,
          endedAt: body.endedAt,
          status: "completed",
        },
        include: { vehicle: true },
      });
      const trips = [];
      for (let i = 0; i < inputTrips.length; i++) {
        const t = inputTrips[i];
        const p = places[i];
        trips.push(
          await tx.trip.create({
            data: {
              userId,
              shiftId: shift.id,
              vehicleId,
              startLat: p.startLat,
              startLng: p.startLng,
              endLat: p.endLat,
              endLng: p.endLng,
              startAddress: t.startAddress ?? null,
              endAddress: t.endAddress ?? null,
              distanceMiles: p.distanceMiles,
              startedAt: t.startedAt,
              endedAt: tripEnds[i],
              isManualEntry: true,
              isPhantomTrip: false,
              classification: "business",
              platformTag: t.platformTag ?? null,
              recordedBy: resolveRecordedBy(null, true),
              // A typed total says so twice: in words for the driver, and in
              // gpsQuality where every reroute and recalculation path checks
              // (isTypedTotalTrip) and steps aside.
              ...(totals
                ? {
                    notes: typedTotalNote(totals.drops ?? null),
                    gpsQuality: { distanceSource: TYPED_TOTAL_DISTANCE_SOURCE, drops: totals.drops ?? null },
                  }
                : {}),
            },
          })
        );
      }
      const earning = body.earning
        ? await tx.earning.create({
            data: {
              userId,
              platform: body.earning.platform,
              amountPence: body.earning.amountPence,
              periodStart: body.startedAt,
              periodEnd: body.endedAt,
              source: "manual",
            },
          })
        : null;
      return { shift, trips, earning };
    });

    const { shift, earning } = saved;
    const trips = saved.trips;
    const newIds = new Set(trips.map((t) => t.id));

    for (let i = 0; i < trips.length; i++) {
      const trip = trips[i];
      const p = places[i];

      // Route line for the map (and an end time from the route when none
      // was given), exactly as for one typed trip. Fire-and-forget. Not for
      // a total: a road route from start to finish is not where the shift
      // went, and home to home it would be no line at all.
      if (!totals && p.endLat != null && p.endLng != null && hasValidCoords(p.startLat, p.startLng) && hasValidCoords(p.endLat, p.endLng)) {
        attachManualRoutePolyline({
          tripId: trip.id,
          startLat: p.startLat,
          startLng: p.startLng,
          endLat: p.endLat,
          endLng: p.endLng,
          userId,
        }).catch(() => {});
      }

      // Possible double-count against trips already saved (POST /trips does
      // the same). The shift's own trips are left out: they follow on from
      // each other and are never the same journey. Not for a total either:
      // it spans the whole shift, so every trip in those hours would match
      // on time, and Join would fold the typed total into a recording and
      // lose its mark. The app warns about trips in those hours before
      // saving instead.
      if (!totals && trip.endedAt) {
        try {
          const neighbours = (await loadDuplicateNeighbours(userId, trip)).filter((n) => !newIds.has(n.id));
          const duplicateOf = findDuplicateCandidate(trip, neighbours);
          if (duplicateOf) {
            trips[i] = await prisma.trip.update({
              where: { id: trip.id },
              data: { possibleDuplicateOfId: duplicateOf.id },
            });
            logEvent("trip.possible_duplicate", userId, {
              tripId: trip.id,
              ofTripId: duplicateOf.id,
              newIsManual: true,
            });
          }
        } catch (err) {
          request.log.warn({ err, tripId: trip.id }, "possible-duplicate check failed");
        }
      }

      backfillTripAddresses({
        tripId: trip.id,
        userId,
        startLat: p.startLat,
        startLng: p.startLng,
        endLat: p.endLat,
        endLng: p.endLng,
        hasStart: Boolean(inputTrips[i].startAddress),
        hasEnd: Boolean(inputTrips[i].endAddress),
      }).catch(() => {});

      logEvent("trip.created", userId, {
        distanceMiles: trip.distanceMiles,
        classification: "business",
        isManualEntry: true,
        platformTag: trip.platformTag,
        autoClassified: false,
        source: totals ? "past_shift_totals" : "past_shift",
      });
    }

    if (earning) {
      logEvent("earnings.created", userId, {
        platform: earning.platform,
        amountPence: earning.amountPence,
        source: "manual",
        from: "past_shift",
      });
    }

    // Tax years the trips fall in, beyond the shift's own (which
    // afterShiftCompleted refreshes): a shift over 5 April midnight.
    const shiftTaxYear = getTaxYear(shift.startedAt);
    const otherTaxYears = new Set(trips.map((t) => getTaxYear(t.startedAt)).filter((y) => y !== shiftTaxYear));
    for (const y of otherTaxYears) {
      await upsertMileageSummary(userId, y).catch(() => {});
    }
    const latestStart = trips.reduce((m, t) => (t.startedAt > m ? t.startedAt : m), trips[0].startedAt);
    advanceLastTripAt(userId, latestStart).catch(() => {});

    // The driver is on the form waiting, so the scorecard comes back in the
    // response and no "shift done" push goes out.
    const scorecard = await afterShiftCompleted(userId, shift.id, shift.startedAt, {
      summaryPush: false,
    });
    sendMilestonePush(userId).catch(() => {});

    const totalMiles = Math.round(trips.reduce((sum, t) => sum + t.distanceMiles, 0) * 100) / 100;
    logEvent("shift.past_added", userId, {
      shiftId: shift.id,
      tripCount: trips.length,
      totalMiles,
      durationSeconds: Math.round((shift.endedAt!.getTime() - shift.startedAt.getTime()) / 1000),
      hasEarning: Boolean(earning),
      fromTotals: Boolean(totals),
      ...(totals ? { drops: totals.drops ?? null } : {}),
      daysBack: Math.floor((Date.now() - shift.startedAt.getTime()) / (24 * 60 * 60 * 1000)),
    });

    return reply.status(201).send({ data: shift, trips, earning, scorecard });
  };
  // One at a time per driver, so a double tap cannot pass the repeat check
  // above twice (lib/keyedLock.ts).
  app.post("/past", async (request, reply) =>
    withKeyLock(`past-shift:${request.userId}`, () => addPastShift(request, reply))
  );

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

// UK times for the words below: the server runs in UTC, drivers read BST/GMT.
function ukTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function ukDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
}

/** Why a past shift was refused for overlapping one already saved. */
export function shiftClashMessage(clash: { status: string; startedAt: Date; endedAt: Date | null }): string {
  if (clash.status === "active" || !clash.endedAt) {
    return `You have a shift running now, started at ${ukTime(clash.startedAt)} on ${ukDay(clash.startedAt)}. End it first, or change this shift's times so they don't overlap it.`;
  }
  return `You already have a shift from ${ukTime(clash.startedAt)} to ${ukTime(clash.endedAt)} on ${ukDay(clash.startedAt)}. Change this shift's times so they don't overlap it.`;
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

  // Hand over the badges just awarded so the scorecard does not check again.
  const scorecard = await getShiftScorecard(userId, shiftId, { newAchievements }).catch(() => null);

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
