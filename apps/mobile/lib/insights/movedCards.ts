// Which of the cards moved off Home (Oct 2026 redesign) show on Insights.
// The conditions are the ones Home used, so nobody gains or loses a card by
// the move. Pure.

import type { InsightsPeriod } from "./period";

/**
 * "How you compare" (UK benchmarks, free): Work mode, a driver who has
 * business mileage (Home hid it for everyone else), after the first-week
 * trips rule. Company drivers never had business mileage of their own.
 */
export function showHowYouCompare(p: {
  isWork: boolean;
  isCompanyDriver: boolean;
  /** insightsVisibility().showDriversNearYou: 10 trips or more. */
  enoughTrips: boolean;
  deductionPence: number | null | undefined;
}): boolean {
  return p.isWork && !p.isCompanyDriver && p.enoughTrips && (p.deductionPence ?? 0) > 0;
}

/**
 * Weekly earnings goal (pounds, Work gig): only for a gig or both driver
 * who is not a company driver, and only on this week, because the goal is
 * about the week in progress.
 */
export function showWeeklyEarningsGoal(p: {
  isWork: boolean;
  isGig: boolean;
  isCompanyDriver: boolean;
  period: InsightsPeriod;
  offset: number;
  enoughTrips: boolean;
}): boolean {
  return p.isWork && p.isGig && !p.isCompanyDriver && p.period === "week" && p.offset === 0 && p.enoughTrips;
}

/** Work type "gig" or "both" (unset counts as gig, as Insights does). */
export function isGigWorkType(workType: string | null | undefined): boolean {
  const t = workType ?? "gig";
  return t === "gig" || t === "both";
}
