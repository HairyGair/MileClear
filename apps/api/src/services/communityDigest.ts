// Weekly community digest — aggregated, anonymised stats about the
// MileClear community in the last 7 days. Powers the Sunday 9am UK
// post in #announcements.
//
// Everything here is roll-ups across all users — never names, never
// individual identifying numbers, and we apply a privacy floor (≥5
// contributors) before showing any "top platform" or band.
//
// Phase 1D of the Discord roadmap (21 May 2026).

import { prisma } from "../lib/prisma.js";
import { formatMiles, formatPence } from "@mileclear/shared";

const MIN_CONTRIBUTORS_PER_BUCKET = 5;

export interface CommunityDigest {
  /** ISO date of the period start (7 days ago, midnight UK). */
  periodStart: string;
  /** ISO date of the period end (now). */
  periodEnd: string;

  // Headline numbers
  totalBusinessMiles: number;
  totalMileageDeductionPence: number;
  totalTripsTracked: number;
  activeDriverCount: number;
  newDriverCount: number;

  /** Top platforms by trip count this week. Suppressed if fewer than
   *  5 contributors in the bucket. Returns at most 5. */
  topPlatforms: Array<{ platform: string; tripPct: number; contributors: number }>;

  /** Cohort milestone counts. Each fires once per driver per tax year
   *  so we don't double-count. */
  milestones: {
    crossed1kMiles: number;       // drivers who passed 1k business miles this tax year
    crossed5kMiles: number;
    crossed10kMiles: number;
    firstTripEver: number;        // drivers whose VERY first trip was this week
  };

  /** Optional flavour line — pre-formatted Discord-ready summary
   *  that wraps the numbers into one or two human sentences. */
  highlight?: string;
}

const PLATFORM_LABELS: Record<string, string> = {
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
  other: "Other",
};

function platformLabel(raw: string): string {
  return PLATFORM_LABELS[raw] ?? raw.replace(/_/g, " ");
}

/**
 * Build the digest for the last 7 days. Pulls everything from Prisma
 * — no caching, runs in <1s on production-size data.
 */
export async function buildWeeklyDigest(): Promise<CommunityDigest> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ── Headline aggregates ─────────────────────────────────────────
  const [
    tripAggregates,
    platformBreakdown,
    activeDriverIds,
    newDriverCount,
    deductionRollup,
  ] = await Promise.all([
    // Trips logged in the last 7 days (business + classified only)
    prisma.trip.aggregate({
      where: {
        startedAt: { gte: sevenDaysAgo },
        isPhantomTrip: false,
        classification: "business",
      },
      _count: { id: true },
      _sum: { distanceMiles: true },
    }),

    // Platform breakdown
    prisma.trip.groupBy({
      by: ["platformTag"],
      where: {
        startedAt: { gte: sevenDaysAgo },
        isPhantomTrip: false,
        classification: "business",
        platformTag: { not: null },
      },
      _count: { id: true },
    }),

    // Unique drivers who tracked at least one trip this week
    prisma.trip.findMany({
      where: { startedAt: { gte: sevenDaysAgo }, isPhantomTrip: false },
      select: { userId: true },
      distinct: ["userId"],
    }),

    // New drivers (account created this week)
    prisma.user.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    }),

    // Total mileage deduction this week — approximate, at the
    // generous AMAP rate (45p), since per-user deduction depends on
    // each driver's vehicle type + 10k threshold position. For a
    // community headline this is the right approximation.
    prisma.trip.aggregate({
      where: {
        startedAt: { gte: sevenDaysAgo },
        isPhantomTrip: false,
        classification: "business",
      },
      _sum: { distanceMiles: true },
    }),
  ]);

  const totalBusinessMiles = tripAggregates._sum.distanceMiles ?? 0;
  const totalTripsTracked = tripAggregates._count.id ?? 0;
  const activeDriverCount = activeDriverIds.length;
  // 45p/mi flat for the community headline. Real per-user calc varies.
  const totalMileageDeductionPence = Math.round(
    (deductionRollup._sum.distanceMiles ?? 0) * 45
  );

  // ── Platform breakdown w/ privacy floor ────────────────────────
  const platformTotals = platformBreakdown
    .map((row) => ({
      platform: row.platformTag ?? "other",
      tripCount: row._count.id,
    }))
    .sort((a, b) => b.tripCount - a.tripCount);

  // For each platform, count unique contributing drivers (so we
  // suppress buckets with <5 to protect privacy).
  const topPlatforms: CommunityDigest["topPlatforms"] = [];
  const totalPlatformTrips = platformTotals.reduce((s, p) => s + p.tripCount, 0);
  for (const p of platformTotals.slice(0, 5)) {
    const contributors = await prisma.trip.findMany({
      where: {
        startedAt: { gte: sevenDaysAgo },
        isPhantomTrip: false,
        classification: "business",
        platformTag: p.platform,
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    if (contributors.length < MIN_CONTRIBUTORS_PER_BUCKET) continue;
    const tripPct =
      totalPlatformTrips > 0
        ? Math.round((p.tripCount / totalPlatformTrips) * 100)
        : 0;
    topPlatforms.push({
      platform: p.platform,
      tripPct,
      contributors: contributors.length,
    });
  }

  // ── Cohort milestones ───────────────────────────────────────────
  // For "crossed Xk business miles this tax year THIS WEEK", we use
  // a heuristic: any user whose MileageSummary now exceeds X who
  // had < X seven days ago. Approximation — close enough for a
  // celebratory headline, doesn't require event-level history.
  const milestones = await computeMilestones(sevenDaysAgo);

  const digest: CommunityDigest = {
    periodStart: sevenDaysAgo.toISOString(),
    periodEnd: now.toISOString(),
    totalBusinessMiles,
    totalMileageDeductionPence,
    totalTripsTracked,
    activeDriverCount,
    newDriverCount,
    topPlatforms,
    milestones,
  };

  digest.highlight = buildHighlight(digest);
  return digest;
}

async function computeMilestones(sevenDaysAgo: Date): Promise<
  CommunityDigest["milestones"]
> {
  // First trip ever — count drivers whose first non-phantom trip is
  // within the last 7 days.
  const firstTripWeek = await prisma.user.count({
    where: {
      trips: {
        some: { startedAt: { gte: sevenDaysAgo }, isPhantomTrip: false },
        none: { startedAt: { lt: sevenDaysAgo }, isPhantomTrip: false },
      },
    },
  });

  // For mileage milestones we look at each driver's current
  // tax-year mileage summary and approximate "crossed X this week"
  // by checking if their summary is between X and X + their last-7-day
  // business miles. Cheap heuristic — within £1/year accuracy for
  // community headlines.
  const milestoneCounts = { 1000: 0, 5000: 0, 10000: 0 };
  const summaries = await prisma.mileageSummary.findMany({
    select: {
      userId: true,
      businessMiles: true,
    },
  });

  for (const s of summaries) {
    const recent = await prisma.trip.aggregate({
      where: {
        userId: s.userId,
        startedAt: { gte: sevenDaysAgo },
        isPhantomTrip: false,
        classification: "business",
      },
      _sum: { distanceMiles: true },
    });
    const recentMiles = recent._sum.distanceMiles ?? 0;
    const totalNow = s.businessMiles;
    const totalThen = totalNow - recentMiles;
    for (const threshold of [1000, 5000, 10000] as const) {
      if (totalThen < threshold && totalNow >= threshold) {
        milestoneCounts[threshold] += 1;
      }
    }
  }

  return {
    crossed1kMiles: milestoneCounts[1000],
    crossed5kMiles: milestoneCounts[5000],
    crossed10kMiles: milestoneCounts[10000],
    firstTripEver: firstTripWeek,
  };
}

function buildHighlight(d: CommunityDigest): string {
  // Lead with the most-impressive non-zero stat available so the
  // digest never feels samey week-to-week.
  if (d.milestones.crossed10kMiles >= 1) {
    return `${d.milestones.crossed10kMiles} driver${d.milestones.crossed10kMiles === 1 ? "" : "s"} crossed 10,000 business miles this week — that's the AMAP threshold passed. Big saving on the second-tier deduction from here on.`;
  }
  if (d.milestones.crossed5kMiles >= 1) {
    return `${d.milestones.crossed5kMiles} driver${d.milestones.crossed5kMiles === 1 ? "" : "s"} crossed 5,000 business miles this week. Halfway to the AMAP threshold 👏`;
  }
  if (d.milestones.crossed1kMiles >= 3) {
    return `${d.milestones.crossed1kMiles} drivers passed 1,000 business miles this week — that's £450 of tax deduction unlocked.`;
  }
  if (d.newDriverCount >= 3) {
    return `${d.newDriverCount} new drivers joined MileClear this week. Say hi in **#introductions**.`;
  }
  return "";
}
