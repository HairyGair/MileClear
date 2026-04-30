import { FastifyInstance } from "fastify";
import { z } from "zod";
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
  audience: z.enum(["all", "premium", "inactive", "specific"]),
  userId: z.string().optional(),
  inactiveDays: z.number().int().min(1).max(365).optional(),
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
          _count: { select: { trips: true, vehicles: true, earnings: true } },
          diagnosticDump: { select: { verdict: true, capturedAt: true } },
        },
        orderBy,
        skip,
        take: size,
      }),
      prisma.user.count({ where }),
    ]);

    return reply.send({
      data: users,
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

    return reply.send({
      data: {
        ...user,
        totalMiles: Math.round((mileageAgg._sum.distanceMiles ?? 0) * 10) / 10,
        totalEarningsPence: earningsAgg._sum.amountPence ?? 0,
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

    const { audience, userId, inactiveDays, title, body, dryRun } = parsed.data;

    if (audience === "specific" && !userId) {
      return reply.status(400).send({ error: "userId required for specific audience" });
    }

    // Build user query based on audience
    let users: Array<{ id: string; pushToken: string | null }>;

    if (audience === "specific") {
      users = await prisma.user.findMany({
        where: { id: userId, pushToken: { not: null } },
        select: { id: true, pushToken: true },
      });
    } else if (audience === "premium") {
      users = await prisma.user.findMany({
        where: { isPremium: true, pushToken: { not: null } },
        select: { id: true, pushToken: true },
      });
    } else if (audience === "inactive") {
      const cutoff = new Date(Date.now() - (inactiveDays ?? 14) * 24 * 60 * 60 * 1000);
      // Users with push token who have no trips since the cutoff
      const activeUserIds = await prisma.trip.findMany({
        where: { startedAt: { gte: cutoff } },
        select: { userId: true },
        distinct: ["userId"],
      });
      const activeSet = new Set(activeUserIds.map((r) => r.userId));
      const allWithToken = await prisma.user.findMany({
        where: { pushToken: { not: null } },
        select: { id: true, pushToken: true },
      });
      users = allWithToken.filter((u) => !activeSet.has(u.id));
    } else {
      // all
      users = await prisma.user.findMany({
        where: { pushToken: { not: null } },
        select: { id: true, pushToken: true },
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
}
