import { prisma } from "../lib/prisma.js";
import { sendAdminBriefingEmail, type BriefingData } from "../services/email.js";
import { runJob } from "../services/jobRun.js";

let briefingSentToday = false;

function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    5
  );
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    briefingSentToday = false;
    scheduleMidnightReset();
  }, msUntilMidnight);
}

function getCount(countsMap: Map<string, number>, key: string): number {
  return countsMap.get(key) ?? 0;
}

async function runDailyBriefingJob(): Promise<void> {
  try {
    const now = new Date();
    // Send between 7-9 UTC (covers 8am GMT and 8am BST)
    if (now.getUTCHours() < 7 || now.getUTCHours() >= 9) return;
    if (briefingSentToday) return;
    briefingSentToday = true;

    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Query event counts grouped by type
    const eventCounts = await prisma.appEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: twentyFourHoursAgo } },
      _count: true,
    });

    const countsMap = new Map<string, number>(
      eventCounts.map((e: { type: string; _count: number }) => [e.type, e._count])
    );

    // Also get direct DB counts for totals
    const [totalUsers, newUsers, totalTrips24h, totalErrors] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: { createdAt: { gte: twentyFourHoursAgo } },
        }),
        prisma.trip.count({
          where: { createdAt: { gte: twentyFourHoursAgo } },
        }),
        prisma.appEvent.count({
          where: {
            type: "error.500",
            createdAt: { gte: twentyFourHoursAgo },
          },
        }),
      ]);

    // Get new user details from events
    const newUserEvents = await prisma.appEvent.findMany({
      where: {
        type: "user.registered",
        createdAt: { gte: twentyFourHoursAgo },
      },
      include: {
        user: { select: { email: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const newUserList = newUserEvents
      .filter((e: typeof newUserEvents[number]) => e.user)
      .map((e: typeof newUserEvents[number]) => ({
        email: e.user!.email,
        displayName: e.user!.displayName,
        method: (e.metadata as Record<string, unknown> | null)?.method as string ?? "unknown",
      }));

    // Find admin emails
    const admins = await prisma.user.findMany({
      where: { isAdmin: true },
      select: { email: true },
    });

    if (admins.length === 0) return;

    const briefing: BriefingData = {
      period: { from: twentyFourHoursAgo, to: now },
      registrations: getCount(countsMap, "user.registered"),
      logins: getCount(countsMap, "user.login"),
      loginFailures: getCount(countsMap, "auth.login_failed"),
      verifications: getCount(countsMap, "user.verified"),
      tripsCreated: getCount(countsMap, "trip.created"),
      tripsDeleted: getCount(countsMap, "trip.deleted"),
      shiftsStarted: getCount(countsMap, "shift.started"),
      shiftsCompleted: getCount(countsMap, "shift.completed"),
      earningsCreated: getCount(countsMap, "earnings.created"),
      csvImports: getCount(countsMap, "earnings.csv_imported"),
      openBankingSyncs: getCount(countsMap, "earnings.open_banking_synced"),
      exportsCsv: getCount(countsMap, "export.csv"),
      exportsPdf: getCount(countsMap, "export.pdf"),
      exportsSelfAssessment: getCount(countsMap, "export.self_assessment"),
      checkoutsCreated: getCount(countsMap, "billing.checkout_created"),
      subscriptionsActivated: getCount(countsMap, "billing.subscription_activated"),
      subscriptionsCancelled: getCount(countsMap, "billing.subscription_cancelled"),
      appleIapValidated: getCount(countsMap, "billing.apple_iap_validated"),
      errors500: totalErrors,
      slowRequests: getCount(countsMap, "perf.slow_request"),
      totalUsers,
      newUsers,
      totalTrips24h,
      newUserList,
    };

    for (const admin of admins) {
      await sendAdminBriefingEmail(admin.email, briefing).catch((err: Error) =>
        console.error(`[jobs/briefing] Failed to send to ${admin.email}:`, err)
      );
    }

    console.log(
      `[jobs/briefing] Daily briefing sent to ${admins.length} admin(s)`
    );
  } catch (err) {
    console.error("[jobs/briefing] Daily briefing job failed:", err);
  }
}

/**
 * Clean up events older than 90 days to prevent table bloat.
 */
async function cleanupOldEvents(): Promise<void> {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.appEvent.deleteMany({
      where: { createdAt: { lt: ninetyDaysAgo } },
    });
    if (deleted.count > 0) {
      console.log(
        `[jobs/briefing] Cleaned up ${deleted.count} old app events`
      );
    }
  } catch (err) {
    console.error("[jobs/briefing] Event cleanup failed:", err);
  }
}

/**
 * Start the daily briefing job and event cleanup.
 * Called once after the server starts.
 */
export function startBriefingJobs(): void {
  const INITIAL_DELAY_MS = 2 * 60 * 1000; // 2 minutes after startup
  const CHECK_INTERVAL_MS = 30 * 60 * 1000; // Check every 30 minutes
  const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily cleanup

  scheduleMidnightReset();

  setTimeout(() => {
    void runJob("daily_briefing", runDailyBriefingJob);
    setInterval(() => void runJob("daily_briefing", runDailyBriefingJob), CHECK_INTERVAL_MS);

    // Run cleanup daily
    void runJob("event_cleanup", cleanupOldEvents);
    setInterval(() => void runJob("event_cleanup", cleanupOldEvents), CLEANUP_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log("[jobs/briefing] Briefing jobs scheduled (daily at ~8am UK)");
}
