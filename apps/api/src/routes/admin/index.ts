import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { adminMiddleware } from "../../middleware/admin.js";
import { stripe } from "../../lib/stripe.js";
import { sendReEngagementEmail, sendServiceStatusEmail, sendUpdateEmail } from "../../services/email.js";
import { logEvent } from "../../services/appEvents.js";

const premiumToggleSchema = z.object({
  isPremium: z.boolean(),
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
