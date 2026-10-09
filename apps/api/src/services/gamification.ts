import { prisma } from "../lib/prisma.js";
import { periodClaimPence } from "../lib/mileageRates.js";
import { fallbackVehicleTypeForUser } from "./vehicleDefaults.js";
import { isClaimableTrip } from "../lib/claimableTrips.js";
import { percentChange, toRated } from "../lib/insightsMath.js";
import { periodBounds, previousBounds, ukDayBounds, ukParts, ukWeekBounds } from "../lib/ukTime.js";
import { loadPeriodFigures, rateUserSelect } from "./periodFigures.js";
import {
  getTaxYear,
  parseTaxYear,
  formatPence,
  formatMiles,
  ACHIEVEMENT_META,
  MILESTONE_MILES,
  STREAK_THRESHOLDS,
  TRIP_COUNT_THRESHOLDS,
  SHIFT_COUNT_THRESHOLDS,
  EARNING_THRESHOLDS,
  type AchievementType,
  type GamificationStats,
  type AchievementWithMeta,
  type ShiftScorecard,
  type PeriodRecap,
  type PersonalRecords,
  detectUkRegion,
} from "@mileclear/shared";

// UK day, week and month boundaries come from lib/ukTime (real instants,
// whatever timezone the server runs in). Before 9 Oct 2026 this file kept
// "UK wall clock in the UTC fields", which put the start of every day and
// week an hour late in BST.

// ── Streak computation ──────────────────────────────────────────────

export function computeStreak(
  sortedDatesDesc: string[],
  now: Date = new Date(),
): {
  current: number;
  longest: number;
} {
  if (sortedDatesDesc.length === 0) return { current: 0, longest: 0 };

  // Deduplicate dates (already YYYY-MM-DD strings)
  const unique = [...new Set(sortedDatesDesc)];

  // Check if the streak is still active (today or yesterday, UK dates).
  // Before 9 Oct 2026 "today" was server-local midnight printed in UTC,
  // which in BST is yesterday's date, so a streak stayed "current" a day
  // after it had ended.
  const todayStr = ukParts(now).dateKey;
  const yesterdayStr = new Date(Date.parse(todayStr + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);

  let current = 0;
  let longest = 0;
  let streak = 1;

  // Walk through dates (newest first) computing streaks
  for (let i = 0; i < unique.length - 1; i++) {
    const curr = new Date(unique[i]);
    const next = new Date(unique[i + 1]);
    const diffDays = Math.round(
      (curr.getTime() - next.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 1) {
      streak++;
    } else {
      if (i === 0 || current === 0) {
        // This was the current streak window
        if (unique[0] === todayStr || unique[0] === yesterdayStr) {
          current = streak;
        }
      }
      longest = Math.max(longest, streak);
      streak = 1;
    }
  }

  // Final streak
  longest = Math.max(longest, streak);
  if (current === 0 && (unique[0] === todayStr || unique[0] === yesterdayStr)) {
    current = streak;
  }

  return { current, longest };
}

// ── Personal records via raw SQL ────────────────────────────────────

async function getPersonalRecords(userId: string): Promise<PersonalRecords> {
  // Most miles in a single day
  const dayMiles = await prisma.$queryRaw<
    { totalMiles: number; tripDate: string }[]
  >`
    SELECT CAST(SUM(distanceMiles) AS DECIMAL(12,2)) as totalMiles,
           DATE(startedAt) as tripDate
    FROM trips
    WHERE userId = ${userId} AND isPhantomTrip = false
    GROUP BY DATE(startedAt)
    ORDER BY totalMiles DESC
    LIMIT 1
  `;

  // Most trips in a single shift
  const shiftTrips = await prisma.$queryRaw<
    { tripCount: number; shiftDate: string }[]
  >`
    SELECT COUNT(*) as tripCount,
           DATE(s.startedAt) as shiftDate
    FROM trips t
    JOIN shifts s ON t.shiftId = s.id
    WHERE t.userId = ${userId} AND t.shiftId IS NOT NULL AND t.isPhantomTrip = false
    GROUP BY t.shiftId, DATE(s.startedAt)
    ORDER BY tripCount DESC
    LIMIT 1
  `;

  // Longest single trip
  const longestTrip = await prisma.$queryRaw<
    { distanceMiles: number; startedAt: string }[]
  >`
    SELECT distanceMiles, DATE(startedAt) as startedAt
    FROM trips
    WHERE userId = ${userId} AND isPhantomTrip = false
    ORDER BY distanceMiles DESC
    LIMIT 1
  `;

  // Get all distinct trip dates for streak calculation
  const tripDates = await prisma.$queryRaw<{ tripDate: string }[]>`
    SELECT DISTINCT DATE(startedAt) as tripDate
    FROM trips
    WHERE userId = ${userId} AND isPhantomTrip = false
    ORDER BY tripDate DESC
  `;

  const { longest: longestStreakDays } = computeStreak(
    tripDates.map((r) => {
      const d = r.tripDate;
      return typeof d === "string" ? d : new Date(d).toISOString().slice(0, 10);
    })
  );

  return {
    mostMilesInDay: dayMiles[0] ? Number(dayMiles[0].totalMiles) : 0,
    mostMilesInDayDate: dayMiles[0]
      ? new Date(dayMiles[0].tripDate).toISOString()
      : null,
    mostTripsInShift: shiftTrips[0] ? Number(shiftTrips[0].tripCount) : 0,
    mostTripsInShiftDate: shiftTrips[0]
      ? new Date(shiftTrips[0].shiftDate).toISOString()
      : null,
    longestSingleTrip: longestTrip[0]
      ? Number(longestTrip[0].distanceMiles)
      : 0,
    longestSingleTripDate: longestTrip[0]
      ? new Date(longestTrip[0].startedAt).toISOString()
      : null,
    longestStreakDays,
  };
}

// ── getStats ────────────────────────────────────────────────────────

export async function getStats(userId: string): Promise<GamificationStats> {
  const now = new Date();
  const taxYear = getTaxYear(now);

  // Read mileage summary for current tax year
  const summary = await prisma.mileageSummary.findUnique({
    where: { userId_taxYear: { userId, taxYear } },
  });

  // Today's miles (UK timezone)
  const { start: todayStart, end: todayEnd } = ukDayBounds(now);

  const [todayAgg, todayTrips] = await Promise.all([
    prisma.trip.aggregate({
      where: {
        userId,
        isPhantomTrip: false,
        startedAt: { gte: todayStart, lte: todayEnd },
      },
      _sum: { distanceMiles: true },
    }),
    prisma.trip.count({
      where: {
        userId,
        isPhantomTrip: false,
        startedAt: { gte: todayStart, lte: todayEnd },
      },
    }),
  ]);

  // This week's miles (Monday-based, UK timezone): the same week as
  // /gamification/recap?period=weekly.
  const { start: weekStart } = ukWeekBounds(now);

  const weekAgg = await prisma.trip.aggregate({
    where: {
      userId,
      isPhantomTrip: false,
      startedAt: { gte: weekStart, lte: todayEnd },
    },
    _sum: { distanceMiles: true },
  });

  // Counts. Includes unclassifiedTrips for the current tax year so the
  // mobile dashboard can detect "lots of trips, none business" and show
  // a review-classifications nudge.
  const taxYearRange = parseTaxYear(taxYear);
  const [totalTrips, totalShifts, unclassifiedTrips, lifetimeAgg] = await Promise.all([
    prisma.trip.count({ where: { userId, isPhantomTrip: false } }),
    prisma.shift.count({ where: { userId, status: "completed" } }),
    prisma.trip.count({
      where: {
        userId,
        isPhantomTrip: false,
        classification: "unclassified",
        startedAt: { gte: taxYearRange.start, lte: taxYearRange.end },
      },
    }),
    // Every mile ever recorded: lifetime milestones (totalMiles is this
    // tax year only and resets each April).
    prisma.trip.aggregate({ where: { userId, isPhantomTrip: false }, _sum: { distanceMiles: true } }),
  ]);

  // Streak from distinct trip dates (excluding phantoms — a walking
  // misfire shouldn't extend a driving streak).
  const tripDates = await prisma.$queryRaw<{ tripDate: string }[]>`
    SELECT DISTINCT DATE(startedAt) as tripDate
    FROM trips
    WHERE userId = ${userId} AND isPhantomTrip = false
    ORDER BY tripDate DESC
  `;

  const { current, longest } = computeStreak(
    tripDates.map((r) => {
      const d = r.tripDate;
      return typeof d === "string" ? d : new Date(d).toISOString().slice(0, 10);
    })
  );

  const personalRecords = await getPersonalRecords(userId);

  // Detect user's home region from most recent trips
  const recentTrips = await prisma.trip.findMany({
    where: { userId, isPhantomTrip: false, startLat: { not: 0 } },
    select: { startLat: true, startLng: true },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  let region: string | undefined;
  if (recentTrips.length > 0) {
    const lats = recentTrips.map((t) => t.startLat).sort((a, b) => a - b);
    const lngs = recentTrips.map((t) => t.startLng).sort((a, b) => a - b);
    const mid = Math.floor(lats.length / 2);
    region = detectUkRegion(lats[mid], lngs[mid]) ?? undefined;
  }

  // Driving patterns — day of week, time of day, top places
  const patternTrips = await prisma.trip.findMany({
    where: { userId, isPhantomTrip: false },
    select: { startedAt: true, endAddress: true },
    orderBy: { startedAt: "desc" },
    take: 500,
  });

  let drivingPatterns: import("@mileclear/shared").DrivingPatterns | undefined;
  if (patternTrips.length >= 3) {
    const dayOfWeek = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
    const timeOfDay = [0, 0, 0, 0, 0, 0]; // 4-hour blocks
    for (const t of patternTrips) {
      const d = new Date(t.startedAt);
      const dow = d.getUTCDay(); // 0=Sun
      dayOfWeek[dow === 0 ? 6 : dow - 1]++;
      const hour = d.getUTCHours();
      timeOfDay[Math.floor(hour / 4)]++;
    }

    // Average trips per week (weeks with at least one trip)
    const weekSet = new Set<string>();
    for (const t of patternTrips) {
      const d = new Date(t.startedAt);
      const yearWeek = `${d.getUTCFullYear()}-W${Math.ceil((d.getUTCDate() + new Date(d.getUTCFullYear(), d.getUTCMonth(), 1).getUTCDay()) / 7)}`;
      weekSet.add(yearWeek);
    }
    const avgTripsPerWeek = weekSet.size > 0
      ? Math.round((patternTrips.length / weekSet.size) * 10) / 10
      : 0;

    // Top visited places (by end address)
    const placeCounts: Record<string, number> = {};
    for (const t of patternTrips) {
      const addr = t.endAddress?.trim();
      if (addr && addr !== "Unknown") {
        placeCounts[addr] = (placeCounts[addr] ?? 0) + 1;
      }
    }
    const topPlaces = Object.entries(placeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    drivingPatterns = { dayOfWeek, timeOfDay, avgTripsPerWeek, topPlaces };
  }

  return {
    taxYear,
    totalMiles: summary?.totalMiles ?? 0,
    businessMiles: summary?.businessMiles ?? 0,
    deductionPence: summary?.deductionPence ?? 0,
    currentStreakDays: current,
    longestStreakDays: longest,
    totalTrips,
    totalShifts,
    todayMiles: todayAgg._sum.distanceMiles ?? 0,
    todayTrips,
    weekMiles: weekAgg._sum.distanceMiles ?? 0,
    lifetimeMiles: Math.round((lifetimeAgg._sum.distanceMiles ?? 0) * 10) / 10,
    personalRecords,
    region,
    drivingPatterns,
    unclassifiedTrips,
  };
}

// ── checkAndAwardAchievements ───────────────────────────────────────

export async function checkAndAwardAchievements(
  userId: string
): Promise<AchievementWithMeta[]> {
  // Fetch existing achievements + stats in parallel
  const [existing, totalTrips, totalShifts, totalMilesAgg, totalEarningsAgg, tripDates] =
    await Promise.all([
      prisma.achievement.findMany({
        where: { userId },
        select: { type: true },
      }),
      prisma.trip.count({ where: { userId, isPhantomTrip: false } }),
      prisma.shift.count({ where: { userId, status: "completed" } }),
      prisma.trip.aggregate({
        where: { userId, isPhantomTrip: false },
        _sum: { distanceMiles: true },
      }),
      prisma.earning.aggregate({
        where: { userId },
        _sum: { amountPence: true },
      }),
      prisma.$queryRaw<{ tripDate: string }[]>`
        SELECT DISTINCT DATE(startedAt) as tripDate
        FROM trips
        WHERE userId = ${userId} AND isPhantomTrip = false
        ORDER BY tripDate DESC
      `,
    ]);

  const existingTypes = new Set(existing.map((a) => a.type));
  const totalMiles = totalMilesAgg._sum.distanceMiles ?? 0;
  const totalEarningsPounds = (totalEarningsAgg._sum.amountPence ?? 0) / 100;
  const { longest: longestStreak } = computeStreak(
    tripDates.map((r) => {
      const d = r.tripDate;
      return typeof d === "string" ? d : new Date(d).toISOString().slice(0, 10);
    })
  );

  // Determine which achievements should be awarded
  const earned: AchievementType[] = [];

  if (totalTrips >= 1 && !existingTypes.has("first_trip")) {
    earned.push("first_trip");
  }
  if (totalShifts >= 1 && !existingTypes.has("first_shift")) {
    earned.push("first_shift");
  }

  for (const threshold of MILESTONE_MILES) {
    const type = `miles_${threshold}` as AchievementType;
    if (totalMiles >= threshold && !existingTypes.has(type)) {
      earned.push(type);
    }
  }

  for (const threshold of TRIP_COUNT_THRESHOLDS) {
    const type = `trips_${threshold}` as AchievementType;
    if (totalTrips >= threshold && !existingTypes.has(type)) {
      earned.push(type);
    }
  }

  for (const threshold of SHIFT_COUNT_THRESHOLDS) {
    const type = `shifts_${threshold}` as AchievementType;
    if (totalShifts >= threshold && !existingTypes.has(type)) {
      earned.push(type);
    }
  }

  for (const threshold of STREAK_THRESHOLDS) {
    const type = `streak_${threshold}` as AchievementType;
    if (longestStreak >= threshold && !existingTypes.has(type)) {
      earned.push(type);
    }
  }

  for (const threshold of EARNING_THRESHOLDS) {
    const type = `earned_${threshold}` as AchievementType;
    if (totalEarningsPounds >= threshold && !existingTypes.has(type)) {
      earned.push(type);
    }
  }

  if (earned.length === 0) return [];

  // Bulk create, skipDuplicates handles race conditions
  await prisma.achievement.createMany({
    data: earned.map((type) => ({ userId, type })),
    skipDuplicates: true,
  });

  // Fetch newly created to get IDs + achievedAt
  const newAchievements = await prisma.achievement.findMany({
    where: { userId, type: { in: earned } },
  });

  return newAchievements.map((a) => {
    const meta = ACHIEVEMENT_META[a.type as AchievementType];
    return {
      id: a.id,
      type: a.type,
      achievedAt: a.achievedAt.toISOString(),
      label: meta?.label ?? a.type,
      description: meta?.description ?? "",
      emoji: meta?.emoji ?? "🏆",
    };
  });
}

// ── getAchievements ─────────────────────────────────────────────────

export async function getAchievements(
  userId: string
): Promise<AchievementWithMeta[]> {
  const achievements = await prisma.achievement.findMany({
    where: { userId },
    orderBy: { achievedAt: "desc" },
  });

  return achievements.map((a) => {
    const meta = ACHIEVEMENT_META[a.type as AchievementType];
    return {
      id: a.id,
      type: a.type,
      achievedAt: a.achievedAt.toISOString(),
      label: meta?.label ?? a.type,
      description: meta?.description ?? "",
      emoji: meta?.emoji ?? "🏆",
    };
  });
}

// ── getShiftScorecard ───────────────────────────────────────────────

export async function getShiftScorecard(
  userId: string,
  shiftId?: string
): Promise<ShiftScorecard | null> {
  // If no shiftId, find the most recently completed shift
  const shift = shiftId
    ? await prisma.shift.findFirst({
        where: { id: shiftId, userId },
        include: { vehicle: true },
      })
    : await prisma.shift.findFirst({
        where: { userId, status: "completed" },
        orderBy: { endedAt: "desc" },
        include: { vehicle: true },
      });

  if (!shift) return null;

  // Get trips in this shift, and the business trips earlier in the tax
  // year (the claim's 10,000-mile threshold).
  const { start: shiftTaxStart } = parseTaxYear(getTaxYear(shift.startedAt));
  const [trips, earlierTrips, scorecardUser, scorecardFallbackType] = await Promise.all([
    prisma.trip.findMany({
      where: { shiftId: shift.id, userId, isPhantomTrip: false },
      include: { vehicle: true },
    }),
    prisma.trip.findMany({
      where: {
        userId,
        isPhantomTrip: false,
        classification: "business",
        startedAt: { gte: shiftTaxStart, lt: shift.startedAt },
        OR: [{ shiftId: null }, { shiftId: { not: shift.id } }],
      },
      select: {
        distanceMiles: true,
        classification: true,
        platformTag: true,
        startedAt: true,
        vehicle: { select: { vehicleType: true, providedByOthers: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: rateUserSelect }),
    fallbackVehicleTypeForUser(userId),
  ]);

  const tripsCompleted = trips.length;
  let totalMiles = 0;
  let businessMiles = 0;
  for (const trip of trips) {
    totalMiles += trip.distanceMiles;
    if (trip.classification === "business") {
      businessMiles += trip.distanceMiles;
    }
  }
  // The same claim rule as every other period (lib/mileageRates).
  const fallback = scorecardFallbackType as "car" | "van" | "motorbike";
  const deductionPence = periodClaimPence(
    earlierTrips.filter(isClaimableTrip).map((t) => toRated(t, fallback)),
    trips.filter(isClaimableTrip).map((t) => toRated(t, fallback)),
    scorecardUser,
  );

  // Check personal bests — most miles in a single shift, most trips in a single shift
  // Exclude current shift so we compare against previous bests only
  const shiftMilesRecord = await prisma.$queryRaw<
    { totalMiles: number }[]
  >`
    SELECT CAST(SUM(t.distanceMiles) AS DECIMAL(12,2)) as totalMiles
    FROM trips t
    WHERE t.userId = ${userId} AND t.shiftId IS NOT NULL AND t.shiftId != ${shift.id}
    GROUP BY t.shiftId
    ORDER BY totalMiles DESC
    LIMIT 1
  `;

  const shiftTripsRecord = await prisma.$queryRaw<
    { tripCount: number }[]
  >`
    SELECT COUNT(*) as tripCount
    FROM trips t
    WHERE t.userId = ${userId} AND t.shiftId IS NOT NULL AND t.shiftId != ${shift.id}
    GROUP BY t.shiftId
    ORDER BY tripCount DESC
    LIMIT 1
  `;

  const bestMiles = shiftMilesRecord[0]
    ? Number(shiftMilesRecord[0].totalMiles)
    : 0;
  const bestTrips = shiftTripsRecord[0]
    ? Number(shiftTripsRecord[0].tripCount)
    : 0;

  const isPersonalBestMiles = totalMiles > 0 && totalMiles > bestMiles;
  const isPersonalBestTrips = tripsCompleted > 0 && tripsCompleted > bestTrips;

  // Get newly awarded achievements (from the current check)
  const newAchievements = await checkAndAwardAchievements(userId);

  const durationSeconds = shift.endedAt
    ? Math.floor(
        (shift.endedAt.getTime() - shift.startedAt.getTime()) / 1000
      )
    : 0;

  return {
    shiftId: shift.id,
    startedAt: shift.startedAt.toISOString(),
    endedAt: shift.endedAt?.toISOString() ?? null,
    durationSeconds,
    tripsCompleted,
    totalMiles,
    businessMiles,
    deductionPence,
    isPersonalBestMiles,
    isPersonalBestTrips,
    newAchievements,
  };
}

// ── getPeriodRecap ──────────────────────────────────────────────────
//
// The one source for a period's miles, trips, claim and earnings on
// Insights (docs/insights-oct2026/NUMBERS.md). Boundaries are UK calendar
// days, weeks (Monday to Sunday) and months (lib/ukTime); the claim is
// lib/mileageRates periodClaimPence; phantom trips never count.

export async function getPeriodRecap(
  userId: string,
  period: "daily" | "weekly" | "monthly",
  referenceDate?: Date,
  opts: { withPrevious?: boolean } = {},
): Promise<PeriodRecap> {
  const ref = referenceDate ?? new Date();
  const bounds = periodBounds(period, ref);
  const startDay = ukParts(bounds.start);
  const endDay = ukParts(bounds.end);
  const asUtcDate = (p: { year: number; month: number; day: number }) =>
    new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });

  let label: string;
  if (period === "daily") {
    label = fmt(asUtcDate(startDay), { weekday: "long", day: "numeric", month: "long" });
  } else if (period === "weekly") {
    label = `Week of ${fmt(asUtcDate(startDay), { day: "numeric", month: "short" })} to ${fmt(asUtcDate(endDay), { day: "numeric", month: "short" })}`;
  } else {
    label = fmt(asUtcDate(startDay), { month: "long", year: "numeric" });
  }

  const [figures, previous] = await Promise.all([
    loadPeriodFigures(userId, bounds),
    opts.withPrevious ? loadPeriodFigures(userId, previousBounds(period, ref)) : Promise.resolve(null),
  ]);
  const { trips } = figures;

  let longestTripMiles = 0;
  let longestTripDate: string | null = null;
  let longestTripId: string | null = null;
  const milesByDay: Record<string, number> = {};
  for (const trip of trips) {
    if (trip.distanceMiles > longestTripMiles) {
      longestTripMiles = trip.distanceMiles;
      longestTripDate = trip.startedAt.toISOString();
      longestTripId = trip.id;
    }
    const dayKey = ukParts(trip.startedAt).dateKey;
    milesByDay[dayKey] = (milesByDay[dayKey] ?? 0) + trip.distanceMiles;
  }

  let busiestDayLabel: string | null = null;
  let busiestDayMiles = 0;
  for (const [day, miles] of Object.entries(milesByDay)) {
    if (miles > busiestDayMiles) {
      busiestDayMiles = miles;
      busiestDayLabel = new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
    }
  }

  const shareLines: string[] = [
    `📊 My ${period === "daily" ? "Daily" : period === "weekly" ? "Weekly" : "Monthly"} MileClear Recap`,
    label,
    "",
    `🚗 ${formatMiles(figures.totalMiles)} total`,
    `💼 ${formatMiles(figures.businessMiles)} business`,
    `💰 ${formatPence(figures.claimPence)} mileage claim`,
    `📍 ${figures.totalTrips} trips`,
  ];
  if (busiestDayLabel) {
    shareLines.push(`🔥 Busiest: ${busiestDayLabel} (${formatMiles(busiestDayMiles)})`);
  }
  shareLines.push("", "Track your miles with MileClear 🏁");

  const totalsOf = (f: typeof figures) => ({
    totalMiles: f.totalMiles,
    businessMiles: f.businessMiles,
    personalMiles: f.personalMiles,
    totalTrips: f.totalTrips,
    businessTrips: f.businessTrips,
    deductionPence: f.claimPence,
    earningsPence: f.earningsPence,
  });

  return {
    period,
    label,
    startsAt: bounds.start.toISOString(),
    endsAt: bounds.end.toISOString(),
    totalMiles: figures.totalMiles,
    businessMiles: figures.businessMiles,
    personalMiles: figures.personalMiles,
    deductionPence: figures.claimPence,
    totalTrips: figures.totalTrips,
    businessTrips: figures.businessTrips,
    earningsPence: figures.earningsPence,
    earningsCount: figures.earningsCount,
    busiestDayLabel,
    busiestDayMiles,
    longestTripMiles,
    longestTripDate,
    longestTripId,
    shareText: shareLines.join("\n"),
    ...(previous
      ? {
          previous: totalsOf(previous),
          change: {
            totalMilesPercent: percentChange(figures.totalMiles, previous.totalMiles),
            businessMilesPercent: percentChange(figures.businessMiles, previous.businessMiles),
            totalTripsPercent: percentChange(figures.totalTrips, previous.totalTrips),
            earningsPercent: percentChange(figures.earningsPence, previous.earningsPence),
          },
        }
      : {}),
  };
}
