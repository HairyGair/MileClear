import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, ExpoPushMessage } from "../lib/push.js";

// In-memory dedup sets — keyed by "YYYY-MM-DD:userId" so each user receives
// at most one of each notification type per calendar day, even if the job
// fires multiple times.
const streakNotifiedToday = new Set<string>();
const subExpireNotifiedToday = new Set<string>();

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
        title: "Keep Your Streak Going!",
        body: "You haven't logged any trips today. Head out and keep your streak alive.",
        sound: "default",
        data: { type: "streak_at_risk" },
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
        data: { type: "subscription_expiring", daysLeft },
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
 * Start all scheduled notification jobs.
 * Called once after the server starts. The initial delay of 60 seconds
 * gives the server time to fully initialise before the first run.
 */
export function startNotificationJobs(): void {
  const INITIAL_DELAY_MS = 60 * 1000;       // 60 seconds
  const INTERVAL_MS = 6 * 60 * 60 * 1000;  // 6 hours

  scheduleMidnightReset();

  setTimeout(() => {
    // Run both jobs immediately after the initial delay, then on the interval
    void runStreakAtRiskJob();
    void runSubExpiringJob();

    setInterval(() => {
      void runStreakAtRiskJob();
      void runSubExpiringJob();
    }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log("[jobs/notifications] Scheduled notification jobs started (first run in 60s)");
}
