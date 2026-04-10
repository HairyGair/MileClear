import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { adminMiddleware } from "../../middleware/admin.js";
import { stripe } from "../../lib/stripe.js";
import { sendReEngagementEmail, sendServiceStatusEmail, sendUpdateEmail } from "../../services/email.js";
import { logEvent } from "../../services/appEvents.js";
import { sendPushNotifications } from "../../lib/push.js";
import { PREMIUM_PRICE_MONTHLY_PENCE } from "@mileclear/shared";

const premiumToggleSchema = z.object({
  isPremium: z.boolean(),
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
      },
    });
  });

  // GET /admin/users
  app.get("/users", async (request, reply) => {
    const { q, page, pageSize } = request.query as {
      q?: string;
      page?: string;
      pageSize?: string;
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
          _count: { select: { trips: true, vehicles: true, earnings: true } },
          diagnosticDump: { select: { verdict: true, capturedAt: true } },
        },
        orderBy: { createdAt: "desc" },
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
        await sendReEngagementEmail(user.email, user.displayName, stats);
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
        await sendUpdateEmail(user.email, user.displayName);
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
        await sendServiceStatusEmail(user.email, user.displayName);
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
}
