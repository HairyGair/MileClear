// Fleet-wide totals for the public website ("1.3 million+ miles", "800+
// drivers in the last 30 days"). Public, so it returns two whole-fleet
// numbers only, each rounded DOWN so the site can add a "+" and never
// overstate.
//
// Counting rules match services/communityMonthly.ts: phantom trips and the
// newer half of a flagged possible double-count are left out. An active
// driver is one with at least one counted trip STARTED in the last 30 days.
//
// Cached for an hour with one in-flight promise shared by concurrent
// requests; both reads are single aggregate queries.

import { prisma } from "../lib/prisma.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import type { CommunityTotals } from "@mileclear/shared";

export const COMMUNITY_TOTALS_CACHE_SECONDS = 60 * 60;
const CACHE_KEY = "community:totals:v1";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Round miles down to a figure worth quoting: 1,312,480 -> 1,300,000. */
export function roundMilesDown(miles: number): number {
  if (!Number.isFinite(miles) || miles <= 0) return 0;
  const step = miles >= 1_000_000 ? 100_000 : miles >= 10_000 ? 10_000 : 100;
  return Math.floor(miles / step) * step;
}

/** Round a driver count down to a figure worth quoting: 811 -> 800. */
export function roundDriversDown(drivers: number): number {
  if (!Number.isFinite(drivers) || drivers <= 0) return 0;
  const step = drivers >= 1000 ? 100 : drivers >= 100 ? 50 : 10;
  return Math.floor(drivers / step) * step;
}

let inflight: Promise<CommunityTotals> | null = null;

async function compute(now: Date): Promise<CommunityTotals> {
  const counted = { isPhantomTrip: false, possibleDuplicateOfId: null };
  const [miles, active] = await Promise.all([
    prisma.trip.aggregate({ where: counted, _sum: { distanceMiles: true } }),
    prisma.$queryRaw<Array<{ c: bigint | number }>>`
      SELECT /*+ MAX_EXECUTION_TIME(30000) */ COUNT(DISTINCT userId) AS c
      FROM trips
      WHERE startedAt >= ${new Date(now.getTime() - 30 * DAY_MS)}
        AND isPhantomTrip = 0
        AND possibleDuplicateOfId IS NULL
    `,
  ]);
  return {
    milesAllTime: roundMilesDown(miles._sum.distanceMiles ?? 0),
    activeDrivers30d: roundDriversDown(Number(active[0]?.c ?? 0)),
    generatedAt: now.toISOString(),
  };
}

/** The rounded fleet totals. Cached an hour. */
export async function getCommunityTotals(): Promise<CommunityTotals> {
  const cached = await cacheGet(CACHE_KEY);
  if (cached) return JSON.parse(cached) as CommunityTotals;
  if (inflight) return inflight;

  inflight = compute(new Date())
    .then(async (data) => {
      await cacheSet(CACHE_KEY, JSON.stringify(data), COMMUNITY_TOTALS_CACHE_SECONDS);
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
