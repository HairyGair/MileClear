import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { adminMiddleware } from "../../middleware/admin.js";
import { stripe } from "../../lib/stripe.js";
import { sendReEngagementEmail, sendServiceStatusEmail, sendUpdateEmail } from "../../services/email.js";
import { logEvent } from "../../services/appEvents.js";
import { sendPushNotifications } from "../../lib/push.js";
import { PREMIUM_PRICE_MONTHLY_PENCE, getTaxYear, haversineDistance } from "@mileclear/shared";
import { upsertMileageSummary } from "../../services/mileage.js";
import { advanceLastTripAt } from "../../services/userActivity.js";
import { getAppleClient, getSignedDataVerifier, fetchTransactionWithEnvFallback, type AppleIapEnvironment } from "../../services/appleIap.js";
import { calculateUserHealthScore } from "../../services/userHealthScore.js";

const premiumToggleSchema = z.object({
  isPremium: z.boolean(),
});

const adminNotesSchema = z.object({
  notes: z.string().max(10000).nullable(),
});

const adminCreateTripSchema = z.object({
  vehicleId: z.string().uuid(),
  startLat: z.number(),
  startLng: z.number(),
  endLat: z.number(),
  endLng: z.number(),
  startAddress: z.string().max(500).optional(),
  endAddress: z.string().max(500).optional(),
  distanceMiles: z.number().positive().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  classification: z.enum(["business", "personal", "unclassified"]).default("unclassified"),
  platformTag: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

const pushSchema = z.object({
  audience: z.enum(["all", "premium", "free", "inactive", "specific", "selected"]),
  userId: z.string().optional(),
  userIds: z.array(z.string()).max(500).optional(),
  inactiveDays: z.number().int().min(1).max(365).optional(),
  // Optional filters that compose with the audience cut. All must
  // match (AND). Empty = no filter on that dimension.
  buildNumber: z.string().max(32).optional(),
  appVersion: z.string().max(32).optional(),
  healthBand: z.enum(["good", "warning", "critical", "unknown"]).optional(),
  dashboardMode: z.enum(["work", "personal", "both"]).optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  dryRun: z.boolean().optional().default(true),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", adminMiddleware);

  // GET /admin/analytics
  app.get("/analytics", async (_request, reply) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      premiumUsers,
      totalTrips,
      tripAggregates,
      earningAggregates,
      usersThisMonth,
      tripsThisMonth,
      activeUserRows,
      ratingPromptsShown,
      ratingLoveIt,
      ratingCouldBeBetter,
      ratingAlreadyRated,
      ratingNotNow,
      ratingNativeRequested,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isPremium: true } }),
      prisma.trip.count(),
      prisma.trip.aggregate({ _sum: { distanceMiles: true } }),
      prisma.earning.aggregate({ _sum: { amountPence: true } }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.trip.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.trip.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.appEvent.count({ where: { type: "rating.prompt_shown" } }),
      prisma.appEvent.count({ where: { type: "rating.love_it" } }),
      prisma.appEvent.count({ where: { type: "rating.could_be_better" } }),
      prisma.appEvent.count({ where: { type: "rating.already_rated" } }),
      prisma.appEvent.count({ where: { type: "rating.not_now" } }),
      prisma.appEvent.count({ where: { type: "rating.native_dialog_requested" } }),
    ]);

    return reply.send({
      data: {
        totalUsers,
        activeUsers30d: activeUserRows.length,
        premiumUsers,
        totalTrips,
        totalMiles: Math.round((tripAggregates._sum.distanceMiles ?? 0) * 10) / 10,
        totalEarningsPence: earningAggregates._sum.amountPence ?? 0,
        usersThisMonth,
        tripsThisMonth,
        ratingFunnel: {
          promptsShown: ratingPromptsShown,
          loveIt: ratingLoveIt,
          couldBeBetter: ratingCouldBeBetter,
          alreadyRated: ratingAlreadyRated,
          notNow: ratingNotNow,
          nativeDialogRequested: ratingNativeRequested,
        },
      },
    });
  });

  // GET /admin/users
  app.get("/users", async (request, reply) => {
    const { q, page, pageSize, sortBy } = request.query as {
      q?: string;
      page?: string;
      pageSize?: string;
      sortBy?: string;
    };

    const pageNum = Math.max(1, parseInt(page || "1", 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(pageSize || "20", 10) || 20));
    const skip = (pageNum - 1) * size;

    const where = q
      ? {
          OR: [
            { email: { contains: q } },
            { displayName: { contains: q } },
          ],
        }
      : {};

    let orderBy:
      | { createdAt: "desc" }
      | { lastTripAt: { sort: "desc"; nulls: "last" } }
      | { lastLoginAt: { sort: "desc"; nulls: "last" } };
    if (sortBy === "lastTripAt") {
      orderBy = { lastTripAt: { sort: "desc", nulls: "last" } };
    } else if (sortBy === "lastLoginAt") {
      orderBy = { lastLoginAt: { sort: "desc", nulls: "last" } };
    } else {
      orderBy = { createdAt: "desc" };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          emailVerified: true,
          isPremium: true,
          isAdmin: true,
          createdAt: true,
          lastLoginAt: true,
          lastTripAt: true,
          // Heartbeat fields used to compute the per-user health score.
          // Audit follow-up #2 (4 May 2026).
          bgLocationPermission: true,
          trackingTaskActive: true,
          backgroundFetchStatus: true,
          lastHeartbeatAt: true,
          lastPendingSyncCount: true,
          lastSyncQueuePermFailed: true,
          lastDrivingSpeedAt: true,
          secondsSinceLastTripPost: true,
          _count: { select: { trips: true, vehicles: true, earnings: true } },
          diagnosticDump: { select: { verdict: true, capturedAt: true } },
        },
        orderBy,
        skip,
        take: size,
      }),
      prisma.user.count({ where }),
    ]);

    // Decorate with the health-score band on the way out. The full
    // factor breakdown is included on the user-detail endpoint, not here
    // (keep the list response light). Score + band is enough for the
    // sortable/filterable list column.
    const decorated = users.map((u) => {
      const { score, band } = calculateUserHealthScore({
        bgLocationPermission: u.bgLocationPermission,
        trackingTaskActive: u.trackingTaskActive,
        backgroundFetchStatus: u.backgroundFetchStatus,
        lastHeartbeatAt: u.lastHeartbeatAt,
        lastPendingSyncCount: u.lastPendingSyncCount,
        lastSyncQueuePermFailed: u.lastSyncQueuePermFailed,
        lastDrivingSpeedAt: u.lastDrivingSpeedAt,
        secondsSinceLastTripPost: u.secondsSinceLastTripPost,
      });
      return { ...u, healthScore: score, healthBand: band };
    });

    return reply.send({
      data: decorated,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size),
    });
  });

  // GET /admin/users/:userId
  app.get("/users/:userId", async (request, reply) => {
    const { userId } = request.params as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerified: true,
        isPremium: true,
        isAdmin: true,
        createdAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        premiumExpiresAt: true,
        appleId: true,
        googleId: true,
        notes: true,
        lastLoginAt: true,
        lastTripAt: true,
        lastHeartbeatAt: true,
        bgLocationPermission: true,
        notificationPermission: true,
        trackingTaskActive: true,
        appVersion: true,
        buildNumber: true,
        osVersion: true,
        lastPendingSyncCount: true,
        // 1.1.3+ heartbeat telemetry
        lastSyncQueueFailed: true,
        lastSyncQueuePermFailed: true,
        secondsSinceLastTripPost: true,
        daysSinceLastTrip: true,
        freeDiskBytes: true,
        backgroundFetchStatus: true,
        autoRecordingActive: true,
        recordingStartedAt: true,
        lastDrivingSpeedAt: true,
        _count: { select: { trips: true, vehicles: true, earnings: true } },
        trips: {
          select: {
            id: true,
            distanceMiles: true,
            classification: true,
            startedAt: true,
            platformTag: true,
          },
          orderBy: { startedAt: "desc" },
          take: 20,
        },
        vehicles: {
          select: {
            id: true,
            make: true,
            model: true,
            fuelType: true,
            vehicleType: true,
          },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const [mileageAgg, earningsAgg] = await Promise.all([
      prisma.trip.aggregate({
        where: { userId },
        _sum: { distanceMiles: true },
      }),
      prisma.earning.aggregate({
        where: { userId },
        _sum: { amountPence: true },
      }),
    ]);

    // Per-user health score (audit follow-up #2). The detail view gets
    // the full factor breakdown so admin can see WHY a user scored low,
    // not just the band.
    const health = calculateUserHealthScore({
      bgLocationPermission: user.bgLocationPermission,
      trackingTaskActive: user.trackingTaskActive,
      backgroundFetchStatus: user.backgroundFetchStatus,
      lastHeartbeatAt: user.lastHeartbeatAt,
      lastPendingSyncCount: user.lastPendingSyncCount,
      lastSyncQueuePermFailed: user.lastSyncQueuePermFailed,
      lastDrivingSpeedAt: user.lastDrivingSpeedAt,
      secondsSinceLastTripPost: user.secondsSinceLastTripPost,
    });

    return reply.send({
      data: {
        ...user,
        totalMiles: Math.round((mileageAgg._sum.distanceMiles ?? 0) * 10) / 10,
        totalEarningsPence: earningsAgg._sum.amountPence ?? 0,
        health,
      },
    });
  });

  // GET /admin/users/:userId/diagnostics
  app.get("/users/:userId/diagnostics", async (request, reply) => {
    const { userId } = request.params as { userId: string };

    const dump = await prisma.diagnosticDump.findUnique({
      where: { userId },
    });

    return reply.send({ data: dump });
  });

  // GET /admin/users/:userId/trip-paths
  // Returns recent trips with their coordinate arrays for admin map visualisation.
  app.get("/users/:userId/trip-paths", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { limit, days } = request.query as { limit?: string; days?: string };

    const take = Math.min(100, Math.max(1, parseInt(limit || "20", 10) || 20));
    const daysNum = days ? Math.max(1, parseInt(days, 10) || 0) : null;

    const where: Record<string, unknown> = { userId };
    if (daysNum) {
      where.startedAt = { gte: new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000) };
    }

    const trips = await prisma.trip.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        distanceMiles: true,
        classification: true,
        startLat: true,
        startLng: true,
        endLat: true,
        endLng: true,
        isManualEntry: true,
        coordinates: {
          orderBy: { recordedAt: "asc" },
          select: { lat: true, lng: true },
        },
      },
    });

    return reply.send({ data: trips });
  });

  // GET /admin/apple-webhooks
  app.get("/apple-webhooks", async (request, reply) => {
    const { page, pageSize, status } = request.query as {
      page?: string;
      pageSize?: string;
      status?: string;
    };

    const pageNum = Math.max(1, parseInt(page || "1", 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize || "50", 10) || 50));
    const skip = (pageNum - 1) * size;

    const where = status ? { status } : {};

    const [logs, total] = await Promise.all([
      prisma.appleIapWebhookLog.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip,
        take: size,
      }),
      prisma.appleIapWebhookLog.count({ where }),
    ]);

    // Summary counts by status for the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24hRows = await prisma.appleIapWebhookLog.groupBy({
      by: ["status"],
      where: { receivedAt: { gte: since } },
      _count: { _all: true },
    });
    const last24h: Record<string, number> = {};
    for (const row of last24hRows) {
      last24h[row.status] = row._count._all;
    }

    return reply.send({
      data: logs,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size),
      last24h,
    });
  });

  // GET /admin/job-runs
  app.get("/job-runs", async (request, reply) => {
    const { page, pageSize, jobName, status } = request.query as {
      page?: string;
      pageSize?: string;
      jobName?: string;
      status?: string;
    };

    const pageNum = Math.max(1, parseInt(page || "1", 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize || "50", 10) || 50));
    const skip = (pageNum - 1) * size;

    const where: Record<string, unknown> = {};
    if (jobName) where.jobName = jobName;
    if (status) where.status = status;

    const [runs, total] = await Promise.all([
      prisma.jobRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip,
        take: size,
      }),
      prisma.jobRun.count({ where }),
    ]);

    // Latest run per job name for quick health check
    const latestRowsRaw = await prisma.$queryRaw<
      Array<{
        jobName: string;
        startedAt: Date;
        finishedAt: Date | null;
        status: string;
      }>
    >`
      SELECT r1.jobName, r1.startedAt, r1.finishedAt, r1.status
      FROM job_runs r1
      INNER JOIN (
        SELECT jobName, MAX(startedAt) AS maxStarted
        FROM job_runs
        GROUP BY jobName
      ) r2 ON r1.jobName = r2.jobName AND r1.startedAt = r2.maxStarted
      ORDER BY r1.startedAt DESC
    `;

    return reply.send({
      data: runs,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size),
      latestPerJob: latestRowsRaw,
    });
  });

  // GET /admin/diagnostic-alerts
  app.get("/diagnostic-alerts", async (_request, reply) => {
    const alerts = await prisma.appEvent.findMany({
      where: {
        type: { in: ["alert.permission_missing", "alert.task_not_running", "alert.stuck_recording"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        userId: true,
        metadata: true,
        createdAt: true,
        user: { select: { email: true, displayName: true } },
      },
    });

    return reply.send({ data: alerts });
  });

  // PATCH /admin/users/:userId/premium
  app.patch("/users/:userId/premium", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const parsed = premiumToggleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isPremium: parsed.data.isPremium },
      select: { id: true, email: true, isPremium: true },
    });

    logEvent("admin.premium_toggled", request.userId!, {
      targetUserId: userId,
      newValue: parsed.data.isPremium,
    });

    request.log.warn(
      { adminId: request.userId, targetUserId: userId, action: "premium.toggle", newValue: parsed.data.isPremium },
      `Admin toggled premium: ${userId} → ${parsed.data.isPremium}`
    );

    return reply.send({ data: updated });
  });

  // PATCH /admin/users/:userId/notes
  app.patch("/users/:userId/notes", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const parsed = adminNotesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { notes: parsed.data.notes },
      select: { id: true, notes: true },
    });

    logEvent("admin.notes_updated", request.userId!, { targetUserId: userId });

    return reply.send({ data: updated });
  });

  // POST /admin/users/:userId/trips
  // Create a trip on behalf of a user (restore missing trips, fix data loss).
  app.post("/users/:userId/trips", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const parsed = adminCreateTripSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const data = parsed.data;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!targetUser) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Force vehicle selection from the target user's own vehicles
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: data.vehicleId, userId },
      select: { id: true },
    });
    if (!vehicle) {
      return reply.status(400).send({ error: "Vehicle not found for this user" });
    }

    const startedAt = new Date(data.startedAt);
    const endedAt = new Date(data.endedAt);
    if (endedAt <= startedAt) {
      return reply.status(400).send({ error: "endedAt must be after startedAt" });
    }

    const distanceMiles =
      data.distanceMiles ??
      haversineDistance(data.startLat, data.startLng, data.endLat, data.endLng);

    const trip = await prisma.trip.create({
      data: {
        userId,
        vehicleId: vehicle.id,
        startLat: data.startLat,
        startLng: data.startLng,
        endLat: data.endLat,
        endLng: data.endLng,
        startAddress: data.startAddress ?? null,
        endAddress: data.endAddress ?? null,
        distanceMiles,
        startedAt,
        endedAt,
        isManualEntry: true,
        classification: data.classification,
        platformTag: data.platformTag ?? null,
        notes: data.notes ?? null,
      },
      include: { vehicle: true },
    });

    // Fire-and-forget: mileage summary + lastTripAt
    const taxYear = getTaxYear(startedAt);
    upsertMileageSummary(userId, taxYear).catch(() => {});
    advanceLastTripAt(userId, startedAt).catch(() => {});

    logEvent("admin.trip_created", request.userId!, {
      targetUserId: userId,
      tripId: trip.id,
      distanceMiles,
    });

    request.log.warn(
      {
        adminId: request.userId,
        targetUserId: userId,
        tripId: trip.id,
        action: "admin.trip.create",
      },
      `Admin created trip ${trip.id} for user ${userId}`,
    );

    return reply.status(201).send({ data: trip });
  });

  // DELETE /admin/users/:userId
  app.delete("/users/:userId", async (request, reply) => {
    const { userId } = request.params as { userId: string };

    if (userId === request.userId) {
      return reply.status(400).send({ error: "Cannot delete your own account via admin" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, stripeSubscriptionId: true },
    });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Cancel active Stripe subscription before deleting
    if (user.stripeSubscriptionId && stripe) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch (err) {
        request.log.error(err, `Failed to cancel Stripe subscription for ${userId}`);
      }
    }

    logEvent("admin.user_deleted", request.userId!, {
      targetUserId: userId,
      targetEmail: user.email,
    });

    request.log.warn(
      { adminId: request.userId, targetUserId: userId, targetEmail: user.email, action: "user.delete" },
      `Admin deleted user: ${userId} (${user.email})`
    );

    await prisma.user.delete({ where: { id: userId } });

    return reply.send({ message: "User deleted" });
  });

  // POST /admin/send-re-engagement
  // Sends a personalised re-engagement email to all users (or a subset).
  // Query params: ?dryRun=true (preview without sending), ?onlyInactive=true (only users with 0 trips)
  app.post("/send-re-engagement", async (request, reply) => {
    const { dryRun, onlyInactive } = request.query as {
      dryRun?: string;
      onlyInactive?: string;
    };
    const isDryRun = dryRun === "true";
    const inactiveOnly = onlyInactive === "true";

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        _count: { select: { trips: true } },
      },
    });

    // Get trip stats for users who have trips
    const userIds = users.filter((u) => u._count.trips > 0).map((u) => u.id);
    const tripStats = userIds.length > 0
      ? await prisma.trip.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds } },
          _count: { id: true },
          _sum: { distanceMiles: true },
        })
      : [];

    const statsMap = new Map(
      tripStats.map((s) => [
        s.userId,
        { totalTrips: s._count.id, totalMiles: s._sum.distanceMiles ?? 0 },
      ])
    );

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of users) {
      const stats = statsMap.get(user.id) ?? null;

      // If onlyInactive, skip users who have trips
      if (inactiveOnly && stats && stats.totalTrips > 0) {
        skipped++;
        continue;
      }

      if (isDryRun) {
        sent++;
        continue;
      }

      try {
        await sendReEngagementEmail(user.email, user.displayName, stats, user.id);
        sent++;
        // Small delay to avoid hitting Brevo rate limits (300/day free tier)
        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        errors.push(`${user.email}: ${err.message}`);
      }
    }

    request.log.info(
      { adminId: request.userId, action: "re-engagement-email", sent, skipped, errors: errors.length, isDryRun },
      `Re-engagement email: ${sent} sent, ${skipped} skipped, ${errors.length} errors${isDryRun ? " (DRY RUN)" : ""}`
    );

    return reply.send({
      data: {
        sent,
        skipped,
        errors: errors.length,
        errorDetails: errors.slice(0, 10),
        dryRun: isDryRun,
        totalUsers: users.length,
      },
    });
  });

  // POST /admin/send-update
  // Sends the latest update/changelog email to all users.
  // Query params: ?dryRun=true (preview without sending)
  app.post("/send-update", async (request, reply) => {
    const { dryRun } = request.query as { dryRun?: string };
    const isDryRun = dryRun === "true";

    const users = await prisma.user.findMany({
      select: { id: true, email: true, displayName: true },
    });

    let sent = 0;
    const errors: string[] = [];

    for (const user of users) {
      if (isDryRun) {
        sent++;
        continue;
      }

      try {
        await sendUpdateEmail(user.email, user.displayName, user.id);
        sent++;
        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        errors.push(`${user.email}: ${err.message}`);
      }
    }

    request.log.info(
      { adminId: request.userId, action: "update-email", sent, errors: errors.length, isDryRun },
      `Update email: ${sent} sent, ${errors.length} errors${isDryRun ? " (DRY RUN)" : ""}`
    );

    return reply.send({
      data: {
        sent,
        errors: errors.length,
        errorDetails: errors.slice(0, 10),
        dryRun: isDryRun,
        totalUsers: users.length,
      },
    });
  });

  // POST /admin/send-service-status
  // Sends a short "we're back up" email to all users.
  // Query params: ?dryRun=true (preview without sending)
  app.post("/send-service-status", async (request, reply) => {
    const { dryRun } = request.query as { dryRun?: string };
    const isDryRun = dryRun === "true";

    const users = await prisma.user.findMany({
      select: { id: true, email: true, displayName: true },
    });

    let sent = 0;
    const errors: string[] = [];

    for (const user of users) {
      if (isDryRun) {
        sent++;
        continue;
      }

      try {
        await sendServiceStatusEmail(user.email, user.displayName, user.id);
        sent++;
        // Small delay to avoid hitting Brevo rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        errors.push(`${user.email}: ${err.message}`);
      }
    }

    request.log.info(
      { adminId: request.userId, action: "service-status-email", sent, errors: errors.length, isDryRun },
      `Service status email: ${sent} sent, ${errors.length} errors${isDryRun ? " (DRY RUN)" : ""}`
    );

    return reply.send({
      data: {
        sent,
        errors: errors.length,
        errorDetails: errors.slice(0, 10),
        dryRun: isDryRun,
        totalUsers: users.length,
      },
    });
  });

  // GET /admin/revenue
  app.get("/revenue", async (_request, reply) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [stripeSubscribers, appleSubscribers, adminGranted, totalUsers, churned] =
      await Promise.all([
        prisma.user.count({
          where: { isPremium: true, stripeSubscriptionId: { not: null } },
        }),
        prisma.user.count({
          where: { isPremium: true, appleOriginalTransactionId: { not: null } },
        }),
        prisma.user.count({
          where: {
            isPremium: true,
            stripeSubscriptionId: null,
            appleOriginalTransactionId: null,
          },
        }),
        prisma.user.count(),
        prisma.user.count({
          where: {
            isPremium: false,
            premiumExpiresAt: { gte: thirtyDaysAgo, lt: now },
          },
        }),
      ]);

    const currentPremiumCount = stripeSubscribers + appleSubscribers + adminGranted;
    const mrrPence = currentPremiumCount * PREMIUM_PRICE_MONTHLY_PENCE;
    const churnBase = churned + currentPremiumCount;
    const churnRatePercent = churnBase > 0
      ? Math.round((churned / churnBase) * 1000) / 10
      : 0;
    const arpuPence = totalUsers > 0
      ? Math.round(mrrPence / totalUsers)
      : 0;

    // Monthly premium trend (last 6 months)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const trendRows = await prisma.$queryRaw<
      Array<{ month: string; premiumCount: bigint; newPremium: bigint; churned: bigint }>
    >`
      SELECT
        DATE_FORMAT(months.m, '%Y-%m') AS month,
        (SELECT COUNT(*) FROM users
         WHERE isPremium = true
         AND createdAt <= LAST_DAY(months.m)) AS premiumCount,
        (SELECT COUNT(*) FROM users
         WHERE isPremium = true
         AND DATE_FORMAT(createdAt, '%Y-%m') = DATE_FORMAT(months.m, '%Y-%m')) AS newPremium,
        (SELECT COUNT(*) FROM users
         WHERE isPremium = false
         AND premiumExpiresAt IS NOT NULL
         AND DATE_FORMAT(premiumExpiresAt, '%Y-%m') = DATE_FORMAT(months.m, '%Y-%m')) AS churned
      FROM (
        SELECT DATE_ADD(${sixMonthsAgo}, INTERVAL n MONTH) AS m
        FROM (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) nums
      ) months
      ORDER BY months.m
    `;

    return reply.send({
      data: {
        currentPremiumCount,
        mrrPence,
        stripeSubscribers,
        appleSubscribers,
        adminGranted,
        churnedLast30d: churned,
        churnRatePercent,
        arpuPence,
        monthlyTrend: trendRows.map((r) => ({
          month: r.month,
          premiumCount: Number(r.premiumCount),
          newPremium: Number(r.newPremium),
          churned: Number(r.churned),
        })),
      },
    });
  });

  // GET /admin/engagement
  app.get("/engagement", async (_request, reply) => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [dauRows, wauRows, mauRows, totalUsers, usersWithTrips] =
      await Promise.all([
        prisma.trip.findMany({
          where: { startedAt: { gte: oneDayAgo } },
          select: { userId: true },
          distinct: ["userId"],
        }),
        prisma.trip.findMany({
          where: { startedAt: { gte: sevenDaysAgo } },
          select: { userId: true },
          distinct: ["userId"],
        }),
        prisma.trip.findMany({
          where: { startedAt: { gte: thirtyDaysAgo } },
          select: { userId: true },
          distinct: ["userId"],
        }),
        prisma.user.count(),
        prisma.trip.findMany({
          select: { userId: true },
          distinct: ["userId"],
        }),
      ]);

    // Retention curve (last 6 months)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const retentionRows = await prisma.$queryRaw<
      Array<{ signup_month: string; signups: bigint; retained: bigint }>
    >`
      SELECT
        DATE_FORMAT(u.createdAt, '%Y-%m') AS signup_month,
        COUNT(DISTINCT u.id) AS signups,
        COUNT(DISTINCT CASE WHEN t.startedAt >= ${thirtyDaysAgo} THEN u.id END) AS retained
      FROM users u
      LEFT JOIN trips t ON t.userId = u.id
      WHERE u.createdAt >= ${sixMonthsAgo}
      GROUP BY signup_month
      ORDER BY signup_month
    `;

    // Recently active users
    const recentlyActiveRows = await prisma.$queryRaw<
      Array<{ userId: string; email: string; displayName: string | null; lastTripAt: Date; tripCount: bigint }>
    >`
      SELECT
        u.id AS userId, u.email, u.displayName,
        MAX(t.startedAt) AS lastTripAt,
        COUNT(t.id) AS tripCount
      FROM users u
      INNER JOIN trips t ON t.userId = u.id
      GROUP BY u.id, u.email, u.displayName
      ORDER BY lastTripAt DESC
      LIMIT 20
    `;

    return reply.send({
      data: {
        dau: dauRows.length,
        wau: wauRows.length,
        mau: mauRows.length,
        totalUsers,
        usersWithZeroTrips: totalUsers - usersWithTrips.length,
        retentionCurve: retentionRows.map((r) => {
          const signups = Number(r.signups);
          const retainedCount = Number(r.retained);
          return {
            month: r.signup_month,
            signups,
            retainedCount,
            retentionPercent: signups > 0
              ? Math.round((retainedCount / signups) * 1000) / 10
              : 0,
          };
        }),
        recentlyActive: recentlyActiveRows.map((r) => ({
          userId: r.userId,
          email: r.email,
          displayName: r.displayName,
          lastTripAt: r.lastTripAt.toISOString(),
          tripCount: Number(r.tripCount),
        })),
      },
    });
  });

  // GET /admin/auto-trip-health
  app.get("/auto-trip-health", async (_request, reply) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      autoTripsTotal,
      autoTripsClassified,
      autoTripsUnclassified,
      manualTripsTotal,
      autoTripAgg,
      usersWithAutoTrips7dRows,
      usersWithPushToken,
    ] = await Promise.all([
      prisma.trip.count({
        where: { isManualEntry: false, startedAt: { gte: thirtyDaysAgo } },
      }),
      prisma.trip.count({
        where: {
          isManualEntry: false,
          startedAt: { gte: thirtyDaysAgo },
          classification: { not: "unclassified" },
        },
      }),
      prisma.trip.count({
        where: {
          isManualEntry: false,
          startedAt: { gte: thirtyDaysAgo },
          classification: "unclassified",
        },
      }),
      prisma.trip.count({
        where: { isManualEntry: true, startedAt: { gte: thirtyDaysAgo } },
      }),
      prisma.trip.aggregate({
        where: {
          isManualEntry: false,
          startedAt: { gte: thirtyDaysAgo },
          endedAt: { not: null },
        },
        _avg: { distanceMiles: true },
      }),
      prisma.trip.findMany({
        where: { isManualEntry: false, startedAt: { gte: sevenDaysAgo } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.user.count({ where: { pushToken: { not: null } } }),
    ]);

    // Average duration via raw SQL
    const durationRows = await prisma.$queryRaw<Array<{ avgMinutes: number | null }>>`
      SELECT AVG(TIMESTAMPDIFF(MINUTE, startedAt, endedAt)) AS avgMinutes
      FROM trips
      WHERE isManualEntry = false
      AND startedAt >= ${thirtyDaysAgo}
      AND endedAt IS NOT NULL
    `;

    // Daily breakdown (last 7 days)
    const dailyRows = await prisma.$queryRaw<
      Array<{ date: string; autoCount: bigint; manualCount: bigint }>
    >`
      SELECT
        DATE_FORMAT(startedAt, '%Y-%m-%d') AS date,
        SUM(CASE WHEN isManualEntry = false THEN 1 ELSE 0 END) AS autoCount,
        SUM(CASE WHEN isManualEntry = true THEN 1 ELSE 0 END) AS manualCount
      FROM trips
      WHERE startedAt >= ${sevenDaysAgo}
      GROUP BY date
      ORDER BY date
    `;

    const classificationRatePercent = autoTripsTotal > 0
      ? Math.round((autoTripsClassified / autoTripsTotal) * 1000) / 10
      : 0;
    const detectionAdoptionPercent = usersWithPushToken > 0
      ? Math.round((usersWithAutoTrips7dRows.length / usersWithPushToken) * 1000) / 10
      : 0;

    return reply.send({
      data: {
        autoTripsTotal,
        autoTripsClassified,
        autoTripsUnclassified,
        manualTripsTotal,
        classificationRatePercent,
        usersWithAutoTrips7d: usersWithAutoTrips7dRows.length,
        usersWithPushToken,
        detectionAdoptionPercent,
        avgTripDurationMinutes: Math.round(durationRows[0]?.avgMinutes ?? 0),
        avgAutoTripDistanceMiles:
          Math.round((autoTripAgg._avg.distanceMiles ?? 0) * 10) / 10,
        dailyAutoTrips: dailyRows.map((r) => ({
          date: r.date,
          autoCount: Number(r.autoCount),
          manualCount: Number(r.manualCount),
        })),
      },
    });
  });

  // POST /admin/send-push
  app.post("/send-push", async (request, reply) => {
    const parsed = pushSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    const {
      audience,
      userId,
      userIds,
      inactiveDays,
      buildNumber,
      appVersion,
      healthBand,
      dashboardMode,
      title,
      body,
      dryRun,
    } = parsed.data;

    if (audience === "specific" && !userId) {
      return reply.status(400).send({ error: "userId required for specific audience" });
    }
    if (audience === "selected" && (!userIds || userIds.length === 0)) {
      return reply.status(400).send({ error: "userIds required for selected audience" });
    }

    // Compose the where clause: audience first, then optional filters
    // are AND'd on top. A few filters (inactive, healthBand) can't be
    // expressed in SQL cleanly so they run post-load.
    const where: Prisma.UserWhereInput = { pushToken: { not: null } };

    if (audience === "specific") {
      where.id = userId;
    } else if (audience === "selected") {
      where.id = { in: userIds };
    } else if (audience === "premium") {
      where.isPremium = true;
    } else if (audience === "free") {
      where.isPremium = false;
    }
    // "inactive" + "all" don't add an audience-level filter; inactive
    // filters post-load by trip recency.

    if (buildNumber) where.buildNumber = buildNumber;
    if (appVersion) where.appVersion = appVersion;
    if (dashboardMode) where.dashboardMode = dashboardMode;

    // Need health fields to compute the band post-load. Always
    // included; tiny per-row cost on a list this size.
    let users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        pushToken: true,
        bgLocationPermission: true,
        trackingTaskActive: true,
        backgroundFetchStatus: true,
        lastHeartbeatAt: true,
        lastPendingSyncCount: true,
        lastSyncQueuePermFailed: true,
        lastDrivingSpeedAt: true,
        secondsSinceLastTripPost: true,
      },
    });

    // Inactive filter: post-load to keep the SQL simple
    if (audience === "inactive") {
      const cutoff = new Date(Date.now() - (inactiveDays ?? 14) * 24 * 60 * 60 * 1000);
      const activeUserIds = await prisma.trip.findMany({
        where: { startedAt: { gte: cutoff } },
        select: { userId: true },
        distinct: ["userId"],
      });
      const activeSet = new Set(activeUserIds.map((r) => r.userId));
      users = users.filter((u) => !activeSet.has(u.id));
    }

    // Health-band filter: post-load via the same calculator the user
    // list uses, so the chosen band matches what's shown in the table.
    if (healthBand) {
      users = users.filter((u) => {
        const { band } = calculateUserHealthScore({
          bgLocationPermission: u.bgLocationPermission,
          trackingTaskActive: u.trackingTaskActive,
          backgroundFetchStatus: u.backgroundFetchStatus,
          lastHeartbeatAt: u.lastHeartbeatAt,
          lastPendingSyncCount: u.lastPendingSyncCount,
          lastSyncQueuePermFailed: u.lastSyncQueuePermFailed,
          lastDrivingSpeedAt: u.lastDrivingSpeedAt,
          secondsSinceLastTripPost: u.secondsSinceLastTripPost,
        });
        return band === healthBand;
      });
    }

    const totalTargeted = users.length;

    if (dryRun) {
      return reply.send({
        data: { sent: 0, failed: 0, totalTargeted, dryRun: true },
      });
    }

    const messages = users
      .filter((u) => u.pushToken)
      .map((u) => ({
        to: u.pushToken!,
        title,
        body,
        sound: "default" as const,
      }));

    const tickets = await sendPushNotifications(messages);
    const sent = tickets.filter((t) => t.status === "ok").length;
    const failed = tickets.filter((t) => t.status === "error").length;

    logEvent("admin.push_sent", request.userId!, {
      audience,
      totalTargeted,
      sent,
      failed,
      title,
      buildNumber: buildNumber ?? null,
      appVersion: appVersion ?? null,
      healthBand: healthBand ?? null,
      dashboardMode: dashboardMode ?? null,
      selectedCount: userIds?.length ?? null,
    });

    return reply.send({
      data: { sent, failed, totalTargeted, dryRun: false },
    });
  });

  // POST /admin/users/:userId/reset-classifications
  // Moves auto-classified trips back to "unclassified" so the user can review them.
  // Only affects non-manual trips that were classified as business/personal but
  // have no platform tag (strong indicator of server-side auto-classification).
  app.post("/users/:userId/reset-classifications", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { dryRun } = request.query as { dryRun?: string };
    const isDryRun = dryRun === "true";

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Find trips that were likely auto-classified by the API:
    // - Not manual entries (auto-detected)
    // - Currently classified as business or personal
    // - No platform tag set (the API auto-classifier never set platform tags)
    const affected = await prisma.trip.findMany({
      where: {
        userId,
        isManualEntry: false,
        classification: { in: ["business", "personal"] },
        platformTag: null,
      },
      select: { id: true, classification: true, startedAt: true, distanceMiles: true },
    });

    if (!isDryRun && affected.length > 0) {
      await prisma.trip.updateMany({
        where: {
          id: { in: affected.map((t) => t.id) },
        },
        data: { classification: "unclassified" },
      });

      logEvent("admin.classifications_reset", request.userId!, {
        targetUserId: userId,
        targetEmail: user.email,
        tripsReset: affected.length,
      });
    }

    return reply.send({
      data: {
        userId,
        email: user.email,
        tripsAffected: affected.length,
        dryRun: isDryRun,
        trips: affected.slice(0, 20).map((t) => ({
          id: t.id,
          classification: t.classification,
          startedAt: t.startedAt,
          distanceMiles: t.distanceMiles,
        })),
      },
    });
  });

  // GET /admin/health
  app.get("/health", async (_request, reply) => {
    let dbStatus: "ok" | "error" = "ok";
    let dbLatency = 0;

    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
    } catch {
      dbStatus = "error";
      dbLatency = Date.now() - dbStart;
    }

    const [users, trips, shifts, vehicles, fuelLogs, earnings, achievements] =
      await Promise.all([
        prisma.user.count(),
        prisma.trip.count(),
        prisma.shift.count(),
        prisma.vehicle.count(),
        prisma.fuelLog.count(),
        prisma.earning.count(),
        prisma.achievement.count(),
      ]);

    const mem = process.memoryUsage();

    return reply.send({
      data: {
        api: "ok" as const,
        database: dbStatus,
        databaseLatencyMs: dbLatency,
        recordCounts: {
          users,
          trips,
          shifts,
          vehicles,
          fuelLogs,
          earnings,
          achievements,
        },
        uptime: Math.floor(process.uptime()),
        memoryUsageMb: Math.round(mem.rss / 1024 / 1024),
        nodeVersion: process.version,
      },
    });
  });

  // ==========================================================================
  // INSIGHTS PANELS - one block of 10 admin views added 29 April 2026.
  // Mounted on a new /dashboard/admin/insights page in the web admin.
  // All read-only except comp-premium (which writes an AppEvent audit row).
  // ==========================================================================

  // GET /admin/funnel
  // Signup -> first trip -> 5+ trips -> earnings logged -> Pro upgrade
  app.get("/funnel", async (_request, reply) => {
    const [
      totalUsers,
      usersWithTrip,
      usersWith5Trips,
      usersWithEarnings,
      premiumUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(DISTINCT userId) AS c FROM trips
      `.then((r) => Number(r[0]?.c ?? 0)),
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*) AS c FROM (
          SELECT userId FROM trips GROUP BY userId HAVING COUNT(*) >= 5
        ) t
      `.then((r) => Number(r[0]?.c ?? 0)),
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(DISTINCT userId) AS c FROM earnings
      `.then((r) => Number(r[0]?.c ?? 0)),
      prisma.user.count({ where: { isPremium: true } }),
    ]);

    const pct = (n: number, denom: number) =>
      denom > 0 ? Math.round((n / denom) * 1000) / 10 : 0;

    return reply.send({
      data: {
        steps: [
          { key: "signup", label: "Signed up", count: totalUsers, pctOfPrev: 100, pctOfTotal: 100 },
          { key: "first_trip", label: "Logged first trip", count: usersWithTrip, pctOfPrev: pct(usersWithTrip, totalUsers), pctOfTotal: pct(usersWithTrip, totalUsers) },
          { key: "five_trips", label: "5+ trips (active)", count: usersWith5Trips, pctOfPrev: pct(usersWith5Trips, usersWithTrip), pctOfTotal: pct(usersWith5Trips, totalUsers) },
          { key: "earnings", label: "Logged earnings", count: usersWithEarnings, pctOfPrev: pct(usersWithEarnings, usersWith5Trips), pctOfTotal: pct(usersWithEarnings, totalUsers) },
          { key: "premium", label: "Upgraded to Pro", count: premiumUsers, pctOfPrev: pct(premiumUsers, usersWith5Trips), pctOfTotal: pct(premiumUsers, totalUsers) },
        ],
      },
    });
  });

  // GET /admin/retention
  // D1/D7/D30 retention - of users who signed up in the last 90 days, what
  // fraction logged a trip on or after day 1/7/30 from their signup date.
  app.get("/retention", async (_request, reply) => {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const rows = await prisma.$queryRaw<
      Array<{
        cohort: bigint;
        d1: bigint;
        d7: bigint;
        d30: bigint;
      }>
    >`
      SELECT
        COUNT(DISTINCT u.id) AS cohort,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM trips t
          WHERE t.userId = u.id AND t.startedAt >= DATE_ADD(u.createdAt, INTERVAL 1 DAY)
        ) THEN 1 ELSE 0 END) AS d1,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM trips t
          WHERE t.userId = u.id AND t.startedAt >= DATE_ADD(u.createdAt, INTERVAL 7 DAY)
        ) THEN 1 ELSE 0 END) AS d7,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM trips t
          WHERE t.userId = u.id AND t.startedAt >= DATE_ADD(u.createdAt, INTERVAL 30 DAY)
        ) THEN 1 ELSE 0 END) AS d30
      FROM users u
      WHERE u.createdAt >= ${ninetyDaysAgo}
    `;

    const r = rows[0];
    const cohort = Number(r?.cohort ?? 0);
    const d1 = Number(r?.d1 ?? 0);
    const d7 = Number(r?.d7 ?? 0);
    const d30 = Number(r?.d30 ?? 0);
    const pct = (n: number) =>
      cohort > 0 ? Math.round((n / cohort) * 1000) / 10 : 0;

    return reply.send({
      data: {
        cohortSize: cohort,
        cohortWindow: "Signups in last 90 days",
        d1: { count: d1, pct: pct(d1) },
        d7: { count: d7, pct: pct(d7) },
        d30: { count: d30, pct: pct(d30) },
      },
    });
  });

  // GET /admin/active-recordings
  // Trips currently in progress (endedAt IS NULL) and shifts with status="active".
  // Useful for catching stuck recordings in real time.
  app.get("/active-recordings", async (_request, reply) => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [activeTrips, activeShifts] = await Promise.all([
      prisma.trip.findMany({
        where: { endedAt: null, startedAt: { gte: oneDayAgo } },
        select: {
          id: true,
          userId: true,
          startedAt: true,
          startAddress: true,
          distanceMiles: true,
          classification: true,
          platformTag: true,
          user: { select: { displayName: true, email: true } },
        },
        orderBy: { startedAt: "desc" },
        take: 50,
      }),
      prisma.shift.findMany({
        where: { status: "active", startedAt: { gte: oneDayAgo } },
        select: {
          id: true,
          userId: true,
          startedAt: true,
          user: { select: { displayName: true, email: true } },
        },
        orderBy: { startedAt: "desc" },
        take: 50,
      }),
    ]);

    return reply.send({
      data: {
        activeTrips: activeTrips.map((t) => ({
          id: t.id,
          userId: t.userId,
          userLabel: t.user?.displayName || t.user?.email || "(unknown)",
          startedAt: t.startedAt,
          minutesElapsed: Math.round((Date.now() - t.startedAt.getTime()) / 60000),
          startAddress: t.startAddress,
          distanceMiles: t.distanceMiles,
          classification: t.classification,
          platformTag: t.platformTag,
        })),
        activeShifts: activeShifts.map((s) => ({
          id: s.id,
          userId: s.userId,
          userLabel: s.user?.displayName || s.user?.email || "(unknown)",
          startedAt: s.startedAt,
          minutesElapsed: Math.round((Date.now() - s.startedAt.getTime()) / 60000),
        })),
      },
    });
  });

  // GET /admin/diagnostic-panels
  // Heartbeat-aggregate health, rating-funnel skip reasons, classification
  // accuracy, low-quality trips. Computed in one round-trip.
  app.get("/diagnostic-panels", async (_request, reply) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [ratingEvents, classificationFeedback, lowQualityTrips] = await Promise.all([
      // Rating funnel: count rating.* events in the last 7 days
      prisma.$queryRaw<Array<{ type: string; c: bigint }>>`
        SELECT type, COUNT(*) AS c FROM app_events
        WHERE type LIKE 'rating.%'
          AND createdAt >= ${sevenDaysAgo}
        GROUP BY type
        ORDER BY c DESC
      `,
      // Classification accuracy: classification_auto_accepted_sent flag
      prisma.$queryRaw<Array<{ accepted: bigint; rejected: bigint }>>`
        SELECT
          SUM(CASE WHEN type = 'classification.auto_accepted' THEN 1 ELSE 0 END) AS accepted,
          SUM(CASE WHEN type = 'classification.auto_rejected' THEN 1 ELSE 0 END) AS rejected
        FROM app_events
        WHERE type LIKE 'classification.%'
          AND createdAt >= ${sevenDaysAgo}
      `,
      // Low-quality trips: <0.3mi business trips that survived the auto-trip
      // filter, plus trips with low GPS quality scores if available.
      prisma.trip.count({
        where: {
          startedAt: { gte: sevenDaysAgo },
          distanceMiles: { lt: 0.3 },
          isManualEntry: false,
        },
      }),
    ]);

    // Heartbeat aggregate is harder without a dedicated heartbeat table; we
    // derive it from app_events with type "heartbeat.*" if any exist, else
    // we report unknown. For now, approximate from "diagnostic_alert.*" types.
    const heartbeatRows = await prisma.$queryRaw<
      Array<{ type: string; c: bigint }>
    >`
      SELECT type, COUNT(*) AS c FROM app_events
      WHERE type LIKE 'diagnostic_alert.%'
        AND createdAt >= ${sevenDaysAgo}
      GROUP BY type
    `;

    const cf = classificationFeedback[0] ?? { accepted: 0n, rejected: 0n };
    const accepted = Number(cf.accepted ?? 0);
    const rejected = Number(cf.rejected ?? 0);
    const total = accepted + rejected;

    return reply.send({
      data: {
        windowDays: 7,
        ratingFunnel: ratingEvents.map((r) => ({
          type: r.type,
          count: Number(r.c),
        })),
        classificationAccuracy: {
          accepted,
          rejected,
          accuracyPercent: total > 0 ? Math.round((accepted / total) * 1000) / 10 : null,
        },
        lowQualityTripCount: lowQualityTrips,
        heartbeatAlerts: heartbeatRows.map((r) => ({
          type: r.type,
          count: Number(r.c),
        })),
      },
    });
  });

  // GET /admin/stuck-queues
  // Lists active users (heartbeat in last 7d) with the largest sync-queue
  // depth at last heartbeat. Sustained pendingSyncCount > 0 across heartbeats
  // means the sync engine isn't draining for that user - investigate.
  app.get("/stuck-queues", async (_request, reply) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const users = await prisma.user.findMany({
      where: {
        lastHeartbeatAt: { gte: sevenDaysAgo },
        lastPendingSyncCount: { gt: 0 },
      },
      orderBy: { lastPendingSyncCount: "desc" },
      take: 50,
      select: {
        id: true,
        email: true,
        displayName: true,
        appVersion: true,
        buildNumber: true,
        lastHeartbeatAt: true,
        lastPendingSyncCount: true,
        trackingTaskActive: true,
      },
    });
    return reply.send({ data: users });
  });

  // GET /admin/onboarding-derived
  // Derived from observable user state since we don't emit per-step events.
  // Each step is a state we can read directly from the DB.
  app.get("/onboarding-derived", async (_request, reply) => {
    const [
      total,
      withIntent,
      withVehicle,
      withEmployerRate,
      withFirstTrip,
      withClassifiedTrip,
      withEarning,
      premium,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { userIntent: { not: null } } }),
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(DISTINCT userId) AS c FROM vehicles
      `.then((r) => Number(r[0]?.c ?? 0)),
      prisma.user.count({ where: { employerMileageRatePence: { not: null } } }),
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(DISTINCT userId) AS c FROM trips
      `.then((r) => Number(r[0]?.c ?? 0)),
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(DISTINCT userId) AS c FROM trips
        WHERE classification IN ('business', 'personal')
      `.then((r) => Number(r[0]?.c ?? 0)),
      prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(DISTINCT userId) AS c FROM earnings
      `.then((r) => Number(r[0]?.c ?? 0)),
      prisma.user.count({ where: { isPremium: true } }),
    ]);

    const pct = (n: number) =>
      total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

    return reply.send({
      data: {
        total,
        steps: [
          { label: "Signed up", count: total, pct: 100 },
          { label: "Set work intent", count: withIntent, pct: pct(withIntent) },
          { label: "Added a vehicle", count: withVehicle, pct: pct(withVehicle) },
          { label: "Set employer rate", count: withEmployerRate, pct: pct(withEmployerRate) },
          { label: "Logged first trip", count: withFirstTrip, pct: pct(withFirstTrip) },
          { label: "Classified at least one trip", count: withClassifiedTrip, pct: pct(withClassifiedTrip) },
          { label: "Logged earnings", count: withEarning, pct: pct(withEarning) },
          { label: "Upgraded to Pro", count: premium, pct: pct(premium) },
        ],
      },
    });
  });

  // POST /admin/users/:userId/comp-premium
  // Comp a Pro account with a stated reason. Logs to AppEvent for audit.
  app.post<{ Params: { userId: string }; Body: { reason: string; months: number } }>(
    "/users/:userId/comp-premium",
    async (request, reply) => {
      const { userId } = request.params;
      const schema = z.object({
        reason: z.string().min(3).max(500),
        months: z.number().int().min(1).max(120),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input", details: parsed.error.format() });
      }
      const { reason, months } = parsed.data;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "User not found" });

      const expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: userId },
        data: { isPremium: true, premiumExpiresAt: expiresAt },
      });

      // Audit log via app_events
      await prisma.appEvent.create({
        data: {
          type: "admin.comp_premium",
          userId,
          metadata: {
            adminUserId: request.userId,
            reason,
            months,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return reply.send({
        data: {
          ok: true,
          premiumExpiresAt: expiresAt.toISOString(),
        },
      });
    }
  );

  // GET /admin/audit-log
  // Recent admin actions logged via app_events.
  app.get("/audit-log", async (_request, reply) => {
    const events = await prisma.appEvent.findMany({
      where: { type: { startsWith: "admin." } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { displayName: true, email: true } } },
    });

    return reply.send({
      data: events.map((e) => ({
        id: e.id,
        type: e.type,
        action: e.type.replace("admin.", ""),
        userId: e.userId,
        userLabel: e.user?.displayName || e.user?.email || null,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
    });
  });

  // GET /admin/email-events
  // Recent email-related app events. The transactional email service emits
  // events with type starting "email." when wired up; for now this returns
  // whatever email-typed events have accumulated.
  app.get("/email-events", async (_request, reply) => {
    const events = await prisma.appEvent.findMany({
      where: { type: { startsWith: "email." } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { displayName: true, email: true } } },
    });

    return reply.send({
      data: events.map((e) => ({
        id: e.id,
        type: e.type,
        userId: e.userId,
        userLabel: e.user?.displayName || e.user?.email || null,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
    });
  });

  // GET /admin/top-users
  // Three sorted lists: by total miles, by Pro tenure, by recent engagement.
  app.get("/top-users", async (_request, reply) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [byMiles, byPro, byEngagement] = await Promise.all([
      prisma.$queryRaw<
        Array<{ id: string; displayName: string | null; email: string; totalMiles: number; tripCount: bigint }>
      >`
        SELECT u.id, u.displayName, u.email,
          COALESCE(SUM(t.distanceMiles), 0) AS totalMiles,
          COUNT(t.id) AS tripCount
        FROM users u
        LEFT JOIN trips t ON t.userId = u.id
        GROUP BY u.id
        HAVING totalMiles > 0
        ORDER BY totalMiles DESC
        LIMIT 20
      `,
      prisma.user.findMany({
        where: { isPremium: true },
        select: { id: true, displayName: true, email: true, createdAt: true, premiumExpiresAt: true },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),
      prisma.$queryRaw<
        Array<{ id: string; displayName: string | null; email: string; recentTrips: bigint }>
      >`
        SELECT u.id, u.displayName, u.email,
          COUNT(t.id) AS recentTrips
        FROM users u
        INNER JOIN trips t ON t.userId = u.id
        WHERE t.startedAt >= ${thirtyDaysAgo}
        GROUP BY u.id
        ORDER BY recentTrips DESC
        LIMIT 20
      `,
    ]);

    return reply.send({
      data: {
        byMiles: byMiles.map((u) => ({
          id: u.id,
          label: u.displayName || u.email,
          totalMiles: Number(u.totalMiles ?? 0),
          tripCount: Number(u.tripCount ?? 0),
        })),
        byProTenure: byPro.map((u) => ({
          id: u.id,
          label: u.displayName || u.email,
          // Approximate Pro tenure by user account age (no premiumStartedAt
          // field on the schema yet - early Pro users tend to be early
          // accounts, so this is a reasonable proxy).
          accountAgeDays: Math.floor((Date.now() - u.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
          premiumExpiresAt: u.premiumExpiresAt,
        })),
        byEngagement: byEngagement.map((u) => ({
          id: u.id,
          label: u.displayName || u.email,
          tripsLast30d: Number(u.recentTrips ?? 0),
        })),
      },
    });
  });

  // GET /admin/benchmark-observer
  // Raw bucket data for the Anonymous Benchmarking calculations. Lets us
  // sanity-check the percentiles and watch contributor counts evolve.
  app.get("/benchmark-observer", async (_request, reply) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Per-user weekly miles for the last 30d, then compute median / p25 / p75
    const userWeeklyMiles = await prisma.$queryRaw<
      Array<{ userId: string; totalMiles: number }>
    >`
      SELECT userId, SUM(distanceMiles) AS totalMiles
      FROM trips
      WHERE startedAt >= ${thirtyDaysAgo}
        AND classification = 'business'
      GROUP BY userId
      HAVING totalMiles > 0
    `;

    const miles = userWeeklyMiles
      .map((r) => Number(r.totalMiles))
      .sort((a, b) => a - b);
    const contributors = miles.length;

    function quantile(arr: number[], q: number): number | null {
      if (arr.length === 0) return null;
      const idx = (arr.length - 1) * q;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return Math.round(arr[lo] * 10) / 10;
      return Math.round((arr[lo] + (arr[hi] - arr[lo]) * (idx - lo)) * 10) / 10;
    }

    return reply.send({
      data: {
        category: "monthly_business_miles_per_user",
        windowDays: 30,
        contributors,
        privacyFloorMet: contributors >= 5,
        p25: quantile(miles, 0.25),
        median: quantile(miles, 0.5),
        p75: quantile(miles, 0.75),
        min: miles[0] ?? null,
        max: miles[miles.length - 1] ?? null,
      },
    });
  });

  // ── Build health (per-build regression detection) ────────────────────
  //
  // Returns the most-recent N builds with active-user counts and
  // per-event-type incident rates over a configurable window. Catches
  // "shipped a bug" within hours of release: stuck-recording rate jumps,
  // watchdog pings spike, sync failures climb. The previous build's
  // metrics are the comparison baseline.
  //
  // Audit follow-up #1 from the aggregate health dashboard upgrades.
  app.get("/build-health", async (_request, reply) => {
    const WINDOW_DAYS = 7;
    const MAX_BUILDS = 8;
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Step 1: which builds are active right now (have heartbeats in window)?
    // Group by buildNumber on the User row — that's the user's CURRENT build.
    const activeUsersPerBuild = await prisma.user.groupBy({
      by: ["appVersion", "buildNumber"],
      where: {
        lastHeartbeatAt: { gte: since },
        buildNumber: { not: null },
      },
      _count: { id: true },
    });

    if (activeUsersPerBuild.length === 0) {
      return reply.send({
        data: {
          windowDays: WINDOW_DAYS,
          builds: [],
          generatedAt: new Date().toISOString(),
        },
      });
    }

    // Step 2: order builds by buildNumber descending, take the most recent
    // MAX_BUILDS. buildNumber is a string but compares correctly as numeric
    // for now — Anthony's monotonic-incrementing convention keeps it sortable.
    const sortedBuilds = activeUsersPerBuild
      .filter((b) => b.buildNumber !== null)
      .sort((a, b) => {
        const an = parseInt(a.buildNumber!, 10);
        const bn = parseInt(b.buildNumber!, 10);
        if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
        if (Number.isNaN(an)) return 1;
        if (Number.isNaN(bn)) return -1;
        return bn - an;
      })
      .slice(0, MAX_BUILDS);

    // Step 3: for each build, count events by type within the window.
    // Filter on app_events.buildNumber (the snapshot taken at event time)
    // not user.buildNumber (their current build) so the metrics are
    // accurate even as users upgrade.
    const buildNumbers = sortedBuilds.map((b) => b.buildNumber!);
    const eventCounts = await prisma.appEvent.groupBy({
      by: ["buildNumber", "type"],
      where: {
        buildNumber: { in: buildNumbers },
        createdAt: { gte: since },
      },
      _count: { id: true },
    });

    // Step 4: Pivot — for each build, build a { eventType: count } map.
    const eventsByBuild = new Map<string, Record<string, number>>();
    for (const row of eventCounts) {
      if (!row.buildNumber) continue;
      const map = eventsByBuild.get(row.buildNumber) ?? {};
      map[row.type] = row._count.id;
      eventsByBuild.set(row.buildNumber, map);
    }

    // Step 5: Build the per-build summary objects.
    const builds = sortedBuilds.map((b) => {
      const events = eventsByBuild.get(b.buildNumber!) ?? {};
      const activeUsers = b._count.id;

      const watchdogPings = events["watchdog.silent_push_sent"] ?? 0;
      const reconciliationDrift = events["reconciliation.drift"] ?? 0;
      const slowRequests = events["perf.slow_request"] ?? 0;
      const loginFailures = events["auth.login_failed"] ?? 0;
      const passwordChangeFailures = events["auth.change_password_failed"] ?? 0;
      const tripCreated = events["trip.created"] ?? 0;
      const tripDeleted = events["trip.deleted"] ?? 0;
      const idempotencyReplays = events["idempotency.replay"] ?? 0;

      const tripDeletionRatePct =
        tripCreated > 0 ? Math.round((tripDeleted / tripCreated) * 1000) / 10 : 0;

      return {
        appVersion: b.appVersion ?? "unknown",
        buildNumber: b.buildNumber!,
        activeUsers,
        // Per-user rates — comparable across builds with different audience sizes.
        watchdogPingsPerUser:
          activeUsers > 0 ? Math.round((watchdogPings / activeUsers) * 100) / 100 : 0,
        reconciliationDriftPerUser:
          activeUsers > 0 ? Math.round((reconciliationDrift / activeUsers) * 100) / 100 : 0,
        slowRequestsPerUser:
          activeUsers > 0 ? Math.round((slowRequests / activeUsers) * 100) / 100 : 0,
        loginFailuresPerUser:
          activeUsers > 0 ? Math.round((loginFailures / activeUsers) * 100) / 100 : 0,
        // Absolute counts kept for raw inspection.
        watchdogPings,
        reconciliationDrift,
        slowRequests,
        loginFailures,
        passwordChangeFailures,
        tripCreated,
        tripDeleted,
        tripDeletionRatePct,
        idempotencyReplays,
      };
    });

    return reply.send({
      data: {
        windowDays: WINDOW_DAYS,
        builds,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // ── Apple IAP: reprocess no_user webhook orphans ──────────────────
  //
  // Loops every apple_iap_webhook_logs row with status='no_user', re-fetches
  // the canonical transaction from Apple's App Store Server API, and tries
  // to link to a MileClear user via the appAccountToken on that canonical
  // record (which is sometimes missing from the inbound webhook JWS).
  //
  // Discovered 4 May 2026: 4 production users had subscribed without ever
  // being linked because their inbound webhooks had null appAccountToken
  // and the mobile validate call also never reached us. This endpoint is
  // the catch-up for those orphans; the webhook handler now does the same
  // re-fetch automatically going forward.
  app.post("/apple/reprocess-orphans", async (_request, reply) => {
    const apiClient = getAppleClient();
    const verifier = getSignedDataVerifier();
    if (!apiClient || !verifier) {
      return reply.status(503).send({ error: "Apple IAP not configured" });
    }

    const orphans = await prisma.appleIapWebhookLog.findMany({
      where: { status: "no_user" },
      orderBy: { receivedAt: "desc" },
    });

    const results: Array<{
      txn: string;
      receivedAt: string;
      outcome: "linked" | "still_no_user" | "no_appAccountToken" | "fetch_failed" | "conflict" | "no_txn_id";
      userId?: string;
      userEmail?: string;
      detail?: string;
    }> = [];

    for (const log of orphans) {
      const txn = log.originalTransactionId;
      if (!txn) {
        results.push({
          txn: "(null)",
          receivedAt: log.receivedAt.toISOString(),
          outcome: "no_txn_id",
        });
        continue;
      }

      // Maybe a previous reprocess already linked this. Skip if so.
      const alreadyLinked = await prisma.user.findUnique({
        where: { appleOriginalTransactionId: txn },
        select: { id: true, email: true },
      });
      if (alreadyLinked) {
        results.push({
          txn,
          receivedAt: log.receivedAt.toISOString(),
          outcome: "linked",
          userId: alreadyLinked.id,
          userEmail: alreadyLinked.email,
          detail: "Already linked (presumably by a later webhook or admin action)",
        });
        continue;
      }

      let appAccountToken: string | null = null;
      try {
        // Use the env-fallback helper: try the env recorded on the webhook
        // log first, then the other one. The env-mismatch 404 is what was
        // breaking production validate before this fix.
        const preferredEnv: AppleIapEnvironment | undefined =
          log.environment === "production" || log.environment === "sandbox"
            ? log.environment
            : undefined;
        const fetched = await fetchTransactionWithEnvFallback(txn, preferredEnv);
        if (!fetched) {
          results.push({
            txn,
            receivedAt: log.receivedAt.toISOString(),
            outcome: "fetch_failed",
            detail: "Transaction not found in either Sandbox or Production",
          });
          continue;
        }
        appAccountToken = fetched.transaction.appAccountToken ?? null;
      } catch (err) {
        results.push({
          txn,
          receivedAt: log.receivedAt.toISOString(),
          outcome: "fetch_failed",
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      if (!appAccountToken) {
        results.push({
          txn,
          receivedAt: log.receivedAt.toISOString(),
          outcome: "no_appAccountToken",
          detail: "Apple did not include appAccountToken on the canonical transaction either",
        });
        continue;
      }

      const userToLink = await prisma.user.findUnique({
        where: { id: appAccountToken },
        select: { id: true, email: true, appleOriginalTransactionId: true },
      });
      if (!userToLink) {
        results.push({
          txn,
          receivedAt: log.receivedAt.toISOString(),
          outcome: "still_no_user",
          detail: `appAccountToken ${appAccountToken} matched no user`,
        });
        continue;
      }
      if (
        userToLink.appleOriginalTransactionId &&
        userToLink.appleOriginalTransactionId !== txn
      ) {
        results.push({
          txn,
          receivedAt: log.receivedAt.toISOString(),
          outcome: "conflict",
          userId: userToLink.id,
          userEmail: userToLink.email,
          detail: `User already linked to a different txn (${userToLink.appleOriginalTransactionId})`,
        });
        continue;
      }

      await prisma.user.update({
        where: { id: userToLink.id },
        data: {
          appleOriginalTransactionId: txn,
          isPremium: true,
          // Premium expiry will be set/refreshed by the next webhook hit on
          // this transaction (renewal, billing change, etc). Not setting
          // here because we don't have the expiresDate from the JWS without
          // re-decoding — happy to set if needed via a second fetch.
        },
      });

      logEvent("billing.apple_iap_reprocessed", userToLink.id, {
        originalTransactionId: txn,
        webhookReceivedAt: log.receivedAt.toISOString(),
      });

      results.push({
        txn,
        receivedAt: log.receivedAt.toISOString(),
        outcome: "linked",
        userId: userToLink.id,
        userEmail: userToLink.email,
        detail: "Linked via canonical-transaction appAccountToken re-fetch",
      });
    }

    return reply.send({ data: { processed: results.length, results } });
  });

  // ── Funnel cohorts (audit follow-up #3 of 5) ──────────────────────
  //
  // Per-month cohort funnel covering the user's first 30-ish days from
  // registration. Surfaces WHICH month started underperforming, not
  // just whether the global funnel is healthy.
  //
  // Steps: registered → first trip → first classification → first export
  //   → upgraded to Pro. The Pro step is global (any time) since
  //   conversion can take months; the others are within 30 days of
  //   registration so the rates are comparable across cohorts.
  app.get("/funnel/cohorts", async (_request, reply) => {
    const COHORT_MONTHS = 6;
    const ACTIVATION_WINDOW_DAYS = 30;

    // Last N month boundaries, oldest first.
    const now = new Date();
    const months: { key: string; start: Date; end: Date }[] = [];
    for (let i = COHORT_MONTHS - 1; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
      const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
      months.push({ key, start, end });
    }

    // Single SQL query computing every step per cohort. EXISTS subqueries
    // beat per-cohort serial round trips by a wide margin (we'd otherwise
    // run 6 cohorts × 4 step queries = 24 queries; here we run 1).
    const rows = await prisma.$queryRaw<
      Array<{
        cohort: string;
        registered: bigint;
        firstTrip: bigint;
        firstClassification: bigint;
        firstExport: bigint;
        upgradedToPro: bigint;
      }>
    >`
      SELECT
        DATE_FORMAT(u.createdAt, '%Y-%m') AS cohort,
        COUNT(*) AS registered,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM trips t
          WHERE t.userId = u.id
            AND t.createdAt < DATE_ADD(u.createdAt, INTERVAL ${ACTIVATION_WINDOW_DAYS} DAY)
        ) THEN 1 ELSE 0 END) AS firstTrip,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM trips t
          WHERE t.userId = u.id
            AND t.classification IN ('business', 'personal')
            AND t.createdAt < DATE_ADD(u.createdAt, INTERVAL ${ACTIVATION_WINDOW_DAYS} DAY)
        ) THEN 1 ELSE 0 END) AS firstClassification,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM app_events e
          WHERE e.userId = u.id
            AND e.type IN ('export.csv', 'export.pdf', 'export.self_assessment')
            AND e.createdAt < DATE_ADD(u.createdAt, INTERVAL ${ACTIVATION_WINDOW_DAYS} DAY)
        ) THEN 1 ELSE 0 END) AS firstExport,
        SUM(CASE WHEN u.isPremium = 1 THEN 1 ELSE 0 END) AS upgradedToPro
      FROM users u
      WHERE u.createdAt >= ${months[0].start}
        AND u.createdAt < ${months[months.length - 1].end}
      GROUP BY DATE_FORMAT(u.createdAt, '%Y-%m')
      ORDER BY cohort ASC
    `;

    const byKey = new Map(rows.map((r) => [r.cohort, r]));

    const pct = (n: number, denom: number) =>
      denom > 0 ? Math.round((n / denom) * 1000) / 10 : 0;

    const cohorts = months.map(({ key }) => {
      const row = byKey.get(key);
      const registered = Number(row?.registered ?? 0);
      const firstTrip = Number(row?.firstTrip ?? 0);
      const firstClassification = Number(row?.firstClassification ?? 0);
      const firstExport = Number(row?.firstExport ?? 0);
      const upgradedToPro = Number(row?.upgradedToPro ?? 0);

      return {
        cohort: key,
        registered,
        firstTrip,
        firstClassification,
        firstExport,
        upgradedToPro,
        rateFirstTrip: pct(firstTrip, registered),
        rateClassification: pct(firstClassification, firstTrip),
        rateExport: pct(firstExport, firstClassification),
        rateProConversion: pct(upgradedToPro, registered),
      };
    });

    return reply.send({
      data: {
        activationWindowDays: ACTIVATION_WINDOW_DAYS,
        cohorts,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // ── Time-of-day issue patterns (audit follow-up #5 of 5) ──────────
  //
  // Hourly histogram (UTC, 0-23) of the diagnostic-event types we
  // care about. Surfaces patterns like "watchdog pings spike at 8am
  // every day" (commute / rush hour reliability) or "logins fail at
  // 2am UTC consistently" (timezone bug). 14-day window.
  //
  // Uses Prisma.sql for the IN clause — the previous attempt with
  // template-string interpolation breaks the parameterised binding.
  app.get("/issues-by-hour", async (_request, reply) => {
    const WINDOW_DAYS = 14;
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Watch a curated set, not every event. Informational events like
    // trip.created don't belong here.
    const TRACKED_TYPES = [
      "watchdog.silent_push_sent",
      "watchdog.drain_sync_push_sent",
      "alert.stuck_recording",
      "alert.permission_missing",
      "alert.task_not_running",
      "perf.slow_request",
      "auth.login_failed",
      "reconciliation.drift",
    ];

    const rows = await prisma.appEvent.groupBy({
      by: ["type"],
      where: {
        type: { in: TRACKED_TYPES },
        createdAt: { gte: since },
      },
      _count: { id: true },
    });

    // We need hour-of-day grouping which Prisma's groupBy can't do
    // natively. Drop to a parameterised raw query.
    const hourly = await prisma.$queryRaw<
      Array<{ type: string; hour: number; count: bigint }>
    >(
      Prisma.sql`
        SELECT type, HOUR(createdAt) AS hour, COUNT(*) AS count
        FROM app_events
        WHERE type IN (${Prisma.join(TRACKED_TYPES)})
          AND createdAt >= ${since}
        GROUP BY type, HOUR(createdAt)
        ORDER BY type, hour
      `
    );

    const series: Record<string, number[]> = {};
    for (const t of TRACKED_TYPES) series[t] = new Array(24).fill(0);
    for (const row of hourly) {
      if (series[row.type]) {
        series[row.type][Number(row.hour)] = Number(row.count);
      }
    }

    const totalsByHour: number[] = new Array(24).fill(0);
    for (const arr of Object.values(series)) {
      for (let h = 0; h < 24; h++) totalsByHour[h] += arr[h];
    }
    const totalsByType: Record<string, number> = {};
    for (const r of rows) {
      totalsByType[r.type] = r._count.id;
    }

    return reply.send({
      data: {
        windowDays: WINDOW_DAYS,
        series,
        totalsByHour,
        totalsByType,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // ── Rating funnel diagnostics ─────────────────────────────────────
  //
  // Two sub-views to investigate the gap between admin "Love it!"
  // counts and ratings actually appearing in App Store Connect:
  //
  // 1. By build — confirms whether love_it events came from public
  //    App Store builds (would land in App Store Connect) or
  //    TestFlight builds (silently dropped by Apple).
  //
  // 2. By user — counts distinct users who fired love_it events plus
  //    repeats. Apple silently no-ops requestReview() once a user
  //    has hit 3 prompts in 365 days, so users with 2+ love_it events
  //    are candidates for the silent ceiling.
  app.get("/rating/diagnostics", async (_request, reply) => {
    const events = await prisma.appEvent.findMany({
      where: { type: "rating.love_it" },
      select: {
        userId: true,
        appVersion: true,
        buildNumber: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // By build
    const byBuildMap = new Map<string, { count: number; appVersion: string | null }>();
    for (const e of events) {
      const key = e.buildNumber ?? "unknown";
      const existing = byBuildMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        byBuildMap.set(key, { count: 1, appVersion: e.appVersion ?? null });
      }
    }
    const byBuild = Array.from(byBuildMap.entries())
      .map(([buildNumber, v]) => ({
        buildNumber,
        appVersion: v.appVersion,
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count);

    // By user — distinct user count + repeat tally. Repeats indicate
    // the per-user-per-year ceiling is biting.
    const byUserMap = new Map<string, number>();
    for (const e of events) {
      if (!e.userId) continue;
      byUserMap.set(e.userId, (byUserMap.get(e.userId) ?? 0) + 1);
    }
    const userCounts = Array.from(byUserMap.values());
    const distinctUsers = userCounts.length;
    const usersWithSinglePrompt = userCounts.filter((n) => n === 1).length;
    const usersWithRepeat = userCounts.filter((n) => n >= 2).length;
    const usersAt3Plus = userCounts.filter((n) => n >= 3).length;
    const totalLoveItEvents = events.length;

    return reply.send({
      data: {
        totalLoveItEvents,
        distinctUsers,
        usersWithSinglePrompt,
        usersWithRepeat,
        usersAt3Plus,
        byBuild,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // ── Geographic density (audit follow-up #4 of 5) ──────────────────
  //
  // Bucket trip starts onto a 0.1° lat/lng grid (~11km cells in the
  // UK) and return per-cell counts. We apply a privacy floor so a
  // cell is only emitted when at least N distinct users have started
  // a trip there — keeps individuals from being identifiable by their
  // home / work corner of the map.
  app.get("/geographic-density", async (_request, reply) => {
    const WINDOW_DAYS = 30;
    const MIN_USERS_PER_CELL = 5;
    const GRID_SIZE = 0.1;
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // MySQL's only_full_group_by mode rejects SELECT expressions that
    // aren't byte-identical to GROUP BY ones. Group by bucket index
    // and multiply back to coordinates in JS.
    const rows = await prisma.$queryRaw<
      Array<{ latBucket: number; lngBucket: number; tripCount: bigint; userCount: bigint }>
    >(Prisma.sql`
      SELECT
        ROUND(startLat / ${GRID_SIZE}) AS latBucket,
        ROUND(startLng / ${GRID_SIZE}) AS lngBucket,
        COUNT(*) AS tripCount,
        COUNT(DISTINCT userId) AS userCount
      FROM trips
      WHERE startedAt >= ${since}
        AND startLat IS NOT NULL
        AND startLng IS NOT NULL
      GROUP BY latBucket, lngBucket
      HAVING COUNT(DISTINCT userId) >= ${MIN_USERS_PER_CELL}
      ORDER BY tripCount DESC
    `);

    const cells = rows.map((r) => ({
      lat: Math.round(r.latBucket * GRID_SIZE * 100) / 100,
      lng: Math.round(r.lngBucket * GRID_SIZE * 100) / 100,
      tripCount: Number(r.tripCount),
      userCount: Number(r.userCount),
    }));

    const totalTrips = cells.reduce((acc, c) => acc + c.tripCount, 0);
    const maxTripsInCell = cells.reduce(
      (acc, c) => (c.tripCount > acc ? c.tripCount : acc),
      0
    );

    return reply.send({
      data: {
        windowDays: WINDOW_DAYS,
        gridSizeDegrees: GRID_SIZE,
        minUsersPerCell: MIN_USERS_PER_CELL,
        cells,
        totalTrips,
        maxTripsInCell,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // ── Slow requests, broken down by endpoint ────────────────────────
  //
  // perf.slow_request dominates the issues-by-hour chart; this is the
  // drill. Pulls every slow_request event in the 14-day window and
  // groups by a normalised path (UUIDs and numeric IDs collapsed to
  // ":id", query strings stripped). Reports count, avg duration, p95.
  app.get("/slow-requests-by-endpoint", async (_request, reply) => {
    const WINDOW_DAYS = 14;
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const events = await prisma.appEvent.findMany({
      where: {
        type: "perf.slow_request",
        createdAt: { gte: since },
      },
      select: { metadata: true },
    });

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const NUMERIC_RE = /^\d+$/;

    function normalisePath(raw: string): string {
      const noQuery = raw.split("?")[0];
      return noQuery
        .split("/")
        .map((seg) => {
          if (!seg) return seg;
          if (UUID_RE.test(seg)) return ":id";
          if (NUMERIC_RE.test(seg)) return ":id";
          return seg;
        })
        .join("/");
    }

    const groups = new Map<
      string,
      { method: string; path: string; durations: number[]; statusCounts: Map<number, number> }
    >();

    for (const e of events) {
      const md = e.metadata as { path?: unknown; method?: unknown; durationMs?: unknown; statusCode?: unknown } | null;
      if (!md || typeof md.path !== "string" || typeof md.durationMs !== "number") continue;
      const method = typeof md.method === "string" ? md.method : "?";
      const path = normalisePath(md.path);
      const status = typeof md.statusCode === "number" ? md.statusCode : 0;
      const key = `${method} ${path}`;
      let g = groups.get(key);
      if (!g) {
        g = { method, path, durations: [], statusCounts: new Map() };
        groups.set(key, g);
      }
      g.durations.push(md.durationMs);
      g.statusCounts.set(status, (g.statusCounts.get(status) ?? 0) + 1);
    }

    const rows = Array.from(groups.entries()).map(([key, g]) => {
      const sorted = [...g.durations].sort((a, b) => a - b);
      const avg = sorted.reduce((acc, n) => acc + n, 0) / sorted.length;
      const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      const p95 = sorted[p95Idx];
      const max = sorted[sorted.length - 1];
      const topStatus = Array.from(g.statusCounts.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0] ?? 0;
      return {
        key,
        method: g.method,
        path: g.path,
        count: g.durations.length,
        avgDurationMs: Math.round(avg),
        p95DurationMs: Math.round(p95),
        maxDurationMs: Math.round(max),
        topStatus,
      };
    });

    rows.sort((a, b) => b.count - a.count);

    return reply.send({
      data: {
        windowDays: WINDOW_DAYS,
        thresholdMs: 2000,
        totalEvents: events.length,
        rows: rows.slice(0, 25),
        distinctEndpoints: rows.length,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // ── Background fetch status snapshot ──────────────────────────────
  //
  // Counts users by their last-reported iOS Background App Refresh
  // state. "denied" / "restricted" mean iOS won't run our background
  // tasks at all — a quiet killer for trip-recording reliability.
  // Snapshot only (no historical trend); tracks current population.
  app.get("/background-fetch-status", async (_request, reply) => {
    const rows = await prisma.user.groupBy({
      by: ["backgroundFetchStatus"],
      _count: { id: true },
    });

    // Only count users active enough to matter — bg-fetch denial only
    // hurts users who actually use the app.
    const ACTIVE_DAYS = 30;
    const activeSince = new Date(Date.now() - ACTIVE_DAYS * 24 * 60 * 60 * 1000);
    const activeRows = await prisma.user.groupBy({
      by: ["backgroundFetchStatus"],
      where: {
        OR: [
          { lastHeartbeatAt: { gte: activeSince } },
          { lastDrivingSpeedAt: { gte: activeSince } },
        ],
      },
      _count: { id: true },
    });

    function shape(rs: Array<{ backgroundFetchStatus: string | null; _count: { id: number } }>) {
      const counts: Record<string, number> = {
        available: 0,
        denied: 0,
        restricted: 0,
        unknown: 0,
        not_reported: 0,
      };
      for (const r of rs) {
        const key = r.backgroundFetchStatus ?? "not_reported";
        counts[key] = (counts[key] ?? 0) + r._count.id;
      }
      return counts;
    }

    return reply.send({
      data: {
        activeWindowDays: ACTIVE_DAYS,
        all: shape(rows),
        active: shape(activeRows),
        generatedAt: new Date().toISOString(),
      },
    });
  });
}
