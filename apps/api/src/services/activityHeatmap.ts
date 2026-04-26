import { prisma } from "../lib/prisma.js";
import {
  GIG_PLATFORMS,
  type ActivityHeatmap,
  type HeatmapCell,
  type HeatmapPlatformOption,
} from "@mileclear/shared";

const PLATFORM_LABEL = new Map<string, string>(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

/**
 * Build the dashboard activity heatmap for a user. Auth-only, free for all
 * users. Default window is the last 12 weeks - long enough to spot patterns,
 * short enough that it stays current as a driver's habits change.
 *
 * Bucketing: trips by their startedAt local hour, earnings by their
 * periodStart local hour. Both anchored to the JS Date semantics, which
 * means UTC if the API process runs in UTC. The Pixelish server runs in
 * Europe/London - same as the user base - so day-of-week / hour buckets
 * line up with what the driver actually experienced.
 */
export async function buildActivityHeatmap(
  userId: string,
  options: { weeksBack?: number; platform?: string | null } = {}
): Promise<ActivityHeatmap> {
  const weeksAnalyzed = options.weeksBack ?? 12;
  const filteredPlatform = options.platform ?? null;
  const since = new Date(Date.now() - weeksAnalyzed * 7 * 24 * 60 * 60 * 1000);

  // Pull all business trips in the window so we can compute the available
  // platform list AND build the heatmap from the same dataset. Earnings
  // come back in a parallel query.
  const [allTrips, earnings] = await Promise.all([
    prisma.trip.findMany({
      where: {
        userId,
        classification: "business",
        startedAt: { gte: since },
      },
      select: {
        startedAt: true,
        distanceMiles: true,
        platformTag: true,
      },
    }),
    prisma.earning.findMany({
      where: {
        userId,
        periodStart: { gte: since },
      },
      select: {
        periodStart: true,
        amountPence: true,
        platform: true,
      },
    }),
  ]);

  // Available platforms come from ALL trips, regardless of filter, so the
  // user can switch between them without the chip set changing.
  const platformCounts = new Map<string, number>();
  for (const t of allTrips) {
    if (!t.platformTag) continue;
    platformCounts.set(t.platformTag, (platformCounts.get(t.platformTag) ?? 0) + 1);
  }
  const availablePlatforms: HeatmapPlatformOption[] = Array.from(platformCounts.entries())
    .map(([platform, tripCount]) => ({
      platform,
      label: PLATFORM_LABEL.get(platform) ?? platform,
      tripCount,
    }))
    .sort((a, b) => b.tripCount - a.tripCount);

  // Apply the platform filter (if any) before bucketing.
  const filteredTrips = filteredPlatform
    ? allTrips.filter((t) => t.platformTag === filteredPlatform)
    : allTrips;
  const filteredEarnings = filteredPlatform
    ? earnings.filter((e) => e.platform === filteredPlatform)
    : earnings;

  // 168-cell sparse map - only emit cells with activity to keep the
  // payload small and the client render fast.
  const cellMap = new Map<string, HeatmapCell>();
  const cellKey = (dow: number, hour: number) => `${dow}_${hour}`;

  let totalTrips = 0;
  for (const t of filteredTrips) {
    const d = t.startedAt;
    const dow = d.getDay();
    const hour = d.getHours();
    const key = cellKey(dow, hour);
    const existing = cellMap.get(key) ?? {
      dayOfWeek: dow,
      hour,
      tripCount: 0,
      totalMiles: 0,
      totalEarningsPence: 0,
    };
    existing.tripCount += 1;
    existing.totalMiles += t.distanceMiles;
    cellMap.set(key, existing);
    totalTrips += 1;
  }

  let totalEarningsPence = 0;
  for (const e of filteredEarnings) {
    const d = e.periodStart;
    const dow = d.getDay();
    const hour = d.getHours();
    const key = cellKey(dow, hour);
    const existing = cellMap.get(key) ?? {
      dayOfWeek: dow,
      hour,
      tripCount: 0,
      totalMiles: 0,
      totalEarningsPence: 0,
    };
    existing.totalEarningsPence += e.amountPence;
    cellMap.set(key, existing);
    totalEarningsPence += e.amountPence;
  }

  // Round miles to 1dp for client - matches the precision elsewhere.
  const cells = Array.from(cellMap.values()).map((c) => ({
    ...c,
    totalMiles: Math.round(c.totalMiles * 10) / 10,
  }));

  return {
    weeksAnalyzed,
    filteredPlatform,
    availablePlatforms,
    totalTrips,
    totalEarningsPence,
    cells,
  };
}
