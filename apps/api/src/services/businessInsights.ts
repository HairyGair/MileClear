import { prisma } from "../lib/prisma.js";
import {
  allocateEarningsToHours,
  legacyFuelFields,
  goldenHoursFromSlots,
  percentChange,
  rankPlatforms,
} from "../lib/insightsMath.js";
import { WEEKDAY_NAMES, ukParts, ukWeekBounds } from "../lib/ukTime.js";
import { boundsLabel, loadPeriodFigures, loadPeriodFiguresSeries } from "./periodFigures.js";
import { taxYearRunningCost } from "./runningCost.js";
import {
  getTaxYear,
  parseTaxYear,
  type BusinessInsights,
  type PlatformPerformance,
  type ShiftPerformance,
  type GoldenHour,
  type WeeklyPnL,
} from "@mileclear/shared";

// Industry standard vehicle wear cost (pence per mile) — RAC/AA average
const WEAR_COST_PENCE_PER_MILE = 8;

// Minimum duration (seconds) for a completed shift to count toward time-based
// metrics. Anything shorter is an accidental start/stop tap, not a real shift.
const MIN_SHIFT_SECONDS = 120;

// Minimum total tracked shift time (hours) in the period before we'll report an
// earnings-per-hour rate. Earnings are logged across the whole period (e.g.
// freelance invoices) but shift hours only count tracked driving — dividing a
// year of earnings by a few seconds of tracked time produced absurd rates
// (an 11-second shift turned £460/yr into £153,632/hr). Below this floor the
// sample is too small to mean anything, so we suppress the rate (return 0).
const MIN_SHIFT_HOURS_FOR_RATE = 1;

// ── Shift grading ─────────────────────────────────────────────────

function gradeShift(
  earningsPerHourPence: number,
  utilisationPercent: number,
  costPerMilePence: number,
  milesPerHour: number
): "A" | "B" | "C" | "D" | "F" {
  // Net earnings: deduct estimated costs (fuel + wear) from gross
  const grossHourlyPounds = earningsPerHourPence / 100;
  const costPerHourPounds = (costPerMilePence * milesPerHour) / 100;
  const netHourlyPounds = Math.max(0, grossHourlyPounds - costPerHourPounds);

  // Composite score: 70% net earnings, 30% active time bonus (0-15 scale)
  const utilisationFactor = utilisationPercent / 100; // 0-1
  const activeTimeBonus = utilisationFactor * 15; // max 15 points for 100% active

  const score = netHourlyPounds * 0.7 + activeTimeBonus * 0.3;

  // A: excellent (>12 net), B: good (>9), C: average (>6), D: below average (>3), F: poor
  if (score >= 12) return "A";
  if (score >= 9) return "B";
  if (score >= 6) return "C";
  if (score >= 3) return "D";
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
        isPhantomTrip: false,
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
    // (Fuel logs and vehicles: read by services/runningCost.)
    // Mileage summary
    prisma.mileageSummary.findUnique({
      where: { userId_taxYear: { userId, taxYear } },
    }),
  ]);

  // ── Overall efficiency ──────────────────────────────────────────
  const totalEarningsPence = earnings.reduce((sum, e) => sum + e.amountPence, 0);
  const totalBusinessMiles = mileageSummary?.businessMiles ?? businessTrips.reduce((sum, t) => sum + t.distanceMiles, 0);

  // Only genuine shifts feed time-based metrics — exclude accidental sub-minute
  // start/stop taps so they can't become a near-zero denominator.
  const qualifyingShifts = shifts.filter(
    (s) => s.endedAt && (s.endedAt.getTime() - s.startedAt.getTime()) / 1000 >= MIN_SHIFT_SECONDS
  );
  const qualifyingShiftIds = new Set(qualifyingShifts.map((s) => s.id));
  const totalShiftSeconds = qualifyingShifts.reduce(
    (sum, s) => sum + (s.endedAt!.getTime() - s.startedAt.getTime()) / 1000,
    0
  );
  const totalShiftHours = totalShiftSeconds / 3600;
  const totalShiftTrips = businessTrips.filter((t) => t.shiftId && qualifyingShiftIds.has(t.shiftId)).length;

  const earningsPerMilePence = totalBusinessMiles > 0
    ? Math.round(totalEarningsPence / totalBusinessMiles)
    : 0;
  const earningsPerHourPence = totalShiftHours >= MIN_SHIFT_HOURS_FOR_RATE
    ? Math.round(totalEarningsPence / totalShiftHours)
    : 0;
  const avgTripsPerShift = qualifyingShifts.length > 0
    ? Math.round((totalShiftTrips / qualifyingShifts.length) * 10) / 10
    : 0;

  // ── Platform comparison ─────────────────────────────────────────
  // The one league (lib/insightsMath rankPlatforms), by pay per mile; the
  // same function feeds /business-insights/platform-pnl.
  const league = rankPlatforms(earnings, businessTrips);
  const platformPerformance: PlatformPerformance[] = league.map((r) => ({
    platform: r.platform,
    totalEarningsPence: r.earningsPence,
    tripCount: r.trips,
    totalMiles: r.businessMiles,
    earningsPerMilePence: r.earningsPerMilePence ?? 0,
    earningsPerTripPence: r.trips > 0 ? Math.round(r.earningsPence / r.trips) : 0,
    avgTripMiles: r.trips > 0 ? Math.round((r.businessMiles / r.trips) * 10) / 10 : 0,
  }));
  const bestPlatform = league.length > 0 && league[0].earningsPerMilePence != null ? league[0].platform : null;

  // ── Golden hours ────────────────────────────────────────────────
  // Earnings are dates with no time. A one-day earning is spread over the
  // hours worked that day (shifts, else that platform's trips, else all
  // business trips); earnings over several days or on days with no
  // recorded work are left out. Before 9 Oct 2026 every earning counted at
  // midnight, so "Sunday 1-2 AM" topped the list.
  const { slots } = allocateEarningsToHours({
    earnings,
    shifts: qualifyingShifts.map((sh) => ({ start: sh.startedAt, end: sh.endedAt })),
    businessTrips: businessTrips.map((t) => ({ start: t.startedAt, end: t.endedAt, platformTag: t.platformTag })),
  });
  const topGoldenHours: GoldenHour[] = goldenHoursFromSlots(slots, 3);

  // Busiest day of week (UK time)
  const dayMiles = new Map<string, number>();
  for (const t of businessTrips) {
    const day = WEEKDAY_NAMES[ukParts(t.startedAt).dow];
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
  // One running cost per mile (services/runningCost): the same figure as
  // the Overview fuel card and Trends.
  // fuelCostPerMilePence keeps its old meaning for apps in the field:
  // from real fill-up figures, else null. The estimate is a new field.
  const runningCost = await taxYearRunningCost(userId, now);
  const fuelFields = legacyFuelFields(runningCost);
  const fuelCostPerMilePence = fuelFields.fuelCostPerMilePence;
  const actualMpg = runningCost.mpgSource === "odometer" ? runningCost.mpg : null;
  const estimatedFuelCostPence =
    runningCost.pencePerMile != null && totalBusinessMiles > 0
      ? Math.round(runningCost.pencePerMile * totalBusinessMiles)
      : null;

  // ── Recent shift performance ────────────────────────────────────
  const recentShiftsRaw = qualifyingShifts.slice(0, 10);
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

    // Active time: time spent on trips (start to end) as a percentage of total shift time.
    // This includes dead miles between orders and brief stops (traffic, loading).
    // It's a rough measure of how much of the shift was spent on deliveries vs. idle.
    const tripTimeSeconds = shiftTrips.reduce((sum, t) => {
      if (!t.endedAt) return sum;
      return sum + (new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) / 1000;
    }, 0);
    const utilisationPercent = durationSeconds > 0
      ? Math.min(100, Math.round((tripTimeSeconds / durationSeconds) * 100))
      : 0;

    const ePerMile = shiftBusinessMiles > 0 ? Math.round(shiftEarningsPence / shiftBusinessMiles) : 0;
    const ePerHour = durationHours > 0 ? Math.round(shiftEarningsPence / durationHours) : 0;
    const milesPerHour = durationHours > 0 ? shiftMiles / durationHours : 0;

    // Estimated cost per mile: fuel + wear
    const shiftCostPerMile = (fuelCostPerMilePence ?? 0) + WEAR_COST_PENCE_PER_MILE;

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
      grade: gradeShift(ePerHour, utilisationPercent, shiftCostPerMile, milesPerHour),
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
  // Same weeks and totals as /gamification/recap?period=weekly&compare=1
  // (services/periodFigures). The redesigned Insights shows only the
  // recap's comparison; these stay for older app versions.
  const [lastWeek, thisWeek] = await loadPeriodFiguresSeries(userId, [ukWeekBounds(now, 1), ukWeekBounds(now)]);
  const earningsTrendPercent = percentChange(thisWeek.earningsPence, lastWeek.earningsPence);
  const mileTrendPercent = percentChange(thisWeek.businessMiles, lastWeek.businessMiles);

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
    estimatedFuelCostPerMilePence: fuelFields.estimatedFuelCostPerMilePence,
    fuelCostSource: fuelFields.fuelCostSource,
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
  // The same week, miles, earnings and claim as
  // /gamification/recap?period=weekly (services/periodFigures).
  const week = ukWeekBounds(new Date(), weeksBack);
  const [figures, fuelLogs] = await Promise.all([
    loadPeriodFigures(userId, week),
    prisma.fuelLog.findMany({
      where: { userId, loggedAt: { gte: week.start, lte: week.end } },
      select: { costPence: true },
    }),
  ]);

  const grossEarningsPence = figures.earningsPence;
  const businessMiles = figures.businessMiles;
  const estimatedFuelCostPence = fuelLogs.reduce((sum, l) => sum + l.costPence, 0);
  const estimatedWearCostPence = Math.round(businessMiles * WEAR_COST_PENCE_PER_MILE);

  return {
    periodLabel: boundsLabel(week),
    grossEarningsPence,
    estimatedFuelCostPence,
    estimatedWearCostPence,
    netProfitPence: grossEarningsPence - estimatedFuelCostPence - estimatedWearCostPence,
    // Weekly P&L is a self-employment figure, so its mileage line is the
    // approved rates on every claimable business trip ("mileage on your tax
    // return"), not the claim rule Home/Insights/recap use (10 Oct 2026,
    // Tax tab SPEC section 7). hmrcDeductionPence stays for builds in the
    // field; taxReturnMileagePence is the same value under its new name.
    hmrcDeductionPence: figures.returnMileagePence,
    taxReturnMileagePence: figures.returnMileagePence,
    businessMiles,
    totalTrips: figures.businessTrips,
    earningsCount: figures.earningsCount,
  };
}
