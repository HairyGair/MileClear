// Loads the rows for one Insights period and hands them to the shared
// calculations in lib/insightsMath. Recaps, the weekly report, Weekly P&L
// and the business insights week-on-week trend all read through here, so
// the same week has the same miles, trips, claim and earnings everywhere.

import { prisma } from "../lib/prisma.js";
import { parseTaxYear, getTaxYear } from "@mileclear/shared";
import { summarisePeriod, type PeriodTotals } from "../lib/insightsMath.js";
import { dateColumnRange, ukParts, type Bounds } from "../lib/ukTime.js";
import { fallbackVehicleTypeForUser } from "./vehicleDefaults.js";

const tripSelect = {
  id: true,
  distanceMiles: true,
  classification: true,
  platformTag: true,
  startedAt: true,
  endedAt: true,
  isPhantomTrip: true,
  vehicle: { select: { vehicleType: true, providedByOthers: true } },
} as const;

export const rateUserSelect = {
  workType: true,
  employerMileageRatePence: true,
  employerMileageRatePenceAfter10k: true,
} as const;

export async function loadPeriodTrips(userId: string, b: Bounds) {
  return prisma.trip.findMany({
    where: { userId, isPhantomTrip: false, startedAt: { gte: b.start, lte: b.end } },
    select: tripSelect,
    orderBy: { startedAt: "asc" },
  });
}

export type LoadedPeriodTrip = Awaited<ReturnType<typeof loadPeriodTrips>>[number];

/** Earnings dated inside the period (UK calendar dates). */
export async function loadPeriodEarnings(userId: string, b: Bounds) {
  return prisma.earning.findMany({
    where: { userId, periodStart: dateColumnRange(b) },
    select: { platform: true, amountPence: true, periodStart: true, periodEnd: true },
  });
}

/** Business trips earlier in the tax year the period starts in (the
 *  claim's 10,000-mile threshold). A period spanning 6 April only needs the
 *  earlier year's trips for its days before 6 April, which are in `trips`. */
async function loadEarlierThisTaxYear(userId: string, b: Bounds) {
  const { start: taxStart } = parseTaxYear(getTaxYear(b.start));
  if (taxStart.getTime() >= b.start.getTime()) return [];
  return prisma.trip.findMany({
    where: {
      userId,
      isPhantomTrip: false,
      classification: "business",
      startedAt: { gte: taxStart, lt: b.start },
    },
    select: tripSelect,
  });
}

export interface PeriodFigures extends PeriodTotals {
  trips: LoadedPeriodTrip[];
  earnings: Awaited<ReturnType<typeof loadPeriodEarnings>>;
}

export async function loadPeriodFigures(userId: string, b: Bounds): Promise<PeriodFigures> {
  const [trips, earnings, earlier, user, fallbackType] = await Promise.all([
    loadPeriodTrips(userId, b),
    loadPeriodEarnings(userId, b),
    loadEarlierThisTaxYear(userId, b),
    prisma.user.findUnique({ where: { id: userId }, select: rateUserSelect }),
    fallbackVehicleTypeForUser(userId),
  ]);
  const totals = summarisePeriod({
    trips,
    earlierThisTaxYear: earlier,
    earnings,
    user,
    fallbackType: fallbackType as "car" | "van" | "motorbike",
  });
  return { ...totals, trips, earnings };
}

/** "5 Oct to 11 Oct" from bounds, UK dates. */
export function boundsLabel(b: Bounds): string {
  const fmt = (d: Date) => {
    const p = ukParts(d);
    return new Date(Date.UTC(p.year, p.month - 1, p.day)).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  };
  return `${fmt(b.start)} to ${fmt(b.end)}`;
}
