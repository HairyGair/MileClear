// Profitability rollups — Phase 3 of the "Money Picture" stack
// (22 May 2026).
//
// Three views of profitability:
//   - per-platform   (Uber, Deliveroo, …)  → which gig pays best
//   - per-project    (freeform user labels) → freelance client P&L
//   - per-shift      (single shift window)  → "was that shift worth it?"
//
// All share the same arithmetic: gross earnings - allowable expenses
// dated within the window - estimated fuel cost for the business
// miles. Mileage allowance (AMAP) is NOT subtracted here - that's a
// tax-line item, not a real cost. We surface miles + AMAP-equivalent
// separately so the user can see both views.
//
// Expenses are attributed to a platform/project/shift via:
//   - explicit projectLabel match (per-project view)
//   - date-window overlap (per-shift view)
//   - all expenses count toward gross-vs-cost for the period (per-platform)
//     because most expenses (parking, phone bills) aren't actually
//     platform-tied. The per-platform view shows gross earnings minus
//     a SHARE of period expenses proportional to that platform's
//     earnings share - good-enough heuristic for v1.

import { prisma } from "../lib/prisma.js";
import { EXPENSE_CATEGORIES, type PlatformLeagueEntry } from "@mileclear/shared";
import { rankPlatforms } from "../lib/insightsMath.js";
import { dateColumnRange } from "../lib/ukTime.js";

const ALLOWABLE_EXPENSE_CATEGORIES: Set<string> = new Set(
  EXPENSE_CATEGORIES.filter((c) => c.deductibleWithMileage).map((c) => c.value)
);

export interface PnlBreakdown {
  grossEarningsPence: number;
  expensesPence: number;
  fuelPence: number;
  netPence: number;
  trips: number;
  businessMiles: number;
}

/** Old-shape row: what /platform-pnl?days= returns (app builds 90/93,
 *  Android 6 and the web dashboard read row 0 as "Best: X netted £Y"). */
export interface PlatformPnLLegacy extends PnlBreakdown {
  platform: string;
}

/** League row: what /platform-pnl?period= returns. */
export type PlatformPnL = PlatformLeagueEntry;

export interface ProjectPnL extends PnlBreakdown {
  projectLabel: string;
}

export interface ShiftPnL extends PnlBreakdown {
  shiftId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
}

interface RangeArgs {
  userId: string;
  from: Date;
  to: Date;
}

// ── Per-platform ──────────────────────────────────────────────────────

export async function getPlatformPnL(args: RangeArgs): Promise<PlatformPnL[]> {
  const { userId, from, to } = args;

  const [earnings, trips, fuelLogs, expenses] = await Promise.all([
    prisma.earning.findMany({
      // Earnings are dates: compare UK calendar dates.
      where: { userId, periodStart: dateColumnRange({ start: from, end: to }) },
      select: { platform: true, amountPence: true },
    }),
    prisma.trip.findMany({
      where: {
        userId,
        isPhantomTrip: false,
        classification: "business",
        startedAt: { gte: from, lte: to },
      },
      select: { distanceMiles: true, platformTag: true, startedAt: true, endedAt: true },
    }),
    prisma.fuelLog.findMany({
      where: { userId, loggedAt: { gte: from, lte: to } },
      select: { costPence: true },
    }),
    prisma.expense.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { amountPence: true, category: true },
    }),
  ]);
  return buildPlatformLeague(earnings, trips, fuelLogs, expenses);
}

// ── Per-platform, old shape (no `period` sent) ───────────────────────
// Kept exactly as before 9 Oct 2026 for clients already in the field:
// sorted by net £, an "untagged" row for trips with no platform, phantom
// trips included, earnings compared by instant.

export async function getPlatformPnLLegacy(args: RangeArgs): Promise<PlatformPnLLegacy[]> {
  const { userId, from, to } = args;

  const [earnings, trips, fuelLogs, expenses] = await Promise.all([
    prisma.earning.findMany({
      where: { userId, periodStart: { gte: from, lte: to } },
      select: { platform: true, amountPence: true },
    }),
    prisma.trip.findMany({
      where: {
        userId,
        classification: "business",
        startedAt: { gte: from, lte: to },
      },
      select: { distanceMiles: true, platformTag: true },
    }),
    prisma.fuelLog.findMany({
      where: { userId, loggedAt: { gte: from, lte: to } },
      select: { costPence: true },
    }),
    prisma.expense.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { amountPence: true, category: true },
    }),
  ]);
  return buildLegacyPlatformPnL(earnings, trips, fuelLogs, expenses);
}

export function buildLegacyPlatformPnL(
  earnings: { platform: string; amountPence: number }[],
  trips: { distanceMiles: number; platformTag: string | null }[],
  fuelLogs: { costPence: number }[],
  expenses: { amountPence: number; category: string }[],
): PlatformPnLLegacy[] {
  const totalEarningsPence = earnings.reduce((s, e) => s + e.amountPence, 0);
  const allowableExpensePence = expenses
    .filter((e) => ALLOWABLE_EXPENSE_CATEGORIES.has(e.category))
    .reduce((s, e) => s + e.amountPence, 0);
  const totalFuelPence = fuelLogs.reduce((s, l) => s + l.costPence, 0);

  const blank = (platform: string): PlatformPnLLegacy => ({
    platform,
    grossEarningsPence: 0,
    expensesPence: 0,
    fuelPence: 0,
    netPence: 0,
    trips: 0,
    businessMiles: 0,
  });
  const byPlatform = new Map<string, PlatformPnLLegacy>();
  for (const e of earnings) {
    const cur = byPlatform.get(e.platform) ?? blank(e.platform);
    cur.grossEarningsPence += e.amountPence;
    byPlatform.set(e.platform, cur);
  }
  for (const t of trips) {
    const platform = t.platformTag ?? "untagged";
    const cur = byPlatform.get(platform) ?? blank(platform);
    cur.trips += 1;
    cur.businessMiles += t.distanceMiles;
    byPlatform.set(platform, cur);
  }
  for (const row of byPlatform.values()) {
    const share = totalEarningsPence > 0 ? row.grossEarningsPence / totalEarningsPence : 0;
    row.expensesPence = Math.round(allowableExpensePence * share);
    row.fuelPence = Math.round(totalFuelPence * share);
    row.netPence = row.grossEarningsPence - row.expensesPence - row.fuelPence;
  }
  return Array.from(byPlatform.values()).sort((a, b) => b.netPence - a.netPence);
}

/** The one platform league (9 Oct 2026): ranked by pay per mile via
 *  lib/insightsMath rankPlatforms, the same ranking as
 *  /business-insights platformPerformance. Before, this table sorted by
 *  net £ (best: Uber) while Platform Performance sorted by £/mile (best:
 *  Deliveroo). Costs are still split by earnings share for the net column. */
export function buildPlatformLeague(
  earnings: { platform: string; amountPence: number }[],
  trips: { distanceMiles: number; platformTag: string | null; startedAt: Date; endedAt: Date | null }[],
  fuelLogs: { costPence: number }[],
  expenses: { amountPence: number; category: string }[],
): PlatformPnL[] {
  const totalEarningsPence = earnings.reduce((s, e) => s + e.amountPence, 0);
  const allowableExpensePence = expenses
    .filter((e) => ALLOWABLE_EXPENSE_CATEGORIES.has(e.category))
    .reduce((s, e) => s + e.amountPence, 0);
  const totalFuelPence = fuelLogs.reduce((s, l) => s + l.costPence, 0);

  return rankPlatforms(earnings, trips).map((r, i) => {
    const share = totalEarningsPence > 0 ? r.earningsPence / totalEarningsPence : 0;
    const expensesPence = Math.round(allowableExpensePence * share);
    const fuelPence = Math.round(totalFuelPence * share);
    return {
      platform: r.platform,
      grossEarningsPence: r.earningsPence,
      expensesPence,
      fuelPence,
      netPence: r.earningsPence - expensesPence - fuelPence,
      trips: r.trips,
      businessMiles: r.businessMiles,
      drivingHours: r.drivingHours,
      earningsPerMilePence: r.earningsPerMilePence,
      earningsPerHourPence: r.earningsPerHourPence,
      fewTrips: r.fewTrips,
      rank: i + 1,
    };
  });
}

// ── Per-project (freeform user labels) ────────────────────────────────

export async function getProjectPnL(args: RangeArgs): Promise<ProjectPnL[]> {
  const { userId, from, to } = args;

  const [earnings, trips, expenses] = await Promise.all([
    prisma.earning.findMany({
      where: {
        userId,
        periodStart: { gte: from, lte: to },
        projectLabel: { not: null },
      },
      select: { projectLabel: true, amountPence: true },
    }),
    prisma.trip.findMany({
      where: {
        userId,
        classification: "business",
        startedAt: { gte: from, lte: to },
        projectLabel: { not: null },
      },
      select: { projectLabel: true, distanceMiles: true },
    }),
    prisma.expense.findMany({
      where: {
        userId,
        date: { gte: from, lte: to },
        projectLabel: { not: null },
      },
      select: { projectLabel: true, amountPence: true, category: true },
    }),
  ]);

  const byProject = new Map<string, ProjectPnL>();
  for (const e of earnings) {
    if (!e.projectLabel) continue;
    const cur = byProject.get(e.projectLabel) ?? blankProject(e.projectLabel);
    cur.grossEarningsPence += e.amountPence;
    byProject.set(e.projectLabel, cur);
  }
  for (const t of trips) {
    if (!t.projectLabel) continue;
    const cur = byProject.get(t.projectLabel) ?? blankProject(t.projectLabel);
    cur.trips += 1;
    cur.businessMiles += t.distanceMiles;
    byProject.set(t.projectLabel, cur);
  }
  for (const ex of expenses) {
    if (!ex.projectLabel) continue;
    const cur = byProject.get(ex.projectLabel) ?? blankProject(ex.projectLabel);
    cur.expensesPence += ex.amountPence;
    byProject.set(ex.projectLabel, cur);
  }

  for (const row of byProject.values()) {
    row.netPence = row.grossEarningsPence - row.expensesPence - row.fuelPence;
  }

  return Array.from(byProject.values()).sort(
    (a, b) => b.netPence - a.netPence
  );
}

function blankProject(projectLabel: string): ProjectPnL {
  return {
    projectLabel,
    grossEarningsPence: 0,
    expensesPence: 0,
    fuelPence: 0,
    netPence: 0,
    trips: 0,
    businessMiles: 0,
  };
}

// ── Per-shift ─────────────────────────────────────────────────────────

export async function getShiftPnL(args: {
  userId: string;
  shiftId: string;
}): Promise<ShiftPnL | null> {
  const shift = await prisma.shift.findFirst({
    where: { id: args.shiftId, userId: args.userId },
    include: {
      trips: {
        where: { classification: "business" },
        select: { distanceMiles: true, startedAt: true },
      },
    },
  });
  if (!shift) return null;

  const start = shift.startedAt;
  const end = shift.endedAt ?? new Date();

  const [earnings, expenses, fuelLogs] = await Promise.all([
    prisma.earning.aggregate({
      where: {
        userId: args.userId,
        periodStart: { gte: start, lte: end },
      },
      _sum: { amountPence: true },
    }),
    prisma.expense.findMany({
      where: {
        userId: args.userId,
        date: { gte: start, lte: end },
      },
      select: { amountPence: true, category: true },
    }),
    prisma.fuelLog.aggregate({
      where: {
        userId: args.userId,
        loggedAt: { gte: start, lte: end },
      },
      _sum: { costPence: true },
    }),
  ]);

  const grossEarningsPence = earnings._sum?.amountPence ?? 0;
  const expensesPence = expenses
    .filter((e) => ALLOWABLE_EXPENSE_CATEGORIES.has(e.category))
    .reduce((s, e) => s + e.amountPence, 0);
  const fuelPence = fuelLogs._sum?.costPence ?? 0;
  const businessMiles = shift.trips.reduce((s, t) => s + t.distanceMiles, 0);

  return {
    shiftId: shift.id,
    startedAt: shift.startedAt.toISOString(),
    endedAt: shift.endedAt ? shift.endedAt.toISOString() : null,
    durationSeconds: Math.round((end.getTime() - start.getTime()) / 1000),
    grossEarningsPence,
    expensesPence,
    fuelPence,
    netPence: grossEarningsPence - expensesPence - fuelPence,
    trips: shift.trips.length,
    businessMiles,
  };
}
