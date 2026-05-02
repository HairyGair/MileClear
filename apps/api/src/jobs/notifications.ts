import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, sendPushToUser, ExpoPushMessage } from "../lib/push.js";
import { runRecordingWatchdogJob } from "./recordingWatchdog.js";
import { getPeriodRecap } from "../services/gamification.js";
import {
  formatMiles,
  formatPence,
  MILESTONE_MILES,
  ACHIEVEMENT_META,
  type AchievementType,
} from "@mileclear/shared";
import { sendCheckinEmail } from "../services/email.js";
import { logEvent } from "../services/appEvents.js";
import { runJob } from "../services/jobRun.js";
import { getNearbyStations } from "../services/fuel.js";
import { runVehicleRemindersJob } from "./vehicleReminders.js";

// Persistent dedup via AppEvent table — survives PM2 restarts.
// Checks if a notification event was already logged for a user today.
async function wasNotifiedToday(userId: string, eventType: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const existing = await prisma.appEvent.findFirst({
    where: {
      type: eventType,
      userId,
      createdAt: { gte: todayStart },
    },
    select: { id: true },
  });
  return existing !== null;
}

// Lifetime dedup — checks if a notification event was ever logged for a user.
async function wasEverNotified(userId: string, eventType: string): Promise<boolean> {
  const existing = await prisma.appEvent.findFirst({
    where: { type: eventType, userId },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Find users who had trips in the last 5 days but NOT in the last 24 hours —
 * their streak is at risk. Send a push notification if they haven't been
 * notified yet today.
 */
async function runStreakAtRiskJob(): Promise<void> {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // Users with trips in the last 5 days
    const activeUserIds = await prisma.trip.findMany({
      where: { startedAt: { gte: fiveDaysAgo } },
      select: { userId: true },
      distinct: ["userId"],
    });

    if (activeUserIds.length === 0) return;

    // Of those, users who also had a trip in the last 24 hours
    const recentUserIds = await prisma.trip.findMany({
      where: {
        userId: { in: activeUserIds.map((r) => r.userId) },
        startedAt: { gte: oneDayAgo },
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    const recentSet = new Set(recentUserIds.map((r) => r.userId));

    // Users at risk = had activity in last 5 days but NOT last 24h
    const atRiskIds = activeUserIds
      .map((r) => r.userId)
      .filter((id) => !recentSet.has(id));

    if (atRiskIds.length === 0) return;

    // Fetch push tokens, skipping already-notified users
    const candidates = await prisma.user.findMany({
      where: {
        id: { in: atRiskIds },
        pushToken: { not: null },
      },
      select: { id: true, pushToken: true },
    });

    const messages: ExpoPushMessage[] = [];
    for (const user of candidates) {
      if (await wasNotifiedToday(user.id, "notification.streak_at_risk")) continue;

      logEvent("notification.streak_at_risk", user.id);
      messages.push({
        to: user.pushToken!,
        title: "Keep your streak going!",
        body: "Heading out today? We'll track your miles automatically. Just drive and we'll handle the rest.",
        sound: "default",
        data: { type: "streak_at_risk", action: "open_dashboard" },
      });
    }

    if (messages.length > 0) {
      await sendPushNotifications(messages);
      console.log(`[jobs/notifications] Streak-at-risk: sent ${messages.length} push(es)`);
    }
  } catch (err) {
    console.error("[jobs/notifications] Streak-at-risk job failed:", err);
  }
}

/**
 * Find premium users whose subscription expires within the next 3 days
 * and send a payment reminder if they haven't been notified today.
 */
async function runSubExpiringJob(): Promise<void> {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiring = await prisma.user.findMany({
      where: {
        isPremium: true,
        premiumExpiresAt: {
          gte: now,
          lte: threeDaysFromNow,
        },
        pushToken: { not: null },
      },
      select: { id: true, pushToken: true, premiumExpiresAt: true },
    });

    const messages: ExpoPushMessage[] = [];
    for (const user of expiring) {
      if (await wasNotifiedToday(user.id, "notification.sub_expiring")) continue;
      logEvent("notification.sub_expiring", user.id);

      const daysLeft = Math.ceil(
        (user.premiumExpiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      const dayWord = daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;

      messages.push({
        to: user.pushToken!,
        title: "Subscription Expiring Soon",
        body: `Your MileClear Pro subscription expires ${dayWord}. Renew to keep HMRC exports and analytics.`,
        sound: "default",
        data: { type: "subscription_expiring", action: "billing", daysLeft },
      });
    }

    if (messages.length > 0) {
      await sendPushNotifications(messages);
      console.log(`[jobs/notifications] Sub-expiring: sent ${messages.length} push(es)`);
    }
  } catch (err) {
    console.error("[jobs/notifications] Sub-expiring job failed:", err);
  }
}

/**
 * Weekly recap — runs every 6 hours, but only sends on Mondays.
 * Sends a rich push with real stats from the previous week.
 */
async function runWeeklyRecapJob(): Promise<void> {
  try {
    const now = new Date();
    // Only send on Mondays (day 1)
    if (now.getDay() !== 1) return;
    // Only send between 8am–10am to target morning delivery
    if (now.getHours() < 8 || now.getHours() >= 10) return;

    const users = await prisma.user.findMany({
      where: { pushToken: { not: null } },
      select: { id: true, pushToken: true },
    });

    const messages: ExpoPushMessage[] = [];
    for (const user of users) {
      if (await wasNotifiedToday(user.id, "notification.weekly_recap")) continue;

      try {
        // Use last week's data (reference = 3 days ago to land in the previous Monday–Sunday)
        const lastWeek = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const recap = await getPeriodRecap(user.id, "weekly", lastWeek);

        if (recap.totalTrips === 0) continue; // Skip users with no trips last week

        const body = recap.deductionPence > 0
          ? `${recap.totalTrips} trips, ${formatMiles(recap.totalMiles)} driven, ${formatPence(recap.deductionPence)} tax deduction earned`
          : `${recap.totalTrips} trips, ${formatMiles(recap.totalMiles)} driven last week`;

        logEvent("notification.weekly_recap", user.id);
        messages.push({
          to: user.pushToken!,
          title: "Your Weekly Recap",
          body,
          sound: "default",
          data: {
            type: "weekly_recap",
            action: "open_insights",
            totalMiles: recap.totalMiles,
            totalTrips: recap.totalTrips,
          },
        });
      } catch {
        // Skip this user if recap fails
      }
    }

    if (messages.length > 0) {
      await sendPushNotifications(messages);
      console.log(`[jobs/notifications] Weekly recap: sent ${messages.length} push(es)`);
    }
  } catch (err) {
    console.error("[jobs/notifications] Weekly recap job failed:", err);
  }
}

/**
 * Monthly recap — runs every 6 hours, but only sends on the 1st of the month.
 * Sends a rich push with real stats from the previous month.
 */
async function runMonthlyRecapJob(): Promise<void> {
  try {
    const now = new Date();
    // Only send on the 1st of the month
    if (now.getDate() !== 1) return;
    // Only send between 9am–11am
    if (now.getHours() < 9 || now.getHours() >= 11) return;

    const users = await prisma.user.findMany({
      where: { pushToken: { not: null } },
      select: { id: true, pushToken: true },
    });

    const messages: ExpoPushMessage[] = [];
    for (const user of users) {
      if (await wasNotifiedToday(user.id, "notification.monthly_recap")) continue;

      try {
        // Reference last month
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
        const recap = await getPeriodRecap(user.id, "monthly", lastMonth);

        if (recap.totalTrips === 0) continue;

        const monthName = lastMonth.toLocaleDateString("en-GB", { month: "long" });
        const body = recap.deductionPence > 0
          ? `${formatMiles(recap.totalMiles)} driven across ${recap.totalTrips} trips. ${formatPence(recap.deductionPence)} in tax deductions!`
          : `${formatMiles(recap.totalMiles)} driven across ${recap.totalTrips} trips in ${monthName}`;

        logEvent("notification.monthly_recap", user.id);
        messages.push({
          to: user.pushToken!,
          title: `Your ${monthName} Recap`,
          body,
          sound: "default",
          data: {
            type: "monthly_recap",
            action: "open_insights",
            totalMiles: recap.totalMiles,
            totalTrips: recap.totalTrips,
          },
        });
      } catch {
        // Skip this user if recap fails
      }
    }

    if (messages.length > 0) {
      await sendPushNotifications(messages);
      console.log(`[jobs/notifications] Monthly recap: sent ${messages.length} push(es)`);
    }
  } catch (err) {
    console.error("[jobs/notifications] Monthly recap job failed:", err);
  }
}

/**
 * Welcome nudge — find users who signed up 24–72 hours ago, have a push
 * token registered, but have zero trips. Send a one-time nudge encouraging
 * them to record their first trip.
 */
async function runWelcomeNudgeJob(): Promise<void> {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Users who signed up 24h–72h ago with a push token
    const candidates = await prisma.user.findMany({
      where: {
        createdAt: { gte: threeDaysAgo, lte: oneDayAgo },
        pushToken: { not: null },
      },
      select: { id: true, pushToken: true, displayName: true },
    });

    if (candidates.length === 0) return;

    // Filter to users with zero trips and not already nudged
    const messages: ExpoPushMessage[] = [];
    for (const user of candidates) {
      if (await wasEverNotified(user.id, "notification.welcome_nudge")) continue;

      const tripCount = await prisma.trip.count({
        where: { userId: user.id },
      });
      if (tripCount > 0) continue;

      logEvent("notification.welcome_nudge", user.id);

      const name = user.displayName ? `, ${user.displayName}` : "";
      messages.push({
        to: user.pushToken!,
        title: "Ready to track your first trip?",
        body: `Hey${name}! Tap Start Trip or just drive — MileClear will record your miles automatically.`,
        sound: "default",
        data: { type: "welcome_nudge", action: "open_dashboard" },
      });
    }

    if (messages.length > 0) {
      await sendPushNotifications(messages);
      console.log(`[jobs/notifications] Welcome nudge: sent ${messages.length} push(es)`);
    }
  } catch (err) {
    console.error("[jobs/notifications] Welcome nudge job failed:", err);
  }
}

/**
 * Check-in email — sent 3 days after signup. Personal email from Gair
 * asking how things are going and inviting them to reply with questions.
 * One-time per user.
 */
async function runCheckinEmailJob(): Promise<void> {
  try {
    const now = new Date();
    // Only run between 9am-11am UTC
    if (now.getUTCHours() < 9 || now.getUTCHours() >= 11) return;

    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    // Users who signed up 3-4 days ago
    const candidates = await prisma.user.findMany({
      where: {
        createdAt: { gte: fourDaysAgo, lte: threeDaysAgo },
      },
      select: { id: true, email: true, displayName: true },
    });

    if (candidates.length === 0) return;

    let sent = 0;
    for (const user of candidates) {
      if (await wasEverNotified(user.id, "email.checkin_sent")) continue;

      // Get their trip stats
      const tripStats = await prisma.trip.aggregate({
        where: { userId: user.id },
        _count: { id: true },
        _sum: { distanceMiles: true },
      });

      const stats = {
        totalTrips: tripStats._count.id,
        totalMiles: tripStats._sum.distanceMiles ?? 0,
      };

      try {
        await sendCheckinEmail(user.email, user.displayName, stats, user.id);
        logEvent("email.checkin_sent", user.id);
        sent++;
        // Small delay between emails
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`[jobs/notifications] Check-in email failed for ${user.email}:`, err);
      }
    }

    if (sent > 0) {
      console.log(`[jobs/notifications] Check-in email: sent ${sent}`);
    }
  } catch (err) {
    console.error("[jobs/notifications] Check-in email job failed:", err);
  }
}

// ── Event-driven push helpers (called from routes) ────────────────────

/**
 * Send a push when a user crosses a mileage milestone.
 * Called after trip creation. Checks total miles against milestones.
 */
export async function sendMilestonePush(userId: string): Promise<void> {
  try {
    const totalAgg = await prisma.trip.aggregate({
      where: { userId },
      _sum: { distanceMiles: true },
    });
    const totalMiles = totalAgg._sum.distanceMiles ?? 0;

    // Find the highest milestone crossed
    const crossed = MILESTONE_MILES.filter((m) => totalMiles >= m);
    if (crossed.length === 0) return;
    const milestone = crossed[crossed.length - 1];

    // Check if we already notified for this milestone (use achievements as proxy)
    const existing = await prisma.achievement.findFirst({
      where: { userId, type: `miles_${milestone}` },
    });
    if (!existing) return; // Achievement check happens first, so if no achievement, milestone wasn't just crossed

    // Check if achievement was just earned (within last 60 seconds)
    const sixtySecondsAgo = new Date(Date.now() - 60_000);
    if (existing.achievedAt < sixtySecondsAgo) return;

    const formatted = milestone >= 1000
      ? `${(milestone / 1000).toFixed(0)}k`
      : String(milestone);

    await sendPushToUser(
      userId,
      `${formatted} Miles!`,
      `You've driven ${formatMiles(totalMiles)} total. Keep going!`,
      { type: "milestone", action: "open_achievements", milestone }
    );
  } catch (err) {
    console.error("[notifications] Milestone push failed:", err);
  }
}

/**
 * Send a push for each newly unlocked achievement.
 * Called after checkAndAwardAchievements.
 */
export async function sendAchievementPush(
  userId: string,
  newAchievements: { type: string; label: string; emoji: string }[]
): Promise<void> {
  if (newAchievements.length === 0) return;

  try {
    // Send one notification for the most significant achievement
    const achievement = newAchievements[newAchievements.length - 1];

    await sendPushToUser(
      userId,
      `${achievement.emoji} Achievement Unlocked!`,
      `${achievement.label} — tap to see your badges`,
      { type: "achievement", action: "open_achievements", achievementType: achievement.type }
    );
  } catch (err) {
    console.error("[notifications] Achievement push failed:", err);
  }
}

/**
 * Send a shift completion summary push.
 * Called from the shift end route.
 */
export async function sendShiftSummaryPush(
  userId: string,
  stats: { tripsCompleted: number; totalMiles: number; deductionPence: number; durationSeconds: number }
): Promise<void> {
  try {
    if (stats.tripsCompleted === 0 && stats.totalMiles === 0) return;

    const hours = Math.floor(stats.durationSeconds / 3600);
    const mins = Math.floor((stats.durationSeconds % 3600) / 60);
    const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    const tripWord = stats.tripsCompleted === 1 ? "trip" : "trips";
    let body = `${stats.tripsCompleted} ${tripWord}, ${formatMiles(stats.totalMiles)} in ${duration}`;
    if (stats.deductionPence > 0) {
      body += ` — ${formatPence(stats.deductionPence)} tax deduction`;
    }

    await sendPushToUser(
      userId,
      "Shift Complete",
      body,
      { type: "shift_summary", action: "open_dashboard" }
    );
  } catch (err) {
    console.error("[notifications] Shift summary push failed:", err);
  }
}

/**
 * Start all scheduled notification jobs.
 * Called once after the server starts. The initial delay of 60 seconds
 * gives the server time to fully initialise before the first run.
 */
async function runMorningBriefingJob(): Promise<void> {
  const now = new Date();
  // Send between 7-9 UTC (covers 8am BST and 8am GMT)
  if (now.getUTCHours() < 7 || now.getUTCHours() >= 9) return;

  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  // ISO week start (Monday)
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));

  // Get all users with push tokens
  const users = await prisma.user.findMany({
    where: { pushToken: { not: null } },
    select: {
      id: true,
      pushToken: true,
      dashboardMode: true,
      weeklyEarningsGoalPence: true,
    },
  });

  let sent = 0;
  for (const user of users) {
    if (!user.pushToken) continue;

    // Dedup: check if we already sent today
    if (await wasNotifiedToday(user.id, "notification.morning_briefing")) continue;

    // Yesterday's stats
    const [yesterdayTrips, yesterdayEarnings, unclassifiedCount, weekEarnings] = await Promise.all([
      prisma.trip.aggregate({
        where: { userId: user.id, startedAt: { gte: yesterdayStart, lt: todayStart } },
        _count: { _all: true },
        _sum: { distanceMiles: true },
      }),
      prisma.earning.aggregate({
        where: { userId: user.id, periodStart: { gte: yesterdayStart, lt: todayStart } },
        _sum: { amountPence: true },
      }),
      prisma.trip.count({
        where: { userId: user.id, classification: "unclassified" },
      }),
      prisma.earning.aggregate({
        where: { userId: user.id, periodStart: { gte: weekStart } },
        _sum: { amountPence: true },
      }),
    ]);

    const tripCount = yesterdayTrips._count._all;
    const miles = Math.round((yesterdayTrips._sum.distanceMiles ?? 0) * 10) / 10;
    const earningsPence = yesterdayEarnings._sum?.amountPence ?? 0;
    const weekEarningsPence = weekEarnings._sum?.amountPence ?? 0;
    const goalPence = user.weeklyEarningsGoalPence;

    // Build notification body based on mode
    const parts: string[] = [];
    const isWork = user.dashboardMode === "work" || user.dashboardMode === "both";

    if (tripCount > 0) {
      parts.push(`Yesterday: ${miles} mi across ${tripCount} trip${tripCount !== 1 ? "s" : ""}`);
    } else {
      parts.push("No trips yesterday");
    }

    if (isWork && earningsPence > 0) {
      parts.push(`earned ${formatPence(earningsPence)}`);
    }

    if (isWork && goalPence && goalPence > 0) {
      const pct = Math.min(100, Math.round((weekEarningsPence / goalPence) * 100));
      parts.push(`${pct}% to weekly goal`);
    }

    if (unclassifiedCount > 0) {
      parts.push(`${unclassifiedCount} to classify`);
    }

    const title = tripCount > 0 ? "Your daily summary" : "Good morning";
    const body = parts.join(". ") + ".";

    try {
      await sendPushToUser(user.id, title, body, { action: "open_dashboard" });
      logEvent("notification.morning_briefing", user.id);
      sent++;
    } catch {}
  }

  if (sent > 0) {
    console.log(`[jobs/notifications] Morning briefing sent to ${sent} user(s)`);
  }
}

async function runFuelPriceAlertJob(): Promise<void> {
  // Get users with push tokens + saved locations
  const users = await prisma.user.findMany({
    where: {
      pushToken: { not: null },
      savedLocations: { some: {} },
    },
    select: {
      id: true,
      pushToken: true,
      savedLocations: {
        select: { latitude: true, longitude: true, name: true },
        take: 5,
      },
    },
  });

  let sent = 0;
  for (const user of users) {
    if (!user.pushToken) continue;
    if (await wasNotifiedToday(user.id, "notification.fuel_alert")) continue;

    // Find cheapest station across all saved locations
    let cheapestStation: { name: string; price: number; fuelType: string; distance: number; nearLocation: string } | null = null;

    for (const loc of user.savedLocations) {
      try {
        const { stations } = await getNearbyStations(loc.latitude, loc.longitude, 3);
        for (const s of stations) {
          // Check diesel and unleaded
          for (const [fuelKey, label] of [["B7", "Diesel"], ["E10", "Unleaded"]] as const) {
            const price = s.prices[fuelKey];
            if (!price || price <= 0) continue;
            if (!cheapestStation || price < cheapestStation.price) {
              cheapestStation = {
                name: s.stationName,
                price,
                fuelType: label,
                distance: s.distanceMiles,
                nearLocation: loc.name,
              };
            }
          }
        }
      } catch {}
    }

    if (!cheapestStation) continue;

    const priceStr = (cheapestStation.price / 10).toFixed(1);
    const title = `Fuel near ${cheapestStation.nearLocation}: ${priceStr}p/L`;
    const body = `${cheapestStation.fuelType} at ${cheapestStation.name} (${cheapestStation.distance} mi away)`;

    try {
      await sendPushToUser(user.id, title, body, { action: "open_fuel" });
      logEvent("notification.fuel_alert", user.id, {
        station: cheapestStation.name,
        price: cheapestStation.price,
        fuelType: cheapestStation.fuelType,
      });
      sent++;
    } catch {}
  }

  if (sent > 0) {
    console.log(`[jobs/notifications] Fuel price alerts sent to ${sent} user(s)`);
  }
}

async function runDiagnosticScanJob(): Promise<void> {
  // Scan all existing diagnostic dumps for fixable issues and alert users.
  // This catches users who uploaded a dump previously but weren't alerted
  // because this feature didn't exist yet (or the cooldown expired).
  //
  // 24h dedup (was 7d). High-frequency drivers like Anthony hit the same
  // class of issue multiple times in a week, and going silent for 7 days
  // made stuck recordings invisible mid-week. 24h lets us re-alert daily
  // until the user resolves the underlying problem.
  const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

  // Only scan dumps from the last 48 hours. Older dumps are stale -
  // the user may have fixed the issue since uploading. This prevents
  // alerting someone who already resolved their own problem.
  const freshCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const dumps = await prisma.diagnosticDump.findMany({
    where: { createdAt: { gte: freshCutoff } },
    select: {
      userId: true,
      statusJson: true,
      user: { select: { pushToken: true, email: true, displayName: true } },
    },
  });

  let sent = 0;
  for (const dump of dumps) {
    if (!dump.user.pushToken) continue;

    const status = dump.statusJson as Record<string, unknown>;
    const bgPerm = status.backgroundPermission as string | undefined;
    const taskRunning = status.taskRunning as boolean | undefined;
    const enabled = status.enabled as boolean | undefined;
    const autoRecording = status.autoRecordingActive as boolean | undefined;
    const trackingState = status.trackingState as Array<{ key: string; value: string }> | undefined;
    const lastDrivingStr = trackingState?.find((s) => s.key === "last_driving_speed_at")?.value;

    // Check each alert type with cooldown
    const checks: Array<{
      condition: boolean;
      alertType: string;
      title: string;
      body: string;
      data: Record<string, unknown>;
    }> = [
      {
        condition: !!bgPerm && bgPerm !== "granted",
        alertType: "alert.permission_missing",
        title: "Trips aren't recording automatically",
        body: "MileClear needs background location to detect your drives. Go to Settings > MileClear > Location > Always.",
        data: { action: "open_settings" },
      },
      {
        condition: taskRunning === false && enabled === true,
        alertType: "alert.task_not_running",
        title: "Drive detection stopped",
        body: "MileClear's background task isn't running. Try closing and reopening the app to restart it.",
        data: { action: "open_dashboard" },
      },
    ];

    // Stuck recording: lower bound dropped from 30 min to 15 min so we catch
    // the "stopped at destination, recording stuck because background JS is
    // suspended" case sooner. Upper bound stays 24h to ignore stale dumps
    // (user may have already resolved by reopening the app).
    if (autoRecording === true && lastDrivingStr) {
      const elapsed = Date.now() - parseInt(lastDrivingStr, 10);
      if (elapsed > 15 * 60 * 1000 && elapsed < 24 * 60 * 60 * 1000) {
        checks.push({
          condition: true,
          alertType: "alert.stuck_recording",
          title: "A trip is waiting to save",
          body: "It looks like a recording is still running. Open MileClear to save the trip.",
          data: { action: "open_active_recording" },
        });
      }
    }

    for (const check of checks) {
      if (!check.condition) continue;
      const cutoff = new Date(Date.now() - ALERT_COOLDOWN_MS);
      const already = await prisma.appEvent.findFirst({
        where: { userId: dump.userId, type: check.alertType, createdAt: { gte: cutoff } },
      });
      if (already) continue;

      try {
        await sendPushToUser(dump.userId, check.title, check.body, check.data);
        logEvent(check.alertType, dump.userId);

        // Notify admins
        const admins = await prisma.user.findMany({
          where: { isAdmin: true, pushToken: { not: null } },
          select: { id: true },
        });
        const userName = dump.user.displayName || dump.user.email || dump.userId;
        for (const admin of admins) {
          await sendPushToUser(
            admin.id,
            `Diagnostic alert: ${userName}`,
            `${check.title} - ${check.body}`,
            { action: "open_admin", userId: dump.userId },
          ).catch(() => {});
        }
        sent++;
      } catch {}
    }
  }

  if (sent > 0) {
    console.log(`[jobs/notifications] Diagnostic scan sent ${sent} alert(s)`);
  }
}

export function startNotificationJobs(): void {
  const INITIAL_DELAY_MS = 60 * 1000;       // 60 seconds
  const INTERVAL_MS = 6 * 60 * 60 * 1000;  // 6 hours
  const BRIEFING_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes (checks time window internally)

  const runAll = () => {
    void runJob("streak_at_risk", runStreakAtRiskJob);
    void runJob("sub_expiring", runSubExpiringJob);
    void runJob("weekly_recap", runWeeklyRecapJob);
    void runJob("monthly_recap", runMonthlyRecapJob);
    void runJob("welcome_nudge", runWelcomeNudgeJob);
    void runJob("checkin_email", runCheckinEmailJob);
    void runJob("vehicle_reminders", runVehicleRemindersJob);
  };

  setTimeout(() => {
    runAll();
    setInterval(runAll, INTERVAL_MS);

    void runJob("morning_briefing", runMorningBriefingJob);
    setInterval(() => void runJob("morning_briefing", runMorningBriefingJob), BRIEFING_INTERVAL_MS);

    void runJob("fuel_price_alert", runFuelPriceAlertJob);
    setInterval(() => void runJob("fuel_price_alert", runFuelPriceAlertJob), INTERVAL_MS);

    void runJob("diagnostic_scan", runDiagnosticScanJob);
    setInterval(() => void runJob("diagnostic_scan", runDiagnosticScanJob), INTERVAL_MS);

    // Recording watchdog runs every 5 min — much higher frequency than other
    // jobs because stuck-recording detection is time-sensitive (we want the
    // user's phantom recording drained before they'd notice in the UI).
    const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;
    void runJob("recording_watchdog", runRecordingWatchdogJob);
    setInterval(() => void runJob("recording_watchdog", runRecordingWatchdogJob), WATCHDOG_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log("[jobs/notifications] Scheduled notification jobs started (first run in 60s)");
}
