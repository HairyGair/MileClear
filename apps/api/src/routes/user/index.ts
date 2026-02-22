import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { stripe } from "../../lib/stripe.js";
import { verifyPassword } from "../../services/auth.js";

const updateProfileSchema = z.object({
  displayName: z.string().max(100).nullable().optional(),
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
  emailVerified: true,
  isPremium: true,
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
    const { displayName, email, currentPassword } = parsed.data;

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

    const [user, vehicles, shifts, trips, fuelLogs, earnings, achievements, mileageSummaries] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: USER_SELECT,
        }),
        prisma.vehicle.findMany({ where: { userId } }),
        prisma.shift.findMany({ where: { userId } }),
        prisma.trip.findMany({
          where: { userId },
          include: { coordinates: true },
        }),
        prisma.fuelLog.findMany({ where: { userId } }),
        prisma.earning.findMany({ where: { userId } }),
        prisma.achievement.findMany({ where: { userId } }),
        prisma.mileageSummary.findMany({ where: { userId } }),
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

    await prisma.user.delete({ where: { id: userId } });

    return reply.send({ message: "Account deleted" });
  });
}
