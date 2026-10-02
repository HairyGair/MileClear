// Loads the rows behind the community numbers for one month and rolls them
// up (services/communityMonthly.ts holds the pure rules).
//
// Reads, none per-user:
//   - the month's trips (narrow columns + vehicle type)
//   - a count of accounts created in the month
//   - business miles earlier in the same tax year, ONLY for drivers with
//     business trips this month (IN list, served by the [userId, startedAt]
//     index), grouped by driver and vehicle type, for the 10,000-mile step
//   - home regions via the shared geography base (memoised 5 min there)
//
// Only complete months are ever computed, so the result is cached for a day
// (late edits and hand-added trips still land the next day) with one
// in-flight promise shared by concurrent requests. No schema, no table.

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import { loadGeographyBase } from "./geographyLoader.js";
import {
  availableMonths,
  londonTaxYear,
  monthBounds,
  priorKey,
  rollupCommunityMonth,
  taxYearStart,
  vehicleClass,
  type CommunityTrip,
} from "./communityMonthly.js";
import type { CommunityMonthly } from "@mileclear/shared";

export const COMMUNITY_CACHE_SECONDS = 24 * 60 * 60;
const CACHE_PREFIX = "community:monthly:v1:";
const IN_CHUNK = 500;

const inflight = new Map<string, Promise<CommunityMonthly>>();

async function priorBusinessMiles(
  userIds: string[],
  from: Date,
  to: Date,
): Promise<Array<{ userId: string; vehicleType: string; miles: number }>> {
  const out: Array<{ userId: string; vehicleType: string; miles: number }> = [];
  for (let i = 0; i < userIds.length; i += IN_CHUNK) {
    const chunk = userIds.slice(i, i + IN_CHUNK);
    const rows = await prisma.$queryRaw<Array<{ userId: string; vehicleType: string | null; miles: number | null }>>`
      SELECT /*+ MAX_EXECUTION_TIME(30000) */ t.userId AS userId, v.vehicleType AS vehicleType, SUM(t.distanceMiles) AS miles
      FROM trips t
      LEFT JOIN vehicles v ON v.id = t.vehicleId
      WHERE t.userId IN (${Prisma.join(chunk)})
        AND t.startedAt >= ${from} AND t.startedAt < ${to}
        AND t.isPhantomTrip = 0
        AND t.possibleDuplicateOfId IS NULL
        AND t.classification = 'business'
      GROUP BY t.userId, v.vehicleType
    `;
    for (const r of rows) out.push({ userId: r.userId, vehicleType: r.vehicleType ?? "car", miles: Number(r.miles ?? 0) });
  }
  return out;
}

async function compute(month: string): Promise<CommunityMonthly> {
  const now = new Date();
  const { start, end } = monthBounds(month);

  const [rows, newDrivers, geo] = await Promise.all([
    prisma.trip.findMany({
      where: { startedAt: { gte: start, lt: end }, isPhantomTrip: false },
      select: {
        userId: true,
        startedAt: true,
        distanceMiles: true,
        classification: true,
        platformTag: true,
        isManualEntry: true,
        isPhantomTrip: true,
        possibleDuplicateOfId: true,
        vehicle: { select: { vehicleType: true } },
      },
    }),
    prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
    loadGeographyBase(),
  ]);

  const trips: CommunityTrip[] = rows.map((r) => ({
    userId: r.userId,
    startedAt: r.startedAt,
    distanceMiles: r.distanceMiles,
    classification: r.classification,
    platformTag: r.platformTag,
    isManualEntry: r.isManualEntry,
    isPhantomTrip: r.isPhantomTrip,
    possibleDuplicateOfId: r.possibleDuplicateOfId,
    vehicleType: r.vehicle?.vehicleType ?? null,
  }));

  // Business drivers per tax year touched by the month. Only a tax year that
  // began before the month has earlier miles to look up.
  const businessUsersByTaxYear = new Map<string, Set<string>>();
  for (const t of trips) {
    if (t.classification !== "business" || t.isPhantomTrip || t.possibleDuplicateOfId) continue;
    const ty = londonTaxYear(t.startedAt);
    const set = businessUsersByTaxYear.get(ty) ?? new Set<string>();
    set.add(t.userId);
    businessUsersByTaxYear.set(ty, set);
  }
  const prior = new Map<string, number>();
  for (const [ty, users] of businessUsersByTaxYear) {
    const from = taxYearStart(ty);
    if (from >= start) continue;
    for (const r of await priorBusinessMiles([...users], from, start)) {
      const key = priorKey(r.userId, ty, vehicleClass(r.vehicleType));
      prior.set(key, (prior.get(key) ?? 0) + r.miles);
    }
  }

  const regionByUser = new Map<string, string | null>();
  for (const u of geo.users) {
    const usable = u.home.confidence !== "signup_ip" && u.home.confidence !== "unknown";
    regionByUser.set(u.id, usable ? u.home.region : null);
  }

  return rollupCommunityMonth({ month, trips, priorBusinessMiles: prior, newDrivers, regionByUser, now });
}

/** The community numbers for a COMPLETE month (callers validate). Cached a day. */
export async function getCommunityMonthly(month: string): Promise<CommunityMonthly> {
  const key = `${CACHE_PREFIX}${month}`;
  const cached = await cacheGet(key);
  // The month list moves on even while a month's numbers are cached.
  if (cached) return { ...(JSON.parse(cached) as CommunityMonthly), months: availableMonths(new Date()) };

  const running = inflight.get(month);
  if (running) return running;

  const promise = compute(month)
    .then(async (data) => {
      await cacheSet(key, JSON.stringify(data), COMMUNITY_CACHE_SECONDS);
      return data;
    })
    .finally(() => {
      inflight.delete(month);
    });
  inflight.set(month, promise);
  return promise;
}
