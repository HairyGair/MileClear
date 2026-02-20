import { prisma } from "../lib/prisma.js";
import {
  getTaxYear,
  calculateHmrcDeduction,
  formatPence,
  formatMiles,
  ACHIEVEMENT_META,
  MILESTONE_MILES,
  STREAK_THRESHOLDS,
  TRIP_COUNT_THRESHOLDS,
  type AchievementType,
  type GamificationStats,
  type AchievementWithMeta,
  type ShiftScorecard,
  type PeriodRecap,
  type PersonalRecords,
} from "@mileclear/shared";

// ── Streak computation ──────────────────────────────────────────────

function computeStreak(sortedDatesDesc: string[]): {
  current: number;
  longest: number;
} {
  if (sortedDatesDesc.length === 0) return { current: 0, longest: 0 };

  // Deduplicate dates (already YYYY-MM-DD strings)
  const unique = [...new Set(sortedDatesDesc)];

  // Check if the streak is still active (today or yesterday)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

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
    WHERE userId = ${userId}
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
    WHERE t.userId = ${userId} AND t.shiftId IS NOT NULL
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
    WHERE userId = ${userId}
    ORDER BY distanceMiles DESC
    LIMIT 1
  `;

  // Get all distinct trip dates for streak calculation
  const tripDates = await prisma.$queryRaw<{ tripDate: string }[]>`
    SELECT DISTINCT DATE(startedAt) as tripDate
    FROM trips
    WHERE userId = ${userId}
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

  // Today's miles
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayAgg = await prisma.trip.aggregate({
    where: {
      userId,
      startedAt: { gte: todayStart, lte: todayEnd },
    },
    _sum: { distanceMiles: true },
  });

  // This week's miles (Monday-based)
  const weekStart = new Date();
  const dayOfWeek = weekStart.getDay();
  const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - diffToMon);
  weekStart.setHours(0, 0, 0, 0);

  const weekAgg = await prisma.trip.aggregate({
    where: {
      userId,
      startedAt: { gte: weekStart, lte: todayEnd },
    },
    _sum: { distanceMiles: true },
  });

  // Counts
  const [totalTrips, totalShifts] = await Promise.all([
    prisma.trip.count({ where: { userId } }),
    prisma.shift.count({ where: { userId, status: "completed" } }),
  ]);

  // Streak from distinct trip dates
  const tripDates = await prisma.$queryRaw<{ tripDate: string }[]>`
    SELECT DISTINCT DATE(startedAt) as tripDate
    FROM trips
    WHERE userId = ${userId}
    ORDER BY tripDate DESC
  `;

  const { current, longest } = computeStreak(
    tripDates.map((r) => {
      const d = r.tripDate;
      return typeof d === "string" ? d : new Date(d).toISOString().slice(0, 10);
    })
  );

  const personalRecords = await getPersonalRecords(userId);

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
    weekMiles: weekAgg._sum.distanceMiles ?? 0,
    personalRecords,
  };
}

// ── checkAndAwardAchievements ───────────────────────────────────────

export async function checkAndAwardAchievements(
  userId: string
): Promise<AchievementWithMeta[]> {
  // Fetch existing achievements + stats in parallel
  const [existing, totalTrips, totalShifts, totalMilesAgg, tripDates] =
    await Promise.all([
      prisma.achievement.findMany({
        where: { userId },
        select: { type: true },
      }),
      prisma.trip.count({ where: { userId } }),
      prisma.shift.count({ where: { userId, status: "completed" } }),
      prisma.trip.aggregate({
        where: { userId },
        _sum: { distanceMiles: true },
      }),
      prisma.$queryRaw<{ tripDate: string }[]>`
        SELECT DISTINCT DATE(startedAt) as tripDate
        FROM trips
        WHERE userId = ${userId}
        ORDER BY tripDate DESC
      `,
    ]);

  const existingTypes = new Set(existing.map((a) => a.type));
  const totalMiles = totalMilesAgg._sum.distanceMiles ?? 0;
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

  for (const threshold of STREAK_THRESHOLDS) {
    const type = `streak_${threshold}` as AchievementType;
    if (longestStreak >= threshold && !existingTypes.has(type)) {
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

  // Get trips in this shift
  const trips = await prisma.trip.findMany({
    where: { shiftId: shift.id, userId },
    include: { vehicle: true },
  });

  const tripsCompleted = trips.length;
  let totalMiles = 0;
  let businessMiles = 0;
  let deductionPence = 0;

  for (const trip of trips) {
    totalMiles += trip.distanceMiles;
    if (trip.classification === "business") {
      businessMiles += trip.distanceMiles;
      const vType = (trip.vehicle?.vehicleType ?? "car") as
        | "car"
        | "van"
        | "motorbike";
      deductionPence += calculateHmrcDeduction(vType, trip.distanceMiles);
    }
  }

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

export async function getPeriodRecap(
  userId: string,
  period: "weekly" | "monthly",
  referenceDate?: Date
): Promise<PeriodRecap> {
  const ref = referenceDate ?? new Date();
  let start: Date;
  let end: Date;
  let label: string;

  if (period === "weekly") {
    // Monday-based week
    const dayOfWeek = ref.getDay();
    const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    start = new Date(ref);
    start.setDate(start.getDate() - diffToMon);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const startStr = start.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    const endStr = end.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    label = `Week of ${startStr} – ${endStr}`;
  } else {
    start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
    label = ref.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }

  const trips = await prisma.trip.findMany({
    where: {
      userId,
      startedAt: { gte: start, lte: end },
    },
    include: { vehicle: true },
    orderBy: { startedAt: "asc" },
  });

  let totalMiles = 0;
  let businessMiles = 0;
  let deductionPence = 0;
  let longestTripMiles = 0;
  let longestTripDate: string | null = null;

  // Group by day for busiest day
  const milesByDay: Record<string, number> = {};

  for (const trip of trips) {
    totalMiles += trip.distanceMiles;
    if (trip.classification === "business") {
      businessMiles += trip.distanceMiles;
      const vType = (trip.vehicle?.vehicleType ?? "car") as
        | "car"
        | "van"
        | "motorbike";
      deductionPence += calculateHmrcDeduction(vType, trip.distanceMiles);
    }

    if (trip.distanceMiles > longestTripMiles) {
      longestTripMiles = trip.distanceMiles;
      longestTripDate = trip.startedAt.toISOString();
    }

    const dayKey = trip.startedAt.toISOString().slice(0, 10);
    milesByDay[dayKey] = (milesByDay[dayKey] ?? 0) + trip.distanceMiles;
  }

  // Find busiest day
  let busiestDayLabel: string | null = null;
  let busiestDayMiles = 0;
  for (const [day, miles] of Object.entries(milesByDay)) {
    if (miles > busiestDayMiles) {
      busiestDayMiles = miles;
      busiestDayLabel = new Date(day).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
    }
  }

  // Generate share text
  const shareLines: string[] = [
    `📊 My ${period === "weekly" ? "Weekly" : "Monthly"} MileClear Recap`,
    label,
    "",
    `🚗 ${formatMiles(totalMiles)} total`,
    `💼 ${formatMiles(businessMiles)} business`,
    `💰 ${formatPence(deductionPence)} tax deduction`,
    `📍 ${trips.length} trips`,
  ];
  if (busiestDayLabel) {
    shareLines.push(`🔥 Busiest: ${busiestDayLabel} (${formatMiles(busiestDayMiles)})`);
  }
  shareLines.push("", "Track your miles with MileClear 🏁");

  return {
    period,
    label,
    totalMiles,
    businessMiles,
    deductionPence,
    totalTrips: trips.length,
    busiestDayLabel,
    busiestDayMiles,
    longestTripMiles,
    longestTripDate,
    shareText: shareLines.join("\n"),
  };
}
