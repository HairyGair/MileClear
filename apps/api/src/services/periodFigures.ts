// Loads the rows for Insights periods and hands them to the shared
// calculations in lib/insightsMath. Recaps, the weekly report, Weekly P&L
// and the business insights week-on-week trend all read through here, so
// the same week has the same miles, trips, claim and earnings everywhere.
//
// Load (9 Oct 2026 review): the claim's 10,000-mile threshold needs the
// business miles driven earlier in the tax year. That is ONE grouped
// aggregate (sum of miles by vehicle and platform tag), never the trip
// rows, and a request that needs several consecutive periods (this week
// and last week) runs it once, before the earliest period, and adds the
// earlier periods' own trips for the later ones.

import { prisma } from "../lib/prisma.js";
import { parseTaxYear, getTaxYear } from "@mileclear/shared";
import { claimableWhere, isClaimableTrip } from "../lib/claimableTrips.js";
import type { DatedRatedTrip } from "../lib/mileageRates.js";
import { ratedFromGroups, summarisePeriod, toRated, type PeriodTotals } from "../lib/insightsMath.js";
import { dateColumnRange, ukParts, type Bounds } from "../lib/ukTime.js";
import { fallbackVehicleTypeFromList } from "./vehicleDefaults.js";

type VehicleType = "car" | "van" | "motorbike";

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

/** Claimable business miles from 6 April of `before`'s tax year up to
 *  `before`, as one grouped aggregate (no trip rows). */
export async function loadEarlierClaimable(
  userId: string,
  before: Date,
  vehicleTypeById: Map<string, string>,
  fallbackType: VehicleType,
): Promise<DatedRatedTrip[]> {
  const { start: taxStart } = parseTaxYear(getTaxYear(before));
  if (taxStart.getTime() >= before.getTime()) return [];
  const groups = await prisma.trip.groupBy({
    by: ["vehicleId", "platformTag"],
    where: claimableWhere({
      userId,
      isPhantomTrip: false,
      classification: "business",
      startedAt: { gte: taxStart, lt: before },
    }),
    _sum: { distanceMiles: true },
  });
  return ratedFromGroups(groups, vehicleTypeById, fallbackType, taxStart);
}

/** The driver's rate settings and vehicle types: once per request. */
export async function loadRateContext(userId: string) {
  const [user, vehicles] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: rateUserSelect }),
    prisma.vehicle.findMany({ where: { userId }, select: { id: true, vehicleType: true, isPrimary: true } }),
  ]);
  return {
    user,
    vehicleTypeById: new Map(vehicles.map((v) => [v.id, v.vehicleType])),
    fallbackType: fallbackVehicleTypeFromList(vehicles) as VehicleType,
  };
}

export interface PeriodFigures extends PeriodTotals {
  trips: LoadedPeriodTrip[];
  earnings: Awaited<ReturnType<typeof loadPeriodEarnings>>;
}

/** Figures for consecutive periods, oldest first (e.g. last week, this
 *  week). One earlier-miles aggregate for the whole series. */
export async function loadPeriodFiguresSeries(userId: string, periods: Bounds[]): Promise<PeriodFigures[]> {
  if (periods.length === 0) return [];
  const sorted = [...periods].sort((a, b) => a.start.getTime() - b.start.getTime());
  const ctx = await loadRateContext(userId);
  const [base, ...perPeriod] = await Promise.all([
    loadEarlierClaimable(userId, sorted[0].start, ctx.vehicleTypeById, ctx.fallbackType),
    ...sorted.map((b) => Promise.all([loadPeriodTrips(userId, b), loadPeriodEarnings(userId, b)])),
  ]);
  const earlier: DatedRatedTrip[] = [...(base as DatedRatedTrip[])];
  const out = new Map<Bounds, PeriodFigures>();
  sorted.forEach((b, i) => {
    const [trips, earnings] = perPeriod[i] as [LoadedPeriodTrip[], PeriodFigures["earnings"]];
    const totals = summarisePeriod({ trips, earlier, earnings, user: ctx.user, fallbackType: ctx.fallbackType });
    out.set(b, { ...totals, trips, earnings });
    // Later periods count this one's business trips as earlier miles.
    for (const t of trips) {
      if (!t.isPhantomTrip && isClaimableTrip(t)) earlier.push(toRated(t, ctx.fallbackType));
    }
  });
  return periods.map((b) => out.get(b)!);
}

export async function loadPeriodFigures(userId: string, b: Bounds): Promise<PeriodFigures> {
  const [f] = await loadPeriodFiguresSeries(userId, [b]);
  return f;
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
