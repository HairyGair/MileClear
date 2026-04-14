import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { stripe } from "../../lib/stripe.js";
import { verifyPassword } from "../../services/auth.js";
import { sendPushToUser } from "../../lib/push.js";
import { logEvent } from "../../services/appEvents.js";

const updateProfileSchema = z.object({
  displayName: z.string().max(100).nullable().optional(),
  fullName: z.string().max(200).nullable().optional(),
  avatarId: z.string().max(50).nullable().optional(),
  userIntent: z.enum(["work", "personal", "both"]).nullable().optional(),
  workType: z.enum(["gig", "employee", "both"]).optional(),
  employerMileageRatePence: z.number().int().min(0).max(100).nullable().optional(),
  dashboardMode: z.enum(["both", "work", "personal"]).optional(),
  weeklyEarningsGoalPence: z.number().int().min(0).max(1000000).nullable().optional(),
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
  weeklyEarningsGoalPence: true,
  emailVerified: true,
  isPremium: true,
  isAdmin: true,
  premiumExpiresAt: true,
  createdAt: true,
} as const;

const ALERT_COOLDOWN_DAYS = 7;

async function wasAlertedRecently(userId: string, alertType: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const existing = await prisma.appEvent.findFirst({
    where: {
      userId,
      type: alertType,
      createdAt: { gte: cutoff },
    },
  });
  return !!existing;
}

async function analyzeDiagnosticAndAlert(
  userId: string,
  statusJson: Record<string, unknown>,
): Promise<void> {
  const bgPermission = statusJson.backgroundPermission as string | undefined;
  const taskRunning = statusJson.taskRunning as boolean | undefined;
  const enabled = statusJson.enabled as boolean | undefined;
  const autoRecording = statusJson.autoRecordingActive as boolean | undefined;
  const lastDrivingStr = (statusJson.trackingState as Array<{ key: string; value: string }> | undefined)
    ?.find((s) => s.key === "last_driving_speed_at")?.value;

  // Helper: send alert to user + notify all admins
  async function sendAlertWithAdminNotify(
    alertUserId: string,
    alertType: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ) {
    if (await wasAlertedRecently(alertUserId, alertType)) return;

    // Alert the user
    await sendPushToUser(alertUserId, title, body, data);
    logEvent(alertType, alertUserId, metadata);

    // Notify all admins
    const user = await prisma.user.findUnique({
      where: { id: alertUserId },
      select: { email: true, displayName: true },
    });
    const admins = await prisma.user.findMany({
      where: { isAdmin: true, pushToken: { not: null } },
      select: { id: true },
    });
    const userName = user?.displayName || user?.email || alertUserId;
    for (const admin of admins) {
      await sendPushToUser(
        admin.id,
        `Diagnostic alert: ${userName}`,
        `${title} - ${body}`,
        { action: "open_admin", userId: alertUserId },
      ).catch(() => {});
    }
  }

  // Alert 1: Background permission not granted
  if (bgPermission && bgPermission !== "granted") {
    await sendAlertWithAdminNotify(
      userId,
      "alert.permission_missing",
      "Trips aren't recording automatically",
      "MileClear needs background location to detect your drives. Go to Settings > MileClear > Location > Always.",
      { action: "open_settings" },
      { bgPermission },
    );
  }

  // Alert 2: Task not running but detection is enabled
  if (taskRunning === false && enabled === true) {
    await sendAlertWithAdminNotify(
      userId,
      "alert.task_not_running",
      "Drive detection stopped",
      "MileClear's background task isn't running. Try closing and reopening the app to restart it.",
      { action: "open_dashboard" },
    );
  }

  // Alert 3: Stuck recording (active but no driving for >30 min)
  if (autoRecording === true && lastDrivingStr) {
    const lastDrivingMs = parseInt(lastDrivingStr, 10);
    const elapsed = Date.now() - lastDrivingMs;
    if (elapsed > 30 * 60 * 1000) {
      await sendAlertWithAdminNotify(
        userId,
        "alert.stuck_recording",
        "A trip is waiting to save",
        "It looks like a recording is still running. Open MileClear to save the trip.",
        { action: "open_trips" },
        { elapsedMs: elapsed },
      );
    }
  }
}

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

    // Weekly earnings goal
    if (parsed.data.weeklyEarningsGoalPence !== undefined) {
      updateData.weeklyEarningsGoalPence = parsed.data.weeklyEarningsGoalPence;
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

  // GET /user/weekly-progress
  app.get("/weekly-progress", async (request, reply) => {
    const userId = request.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weeklyEarningsGoalPence: true },
    });

    // ISO week: Monday to Sunday
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));

    const earningsAgg = await prisma.earning.aggregate({
      where: {
        userId,
        periodStart: { gte: weekStart },
      },
      _sum: { amountPence: true },
    });

    const currentWeekEarningsPence = earningsAgg._sum?.amountPence ?? 0;
    const goalPence = user?.weeklyEarningsGoalPence ?? null;
    const progressPercent = goalPence && goalPence > 0
      ? Math.min(100, Math.round((currentWeekEarningsPence / goalPence) * 100))
      : null;

    return reply.send({
      data: {
        goalPence,
        currentWeekEarningsPence,
        progressPercent,
        weekStart: weekStart.toISOString(),
      },
    });
  });

  // GET /user/calendar?year=2026&month=4
  app.get("/calendar", async (request, reply) => {
    const userId = request.userId!;
    const { year, month } = request.query as { year?: string; month?: string };

    const y = parseInt(year || String(new Date().getFullYear()), 10);
    const m = parseInt(month || String(new Date().getMonth() + 1), 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return reply.status(400).send({ error: "Invalid year or month" });
    }

    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));

    const [trips, earnings, shifts] = await Promise.all([
      prisma.trip.findMany({
        where: { userId, startedAt: { gte: start, lt: end } },
        select: { startedAt: true, distanceMiles: true, classification: true },
      }),
      prisma.earning.findMany({
        where: { userId, periodStart: { gte: start, lt: end } },
        select: { periodStart: true, amountPence: true },
      }),
      prisma.shift.findMany({
        where: { userId, startedAt: { gte: start, lt: end }, status: "completed" },
        select: { startedAt: true, endedAt: true },
      }),
    ]);

    // Aggregate per day
    const days: Record<string, {
      earningsPence: number;
      miles: number;
      businessMiles: number;
      tripCount: number;
      shiftMinutes: number;
    }> = {};

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const ensure = (key: string) => {
      if (!days[key]) {
        days[key] = { earningsPence: 0, miles: 0, businessMiles: 0, tripCount: 0, shiftMinutes: 0 };
      }
      return days[key];
    };

    for (const t of trips) {
      const d = ensure(dayKey(t.startedAt));
      d.tripCount++;
      d.miles += t.distanceMiles;
      if (t.classification === "business") d.businessMiles += t.distanceMiles;
    }

    for (const e of earnings) {
      const d = ensure(dayKey(e.periodStart));
      d.earningsPence += e.amountPence;
    }

    for (const s of shifts) {
      if (!s.endedAt) continue;
      const d = ensure(dayKey(s.startedAt));
      d.shiftMinutes += Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60000);
    }

    // Convert to array sorted by date
    const result = Object.entries(days)
      .map(([date, data]) => ({
        date,
        ...data,
        miles: Math.round(data.miles * 10) / 10,
        businessMiles: Math.round(data.businessMiles * 10) / 10,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return reply.send({ data: result });
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

  // POST /user/diagnostics — upload drive detection diagnostics dump
  const diagnosticsSchema = z.object({
    capturedAt: z.string(),
    platform: z.string().max(10),
    osVersion: z.string().max(20),
    appVersion: z.string().max(20),
    buildNumber: z.string().max(20),
    verdict: z.string().max(20),
    statusJson: z.record(z.unknown()),
    eventsJson: z.array(z.object({
      recorded_at: z.string(),
      event: z.string(),
      data: z.string().nullable(),
    })),
  });

  app.post("/diagnostics", async (request, reply) => {
    const userId = request.userId!;
    const parsed = diagnosticsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }
    const d = parsed.data;

    await prisma.diagnosticDump.upsert({
      where: { userId },
      update: {
        capturedAt: new Date(d.capturedAt),
        platform: d.platform,
        osVersion: d.osVersion,
        appVersion: d.appVersion,
        buildNumber: d.buildNumber,
        verdict: d.verdict,
        statusJson: d.statusJson as any,
        eventsJson: d.eventsJson,
        createdAt: new Date(),
      },
      create: {
        userId,
        capturedAt: new Date(d.capturedAt),
        platform: d.platform,
        osVersion: d.osVersion,
        appVersion: d.appVersion,
        buildNumber: d.buildNumber,
        verdict: d.verdict,
        statusJson: d.statusJson as any,
        eventsJson: d.eventsJson,
      },
    });

    // Analyse diagnostic and send proactive alerts for fixable issues.
    // Deduped to once per 7 days per issue type via AppEvent table.
    analyzeDiagnosticAndAlert(userId, d.statusJson).catch(() => {});

    return reply.send({ success: true });
  });

  // POST /user/event - lightweight client event logging
  const eventSchema = z.object({
    type: z.string().min(1).max(100),
    metadata: z.record(z.unknown()).optional(),
  });

  app.post("/event", async (request, reply) => {
    const parsed = eventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid event" });
    }
    logEvent(parsed.data.type, request.userId!, parsed.data.metadata);
    return reply.send({ success: true });
  });
}
