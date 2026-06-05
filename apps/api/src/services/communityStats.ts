// Community-wide statistics for the /leaderboard and /stats slash
// commands. Strictly anonymised — no names, no individual identifying
// numbers, privacy floor of 5 contributors before any bucket gets
// surfaced.
//
// Phase 2 of the Discord roadmap (21 May 2026).

import { prisma } from "../lib/prisma.js";

const MIN_CONTRIBUTORS = 5;

export interface LeaderboardEntry {
  position: number;
  miles: number;
}

export interface Leaderboard {
  /** Top 3 by business miles this week, anonymised. Empty array if
   *  there aren't enough drivers to meet the privacy floor. */
  entries: LeaderboardEntry[];
  totalActiveDrivers: number;
  /** ISO period start (7 days ago). */
  periodStart: string;
}

export async function getWeeklyLeaderboard(): Promise<Leaderboard> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Sum business miles per user this week.
  const grouped = await prisma.trip.groupBy({
    by: ["userId"],
    where: {
      startedAt: { gte: sevenDaysAgo },
      isPhantomTrip: false,
      classification: "business",
    },
    _sum: { distanceMiles: true },
  });

  const totalActiveDrivers = grouped.length;
  if (totalActiveDrivers < MIN_CONTRIBUTORS) {
    return {
      entries: [],
      totalActiveDrivers,
      periodStart: sevenDaysAgo.toISOString(),
    };
  }

  const sorted = grouped
    .map((g) => ({ userId: g.userId, miles: g._sum.distanceMiles ?? 0 }))
    .filter((g) => g.miles > 0)
    .sort((a, b) => b.miles - a.miles)
    .slice(0, 3);

  return {
    entries: sorted.map((g, i) => ({
      position: i + 1,
      miles: g.miles,
    })),
    totalActiveDrivers,
    periodStart: sevenDaysAgo.toISOString(),
  };
}

// ── Platform stats ────────────────────────────────────────────────

export interface PlatformStats {
  platform: string;
  contributors: number;          // Distinct drivers with at least one tagged trip
  trips: number;                  // Total trips tagged with this platform (last 30d)
  avgTripMiles: number;          // Mean distance per trip
  totalMiles: number;            // Total business miles tagged
  /** Community-level earnings per mile if we have a clear signal, in
   *  pence. Null when there isn't enough data or earnings aren't
   *  cleanly attributable to platform trips. */
  earningsPerMilePence: number | null;
}

const KNOWN_PLATFORMS: Record<string, string> = {
  uber: "Uber",
  deliveroo: "Deliveroo",
  just_eat: "Just Eat",
  amazon_flex: "Amazon Flex",
  stuart: "Stuart",
  gophr: "Gophr",
  dpd: "DPD",
  yodel: "Yodel",
  evri: "Evri",
  freelance: "Freelance",
};

export function normalisePlatformKey(query: string): string | null {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (KNOWN_PLATFORMS[q]) return q;
  // Try alias mapping
  const aliases: Record<string, string> = {
    uber: "uber",
    ubereats: "uber",
    "uber eats": "uber",
    deliveroo: "deliveroo",
    justeat: "just_eat",
    just_eat: "just_eat",
    "just eat": "just_eat",
    flex: "amazon_flex",
    amazon: "amazon_flex",
    amazonflex: "amazon_flex",
    stuart: "stuart",
    gophr: "gophr",
    dpd: "dpd",
    yodel: "yodel",
    evri: "evri",
    hermes: "evri",
    freelance: "freelance",
  };
  return aliases[q] ?? null;
}

export function platformLabel(key: string): string {
  return KNOWN_PLATFORMS[key] ?? key;
}

export async function getPlatformStats(
  platformKey: string
): Promise<PlatformStats | null> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Aggregate trips tagged with this platform in the last 30 days.
  const trips = await prisma.trip.findMany({
    where: {
      platformTag: platformKey,
      startedAt: { gte: thirtyDaysAgo },
      isPhantomTrip: false,
      classification: "business",
    },
    select: { userId: true, distanceMiles: true },
  });

  const distinctUsers = new Set(trips.map((t) => t.userId));
  if (distinctUsers.size < MIN_CONTRIBUTORS) return null;

  const totalMiles = trips.reduce((s, t) => s + t.distanceMiles, 0);
  const avgTripMiles = totalMiles / trips.length;

  // Earnings attribution: total platform earnings in the same window
  // divided by total platform miles. Imperfect (earnings dates don't
  // always match trip dates) but reasonable for a community
  // benchmark.
  const earnings = await prisma.earning.aggregate({
    where: {
      platform: platformKey,
      periodStart: { gte: thirtyDaysAgo },
      userId: { in: [...distinctUsers] },
    },
    _sum: { amountPence: true },
    _count: { id: true },
  });
  const totalEarningsPence = earnings._sum.amountPence ?? 0;
  const earningsPerMilePence =
    totalMiles > 0 && totalEarningsPence > 0 && earnings._count.id >= MIN_CONTRIBUTORS
      ? Math.round(totalEarningsPence / totalMiles)
      : null;

  return {
    platform: platformKey,
    contributors: distinctUsers.size,
    trips: trips.length,
    avgTripMiles,
    totalMiles,
    earningsPerMilePence,
  };
}
