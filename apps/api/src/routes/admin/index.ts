import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authMiddleware } from "../../middleware/auth.js";
import { adminMiddleware } from "../../middleware/admin.js";

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

    return reply.send({ data: updated });
  });

  // DELETE /admin/users/:userId
  app.delete("/users/:userId", async (request, reply) => {
    const { userId } = request.params as { userId: string };

    if (userId === request.userId) {
      return reply.status(400).send({ error: "Cannot delete your own account via admin" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    await prisma.user.delete({ where: { id: userId } });

    return reply.send({ message: "User deleted" });
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
