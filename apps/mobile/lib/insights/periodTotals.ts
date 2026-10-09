// Turns the server's figures into the totals the summary card shows. Pure.
//
// Week and Month: the recap (GET /gamification/recap, compare=1 for Pro) is
// the only source: miles, trips, claim, earnings, busiest day and the
// previous period all come from one response (NUMBERS.md). Work mode reads
// the business figures.
// Tax year: GET /gamification/stats for miles and the claim (the same claim
// the Tax year card shows), trip count from the trip summary.

import type { GamificationStats, PeriodRecap, PeriodRecapTotals } from "@mileclear/shared";

export interface PeriodTotals {
  miles: number;
  trips: number;
  businessMiles: number;
  /** Mileage claim in pence, or null when this source can't say. */
  claimPence: number | null;
  earningsPence: number | null;
  earningsCount: number | null;
  busiestDayLabel: string | null;
  busiestDayMiles: number;
}

export type InsightsMode = "work" | "personal";

export function totalsFromRecap(r: PeriodRecap, mode: InsightsMode): PeriodTotals {
  const work = mode === "work";
  return {
    miles: work ? r.businessMiles : r.totalMiles,
    trips: work ? (r.businessTrips ?? r.totalTrips) : r.totalTrips,
    businessMiles: r.businessMiles,
    claimPence: r.deductionPence,
    earningsPence: r.earningsPence ?? null,
    earningsCount: r.earningsCount ?? null,
    busiestDayLabel: r.busiestDayLabel,
    busiestDayMiles: r.busiestDayMiles,
  };
}

/** The period before, from the same response. Null when not asked for. */
export function previousFromRecap(r: PeriodRecap, mode: InsightsMode): PeriodTotals | null {
  const p: PeriodRecapTotals | undefined = r.previous;
  if (!p) return null;
  const work = mode === "work";
  return {
    miles: work ? p.businessMiles : p.totalMiles,
    trips: work ? p.businessTrips : p.totalTrips,
    businessMiles: p.businessMiles,
    claimPence: p.deductionPence,
    earningsPence: p.earningsPence,
    earningsCount: null,
    busiestDayLabel: null,
    busiestDayMiles: 0,
  };
}

/** This tax year: miles and claim from stats, so the Tax year card agrees. */
export function totalsFromStats(
  s: Pick<GamificationStats, "totalMiles" | "businessMiles" | "deductionPence">,
  trips: number,
  mode: InsightsMode
): PeriodTotals {
  return {
    miles: mode === "work" ? s.businessMiles : s.totalMiles,
    trips,
    businessMiles: s.businessMiles,
    claimPence: s.deductionPence,
    earningsPence: null,
    earningsCount: null,
    busiestDayLabel: null,
    busiestDayMiles: 0,
  };
}

/** A past tax year: the trip summary only; no claim to show. */
export function totalsFromTripSummary(
  s: { totalMiles: number; totalTrips: number; businessMiles: number; businessTrips: number },
  mode: InsightsMode
): PeriodTotals {
  return {
    miles: mode === "work" ? s.businessMiles : s.totalMiles,
    trips: mode === "work" ? s.businessTrips : s.totalTrips,
    businessMiles: s.businessMiles,
    claimPence: null,
    earningsPence: null,
    earningsCount: null,
    busiestDayLabel: null,
    busiestDayMiles: 0,
  };
}
