// Admin observability endpoints (Sep 2026 redesign). Registered inside the
// admin plugin, so the auth + admin preHandlers already apply.
//
//   GET /admin/support-queue         who is waiting on a reply, oldest first
//   GET /admin/android-testers       every Android account with a one-word verdict
//   GET /admin/live-activity-health  push-start / presence / progress rollup, 7 days
//   GET /admin/trip-quality          stub-fix and phantom rates for captured trips, 7 days
//
// The counting lives in services/adminObservability.ts so it is unit-tested;
// this file only fetches rows and shapes the response.

import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import {
  ageHours,
  classifyAndroidTester,
  feedbackIsOpen,
  lastReplyBy,
  liveActivityRollup,
  missingTripAnswered,
  tripQualityRollup,
  STUB_COORD_MAX,
} from "../../services/adminObservability.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function adminObservabilityRoutes(app: FastifyInstance): Promise<void> {
  // ── Support queue ────────────────────────────────────────────────────────
  app.get("/support-queue", async (_request, reply) => {
    const now = Date.now();
    const since = new Date(now - 14 * DAY);

    const [feedback, reports] = await Promise.all([
      prisma.feedback.findMany({
        where: { createdAt: { gte: new Date(now - 90 * DAY) } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          title: true,
          status: true,
          category: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { email: true, displayName: true, isPremium: true } },
          replies: { select: { createdAt: true, user: { select: { isAdmin: true } } } },
        },
      }),
      prisma.appEvent.findMany({
        where: { type: "trip.report_missing", createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          metadata: true,
          createdAt: true,
          user: { select: { email: true, displayName: true, isPremium: true } },
        },
      }),
    ]);

    const reportUserIds = [...new Set(reports.map((r) => r.userId).filter((v): v is string => !!v))];
    const followUps = reportUserIds.length
      ? await prisma.appEvent.findMany({
          where: {
            userId: { in: reportUserIds },
            type: { in: ["support.reply_sent", "admin.trip_created"] },
            createdAt: { gte: since },
          },
          select: { userId: true, type: true, createdAt: true },
        })
      : [];
    const followBy = new Map<string, Array<{ type: string; createdAt: Date }>>();
    for (const f of followUps) {
      if (!f.userId) continue;
      const arr = followBy.get(f.userId) ?? [];
      arr.push(f);
      followBy.set(f.userId, arr);
    }

    type Item = {
      kind: "feedback" | "missing_trip";
      id: string;
      userId: string | null;
      email: string | null;
      displayName: string | null;
      isPremium: boolean;
      at: string;
      ageHours: number;
      summary: string;
      status: string | null;
      replies: number;
      lastReplyBy: "admin" | "user" | null;
    };

    const items: Item[] = [];
    for (const f of feedback) {
      if (!feedbackIsOpen(f.status)) continue;
      const replies = f.replies.map((r) => ({ createdAt: r.createdAt, isAdmin: r.user.isAdmin }));
      const last = lastReplyBy(replies);
      // Waiting on us: no reply yet, or the user spoke last.
      if (last === "admin") continue;
      items.push({
        kind: "feedback",
        id: f.id,
        userId: f.userId,
        email: f.user?.email ?? null,
        displayName: f.user?.displayName ?? null,
        isPremium: f.user?.isPremium ?? false,
        at: f.createdAt.toISOString(),
        ageHours: ageHours(now, f.createdAt),
        summary: `${f.category}: ${f.title}`,
        status: f.status,
        replies: replies.length,
        lastReplyBy: last,
      });
    }
    for (const r of reports) {
      const ups = r.userId ? (followBy.get(r.userId) ?? []) : [];
      if (missingTripAnswered(r.createdAt, ups)) continue;
      const meta = (r.metadata ?? {}) as { note?: string };
      items.push({
        kind: "missing_trip",
        id: r.id,
        userId: r.userId,
        email: r.user?.email ?? null,
        displayName: r.user?.displayName ?? null,
        isPremium: r.user?.isPremium ?? false,
        at: r.createdAt.toISOString(),
        ageHours: ageHours(now, r.createdAt),
        summary: meta.note?.slice(0, 160) ?? "(no note)",
        status: null,
        replies: 0,
        lastReplyBy: null,
      });
    }
    items.sort((a, b) => a.at.localeCompare(b.at));

    return reply.send({
      data: {
        items,
        counts: {
          feedbackOpen: items.filter((i) => i.kind === "feedback").length,
          missingTripsOpen: items.filter((i) => i.kind === "missing_trip").length,
          total: items.length,
        },
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // ── Android testers ──────────────────────────────────────────────────────
  app.get("/android-testers", async (_request, reply) => {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY);

    const users = await prisma.user.findMany({
      where: { platformsSeen: { contains: "android" } },
      orderBy: { lastHeartbeatAt: "desc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        isPremium: true,
        createdAt: true,
        buildNumber: true,
        appVersion: true,
        osVersion: true,
        lastHeartbeatAt: true,
        lastTripAt: true,
        pushToken: true,
        bgLocationPermission: true,
      },
    });
    const ids = users.map((u) => u.id);

    const [trips, dumps] = ids.length
      ? await Promise.all([
          prisma.trip.findMany({
            where: { userId: { in: ids }, startedAt: { gte: weekAgo } },
            select: { userId: true, isManualEntry: true, coordinateCount: true, startedAt: true },
          }),
          prisma.diagnosticDump.findMany({
            where: { userId: { in: ids } },
            select: { userId: true, capturedAt: true, statusJson: true },
          }),
        ])
      : [[], []];

    const tripsBy = new Map<string, { auto: number; manual: number; stubs: number; lastAuto: Date | null }>();
    for (const t of trips) {
      const row = tripsBy.get(t.userId) ?? { auto: 0, manual: 0, stubs: 0, lastAuto: null };
      if (t.isManualEntry) row.manual++;
      else {
        row.auto++;
        if (t.coordinateCount <= STUB_COORD_MAX) row.stubs++;
        if (!row.lastAuto || t.startedAt > row.lastAuto) row.lastAuto = t.startedAt;
      }
      tripsBy.set(t.userId, row);
    }
    const dumpBy = new Map(dumps.map((d) => [d.userId, d]));

    const testers = users.map((u) => {
      const t = tripsBy.get(u.id) ?? { auto: 0, manual: 0, stubs: 0, lastAuto: null };
      const dump = dumpBy.get(u.id);
      const s = (dump?.statusJson ?? {}) as {
        device?: { constants?: { deviceName?: string } };
        batteryOptimisation?: { ignoring?: boolean; manufacturer?: string };
        activitySummary?: Record<string, number>;
      };
      const verdict = classifyAndroidTester({
        createdAt: u.createdAt,
        lastHeartbeatAt: u.lastHeartbeatAt,
        bgLocationPermission: u.bgLocationPermission,
        autoTrips7d: t.auto,
        stubTrips7d: t.stubs,
        now,
      });
      return {
        userId: u.id,
        email: u.email,
        displayName: u.displayName,
        isPremium: u.isPremium,
        createdAt: u.createdAt.toISOString(),
        buildNumber: u.buildNumber,
        appVersion: u.appVersion,
        osVersion: u.osVersion,
        device: s.device?.constants?.deviceName ?? null,
        manufacturer: s.batteryOptimisation?.manufacturer ?? null,
        lastHeartbeatAt: u.lastHeartbeatAt?.toISOString() ?? null,
        lastTripAt: u.lastTripAt?.toISOString() ?? null,
        lastAutoTripAt: t.lastAuto?.toISOString() ?? null,
        autoTrips7d: t.auto,
        manualTrips7d: t.manual,
        stubTrips7d: t.stubs,
        hasPushToken: !!u.pushToken,
        bgLocationPermission: u.bgLocationPermission,
        batteryIgnoring: typeof s.batteryOptimisation?.ignoring === "boolean" ? s.batteryOptimisation.ignoring : null,
        headlessRearms: s.activitySummary?.native_headless_rearmed ?? null,
        headlessSpeedWakes: s.activitySummary?.native_headless_force_start_from_speed ?? null,
        dumpAt: dump?.capturedAt.toISOString() ?? null,
        verdict,
      };
    });

    const count = (pred: (t: (typeof testers)[number]) => boolean) => testers.filter(pred).length;
    return reply.send({
      data: {
        testers,
        totals: {
          count: testers.length,
          withPushToken: count((t) => t.hasPushToken),
          bgGranted: count((t) => t.bgLocationPermission === "granted"),
          batteryOptimised: count((t) => t.batteryIgnoring === false),
          capturing: count((t) => t.verdict === "capturing"),
          stubFixes: count((t) => t.verdict === "stub_fixes"),
          silent: count((t) => t.verdict === "silent"),
          gone: count((t) => t.verdict === "gone"),
        },
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // ── Live Activity health ─────────────────────────────────────────────────
  app.get("/live-activity-health", async (_request, reply) => {
    const since = new Date(Date.now() - 7 * DAY);
    const events = await prisma.appEvent.findMany({
      where: {
        type: { in: ["la.push_start", "la.presence_check", "la.foreground_heal", "la.progress_update"] },
        createdAt: { gte: since },
      },
      select: { type: true, buildNumber: true, metadata: true },
    });
    const rollup = liveActivityRollup(events);
    return reply.send({ data: { days: 7, ...rollup, generatedAt: new Date().toISOString() } });
  });

  // ── Trip quality ─────────────────────────────────────────────────────────
  app.get("/trip-quality", async (_request, reply) => {
    const since = new Date(Date.now() - 7 * DAY);
    const [trips, eventCounts] = await Promise.all([
      prisma.trip.findMany({
        where: { startedAt: { gte: since } },
        select: {
          isManualEntry: true,
          isPhantomTrip: true,
          coordinateCount: true,
          user: { select: { signupPlatform: true } },
        },
      }),
      prisma.appEvent.groupBy({
        by: ["type"],
        where: {
          createdAt: { gte: since },
          type: {
            in: [
              "trip.map_match_skipped_implausible",
              "trip.visit_auto_split",
              "trip.wake_lag_start_extended",
              "trip.edge_phantom_trimmed",
              "trip.orphan_route_finalize",
              "trip.report_missing",
            ],
          },
        },
        _count: { _all: true },
      }),
    ]);
    const rollup = tripQualityRollup(
      trips.map((t) => ({
        isManualEntry: t.isManualEntry,
        isPhantomTrip: t.isPhantomTrip,
        coordinateCount: t.coordinateCount,
        platform: t.user.signupPlatform,
      }))
    );
    const byType = new Map(eventCounts.map((e) => [e.type, e._count._all]));
    return reply.send({
      data: {
        days: 7,
        ...rollup,
        events: {
          mapMatchSkipped: byType.get("trip.map_match_skipped_implausible") ?? 0,
          visitAutoSplit: byType.get("trip.visit_auto_split") ?? 0,
          wakeLagExtended: byType.get("trip.wake_lag_start_extended") ?? 0,
          edgePhantomTrimmed: byType.get("trip.edge_phantom_trimmed") ?? 0,
          orphanFinalized: byType.get("trip.orphan_route_finalize") ?? 0,
          missingReports: byType.get("trip.report_missing") ?? 0,
        },
        generatedAt: new Date().toISOString(),
      },
    });
  });
}
