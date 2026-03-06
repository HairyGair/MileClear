import { prisma } from "../lib/prisma.js";
import {
  getTaxYear,
  parseTaxYear,
  calculateHmrcDeduction,
  type BusinessInsights,
  type PlatformPerformance,
  type ShiftPerformance,
  type GoldenHour,
  type WeeklyPnL,
} from "@mileclear/shared";

// Industry standard vehicle wear cost (pence per mile) — RAC/AA average
const WEAR_COST_PENCE_PER_MILE = 8;

// ── Shift grading ─────────────────────────────────────────────────

function gradeShift(earningsPerHourPence: number, utilisationPercent: number): "A" | "B" | "C" | "D" | "F" {
  // Composite score: 70% earnings weight, 30% utilisation
  // A: excellent (>£15/hr equivalent), B: good (>£11), C: average (>£8), D: below average (>£5), F: poor
  const hourlyPounds = earningsPerHourPence / 100;
  const utilisationBonus = utilisationPercent / 100; // 0-1

  const score = hourlyPounds * 0.7 + hourlyPounds * utilisationBonus * 0.3;

  if (score >= 15) return "A";
  if (score >= 11) return "B";
  if (score >= 8) return "C";
  if (score >= 5) return "D";
  return "F";
}

// ── Get Business Insights ─────────────────────────────────────────

export async function getBusinessInsights(userId: string): Promise<BusinessInsights> {
  const now = new Date();
  const taxYear = getTaxYear(now);
  const { start: taxStart, end: taxEnd } = parseTaxYear(taxYear);

  // Fetch all data in parallel
  const [
    earnings,
    businessTrips,
    shifts,
    fuelLogs,
    vehicles,
    mileageSummary,
  ] = await Promise.all([
    // All earnings in this tax year
    prisma.earning.findMany({
      where: {
        userId,
        periodStart: { gte: taxStart },
        periodEnd: { lte: taxEnd },
      },
    }),
    // Business trips in this tax year
    prisma.trip.findMany({
      where: {
        userId,
        classification: "business",
        startedAt: { gte: taxStart, lte: taxEnd },
      },
      include: { vehicle: true },
      orderBy: { startedAt: "asc" },
    }),
    // Completed shifts in this tax year
    prisma.shift.findMany({
      where: {
        userId,
        status: "completed",
        startedAt: { gte: taxStart, lte: taxEnd },
      },
      orderBy: { startedAt: "desc" },
    }),
    // Fuel logs in this tax year
    prisma.fuelLog.findMany({
      where: {
        userId,
        loggedAt: { gte: taxStart, lte: taxEnd },
      },
      orderBy: { loggedAt: "asc" },
    }),
    // User's vehicles (for MPG)
    prisma.vehicle.findMany({
      where: { userId },
    }),
    // Mileage summary
    prisma.mileageSummary.findUnique({
      where: { userId_taxYear: { userId, taxYear } },
    }),
  ]);

  // ── Overall efficiency ──────────────────────────────────────────
  const totalEarningsPence = earnings.reduce((sum, e) => sum + e.amountPence, 0);
  const totalBusinessMiles = mileageSummary?.businessMiles ?? businessTrips.reduce((sum, t) => sum + t.distanceMiles, 0);
  const totalShiftSeconds = shifts.reduce((sum, s) => {
    if (!s.endedAt) return sum;
    return sum + (s.endedAt.getTime() - s.startedAt.getTime()) / 1000;
  }, 0);
  const totalShiftHours = totalShiftSeconds / 3600;
  const totalShiftTrips = businessTrips.filter((t) => t.shiftId).length;

  const earningsPerMilePence = totalBusinessMiles > 0
    ? Math.round(totalEarningsPence / totalBusinessMiles)
    : 0;
  const earningsPerHourPence = totalShiftHours > 0
    ? Math.round(totalEarningsPence / totalShiftHours)
    : 0;
  const avgTripsPerShift = shifts.length > 0
    ? Math.round((totalShiftTrips / shifts.length) * 10) / 10
    : 0;

  // ── Platform comparison ─────────────────────────────────────────
  const platformMap = new Map<string, { earningsPence: number; trips: number; miles: number }>();

  for (const e of earnings) {
    const key = e.platform.toLowerCase();
    const existing = platformMap.get(key) ?? { earningsPence: 0, trips: 0, miles: 0 };
    existing.earningsPence += e.amountPence;
    platformMap.set(key, existing);
  }

  // Match trips to platforms
  for (const t of businessTrips) {
    if (!t.platformTag) continue;
    const key = t.platformTag.toLowerCase();
    const existing = platformMap.get(key) ?? { earningsPence: 0, trips: 0, miles: 0 };
    existing.trips += 1;
    existing.miles += t.distanceMiles;
    platformMap.set(key, existing);
  }

  const platformPerformance: PlatformPerformance[] = [];
  for (const [platform, data] of platformMap) {
    if (data.earningsPence === 0 && data.trips === 0) continue;
    platformPerformance.push({
      platform,
      totalEarningsPence: data.earningsPence,
      tripCount: data.trips,
      totalMiles: Math.round(data.miles * 10) / 10,
      earningsPerMilePence: data.miles > 0 ? Math.round(data.earningsPence / data.miles) : 0,
      earningsPerTripPence: data.trips > 0 ? Math.round(data.earningsPence / data.trips) : 0,
      avgTripMiles: data.trips > 0 ? Math.round((data.miles / data.trips) * 10) / 10 : 0,
    });
  }

  // Sort by earnings per mile descending
  platformPerformance.sort((a, b) => b.earningsPerMilePence - a.earningsPerMilePence);

  const bestPlatform = platformPerformance.length > 0
    ? platformPerformance[0].platform
    : null;

  // ── Golden hours ────────────────────────────────────────────────
  // Aggregate earnings by day-of-week + hour
  const hourSlots = new Map<string, { totalPence: number; count: number }>();

  for (const e of earnings) {
    // Use periodStart as the earning time
    const d = new Date(e.periodStart);
    const dayOfWeek = d.toLocaleDateString("en-GB", { weekday: "long" });
    const hour = d.getHours();
    const key = `${dayOfWeek}_${hour}`;
    const existing = hourSlots.get(key) ?? { totalPence: 0, count: 0 };
    existing.totalPence += e.amountPence;
    existing.count += 1;
    hourSlots.set(key, existing);
  }

  // Also use trip start times for trip-level density
  for (const t of businessTrips) {
    const d = new Date(t.startedAt);
    const dayOfWeek = d.toLocaleDateString("en-GB", { weekday: "long" });
    const hour = d.getHours();
    const key = `${dayOfWeek}_${hour}`;
    if (!hourSlots.has(key)) {
      hourSlots.set(key, { totalPence: 0, count: 0 });
    }
  }

  const goldenHours: GoldenHour[] = [];
  for (const [key, data] of hourSlots) {
    if (data.totalPence === 0) continue;
    const [dayOfWeek, hourStr] = key.split("_");
    const hour = parseInt(hourStr, 10);
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const nextHour = (hour + 1) % 24;
    const nextPeriod = nextHour >= 12 ? "PM" : "AM";
    const nextDisplayHour = nextHour === 0 ? 12 : nextHour > 12 ? nextHour - 12 : nextHour;

    goldenHours.push({
      dayOfWeek,
      hour,
      label: `${dayOfWeek} ${displayHour}–${nextDisplayHour} ${nextPeriod}`,
      avgEarningsPence: Math.round(data.totalPence / data.count),
      tripCount: data.count,
    });
  }

  // Sort by avg earnings and take top 3
  goldenHours.sort((a, b) => b.avgEarningsPence - a.avgEarningsPence);
  const topGoldenHours = goldenHours.slice(0, 3);

  // Busiest day of week
  const dayMiles = new Map<string, number>();
  for (const t of businessTrips) {
    const day = new Date(t.startedAt).toLocaleDateString("en-GB", { weekday: "long" });
    dayMiles.set(day, (dayMiles.get(day) ?? 0) + t.distanceMiles);
  }
  let busiestDay: string | null = null;
  let busiestDayMiles = 0;
  for (const [day, miles] of dayMiles) {
    if (miles > busiestDayMiles) {
      busiestDayMiles = miles;
      busiestDay = day;
    }
  }

  // ── Fuel economy ────────────────────────────────────────────────
  let actualMpg: number | null = null;
  let fuelCostPerMilePence: number | null = null;
  let estimatedFuelCostPence: number | null = null;

  // Try to compute real MPG from consecutive odometer readings
  const logsWithOdometer = fuelLogs.filter((l) => l.odometerReading !== null && l.odometerReading > 0);
  if (logsWithOdometer.length >= 2) {
    // Sort by odometer reading
    logsWithOdometer.sort((a, b) => a.odometerReading! - b.odometerReading!);
    const first = logsWithOdometer[0];
    const last = logsWithOdometer[logsWithOdometer.length - 1];
    const milesDriven = last.odometerReading! - first.odometerReading!;
    // Sum litres between first and last (excluding first fill-up)
    const litresUsed = logsWithOdometer.slice(1).reduce((sum, l) => sum + l.litres, 0);
    if (litresUsed > 0 && milesDriven > 0) {
      // 1 gallon = 4.54609 litres
      const gallonsUsed = litresUsed / 4.54609;
      actualMpg = Math.round((milesDriven / gallonsUsed) * 10) / 10;
    }
  }

  // Cost per mile from total fuel spend
  const totalFuelCostPence = fuelLogs.reduce((sum, l) => sum + l.costPence, 0);
  const totalAllMiles = mileageSummary?.totalMiles ?? totalBusinessMiles;
  if (totalFuelCostPence > 0 && totalAllMiles > 0) {
    fuelCostPerMilePence = Math.round(totalFuelCostPence / totalAllMiles);
  }

  // Estimate total fuel cost for business miles if we have cost-per-mile
  if (fuelCostPerMilePence !== null && totalBusinessMiles > 0) {
    estimatedFuelCostPence = Math.round(fuelCostPerMilePence * totalBusinessMiles);
  } else if (actualMpg && totalBusinessMiles > 0) {
    // Fallback: estimate from MPG + average fuel price (~145p/litre)
    const primaryVehicle = vehicles.find((v) => v.isPrimary) ?? vehicles[0];
    const avgPricePerLitre = primaryVehicle?.fuelType === "diesel" ? 150 : 140; // rough pence/litre
    const gallonsNeeded = totalBusinessMiles / actualMpg;
    const litresNeeded = gallonsNeeded * 4.54609;
    estimatedFuelCostPence = Math.round(litresNeeded * avgPricePerLitre);
  }

  // ── Recent shift performance ────────────────────────────────────
  const recentShiftsRaw = shifts.slice(0, 10);
  const recentShifts: ShiftPerformance[] = [];

  for (const shift of recentShiftsRaw) {
    if (!shift.endedAt) continue;

    const shiftTrips = businessTrips.filter((t) => t.shiftId === shift.id);
    const shiftMiles = shiftTrips.reduce((sum, t) => sum + t.distanceMiles, 0);
    const shiftBusinessMiles = shiftTrips
      .filter((t) => t.classification === "business")
      .reduce((sum, t) => sum + t.distanceMiles, 0);

    const durationSeconds = Math.floor(
      (shift.endedAt.getTime() - shift.startedAt.getTime()) / 1000
    );
    const durationHours = durationSeconds / 3600;

    // Find earnings that overlap with this shift's time window
    const shiftEarnings = earnings.filter((e) => {
      const eStart = new Date(e.periodStart).getTime();
      const eEnd = new Date(e.periodEnd).getTime();
      return eStart >= shift.startedAt.getTime() - 86400000 && // 1 day buffer
             eEnd <= shift.endedAt!.getTime() + 86400000;
    });
    // If we can't match earnings to specific shifts, estimate from daily average
    let shiftEarningsPence = shiftEarnings.reduce((sum, e) => sum + e.amountPence, 0);
    if (shiftEarningsPence === 0 && totalEarningsPence > 0 && shifts.length > 0) {
      // Rough estimate: proportional by shift duration
      shiftEarningsPence = Math.round(
        totalEarningsPence * (durationHours / Math.max(totalShiftHours, 1))
      );
    }

    // Utilisation: estimate from trip count and average trip duration
    // If we have coordinates, we could compute exact moving time, but for now use trip time
    const tripTimeSeconds = shiftTrips.reduce((sum, t) => {
      if (!t.endedAt) return sum;
      return sum + (new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) / 1000;
    }, 0);
    const utilisationPercent = durationSeconds > 0
      ? Math.min(100, Math.round((tripTimeSeconds / durationSeconds) * 100))
      : 0;

    const ePerMile = shiftBusinessMiles > 0 ? Math.round(shiftEarningsPence / shiftBusinessMiles) : 0;
    const ePerHour = durationHours > 0 ? Math.round(shiftEarningsPence / durationHours) : 0;

    recentShifts.push({
      shiftId: shift.id,
      startedAt: shift.startedAt.toISOString(),
      endedAt: shift.endedAt.toISOString(),
      durationSeconds,
      tripsCompleted: shiftTrips.length,
      totalMiles: Math.round(shiftMiles * 10) / 10,
      businessMiles: Math.round(shiftBusinessMiles * 10) / 10,
      earningsPence: shiftEarningsPence,
      earningsPerMilePence: ePerMile,
      earningsPerHourPence: ePerHour,
      utilisationPercent,
      grade: gradeShift(ePerHour, utilisationPercent),
    });
  }

  // Average shift grade
  const gradeValues: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const gradeLetters = ["F", "D", "C", "B", "A"];
  let avgShiftGrade: string | null = null;
  if (recentShifts.length > 0) {
    const avgGradeNum = recentShifts.reduce((sum, s) => sum + gradeValues[s.grade], 0) / recentShifts.length;
    avgShiftGrade = gradeLetters[Math.round(avgGradeNum)] ?? "C";
  }

  // ── Week-on-week trends ─────────────────────────────────────────
  const now2 = new Date();
  const thisWeekStart = new Date(now2);
  const dow = thisWeekStart.getDay();
  thisWeekStart.setDate(thisWeekStart.getDate() - (dow === 0 ? 6 : dow - 1));
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setMilliseconds(-1);

  const thisWeekEarnings = earnings
    .filter((e) => new Date(e.periodStart) >= thisWeekStart)
    .reduce((sum, e) => sum + e.amountPence, 0);
  const lastWeekEarnings = earnings
    .filter((e) => {
      const d = new Date(e.periodStart);
      return d >= lastWeekStart && d < thisWeekStart;
    })
    .reduce((sum, e) => sum + e.amountPence, 0);

  const earningsTrendPercent = lastWeekEarnings > 0
    ? Math.round(((thisWeekEarnings - lastWeekEarnings) / lastWeekEarnings) * 100)
    : null;

  const thisWeekMiles = businessTrips
    .filter((t) => new Date(t.startedAt) >= thisWeekStart)
    .reduce((sum, t) => sum + t.distanceMiles, 0);
  const lastWeekMiles = businessTrips
    .filter((t) => {
      const d = new Date(t.startedAt);
      return d >= lastWeekStart && d < thisWeekStart;
    })
    .reduce((sum, t) => sum + t.distanceMiles, 0);

  const mileTrendPercent = lastWeekMiles > 0
    ? Math.round(((thisWeekMiles - lastWeekMiles) / lastWeekMiles) * 100)
    : null;

  return {
    totalEarningsPence,
    totalBusinessMiles,
    totalShiftHours: Math.round(totalShiftHours * 10) / 10,
    earningsPerMilePence,
    earningsPerHourPence,
    avgTripsPerShift,
    deductionPence: mileageSummary?.deductionPence ?? 0,
    platformPerformance,
    bestPlatform,
    goldenHours: topGoldenHours,
    busiestDay,
    avgShiftGrade,
    fuelCostPerMilePence,
    actualMpg,
    estimatedFuelCostPence,
    recentShifts,
    earningsTrendPercent,
    mileTrendPercent,
  };
}

// ── Weekly P&L ────────────────────────────────────────────────────

export async function getWeeklyPnL(
  userId: string,
  weeksBack: number = 0
): Promise<WeeklyPnL> {
  const now = new Date();
  const start = new Date(now);
  const dow = start.getDay();
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1) - weeksBack * 7);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const startStr = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const periodLabel = `${startStr} – ${endStr}`;

  const [earnings, trips, fuelLogs] = await Promise.all([
    prisma.earning.findMany({
      where: {
        userId,
        periodStart: { gte: start, lte: end },
      },
    }),
    prisma.trip.findMany({
      where: {
        userId,
        classification: "business",
        startedAt: { gte: start, lte: end },
      },
      include: { vehicle: true },
    }),
    prisma.fuelLog.findMany({
      where: {
        userId,
        loggedAt: { gte: start, lte: end },
      },
    }),
  ]);

  const grossEarningsPence = earnings.reduce((sum, e) => sum + e.amountPence, 0);
  const businessMiles = trips.reduce((sum, t) => sum + t.distanceMiles, 0);
  const estimatedFuelCostPence = fuelLogs.reduce((sum, l) => sum + l.costPence, 0);
  const estimatedWearCostPence = Math.round(businessMiles * WEAR_COST_PENCE_PER_MILE);

  let hmrcDeductionPence = 0;
  for (const trip of trips) {
    const vType = (trip.vehicle?.vehicleType ?? "car") as "car" | "van" | "motorbike";
    hmrcDeductionPence += calculateHmrcDeduction(vType, trip.distanceMiles);
  }

  return {
    periodLabel,
    grossEarningsPence,
    estimatedFuelCostPence,
    estimatedWearCostPence,
    netProfitPence: grossEarningsPence - estimatedFuelCostPence - estimatedWearCostPence,
    hmrcDeductionPence,
    businessMiles: Math.round(businessMiles * 10) / 10,
    totalTrips: trips.length,
  };
}
