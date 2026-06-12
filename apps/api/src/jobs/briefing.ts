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

/**
 * Compact ClearTrack health counts for the briefing — same criteria as
 * /admin/cleartrack-health and the #founder monitor (silent non-capture:
 * previously-active driver, native engine, permissions granted, app alive,
 * zero recent auto-captures; stranded: fresh dumps but a dead OTA stream).
 * Counts only; the admin page has the per-device detail.
 */
async function getCaptureHealthCounts(): Promise<{
  silent: number;
  stranded: number;
  selfHeals24h: number;
}> {
  const now = Date.now();
  const dumps = await prisma.diagnosticDump.findMany({
    where: { createdAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { capturedAt: "desc" },
    select: { userId: true, createdAt: true, statusJson: true },
  });
  const latest = new Map<string, (typeof dumps)[number]>();
  for (const d of dumps) if (!latest.has(d.userId)) latest.set(d.userId, d);

  const native = [...latest.values()].filter((d) => {
    const s = (d.statusJson ?? {}) as Record<string, unknown>;
    return s.nativeEngineEnabled === true && s.backgroundPermission === "granted";
  });
  const ids = native.map((d) => d.userId);

  const recentCutoff = new Date(now - 4 * 24 * 60 * 60 * 1000);
  const baselineCutoff = new Date(now - 18 * 24 * 60 * 60 * 1000);
  const [recent, baseline] = ids.length
    ? await Promise.all([
        prisma.trip.groupBy({
          by: ["userId"],
          where: { userId: { in: ids }, isManualEntry: false, startedAt: { gte: recentCutoff } },
          _count: { _all: true },
        }),
        prisma.trip.groupBy({
          by: ["userId"],
          where: {
            userId: { in: ids },
            isManualEntry: false,
            startedAt: { gte: baselineCutoff, lt: recentCutoff },
          },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const recentBy = new Map(recent.map((r) => [r.userId, r._count._all]));
  const baselineBy = new Map(baseline.map((r) => [r.userId, r._count._all]));

  let silent = 0;
  let stranded = 0;
  let selfHeals24h = 0;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  for (const d of latest.values()) {
    const s = (d.statusJson ?? {}) as Record<string, unknown>;
    if (s.nativeEngineEnabled === true && s.backgroundPermission === "granted") {
      if ((recentBy.get(d.userId) ?? 0) === 0 && (baselineBy.get(d.userId) ?? 0) >= 4) silent++;
    }
    if (s.nativeEngineEnabled === true) {
      const updates = s.updates as
        | { isEnabled?: boolean; createdAt?: string | null; isEmbeddedLaunch?: boolean | null }
        | undefined;
      if (!updates) {
        stranded++;
      } else if (updates.isEnabled !== false && updates.isEmbeddedLaunch !== true) {
        const created = updates.createdAt ? Date.parse(updates.createdAt) : NaN;
        if (Number.isFinite(created) && now - created > 21 * 24 * 60 * 60 * 1000) stranded++;
      }
    }
    const activity = s.activitySummary as Record<string, number> | undefined;
    if (d.createdAt.getTime() > dayAgo && (activity?.engine_self_healed ?? 0) > 0) selfHeals24h++;
  }
  return { silent, stranded, selfHeals24h };
}

async function runDailyBriefingJob(): Promise<void> {
  try {
    const now = new Date();
    // Send between 7-9 UTC (covers 8am GMT and 8am BST)
    if (now.getUTCHours() < 7 || now.getUTCHours() >= 9) return;
    if (briefingSentToday) return;
    briefingSentToday = true;

    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

    // Event counts (24h) for everything event-sourced.
    const eventCounts = await prisma.appEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: dayAgo } },
      _count: true,
    });
    const countsMap = new Map<string, number>(
      eventCounts.map((e: { type: string; _count: number }) => [e.type, e._count])
    );

    // The day's driving, with a prior-7-day daily baseline so the numbers
    // mean something ("is today normal?") instead of floating contextless.
    const [
      day,
      dayAuto,
      dayDrivers,
      prior,
      priorDrivers,
      totalUsers,
      premiumUsers,
      permFailedUsers,
    ] = await Promise.all([
      prisma.trip.aggregate({
        where: { startedAt: { gte: dayAgo } },
        _count: { _all: true },
        _sum: { distanceMiles: true },
      }),
      prisma.trip.count({ where: { startedAt: { gte: dayAgo }, isManualEntry: false } }),
      prisma.trip
        .groupBy({ by: ["userId"], where: { startedAt: { gte: dayAgo } } })
        .then((r) => r.length),
      prisma.trip.aggregate({
        where: { startedAt: { gte: eightDaysAgo, lt: dayAgo } },
        _count: { _all: true },
        _sum: { distanceMiles: true },
      }),
      prisma.trip
        .groupBy({ by: ["userId", ], where: { startedAt: { gte: eightDaysAgo, lt: dayAgo } } })
        .then((r) => new Set(r.map((x) => x.userId)).size),
      prisma.user.count(),
      prisma.user.count({
        where: { OR: [{ isPremium: true }, { referralProUntil: { gt: now } }] },
      }),
      prisma.user.count({
        where: {
          lastSyncQueuePermFailed: { gt: 0 },
          lastHeartbeatAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const captureHealth = await getCaptureHealthCounts();

    // New user details from events
    const newUserEvents = await prisma.appEvent.findMany({
      where: { type: "user.registered", createdAt: { gte: dayAgo } },
      include: { user: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    });
    const newUserList = newUserEvents
      .filter((e: (typeof newUserEvents)[number]) => e.user)
      .map((e: (typeof newUserEvents)[number]) => ({
        email: e.user!.email,
        displayName: e.user!.displayName,
        method:
          ((e.metadata as Record<string, unknown> | null)?.method as string) ?? "unknown",
      }));

    const admins = await prisma.user.findMany({
      where: { isAdmin: true },
      select: { email: true },
    });
    if (admins.length === 0) return;

    const briefing: BriefingData = {
      period: { from: dayAgo, to: now },

      // The day's driving + baseline
      drivers: dayDrivers,
      trips: day._count._all,
      autoTrips: dayAuto,
      miles: Math.round(day._sum.distanceMiles ?? 0),
      avgDriversPerDay: priorDrivers / 7,
      avgTripsPerDay: prior._count._all / 7,
      avgMilesPerDay: (prior._sum.distanceMiles ?? 0) / 7,

      // Growth
      registrations: getCount(countsMap, "user.registered"),
      newUserList,
      totalUsers,

      // Capture health
      missingTripReports: getCount(countsMap, "trip.report_missing"),
      silentDevices: captureHealth.silent,
      strandedDevices: captureHealth.stranded,
      engineSelfHeals: captureHealth.selfHeals24h,
      watchdogPushes:
        getCount(countsMap, "watchdog.silent_push_sent") +
        getCount(countsMap, "watchdog.drain_sync_push_sent"),
      watchdogGaveUp: getCount(countsMap, "watchdog.gave_up"),

      // Money
      subscriptionsActivated: getCount(countsMap, "billing.subscription_activated"),
      subscriptionsCancelled: getCount(countsMap, "billing.subscription_cancelled"),
      premiumUsers,
      referralScreenViews: getCount(countsMap, "referral.screen_viewed"),
      referralShares: getCount(countsMap, "referral.share_completed"),
      referralQualified: getCount(countsMap, "referral.qualified"),

      // Needs attention
      errors500: getCount(countsMap, "error.500"),
      slowRequests: getCount(countsMap, "perf.slow_request"),
      permFailedUsers,

      // Feature usage (low-volume; rendered only when non-zero)
      shiftsCompleted: getCount(countsMap, "shift.completed"),
      earningsCreated: getCount(countsMap, "earnings.created"),
      tripsDeleted: getCount(countsMap, "trip.deleted"),
      exports:
        getCount(countsMap, "export.csv") +
        getCount(countsMap, "export.pdf") +
        getCount(countsMap, "export.self_assessment"),
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
