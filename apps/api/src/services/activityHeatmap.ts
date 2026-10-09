import { prisma } from "../lib/prisma.js";
import { allocateEarningsToHours } from "../lib/insightsMath.js";
import { ukParts } from "../lib/ukTime.js";
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
 * Bucketing: trips by their startedAt hour in UK time. Earnings are dates
 * with no time (Earning.periodStart is a DATE), so they are spread over the
 * hours worked that day (lib/insightsMath allocateEarningsToHours, the same
 * as Golden Hours); earnings over several days or on days with no recorded
 * work are not put in any cell. Before 9 Oct 2026 every earning landed in
 * the midnight cell (1 AM in BST).
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
  const [allTripsRaw, earnings, shifts] = await Promise.all([
    prisma.trip.findMany({
      where: {
        userId,
        classification: "business",
        startedAt: { gte: since },
      },
      select: {
        startedAt: true,
        endedAt: true,
        distanceMiles: true,
        platformTag: true,
        isPhantomTrip: true,
      },
    }),
    prisma.earning.findMany({
      where: {
        userId,
        periodStart: { gte: since },
      },
      select: {
        periodStart: true,
        periodEnd: true,
        amountPence: true,
        platform: true,
      },
    }),
    prisma.shift.findMany({
      where: { userId, status: "completed", startedAt: { gte: since }, endedAt: { not: null } },
      select: { startedAt: true, endedAt: true },
    }),
  ]);

  const allTrips = allTripsRaw.filter((t) => !t.isPhantomTrip);

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
    const { dow, hour } = ukParts(t.startedAt);
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

  // Total keeps every earning; cells get only what can be placed in an hour.
  const totalEarningsPence = filteredEarnings.reduce((sum, e) => sum + e.amountPence, 0);
  const { slots } = allocateEarningsToHours({
    earnings: filteredEarnings,
    shifts: filteredPlatform ? [] : shifts.map((sh) => ({ start: sh.startedAt, end: sh.endedAt })),
    businessTrips: filteredTrips.map((t) => ({ start: t.startedAt, end: t.endedAt, platformTag: t.platformTag })),
  });
  for (const slot of slots) {
    const key = cellKey(slot.dow, slot.hour);
    const existing = cellMap.get(key) ?? {
      dayOfWeek: slot.dow,
      hour: slot.hour,
      tripCount: 0,
      totalMiles: 0,
      totalEarningsPence: 0,
    };
    existing.totalEarningsPence += slot.totalPence;
    cellMap.set(key, existing);
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
