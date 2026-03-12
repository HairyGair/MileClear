import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, sendPushToUser, ExpoPushMessage } from "../lib/push.js";
import { getPeriodRecap } from "../services/gamification.js";
import {
  formatMiles,
  formatPence,
  MILESTONE_MILES,
  ACHIEVEMENT_META,
  type AchievementType,
} from "@mileclear/shared";

// In-memory dedup sets — keyed by "YYYY-MM-DD:userId" so each user receives
// at most one of each notification type per calendar day, even if the job
// fires multiple times.
const streakNotifiedToday = new Set<string>();
const subExpireNotifiedToday = new Set<string>();
const weeklyRecapNotifiedToday = new Set<string>();
const monthlyRecapNotifiedToday = new Set<string>();

function todayKey(userId: string): string {
  return `${new Date().toISOString().slice(0, 10)}:${userId}`;
}

// Reset the dedup sets at midnight so they don't grow forever.
function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    5 // 5 seconds past midnight to be safe
  );
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    streakNotifiedToday.clear();
    subExpireNotifiedToday.clear();
    weeklyRecapNotifiedToday.clear();
    monthlyRecapNotifiedToday.clear();
    scheduleMidnightReset(); // reschedule for the next day
  }, msUntilMidnight);
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
      const key = todayKey(user.id);
      if (streakNotifiedToday.has(key)) continue;
      streakNotifiedToday.add(key);

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
      const key = todayKey(user.id);
      if (subExpireNotifiedToday.has(key)) continue;
      subExpireNotifiedToday.add(key);

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
      const key = todayKey(user.id);
      if (weeklyRecapNotifiedToday.has(key)) continue;
      weeklyRecapNotifiedToday.add(key);

      try {
        // Use last week's data (reference = 3 days ago to land in the previous Monday–Sunday)
        const lastWeek = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const recap = await getPeriodRecap(user.id, "weekly", lastWeek);

        if (recap.totalTrips === 0) continue; // Skip users with no trips last week

        const body = recap.deductionPence > 0
          ? `${recap.totalTrips} trips, ${formatMiles(recap.totalMiles)} driven, ${formatPence(recap.deductionPence)} tax deduction earned`
          : `${recap.totalTrips} trips, ${formatMiles(recap.totalMiles)} driven last week`;

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
      const key = todayKey(user.id);
      if (monthlyRecapNotifiedToday.has(key)) continue;
      monthlyRecapNotifiedToday.add(key);

      try {
        // Reference last month
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
        const recap = await getPeriodRecap(user.id, "monthly", lastMonth);

        if (recap.totalTrips === 0) continue;

        const monthName = lastMonth.toLocaleDateString("en-GB", { month: "long" });
        const body = recap.deductionPence > 0
          ? `${formatMiles(recap.totalMiles)} driven across ${recap.totalTrips} trips. ${formatPence(recap.deductionPence)} in tax deductions!`
          : `${formatMiles(recap.totalMiles)} driven across ${recap.totalTrips} trips in ${monthName}`;

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
export function startNotificationJobs(): void {
  const INITIAL_DELAY_MS = 60 * 1000;       // 60 seconds
  const INTERVAL_MS = 6 * 60 * 60 * 1000;  // 6 hours

  scheduleMidnightReset();

  setTimeout(() => {
    // Run all jobs immediately after the initial delay, then on the interval
    void runStreakAtRiskJob();
    void runSubExpiringJob();
    void runWeeklyRecapJob();
    void runMonthlyRecapJob();

    setInterval(() => {
      void runStreakAtRiskJob();
      void runSubExpiringJob();
      void runWeeklyRecapJob();
      void runMonthlyRecapJob();
    }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log("[jobs/notifications] Scheduled notification jobs started (first run in 60s)");
}
