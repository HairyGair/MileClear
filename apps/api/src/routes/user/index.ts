import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { stripe } from "../../lib/stripe.js";
import { verifyPassword } from "../../services/auth.js";

const updateProfileSchema = z.object({
  displayName: z.string().max(100).nullable().optional(),
  fullName: z.string().max(200).nullable().optional(),
  avatarId: z.string().max(50).nullable().optional(),
  userIntent: z.enum(["work", "personal", "both"]).nullable().optional(),
  workType: z.enum(["gig", "employee", "both"]).optional(),
  employerMileageRatePence: z.number().int().min(0).max(100).nullable().optional(),
  dashboardMode: z.enum(["both", "work", "personal"]).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
});

const deleteAccountSchema = z.object({
  password: z.string(),
});

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  fullName: true,
  avatarId: true,
  userIntent: true,
  workType: true,
  employerMileageRatePence: true,
  dashboardMode: true,
  emailVerified: true,
  isPremium: true,
  isAdmin: true,
  premiumExpiresAt: true,
  createdAt: true,
} as const;

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // Get current user profile
  app.get("/profile", async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId! },
      select: USER_SELECT,
    });

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    return reply.send({ data: user });
  });

  // Update profile
  app.patch("/profile", async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const userId = request.userId!;
    const { displayName, fullName, avatarId, userIntent, workType, employerMileageRatePence, dashboardMode, email, currentPassword } = parsed.data;

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });

    if (!currentUser) {
      return reply.status(404).send({ error: "User not found" });
    }

    const updateData: Record<string, unknown> = {};

    // Display name can always be updated
    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }

    // Full name (legal name for exports) can always be updated
    if (fullName !== undefined) {
      updateData.fullName = fullName;
    }

    // Avatar can always be updated
    if (avatarId !== undefined) {
      updateData.avatarId = avatarId;
    }

    // User intent can always be updated
    if (userIntent !== undefined) {
      updateData.userIntent = userIntent;
    }

    // Work type can always be updated
    if (workType !== undefined) {
      updateData.workType = workType;
    }

    // Employer mileage rate can always be updated
    if (employerMileageRatePence !== undefined) {
      updateData.employerMileageRatePence = employerMileageRatePence;
    }

    // Dashboard mode can always be updated
    if (dashboardMode !== undefined) {
      updateData.dashboardMode = dashboardMode;
    }

    // Email change requires password verification
    if (email && email !== currentUser.email) {
      if (!currentUser.passwordHash) {
        return reply.status(400).send({
          error: "Cannot change email on OAuth-only accounts",
        });
      }

      if (!currentPassword) {
        return reply.status(400).send({
          error: "Current password is required to change email",
        });
      }

      const valid = await verifyPassword(currentPassword, currentUser.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: "Incorrect password" });
      }

      // Check email uniqueness
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({ error: "Email already in use" });
      }

      updateData.email = email;
      updateData.emailVerified = false;
    }

    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({ error: "No changes provided" });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SELECT,
    });

    return reply.send({ data: user });
  });

  // GDPR data export
  app.get("/export", async (request, reply) => {
    const userId = request.userId!;

    const [user, vehicles, shifts, trips, fuelLogs, earnings, achievements, mileageSummaries, tripAnomalies] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: USER_SELECT,
        }),
        prisma.vehicle.findMany({ where: { userId } }),
        prisma.shift.findMany({ where: { userId } }),
        prisma.trip.findMany({
          where: { userId },
          take: 10000,
          include: { coordinates: { take: 1000 } },
        }),
        prisma.fuelLog.findMany({ where: { userId } }),
        prisma.earning.findMany({ where: { userId } }),
        prisma.achievement.findMany({ where: { userId } }),
        prisma.mileageSummary.findMany({ where: { userId } }),
        prisma.tripAnomaly.findMany({ where: { userId } }),
      ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user,
      vehicles,
      shifts,
      trips,
      fuelLogs,
      earnings,
      achievements,
      mileageSummaries,
      tripAnomalies,
    };

    reply.header("Content-Disposition", "attachment; filename=mileclear-data-export.json");
    return reply.send(exportData);
  });

  // Delete account
  app.delete("/account", async (request, reply) => {
    const userId = request.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, stripeSubscriptionId: true },
    });

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    // OAuth-only accounts can delete without password
    if (user.passwordHash) {
      const parsed = deleteAccountSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Password is required" });
      }

      const valid = await verifyPassword(parsed.data.password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: "Incorrect password" });
      }
    }

    // Cancel Stripe subscription before deleting account
    if (user.stripeSubscriptionId && stripe) {
      try {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      } catch (err) {
        console.error("Failed to cancel subscription:", err);
      }
    }

    request.log.warn(
      { userId, action: "account.delete" },
      `User deleted their own account: ${userId}`
    );

    await prisma.user.delete({ where: { id: userId } });

    return reply.send({ message: "Account deleted" });
  });
}
