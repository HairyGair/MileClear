import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { premiumMiddleware } from "../../middleware/premium.js";
import { prisma } from "../../lib/prisma.js";
import {
  GIG_PLATFORMS,
  haversineDistance,
  type PickupWait,
  type PickupWaitInsight,
} from "@mileclear/shared";

const MIN_INSIGHT_CONTRIBUTORS = 5;
// 300m radius captures the typical building footprint of a restaurant,
// drive-thru forecourt, or depot bay - small enough to feel "this place"
// not "this neighbourhood".
const INSIGHT_RADIUS_MILES = 300 / 1609; // 300m -> miles
// Look back 90 days so the median tracks current performance, not history
// from when the location was newly opened or under different management.
const INSIGHT_WINDOW_DAYS = 90;

const PLATFORM_LABEL = new Map<string, string>(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  );
  return sorted[idx];
}

function toPickupWait(row: {
  id: string;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  platform: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
}): PickupWait {
  return {
    id: row.id,
    locationName: row.locationName,
    locationLat: row.locationLat,
    locationLng: row.locationLng,
    platform: row.platform,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
  };
}

export async function pickupWaitRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // POST /pickup-waits/start — begin a new wait. Returns the new record so
  // the client can stash the id and call /end later.
  app.post("/start", async (request, reply) => {
    const body = z
      .object({
        locationName: z.string().max(255).optional(),
        locationLat: z.number().min(-90).max(90).optional(),
        locationLng: z.number().min(-180).max(180).optional(),
        platform: z.string().min(1).max(40).optional(),
      })
      .parse(request.body);

    // Auto-end any wait that's been open for >2h - assumed forgotten about.
    // Otherwise drivers end up with one bogus 47-hour wait skewing averages.
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.pickupWait.updateMany({
      where: {
        userId: request.userId!,
        endedAt: null,
        startedAt: { lt: cutoff },
      },
      data: {
        endedAt: new Date(),
        durationSeconds: 7200, // capped at the cutoff value
      },
    });

    const row = await prisma.pickupWait.create({
      data: {
        userId: request.userId!,
        locationName: body.locationName ?? null,
        locationLat: body.locationLat ?? null,
        locationLng: body.locationLng ?? null,
        platform: body.platform ?? null,
        startedAt: new Date(),
      },
    });

    return reply.send({ data: toPickupWait(row) });
  });

  // POST /pickup-waits/:id/end — close out a wait. Idempotent.
  app.post(
    "/:id/end",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply
    ) => {
      const { id } = z
        .object({ id: z.string().uuid() })
        .parse(request.params);

      const existing = await prisma.pickupWait.findFirst({
        where: { id, userId: request.userId! },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Wait not found" });
      }

      // Idempotent - if already ended, just return current state.
      if (existing.endedAt) {
        return reply.send({ data: toPickupWait(existing) });
      }

      const now = new Date();
      const durationSeconds = Math.max(
        0,
        Math.round((now.getTime() - existing.startedAt.getTime()) / 1000)
      );

      const row = await prisma.pickupWait.update({
        where: { id },
        data: {
          endedAt: now,
          durationSeconds,
        },
      });

      return reply.send({ data: toPickupWait(row) });
    }
  );

  // GET /pickup-waits/active — returns the user's currently-open wait, if any.
  // Used by the mobile app on launch to restore an in-flight wait timer.
  app.get("/active", async (request, reply) => {
    const row = await prisma.pickupWait.findFirst({
      where: { userId: request.userId!, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    return reply.send({ data: row ? toPickupWait(row) : null });
  });

  // GET /pickup-waits/insights?lat=X&lng=Y — community-aggregated wait
  // times within 300m of the supplied point. Pro feature. Privacy floor
  // of 5 contributors before any cell is exposed.
  app.get<{ Querystring: { lat?: string; lng?: string } }>(
    "/insights",
    {
      preHandler: premiumMiddleware,
    },
    async (request, reply) => {
      const params = z
        .object({
          lat: z.coerce.number().min(-90).max(90),
          lng: z.coerce.number().min(-180).max(180),
        })
        .parse(request.query);

      const since = new Date(
        Date.now() - INSIGHT_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );

      // Pull completed waits in the window with location data. We
      // brute-force distance filter in Node - at our scale (a few
      // thousand rows) this is cheaper than maintaining a spatial index.
      const waits = await prisma.pickupWait.findMany({
        where: {
          endedAt: { not: null },
          durationSeconds: { not: null, gt: 0 },
          locationLat: { not: null },
          locationLng: { not: null },
          startedAt: { gte: since },
        },
        select: {
          userId: true,
          locationName: true,
          locationLat: true,
          locationLng: true,
          platform: true,
          durationSeconds: true,
        },
      });

      const nearby = waits.filter((w) => {
        if (w.locationLat === null || w.locationLng === null) return false;
        const distance = haversineDistance(
          params.lat,
          params.lng,
          w.locationLat,
          w.locationLng
        );
        return distance <= INSIGHT_RADIUS_MILES;
      });

      const uniqueUsers = new Set(nearby.map((w) => w.userId));

      if (uniqueUsers.size < MIN_INSIGHT_CONTRIBUTORS) {
        const empty: PickupWaitInsight = {
          available: false,
          contributors: uniqueUsers.size,
          sampleCount: nearby.length,
          medianSeconds: 0,
          p25Seconds: 0,
          p75Seconds: 0,
          longestSeconds: 0,
          shortestSeconds: 0,
          platforms: [],
          locationName: null,
        };
        return reply.send({ data: empty });
      }

      const durations = nearby.map((w) => w.durationSeconds!);

      // Most-common location name in the cluster (excluding nulls).
      const nameCounts = new Map<string, number>();
      for (const w of nearby) {
        if (w.locationName) {
          nameCounts.set(w.locationName, (nameCounts.get(w.locationName) ?? 0) + 1);
        }
      }
      let bestName: string | null = null;
      let bestCount = 0;
      for (const [name, count] of nameCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestName = name;
        }
      }

      // Per-platform breakdowns, only emitted when each platform meets the floor.
      const byPlatform = new Map<string, { users: Set<string>; durations: number[] }>();
      for (const w of nearby) {
        if (!w.platform) continue;
        const bucket = byPlatform.get(w.platform) ?? {
          users: new Set<string>(),
          durations: [],
        };
        bucket.users.add(w.userId);
        bucket.durations.push(w.durationSeconds!);
        byPlatform.set(w.platform, bucket);
      }
      const platforms: PickupWaitInsight["platforms"] = [];
      for (const [platform, bucket] of byPlatform) {
        if (bucket.users.size < MIN_INSIGHT_CONTRIBUTORS) continue;
        platforms.push({
          platform,
          label: PLATFORM_LABEL.get(platform) ?? platform,
          contributors: bucket.users.size,
          medianSeconds: Math.round(median(bucket.durations)),
        });
      }
      platforms.sort((a, b) => b.contributors - a.contributors);

      const insight: PickupWaitInsight = {
        available: true,
        contributors: uniqueUsers.size,
        sampleCount: nearby.length,
        medianSeconds: Math.round(median(durations)),
        p25Seconds: Math.round(percentile(durations, 25)),
        p75Seconds: Math.round(percentile(durations, 75)),
        longestSeconds: Math.max(...durations),
        shortestSeconds: Math.min(...durations),
        platforms,
        locationName: bestName,
      };

      return reply.send({ data: insight });
    }
  );
}
