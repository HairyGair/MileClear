import { prisma } from "../lib/prisma.js";
import {
  estimateUkTax,
  calculateHmrcDeduction,
  getTaxYear,
  parseTaxYear,
  type TaxSnapshot,
  type ReadinessItem,
  type VehicleType,
} from "@mileclear/shared";

/**
 * Build the dashboard tax snapshot for a user. Free for all users (auth only,
 * no premium gate). The point of the snapshot is to make the "this app saves
 * me money at tax time" value tangible all year, not just at year-end.
 *
 * Distinct from the premium /self-assessment/summary endpoint, which returns
 * the full Self Assessment wizard data (per-vehicle, per-platform, SA103 box
 * values, allowable expense breakdown). The snapshot is deliberately simpler:
 * earnings minus mileage deduction = profit, no expense allocation.
 */
export async function buildTaxSnapshot(userId: string): Promise<TaxSnapshot> {
  const now = new Date();
  const taxYear = getTaxYear(now);
  const { start, end } = parseTaxYear(taxYear);

  // Filing deadline is 31 January after the end of the tax year.
  // Tax year 2025-26 ends 5 April 2026, deadline 31 January 2027.
  const deadlineYear = end.getFullYear() + 1;
  const filingDeadline = new Date(Date.UTC(deadlineYear, 0, 31, 23, 59, 59));
  const daysToFilingDeadline = Math.floor(
    (filingDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Last 7 days for set-aside calculation (rolling window, not aligned to week).
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [user, vehicles, businessTrips, earningsYtd, earningsLast7d, unclassifiedCount] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true },
      }),
      prisma.vehicle.findMany({
        where: { userId },
        select: {
          id: true,
          isPrimary: true,
          vehicleType: true,
          estimatedMpg: true,
          actualMpg: true,
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      }),
      prisma.trip.findMany({
        where: {
          userId,
          classification: "business",
          startedAt: { gte: start, lte: end },
        },
        select: {
          distanceMiles: true,
          vehicle: { select: { vehicleType: true } },
        },
      }),
      prisma.earning.aggregate({
        where: {
          userId,
          periodStart: { gte: start },
          periodEnd: { lte: end },
        },
        _sum: { amountPence: true },
      }),
      prisma.earning.aggregate({
        where: {
          userId,
          periodStart: { gte: sevenDaysAgo },
        },
        _sum: { amountPence: true },
      }),
      prisma.trip.count({
        where: {
          userId,
          classification: "unclassified",
          startedAt: { gte: start, lte: end },
        },
      }),
    ]);

  // Mileage deduction: group business miles by vehicle type so the right AMAP
  // rate is applied. Trips without a linked vehicle assume car (most common).
  const milesByType = new Map<VehicleType, number>();
  for (const trip of businessTrips) {
    const type = (trip.vehicle?.vehicleType ?? "car") as VehicleType;
    milesByType.set(type, (milesByType.get(type) ?? 0) + trip.distanceMiles);
  }
  let mileageDeductionPence = 0;
  for (const [type, miles] of milesByType) {
    mileageDeductionPence += calculateHmrcDeduction(type, miles);
  }

  const grossEarningsPence = earningsYtd._sum.amountPence ?? 0;
  const earningsLast7DaysPence = earningsLast7d._sum.amountPence ?? 0;

  // Profit = earnings - mileage deduction. Snapshot is intentionally simple
  // and does NOT subtract allowable expenses (parking, tolls, etc.) - that
  // calculation lives in the premium Self Assessment wizard.
  const taxableProfitPence = Math.max(0, grossEarningsPence - mileageDeductionPence);

  const taxEstimate = estimateUkTax(taxableProfitPence);
  const estimatedTaxPence =
    taxEstimate.incomeTaxPence + taxEstimate.class2NiPence + taxEstimate.class4NiPence;

  const effectiveRatePercent =
    grossEarningsPence > 0
      ? Math.round((estimatedTaxPence / grossEarningsPence) * 10000) / 100
      : 0;

  // Set-aside recommendation: apply the YTD effective rate to last week's
  // gross. Self-corrects as the year progresses and the effective rate
  // becomes more accurate. Defaults to 25% (sensible basic-rate guess) for
  // new users with no YTD data yet.
  const rateForSetAside = effectiveRatePercent > 0 ? effectiveRatePercent : 25;
  const suggestedSetAsidePence = Math.round(
    (earningsLast7DaysPence * rateForSetAside) / 100
  );

  // Readiness checks. Three items, each contributes 33% (last gets 34%).
  // Keeping it small and meaningful - long checklists make people freeze.
  const primaryVehicle = vehicles.find((v) => v.isPrimary) ?? vehicles[0];
  const items: ReadinessItem[] = [
    {
      id: "profile-name",
      label: "Full name on profile",
      done: !!user?.fullName?.trim(),
      hint: "Self Assessment exports need your full legal name. Add it in Profile.",
    },
    {
      id: "primary-vehicle",
      label: "Primary vehicle with MPG",
      done:
        !!primaryVehicle &&
        ((primaryVehicle.actualMpg ?? 0) > 0 ||
          (primaryVehicle.estimatedMpg ?? 0) > 0),
      hint: !primaryVehicle
        ? "Add a vehicle in Profile so MileClear knows which AMAP rate to apply."
        : "Set MPG on your primary vehicle so fuel cost calculations are accurate.",
    },
    {
      id: "trips-classified",
      label: "All trips classified this tax year",
      done: unclassifiedCount === 0,
      hint:
        unclassifiedCount > 0
          ? `${unclassifiedCount} ${unclassifiedCount === 1 ? "trip needs" : "trips need"} classifying as business or personal.`
          : undefined,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const percentComplete = Math.round((doneCount / items.length) * 100);

  return {
    taxYear,
    taxYearEndDate: end.toISOString(),
    filingDeadline: filingDeadline.toISOString(),
    daysToFilingDeadline,
    ytd: {
      grossEarningsPence,
      mileageDeductionPence,
      taxableProfitPence,
      estimatedTaxPence,
      effectiveRatePercent,
    },
    setAsideThisWeek: {
      earningsLast7DaysPence,
      suggestedSetAsidePence,
      rateUsedPercent: rateForSetAside,
    },
    readiness: {
      percentComplete,
      items,
    },
  };
}
