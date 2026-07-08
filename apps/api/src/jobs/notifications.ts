import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, sendPushToUser, ExpoPushMessage } from "../lib/push.js";
import { pushPrefEnabled } from "../services/pushPrefs.js";
import { runRecordingWatchdogJob } from "./recordingWatchdog.js";
import { runIdempotencyPurgeJob } from "./idempotencyPurge.js";
import { runReconciliationJob } from "./reconciliation.js";
import { runGeofenceRadiusRecommendJob } from "./geofenceRadiusRecommend.js";
import { runHmrcKeepAliveJob } from "./hmrcKeepAlive.js";
import { getPeriodRecap } from "../services/gamification.js";
import {
  formatMiles,
  formatPence,
  MILESTONE_MILES,
} from "@mileclear/shared";
import { sendCheckinEmail } from "../services/email.js";
import { logEvent } from "../services/appEvents.js";
import { runJob } from "../services/jobRun.js";
import { getNearbyStations, prewarmStationCache } from "../services/fuel.js";
import { runVehicleRemindersJob } from "./vehicleReminders.js";
import { runActivationDay7Job, runPayingInactiveAlarmJob } from "./activation.js";
import { runDiscordProSyncJob } from "./discordProSync.js";
import { runTaxTipOfTheDayJob } from "./taxTipOfTheDay.js";
import { runWeeklyDigestJob } from "./weeklyDigest.js";
import { runTaxDeadlineRemindersJob } from "./taxDeadlineReminders.js";
import { postFounderAlert } from "../services/discord.js";
import {
  runFirstTripCelebrationJob,
  runMileageMilestoneCelebrationJob,
} from "./discordCelebrations.js";

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
      where: { isPhantomTrip: false, startedAt: { gte: fiveDaysAgo } },
      select: { userId: true },
      distinct: ["userId"],
    });

    if (activeUserIds.length === 0) return;

    // Of those, users who also had a trip in the last 24 hours
    const recentUserIds = await prisma.trip.findMany({
      where: {
        userId: { in: activeUserIds.map((r) => r.userId) },
        isPhantomTrip: false,
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
      select: { id: true, pushToken: true, pushPrefs: true },
    });

    const messages: ExpoPushMessage[] = [];
    for (const user of candidates) {
      if (!pushPrefEnabled(user.pushPrefs, "streakReminder")) continue;
      if (await wasNotifiedToday(user.id, "notification.streak_at_risk")) continue;

      logEvent("notification.streak_at_risk", user.id);
      messages.push({
        to: user.pushToken!,
        title: "Driving today?",
        body: "Tap to keep your tracking streak going. MileClear records automatically once you start.",
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
        title: `Pro expires ${dayWord}`,
        body: "Renew to keep HMRC exports, the Self Assessment wizard, and unlimited saved locations.",
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
      select: { id: true, pushToken: true, pushPrefs: true },
    });

    const messages: ExpoPushMessage[] = [];
    for (const user of users) {
      if (!pushPrefEnabled(user.pushPrefs, "weeklySummary")) continue;
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
          title: "Last week, in numbers",
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
      select: { id: true, pushToken: true, pushPrefs: true },
    });

    const messages: ExpoPushMessage[] = [];
    for (const user of users) {
      if (!pushPrefEnabled(user.pushPrefs, "monthlyRecap")) continue;
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
        where: { userId: user.id, isPhantomTrip: false },
      });
      if (tripCount > 0) continue;

      // Permission-aware copy. ~47% of users never grant "Always" location,
      // so background auto-detection silently never runs for them — telling
      // those users to "just drive, it records automatically" is misleading
      // and a likely activation killer. Branch on the latest diagnostic dump's
      // backgroundPermission: if it isn't "granted" (or we have no dump), steer
      // them to turn on Always rather than promising automatic capture.
      const dump = await prisma.diagnosticDump.findUnique({
        where: { userId: user.id },
        select: { statusJson: true },
      });
      const bgPerm =
        dump && dump.statusJson && typeof dump.statusJson === "object"
          ? (dump.statusJson as Record<string, unknown>).backgroundPermission
          : undefined;
      const hasAlways = bgPerm === "granted";

      logEvent("notification.welcome_nudge", user.id);

      const name = user.displayName ? ` ${user.displayName}` : "";
      messages.push({
        to: user.pushToken!,
        title: hasAlways ? "Your first trip is the hardest" : "Turn on automatic tracking",
        body: hasAlways
          ? `Welcome${name}. Tap Start Trip, or just drive: MileClear records automatically once you're moving.`
          : `Welcome${name}. MileClear records trips by itself once you allow "Always" location — tap to switch it on, then just drive.`,
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
        where: { userId: user.id, isPhantomTrip: false },
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
      where: { userId, isPhantomTrip: false },
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

    // Respect the user's "Milestone alerts" preference — this send predates the
    // pref system and was one of two bypassing it (8 Jul 2026 review).
    const prefUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushPrefs: true },
    });
    if (!pushPrefEnabled(prefUser?.pushPrefs, "milestoneAlerts")) return;

    const formatted = milestone >= 1000
      ? `${(milestone / 1000).toFixed(0)}k`
      : String(milestone);

    await sendPushToUser(
      userId,
      `${formatted} miles tracked`,
      `Total distance: ${formatMiles(totalMiles)}. Tap to see what it's worth at HMRC rates.`,
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
      `${achievement.emoji} ${achievement.label}`,
      "New badge earned. Tap to see all your achievements.",
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

    // Respect the user's "Shift summary" preference — this send predates the
    // pref system and was one of two bypassing it (8 Jul 2026 review).
    const prefUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushPrefs: true },
    });
    if (!pushPrefEnabled(prefUser?.pushPrefs, "shiftSummary")) return;

    const hours = Math.floor(stats.durationSeconds / 3600);
    const mins = Math.floor((stats.durationSeconds % 3600) / 60);
    const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    const tripWord = stats.tripsCompleted === 1 ? "trip" : "trips";
    let body = `${stats.tripsCompleted} ${tripWord}, ${formatMiles(stats.totalMiles)} in ${duration}`;
    if (stats.deductionPence > 0) {
      body += `. ${formatPence(stats.deductionPence)} added to this year's deduction.`;
    }

    await sendPushToUser(
      userId,
      "Shift wrapped",
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

  // Get all users with push tokens. We also pull heartbeat fields so the
  // briefing can detect "user clearly drove yesterday but no trips reached
  // the server" — that's a sync failure, not a quiet day, and the message
  // should reflect that.
  const users = await prisma.user.findMany({
    where: { pushToken: { not: null } },
    select: {
      id: true,
      pushToken: true,
      pushPrefs: true,
      dashboardMode: true,
      weeklyEarningsGoalPence: true,
      lastDrivingSpeedAt: true,
      lastPendingSyncCount: true,
      lastSyncQueuePermFailed: true,
      autoRecordingActive: true,
    },
  });

  let sent = 0;
  for (const user of users) {
    if (!user.pushToken) continue;
    if (!pushPrefEnabled(user.pushPrefs, "morningBriefing")) continue;

    // Dedup: check if we already sent today
    if (await wasNotifiedToday(user.id, "notification.morning_briefing")) continue;

    // Yesterday's stats
    const [yesterdayTrips, yesterdayEarnings, unclassifiedCount, weekEarnings] = await Promise.all([
      prisma.trip.aggregate({
        where: { userId: user.id, isPhantomTrip: false, startedAt: { gte: yesterdayStart, lt: todayStart } },
        _count: { _all: true },
        _sum: { distanceMiles: true },
      }),
      prisma.earning.aggregate({
        where: { userId: user.id, periodStart: { gte: yesterdayStart, lt: todayStart } },
        _sum: { amountPence: true },
      }),
      prisma.trip.count({
        where: { userId: user.id, classification: "unclassified", isPhantomTrip: false },
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

    // Detect "trips probably exist but haven't synced". Three signals:
    //   1. lastDrivingSpeedAt was during yesterday's window (device saw
    //      driving speed but no trip rows reached the server)
    //   2. lastPendingSyncCount > 0 (sync queue had work outstanding at
    //      last heartbeat)
    //   3. lastSyncQueuePermFailed > 0 (sync gave up on something —
    //      almost certainly trips)
    // Any one of these means "don't claim 'no trips yesterday' confidently"
    // — that lie is what triggered support contact 4 May 2026.
    const droveYesterday =
      user.lastDrivingSpeedAt !== null &&
      user.lastDrivingSpeedAt >= yesterdayStart &&
      user.lastDrivingSpeedAt < todayStart;
    const hasPendingSync = (user.lastPendingSyncCount ?? 0) > 0;
    const hasFailedSync = (user.lastSyncQueuePermFailed ?? 0) > 0;
    const probablyHasUnsyncedTrips =
      tripCount === 0 && (droveYesterday || hasPendingSync || hasFailedSync);

    // Build notification body based on mode
    const parts: string[] = [];
    const isWork = user.dashboardMode === "work" || user.dashboardMode === "both";

    if (tripCount > 0) {
      parts.push(`Yesterday: ${miles} mi across ${tripCount} trip${tripCount !== 1 ? "s" : ""}`);

      if (isWork && earningsPence > 0) {
        parts.push(`earned ${formatPence(earningsPence)}`);
      }
      if (isWork && goalPence && goalPence > 0) {
        const pct = Math.min(100, Math.round((weekEarningsPence / goalPence) * 100));
        parts.push(`${pct}% to weekly goal`);
      }
      if (unclassifiedCount > 0) {
        parts.push(`${unclassifiedCount} in your inbox to classify`);
      }
    } else if (probablyHasUnsyncedTrips) {
      // We have heartbeat-v2 evidence the user drove. Tell them to open
      // the app so the sync queue drains and yesterday's trips reach
      // the server.
      parts.push("Yesterday's trips haven't reached us yet. Open MileClear so they can upload");
      if (unclassifiedCount > 0) {
        parts.push(`${unclassifiedCount} already in your inbox to classify`);
      }
    } else if (unclassifiedCount > 0) {
      // No yesterday trips on the server, but inbox has stuff. Surface
      // that as the headline — much more useful than a passive-aggressive
      // "no trips yesterday" reminder.
      parts.push(
        `${unclassifiedCount} ${unclassifiedCount === 1 ? "trip is" : "trips are"} waiting in your inbox to classify`
      );
      if (isWork && goalPence && goalPence > 0) {
        const pct = Math.min(100, Math.round((weekEarningsPence / goalPence) * 100));
        parts.push(`${pct}% to weekly goal`);
      }
    } else {
      // Nothing to say. Skip the briefing — better to be silent than to
      // claim "you didn't drive yesterday" when we genuinely don't know
      // (older builds without heartbeat-v2 telemetry can't prove it
      // either way). 4 May 2026: complaint from a build-55 user who
      // had 2 trips locally that hadn't synced.
      continue;
    }

    const title = tripCount > 0
      ? "Your daily summary"
      : probablyHasUnsyncedTrips
        ? "Trips waiting to sync"
        : "Trips to classify";
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
  // Window-gate to 07:00-09:00 UTC (morning, pre-commute — when a cheap
  // fuel tip is actually useful). Before 8 Jul 2026 this job had NO time
  // gate: wasNotifiedToday resets at midnight UTC, so the first 6-hourly
  // tick after midnight — the ~02:00-04:00 one — delivered every fuel
  // alert in the small hours. JRD Electrical (a paying subscriber)
  // received a ~3am push every night for weeks before cancelling.
  const now = new Date();
  if (now.getUTCHours() < 7 || now.getUTCHours() >= 9) return;

  // Get users with push tokens + saved locations
  const users = await prisma.user.findMany({
    where: {
      pushToken: { not: null },
      savedLocations: { some: {} },
    },
    select: {
      id: true,
      pushToken: true,
      pushPrefs: true,
      savedLocations: {
        select: { latitude: true, longitude: true, name: true },
        take: 5,
      },
    },
  });

  let sent = 0;
  for (const user of users) {
    if (!user.pushToken) continue;
    if (!pushPrefEnabled(user.pushPrefs, "fuelAlert")) continue;
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

    // "Drive detection stopped" — re-gated 29 May 2026. The old condition fired
    // on the raw `taskRunning` flag, which is unreliable: both the anchored-skip
    // and the backstop legitimately leave taskRunning=false while the device is
    // parked. A 3-day analysis of the alert found ~44% were false (users were
    // recording trips fine) and most "dark" hits were never-driven or
    // permission-missing users (the latter already covered by
    // permission_missing). So we now key off the OUTCOME, not the flag: a
    // previously-active driver (>=3 lifetime auto-trips) with Always granted
    // who has recorded no auto-trip in the last 4 days. The cheap dump flags
    // gate the (slightly more expensive) trip counts so we only query for
    // plausibly-stalled devices.
    let captureStalled = false;
    if (enabled === true && bgPerm === "granted" && taskRunning === false) {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const [lifetimeAuto, recentAuto] = await Promise.all([
        prisma.trip.count({ where: { userId: dump.userId, isManualEntry: false, isPhantomTrip: false } }),
        prisma.trip.count({
          where: { userId: dump.userId, isManualEntry: false, isPhantomTrip: false, createdAt: { gte: fourDaysAgo } },
        }),
      ]);
      captureStalled = lifetimeAuto >= 3 && recentAuto === 0;
    }

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
        title: "Auto-tracking is off",
        body: "Set Location to 'Always' in Settings > MileClear so trips record while the app is in the background.",
        data: { action: "open_settings" },
      },
      {
        // alertType kept for continuity (admin Alerts tab + dedup history);
        // the meaning is now "capture stalled" — see captureStalled above.
        condition: captureStalled,
        alertType: "alert.task_not_running",
        title: "We haven't logged a trip in a few days",
        body: "Tracking may have stopped. Tap to check your detection status and restart it.",
        // Deep-link to the Drive Detection diagnostics screen — the page that
        // shows live status + a Restart detection button, i.e. where the user
        // can actually act on this.
        data: { action: "open_diagnostics" },
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
          title: "Trip still recording",
          body: "Looks like you've stopped driving. Open MileClear to save the trip.",
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
        // Admin push fanout removed 4 May 2026: alerts are visible in
        // the admin Alerts tab (/dashboard/admin → Alerts) via the
        // /admin/diagnostic-alerts feed. No need to spam admin phones.
        sent++;
      } catch {}
    }
  }

  if (sent > 0) {
    console.log(`[jobs/notifications] Diagnostic scan sent ${sent} alert(s)`);
  }
}

// Founder-facing dedup state for the native-engine health monitor.
let lastNativeHealthSig = "";
let lastNativeHealthAt = 0;
const NATIVE_HEALTH_REPOST_MS = 6 * 60 * 60 * 1000; // re-surface an unchanged problem at most every 6h

/**
 * Founder-facing health monitor for the native-engine rollout (build 73, on by
 * default since 4 Jun 2026). Watches the diagnostic dumps we already collect and
 * pings #founder when native-engine devices report detection errors - the signal
 * to roll the flag back. Deduped: posts only when the set of unhealthy devices
 * changes, or after a long quiet window. Stays silent when every native device
 * is healthy (the common case), so the channel only lights up on real trouble.
 */
async function runNativeEngineHealthJob(): Promise<void> {
  const WINDOW_MS = 12 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - WINDOW_MS);

  const dumps = await prisma.diagnosticDump.findMany({
    where: { createdAt: { gte: cutoff } },
    orderBy: { capturedAt: "desc" },
    select: {
      userId: true,
      verdict: true,
      statusJson: true,
      user: { select: { email: true } },
    },
  });

  // Reduce to the latest dump per user (the list is desc by capturedAt).
  const latest = new Map<string, (typeof dumps)[number]>();
  for (const d of dumps) if (!latest.has(d.userId)) latest.set(d.userId, d);

  let nativeTotal = 0;
  let permissionGated = 0;
  let userDisabled = 0;
  const unhealthy: { email: string; userId: string }[] = [];
  for (const d of latest.values()) {
    const status = (d.statusJson ?? {}) as Record<string, unknown>;
    if (status.nativeEngineEnabled !== true) continue; // native-engine devices only
    nativeTotal++;
    if (d.verdict === "error") {
      // A user who switched auto-detection OFF (drive_detection_enabled=0, the
      // settings/tracking toggle) is a CHOICE, not a ClearTrack fault — it must
      // never enter the rollback signal (kingdomembracer75, 22 Jun: 17 lifetime
      // auto-trips then toggled detection off, paged #founder as an "error").
      // The client now reports "info" for this, but check it here too so the
      // exclusion holds for devices that haven't pulled that OTA yet.
      if (status.enabled === false) {
        userDisabled++;
      } else if (status.backgroundPermission === "granted") {
        // Only a genuine engine error (the rollback signal) when background
        // permission is GRANTED. An "error" verdict with undetermined/denied
        // background permission means the user hasn't granted Always-location,
        // so the engine simply can't run in the background — a permissions
        // problem, not a ClearTrack bug. Counting those as engine errors would
        // flood the rollback signal with the foreground-only cohort (handled by
        // the welcome nudge + dashboard banner, not by rolling the engine back).
        unhealthy.push({ email: d.user.email ?? d.userId, userId: d.userId });
      } else {
        permissionGated++;
      }
    }
  }
  if (permissionGated > 0) {
    console.log(
      `[native-health] ${permissionGated} native device(s) errored on missing background permission — excluded from the rollback signal`
    );
  }
  if (userDisabled > 0) {
    console.log(
      `[native-health] ${userDisabled} native device(s) reported error with auto-detection user-disabled — excluded from the rollback signal`
    );
  }

  // ── Silent non-capture check (the Norman Boomer class, 10 Jun 2026) ──────
  // A device can be lethally broken while self-reporting "healthy": on some
  // devices RNBG never reports motion (every native_motionchange is
  // isMoving:false at app open), so the engine starts cleanly and never opens
  // a single recording — and the on-device verdict only degrades after a
  // 10-day dry spell. Catch it server-side instead: a previously-active
  // auto-capturing driver, native engine on, background permission granted,
  // app demonstrably alive (a dump in the window = an app open) — and ZERO
  // auto-captured trips recently. That combination isn't "stopped driving";
  // it's the engine missing drives.
  const RECENT_DAYS = 4;
  const BASELINE_MIN_AUTO_TRIPS = 4; // ≥4 auto trips in the prior 14 days = an active driver
  const nowMs = Date.now();
  const recentCutoff = new Date(nowMs - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const baselineCutoff = new Date(nowMs - (RECENT_DAYS + 14) * 24 * 60 * 60 * 1000);

  const eligible = [...latest.values()].filter((d) => {
    const status = (d.statusJson ?? {}) as Record<string, unknown>;
    // enabled !== false: a user who switched auto-detection OFF has zero
    // auto-trips BY CHOICE — that's not "the engine missing drives", so it must
    // not enter the silent bucket either (kingdomembracer75, 22 Jun: was the
    // 'error' false-alarm, then the verdict OTA moved them straight into this
    // bucket because it didn't check enabled). Same root cause as the error
    // bucket, one level over.
    return (
      status.nativeEngineEnabled === true &&
      status.backgroundPermission === "granted" &&
      status.enabled !== false
    );
  });
  const eligibleIds = eligible.map((d) => d.userId);

  const silent: { email: string; userId: string; staleShift?: boolean }[] = [];
  if (eligibleIds.length > 0) {
    const [recentCounts, baselineCounts] = await Promise.all([
      prisma.trip.groupBy({
        by: ["userId"],
        where: { userId: { in: eligibleIds }, isManualEntry: false, startedAt: { gte: recentCutoff } },
        _count: { _all: true },
      }),
      prisma.trip.groupBy({
        by: ["userId"],
        where: {
          userId: { in: eligibleIds },
          isManualEntry: false,
          startedAt: { gte: baselineCutoff, lt: recentCutoff },
        },
        _count: { _all: true },
      }),
    ]);
    const recentBy = new Map(recentCounts.map((r) => [r.userId, r._count._all]));
    const baselineBy = new Map(baselineCounts.map((r) => [r.userId, r._count._all]));
    for (const d of eligible) {
      if ((recentBy.get(d.userId) ?? 0) > 0) continue;
      if ((baselineBy.get(d.userId) ?? 0) < BASELINE_MIN_AUTO_TRIPS) continue;
      // Don't double-report a device already in the error list.
      if (unhealthy.some((u) => u.userId === d.userId)) continue;
      // A non-null activeShiftId on a silent device is the prime suspect: a
      // stuck/ghost shift mutes the native engine (auto-detection yields while a
      // shift is "active"). The client active_shift_id self-heal clears these,
      // but flag it here so the cause is obvious rather than buried.
      const sStatus = (d.statusJson ?? {}) as Record<string, unknown>;
      const asid = sStatus.activeShiftId;
      const staleShift = typeof asid === "string" && asid.length > 0 && asid !== "null";
      silent.push({ email: d.user.email ?? d.userId, userId: d.userId, staleShift });
    }
  }

  // ── Stranded-OTA check ───────────────────────────────────────────────────
  // A device on a pre-update-aware bundle (no `updates` key) or an OTA >21 days
  // old isn't pulling the latest fixes. But that population is MIXED: some are
  // genuinely old binaries that can't OTA, and many are build-74+ devices that
  // rolled back to their embedded bundle after an OTA failed to launch — those
  // are FUNCTIONAL (still launching + capturing) and self-heal, yet the old
  // blanket rule mislabeled them "build-73 stream" and cried wolf (Katy + Emma,
  // 23 Jun: both flagged here while actually working). So we only escalate to
  // #founder when the device is ALSO impaired — silent non-capture or an error
  // verdict — i.e. stranded AND actually broken, which is exactly what this
  // alert was built for ("we only noticed when its users stopped capturing").
  // Functional stranded devices are logged quietly, not alerted.
  // Embedded launches / dev builds (isEnabled false) — skip.
  const STRANDED_OTA_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;
  const impairedIds = new Set<string>([
    ...unhealthy.map((u) => u.userId),
    ...silent.map((u) => u.userId),
  ]);
  const stranded: { email: string; userId: string; detail: string }[] = [];
  let strandedFunctional = 0;
  for (const d of latest.values()) {
    const status = (d.statusJson ?? {}) as Record<string, unknown>;
    if (status.nativeEngineEnabled !== true) continue;
    if (status.enabled === false) continue; // user turned detection off — not a stranding concern
    const updates = status.updates as
      | { isEnabled?: boolean; createdAt?: string | null; isEmbeddedLaunch?: boolean | null; runtimeVersion?: string | null }
      | undefined;
    let detail: string | null = null;
    if (!updates) {
      // No `updates` key = a pre-9-Jun bundle: could be a genuinely old binary
      // OR a build-74+ device rolled back to embedded. We can't tell from the
      // dump, so don't assert "build-73".
      detail = "pre-update-aware bundle (old binary or rolled-back OTA)";
    } else if (updates.isEnabled === false || updates.isEmbeddedLaunch === true) {
      continue;
    } else {
      const created = updates.createdAt ? Date.parse(updates.createdAt) : NaN;
      if (Number.isFinite(created) && Date.now() - created > STRANDED_OTA_MAX_AGE_MS) {
        detail = `OTA from ${updates.createdAt!.slice(0, 10)} on ${updates.runtimeVersion ?? "?"}`;
      }
    }
    if (!detail) continue;
    // Only escalate stranded devices that are ALSO impaired; a functional one
    // (launching + capturing fine on an older bundle) is noise.
    if (impairedIds.has(d.userId)) {
      stranded.push({ email: d.user.email ?? d.userId, userId: d.userId, detail });
    } else {
      strandedFunctional++;
    }
  }
  if (strandedFunctional > 0) {
    console.log(
      `[native-health] ${strandedFunctional} stranded-but-functional device(s) on pre-update-aware bundles (mostly OTA rollbacks, launching/capturing fine) — not alerting`
    );
  }

  if (unhealthy.length === 0 && silent.length === 0 && stranded.length === 0) {
    lastNativeHealthSig = ""; // reset so a fresh problem alerts immediately
    return;
  }

  const now = Date.now();
  const sig = [
    ...unhealthy.map((u) => `e:${u.userId}`),
    ...silent.map((u) => `s:${u.userId}`),
    ...stranded.map((u) => `o:${u.userId}`),
  ]
    .sort()
    .join(",");
  const shouldPost =
    sig !== lastNativeHealthSig || now - lastNativeHealthAt >= NATIVE_HEALTH_REPOST_MS;
  if (!shouldPost) {
    console.log(
      `[native-health] alert suppressed - unchanged (${unhealthy.length} error / ${silent.length} silent / ${stranded.length} stranded of ${nativeTotal} native devices)`
    );
    return;
  }
  lastNativeHealthSig = sig;
  lastNativeHealthAt = now;

  const sections: string[] = [];
  if (unhealthy.length > 0) {
    const list = unhealthy.slice(0, 15).map((u) => `• ${u.email}`).join("\n");
    sections.push(
      `Verdict "error" in the last 12h (background permission granted):\n${list}` +
        (unhealthy.length > 15 ? `\n…and ${unhealthy.length - 15} more` : "")
    );
  }
  if (silent.length > 0) {
    const list = silent
      .slice(0, 15)
      .map((u) => `• ${u.email}${u.staleShift ? " — stuck active shift (mutes the engine)" : ""}`)
      .join("\n");
    sections.push(
      `SILENT non-capture — previously-active drivers (≥${BASELINE_MIN_AUTO_TRIPS} auto trips in the prior 14d), app alive, ` +
        `zero auto-captured trips in ${RECENT_DAYS} days. The engine is likely missing their drives ` +
        `(self-reported verdict can still say "healthy"):\n${list}` +
        (silent.length > 15 ? `\n…and ${silent.length - 15} more` : "")
    );
  }
  if (stranded.length > 0) {
    const list = stranded.slice(0, 15).map((u) => `• ${u.email} — ${u.detail}`).join("\n");
    sections.push(
      `STRANDED + IMPAIRED — on a pre-update-aware bundle AND showing trouble (silent non-capture ` +
        `or error verdict), so no OTA we ship reaches them. These need a binary update ` +
        `(TestFlight/App Store). Functional rolled-back devices are excluded — only genuinely-stuck ones listed:\n${list}` +
        (stranded.length > 15 ? `\n…and ${stranded.length - 15} more` : "")
    );
  }

  const total = unhealthy.length + silent.length + stranded.length;
  await postFounderAlert({
    severity: unhealthy.length + silent.length >= 3 ? "critical" : "warning",
    title: `ClearTrack: ${total}/${nativeTotal} device(s) need attention (${unhealthy.length} error, ${silent.length} silent, ${stranded.length} stranded)`,
    detail:
      `ClearTrack (native-engine) devices. If the error/silent sets are growing across runs, consider rolling the native engine flag back.\n\n` +
      sections.join("\n\n"),
  });
}

/**
 * Scans the User-table heartbeat fields and pushes alerts when a user's
 * tracking pipeline is silently broken. Complements the diagnostic-dump
 * scan (which only fires when the user manually uploads a dump) — this
 * one runs against every active user's most-recent heartbeat.
 *
 * Alerts are 7-day-cooldown'd per problem-type per user via app_events
 * so we don't repeatedly nag someone whose underlying issue can't be
 * fixed without action they haven't taken yet.
 */
async function runHeartbeatAlertScanJob(): Promise<void> {
  // 7-day cooldown — these are state-of-device alerts that don't change
  // until the user takes action. 24h would spam users who can't change
  // the setting (e.g. iOS prompts gone, MDM-locked).
  const ALERT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

  // Only act on users who heartbeat-reported in the last 7 days. Anyone
  // older has either uninstalled or stopped using the app — pushing them
  // is just churn.
  const heartbeatCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // And only push if the user has been recently active. Users dormant
  // for >30 days don't need a "your tracking is broken" alert because
  // they aren't trying to track anything right now.
  const activityCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      pushToken: { not: null },
      lastHeartbeatAt: { gte: heartbeatCutoff },
      OR: [
        { lastTripAt: { gte: activityCutoff } },
        { lastDrivingSpeedAt: { gte: activityCutoff } },
      ],
    },
    select: {
      id: true,
      bgLocationPermission: true,
      backgroundFetchStatus: true,
      lastSyncQueuePermFailed: true,
      lastSyncQueueFailed: true,
      secondsSinceLastTripPost: true,
      daysSinceLastTrip: true,
      freeDiskBytes: true,
      autoRecordingActive: true,
      lastDrivingSpeedAt: true,
    },
  });

  let sent = 0;

  for (const user of users) {
    const checks: Array<{
      condition: boolean;
      alertType: string;
      title: string;
      body: string;
      data: Record<string, unknown>;
    }> = [];

    // 1. Background location permission lost mid-flight. Without this
    //    iOS won't wake the app to track, so trips silently stop.
    if (user.bgLocationPermission && !["always", "granted"].includes(user.bgLocationPermission)) {
      checks.push({
        condition: true,
        alertType: "alert.heartbeat_bg_location_lost",
        title: "Trips aren't being tracked",
        body: "Background location was turned off. Open Settings → MileClear → Location → Always to keep tracking working.",
        data: { action: "open_settings" },
      });
    }

    // 2. Background App Refresh denied/restricted. Without it the
    //    BACKGROUND_FINALIZE_TASK can't fire, so trips stay stuck.
    if (user.backgroundFetchStatus && ["denied", "restricted"].includes(user.backgroundFetchStatus)) {
      checks.push({
        condition: true,
        alertType: "alert.heartbeat_bg_fetch_denied",
        title: "Trip saving might fail",
        body: "Background App Refresh is off. Open iOS Settings → General → Background App Refresh → MileClear → On.",
        data: { action: "open_settings" },
      });
    }

    // 3. Permanently-failed sync queue rows. The app has given up on
    //    these — without manual intervention they never reach the cloud.
    if ((user.lastSyncQueuePermFailed ?? 0) > 0) {
      checks.push({
        condition: true,
        alertType: "alert.heartbeat_sync_perm_failed",
        title: "Some trips couldn't be saved to the cloud",
        body: `${user.lastSyncQueuePermFailed} trip${
          (user.lastSyncQueuePermFailed ?? 0) === 1 ? "" : "s"
        } failed to upload. Open MileClear and tap Sync to retry.`,
        data: { action: "open_sync_status" },
      });
    }

    // 4. Disk almost full. SQLite writes start failing silently when
    //    iOS has < ~50 MB free.
    if (user.freeDiskBytes != null && user.freeDiskBytes < 100_000_000n) {
      checks.push({
        condition: true,
        alertType: "alert.heartbeat_low_disk",
        title: "Phone storage critically low",
        body: "MileClear may not be able to save new trips. Free up some space on your iPhone.",
        data: { action: "open_dashboard" },
      });
    }

    for (const check of checks) {
      if (!check.condition) continue;
      const cutoff = new Date(Date.now() - ALERT_COOLDOWN_MS);
      const already = await prisma.appEvent.findFirst({
        where: { userId: user.id, type: check.alertType, createdAt: { gte: cutoff } },
      });
      if (already) continue;

      try {
        await sendPushToUser(user.id, check.title, check.body, check.data);
        logEvent(check.alertType, user.id);
        sent++;
      } catch {
        // best-effort
      }
    }
  }

  if (sent > 0) {
    console.log(`[jobs/notifications] Heartbeat scan sent ${sent} alert(s)`);
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

  // Jobs gated to a NARROW time window must tick faster than the window is
  // wide, like the morning briefing always has. On the 6h boot-anchored
  // interval a window-gated job only fires if the boot phase happens to land
  // a tick inside its window — and the nightly ~4am pm2 restart phase-locks
  // the 6h ticks to ~04/10/16/22h, which NEVER hits the fuel job's 07-09 UTC
  // window (fuel alerts silently died when the window gate landed, 8 Jul
  // 2026) and only coincidentally hits activation's 16-18h. All of these
  // return immediately outside their window and are per-user deduped inside
  // it, so the 30-min cadence is cheap.
  const runWindowed = () => {
    void runJob("morning_briefing", runMorningBriefingJob);
    void runJob("fuel_price_alert", runFuelPriceAlertJob);
    void runJob("activation_d7", runActivationDay7Job);
    void runJob("pro_inactive_alarm", runPayingInactiveAlarmJob);
  };

  setTimeout(() => {
    runAll();
    setInterval(runAll, INTERVAL_MS);

    runWindowed();
    setInterval(runWindowed, BRIEFING_INTERVAL_MS);

    void runJob("diagnostic_scan", runDiagnosticScanJob);
    setInterval(() => void runJob("diagnostic_scan", runDiagnosticScanJob), INTERVAL_MS);

    // Heartbeat-driven alert scan: every 6 hours. Catches users whose
    // tracking pipeline broke silently (bg location revoked, sync queue
    // stuck, etc) without requiring them to upload a diagnostic dump.
    void runJob("heartbeat_alert_scan", runHeartbeatAlertScanJob);
    setInterval(() => void runJob("heartbeat_alert_scan", runHeartbeatAlertScanJob), INTERVAL_MS);

    // Recording watchdog runs every 5 min — much higher frequency than other
    // jobs because stuck-recording detection is time-sensitive (we want the
    // user's phantom recording drained before they'd notice in the UI).
    const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;
    void runJob("recording_watchdog", runRecordingWatchdogJob);
    setInterval(() => void runJob("recording_watchdog", runRecordingWatchdogJob), WATCHDOG_INTERVAL_MS);

    // ClearTrack (native-engine) health monitor (founder-facing): every 15 min
    // during the rollout. Watches the diagnostics we already collect across ANY
    // build and pings #founder only when ClearTrack devices report errors -
    // deduped, so the frequent cadence never spams. The rollback signal.
    const NATIVE_HEALTH_INTERVAL_MS = 15 * 60 * 1000;
    void runJob("native_engine_health", runNativeEngineHealthJob);
    setInterval(() => void runJob("native_engine_health", runNativeEngineHealthJob), NATIVE_HEALTH_INTERVAL_MS);

    // Idempotency-key purge: hourly. Just deletes expired rows — cheap.
    const PURGE_INTERVAL_MS = 60 * 60 * 1000;
    void runJob("idempotency_purge", runIdempotencyPurgeJob);
    setInterval(() => void runJob("idempotency_purge", runIdempotencyPurgeJob), PURGE_INTERVAL_MS);

    // Fuel station cache pre-warm: every 12 minutes. Keeps the 15-minute
    // in-memory cache fresh so user-facing /fuel/prices requests never
    // pay the cold-fetch cost (8.33s avg, 26s p95 in production before
    // this). One initial warm on boot then a recurring tick.
    const FUEL_PREWARM_INTERVAL_MS = 12 * 60 * 1000;
    void runJob("fuel_prewarm", prewarmStationCache);
    setInterval(() => void runJob("fuel_prewarm", prewarmStationCache), FUEL_PREWARM_INTERVAL_MS);

    // Reconciliation cron: daily. Cross-checks cached aggregate figures
    // (MileageSummary) against source-of-truth trips. Required for MTD
    // ITSA — wrong quarterly figures get fined.
    const RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
    void runJob("reconciliation", runReconciliationJob);
    setInterval(() => void runJob("reconciliation", runReconciliationJob), RECONCILIATION_INTERVAL_MS);

    // Geofence-radius recommendation: weekly. Rolls up observations into
    // per-location-type p75 distance recommendations. Mobile reads the
    // result on saved-location creation/edit to default-radius adapt.
    const GEOFENCE_RECOMMEND_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
    void runJob("geofence_radius_recommend", runGeofenceRadiusRecommendJob);
    setInterval(
      () => void runJob("geofence_radius_recommend", runGeofenceRadiusRecommendJob),
      GEOFENCE_RECOMMEND_INTERVAL_MS
    );

    // HMRC dev-hub keep-alive: weekly. Calls /hello/application against
    // the sandbox so the "Last API call" timestamp on the developer hub
    // stays current while production-credentials review is in progress.
    // No-op when HMRC creds aren't configured.
    const HMRC_KEEP_ALIVE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
    void runJob("hmrc_keep_alive", runHmrcKeepAliveJob);
    setInterval(
      () => void runJob("hmrc_keep_alive", runHmrcKeepAliveJob),
      HMRC_KEEP_ALIVE_INTERVAL_MS
    );

    // Discord Pro Member role sync: daily. Reconciles every linked
    // user's Pro role against the source-of-truth subscription state.
    // No-op when DISCORD_PRO_ROLE_ID / bot config isn't set.
    const DISCORD_PRO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
    void runJob("discord_pro_sync", runDiscordProSyncJob);
    setInterval(
      () => void runJob("discord_pro_sync", runDiscordProSyncJob),
      DISCORD_PRO_SYNC_INTERVAL_MS
    );

    // Tax tip of the day: hourly cron with an internal 8am UK gate +
    // already-posted-today dedup. No-op when DISCORD_WEBHOOK_TAXTIPS
    // isn't configured.
    const TAX_TIP_INTERVAL_MS = 60 * 60 * 1000; // hourly
    void runJob("tax_tip_of_the_day", runTaxTipOfTheDayJob);
    setInterval(
      () => void runJob("tax_tip_of_the_day", runTaxTipOfTheDayJob),
      TAX_TIP_INTERVAL_MS
    );

    // Weekly community digest: hourly tick, internal Sunday-9am-UK
    // gate + 6-day dedup. Posts to #announcements with aggregated
    // community stats. No-op when announcement webhook isn't set.
    const WEEKLY_DIGEST_INTERVAL_MS = 60 * 60 * 1000;
    void runJob("weekly_digest", runWeeklyDigestJob);
    setInterval(
      () => void runJob("weekly_digest", runWeeklyDigestJob),
      WEEKLY_DIGEST_INTERVAL_MS
    );

    // HMRC deadline reminders: hourly tick with 8am UK gate. Posts
    // when a deadline is 30/14/7/1/0 days away. Per-deadline dedup.
    const DEADLINE_REMINDER_INTERVAL_MS = 60 * 60 * 1000;
    void runJob("deadline_reminders", runTaxDeadlineRemindersJob);
    setInterval(
      () => void runJob("deadline_reminders", runTaxDeadlineRemindersJob),
      DEADLINE_REMINDER_INTERVAL_MS
    );

    // First-business-trip celebrations: 6-hour cron. Anonymous post
    // to #wins when a Discord-linked driver logs their first ever
    // classified business trip. One-shot per user.
    const FIRST_TRIP_INTERVAL_MS = 6 * 60 * 60 * 1000;
    void runJob("first_trip_celebration", runFirstTripCelebrationJob);
    setInterval(
      () => void runJob("first_trip_celebration", runFirstTripCelebrationJob),
      FIRST_TRIP_INTERVAL_MS
    );

    // Mileage milestone celebrations: daily cron. Checks if any
    // Discord-linked driver crossed 1k/5k/10k/25k business miles
    // in the last 24h. Anonymous posts to #wins.
    const MILESTONE_INTERVAL_MS = 24 * 60 * 60 * 1000;
    void runJob("milestone_celebration", runMileageMilestoneCelebrationJob);
    setInterval(
      () => void runJob("milestone_celebration", runMileageMilestoneCelebrationJob),
      MILESTONE_INTERVAL_MS
    );
  }, INITIAL_DELAY_MS);

  console.log("[jobs/notifications] Scheduled notification jobs started (first run in 60s)");
}
