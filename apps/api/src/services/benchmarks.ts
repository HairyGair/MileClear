import { prisma } from "../lib/prisma.js";
import {
  GIG_PLATFORMS,
  type BenchmarkSnapshot,
  type BenchmarkComparison,
  type PlatformBenchmark,
} from "@mileclear/shared";

// Privacy floor: never emit a benchmark cell with fewer than this many
// contributors. Standard practice for ICO-compliant aggregation.
const MIN_CONTRIBUTORS = 5;

const WINDOW_DAYS = 30;

const PLATFORM_LABEL = new Map<string, string>(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function rankPercentile(sorted: number[], value: number): number {
  // Percentile of `value` within `sorted` (ascending). 0-100.
  if (sorted.length === 0) return 0;
  let below = 0;
  for (const v of sorted) {
    if (v < value) below += 1;
  }
  return Math.round((below / sorted.length) * 100);
}

function buildComparison(
  values: number[],
  yourValue: number | null,
  unit: BenchmarkComparison["unit"]
): BenchmarkComparison {
  const contributors = values.length;
  if (contributors < MIN_CONTRIBUTORS) {
    return {
      available: false,
      contributors,
      yourValue,
      median: 0,
      p25: 0,
      p75: 0,
      yourPercentile: null,
      unit,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    available: true,
    contributors,
    yourValue,
    median: Math.round(median(sorted) * 10) / 10,
    p25: Math.round(percentile(sorted, 25) * 10) / 10,
    p75: Math.round(percentile(sorted, 75) * 10) / 10,
    yourPercentile: yourValue !== null ? rankPercentile(sorted, yourValue) : null,
    unit,
  };
}

/**
 * Build the anonymous benchmarking snapshot for the requesting user.
 *
 * Aggregates the last 30 days of business trips across ALL active UK
 * drivers, never exposes individual data, and applies a 5-contributor
 * minimum to every cell. Designed so cells light up automatically as the
 * user base grows - no code change required.
 */
export async function buildBenchmarkSnapshot(
  userId: string
): Promise<BenchmarkSnapshot> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const weeksInWindow = WINDOW_DAYS / 7;

  // Pull all business trips in the window. We aggregate in Node rather than
  // SQL because we need percentile distributions, not just aggregates.
  // At 50 active drivers × ~22 trips each = ~1,100 rows. Fine in-process.
  const trips = await prisma.trip.findMany({
    where: {
      classification: "business",
      startedAt: { gte: since },
    },
    select: {
      userId: true,
      distanceMiles: true,
      platformTag: true,
    },
  });

  // ── National: weekly miles and weekly trips per active driver ──
  const milesByUser = new Map<string, number>();
  const tripsByUser = new Map<string, number>();
  for (const t of trips) {
    milesByUser.set(t.userId, (milesByUser.get(t.userId) ?? 0) + t.distanceMiles);
    tripsByUser.set(t.userId, (tripsByUser.get(t.userId) ?? 0) + 1);
  }

  // Convert to weekly averages so the metric is intuitive ("miles per week"
  // not "miles per 30 days").
  const weeklyMilesValues = Array.from(milesByUser.values()).map(
    (m) => m / weeksInWindow
  );
  const weeklyTripsValues = Array.from(tripsByUser.values()).map(
    (n) => n / weeksInWindow
  );

  const yourMiles = milesByUser.get(userId) ?? null;
  const yourTrips = tripsByUser.get(userId) ?? null;

  const totalActiveDrivers = milesByUser.size;

  const nationalMiles = buildComparison(
    weeklyMilesValues,
    yourMiles !== null ? yourMiles / weeksInWindow : null,
    "miles"
  );
  const nationalTrips = buildComparison(
    weeklyTripsValues,
    yourTrips !== null ? yourTrips / weeksInWindow : null,
    "trips"
  );

  // ── Per-platform: same metrics filtered by platformTag ──
  const platforms: PlatformBenchmark[] = [];
  const platformsTouched = new Set<string>();
  for (const t of trips) {
    if (t.platformTag) platformsTouched.add(t.platformTag);
  }

  for (const platform of platformsTouched) {
    const pMiles = new Map<string, number>();
    const pTrips = new Map<string, number>();
    for (const t of trips) {
      if (t.platformTag !== platform) continue;
      pMiles.set(t.userId, (pMiles.get(t.userId) ?? 0) + t.distanceMiles);
      pTrips.set(t.userId, (pTrips.get(t.userId) ?? 0) + 1);
    }
    const pWeeklyMiles = Array.from(pMiles.values()).map((m) => m / weeksInWindow);
    const pWeeklyTrips = Array.from(pTrips.values()).map((n) => n / weeksInWindow);

    // Skip platforms below the privacy floor entirely - don't even surface them.
    if (pWeeklyMiles.length < MIN_CONTRIBUTORS) continue;

    const yourPMiles = pMiles.get(userId) ?? null;
    const yourPTrips = pTrips.get(userId) ?? null;

    platforms.push({
      platform,
      label: PLATFORM_LABEL.get(platform) ?? platform,
      miles: buildComparison(
        pWeeklyMiles,
        yourPMiles !== null ? yourPMiles / weeksInWindow : null,
        "miles"
      ),
      trips: buildComparison(
        pWeeklyTrips,
        yourPTrips !== null ? yourPTrips / weeksInWindow : null,
        "trips"
      ),
    });
  }

  // Sort platforms by contributor count desc - most-populated first.
  platforms.sort((a, b) => b.miles.contributors - a.miles.contributors);

  // Build the limited-data note if the national bucket is too small. Per-
  // platform suppression is silent (cells just don't appear).
  let limitedDataNote: string | null = null;
  if (!nationalMiles.available) {
    limitedDataNote =
      "Benchmarks unlock once 5 or more drivers have been active in the last 30 days. We're nearly there.";
  }

  return {
    windowDays: WINDOW_DAYS,
    totalActiveDrivers,
    national: {
      weeklyMiles: nationalMiles,
      weeklyTrips: nationalTrips,
    },
    platforms,
    limitedDataNote,
  };
}
