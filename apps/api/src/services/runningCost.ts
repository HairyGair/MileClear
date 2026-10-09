// The one running cost per mile (9 Oct 2026). Rules in lib/insightsMath
// runningCostPerMile. Read by /business-insights/running-cost (Overview fuel card),
// /analytics/fuel-cost (Trends) and /business-insights (Fuel Economy).

import { prisma } from "../lib/prisma.js";
import { getTaxYear, parseTaxYear, type RunningCostSummary } from "@mileclear/shared";
import { odometerMpg, round1, runningCostPerMile, type RunningCost } from "../lib/insightsMath.js";
import { ukMonthBounds, type Bounds } from "../lib/ukTime.js";

/** Tax year to date rate for a driver's primary vehicle. */
export async function taxYearRunningCost(userId: string, now: Date = new Date()): Promise<RunningCost> {
  const { start } = parseTaxYear(getTaxYear(now));
  const [fuelLogs, milesAgg, vehicles] = await Promise.all([
    prisma.fuelLog.findMany({
      where: { userId, loggedAt: { gte: start, lte: now } },
      select: { costPence: true, litres: true, odometerReading: true },
    }),
    prisma.trip.aggregate({
      where: { userId, isPhantomTrip: false, startedAt: { gte: start, lte: now } },
      _sum: { distanceMiles: true },
    }),
    prisma.vehicle.findMany({
      where: { userId },
      select: { isPrimary: true, estimatedMpg: true, actualMpg: true, fuelType: true },
    }),
  ]);
  const primary = vehicles.find((v) => v.isPrimary) ?? vehicles[0] ?? null;
  return runningCostPerMile({
    fuelSpendPence: fuelLogs.reduce((s, l) => s + l.costPence, 0),
    litres: fuelLogs.reduce((s, l) => s + l.litres, 0),
    milesDriven: milesAgg._sum.distanceMiles ?? 0,
    odometerMpg: odometerMpg(fuelLogs) ?? primary?.actualMpg ?? null,
    vehicleMpg: primary?.estimatedMpg ?? null,
    fuelType: primary?.fuelType ?? null,
  });
}

/** The rate plus a period's miles and fill-ups (default: this UK month). */
export async function getRunningCostSummary(userId: string, period?: Bounds): Promise<RunningCostSummary> {
  const b = period ?? ukMonthBounds(new Date());
  const [rate, periodMiles, periodLogs] = await Promise.all([
    taxYearRunningCost(userId),
    prisma.trip.aggregate({
      where: { userId, isPhantomTrip: false, startedAt: { gte: b.start, lte: b.end } },
      _sum: { distanceMiles: true },
    }),
    prisma.fuelLog.findMany({
      where: { userId, loggedAt: { gte: b.start, lte: b.end } },
      select: { costPence: true },
    }),
  ]);
  const miles = round1(periodMiles._sum.distanceMiles ?? 0);
  return {
    ...rate,
    period: {
      startsAt: b.start.toISOString(),
      endsAt: b.end.toISOString(),
      miles,
      estimatedCostPence: rate.pencePerMile != null ? Math.round(miles * rate.pencePerMile) : null,
      fillUps: periodLogs.length,
      fillUpSpendPence: periodLogs.reduce((s, l) => s + l.costPence, 0),
    },
  };
}
