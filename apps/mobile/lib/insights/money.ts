// Go deeper (Work, Pro): pay per mile and per hour, and the week's money in
// and out. Pure wording and rules; the numbers come from /business-insights
// and /business-insights/pnl (docs/insights-oct2026/NUMBERS.md).

export interface PayRates {
  totalEarningsPence: number;
  totalBusinessMiles: number;
  earningsPerMilePence: number;
  earningsPerHourPence: number;
}

export interface WeekMoney {
  grossEarningsPence: number;
  estimatedFuelCostPence: number;
  estimatedWearCostPence: number;
  netProfitPence: number;
  earningsCount?: number;
}

/** Pay per mile needs paid work and at least a mile; never a "£0.00" headline. */
export function hasPayRates(r: PayRates | null): r is PayRates {
  return !!r && r.totalEarningsPence > 0 && r.totalBusinessMiles >= 1 && r.earningsPerMilePence > 0;
}

export function payHeadline(r: PayRates, formatPence: (p: number) => string): string {
  const perMile = `${formatPence(r.earningsPerMilePence)} a mile`;
  return r.earningsPerHourPence > 0 ? `${perMile}, ${formatPence(r.earningsPerHourPence)} an hour` : perMile;
}

/** A week with nothing paid in and no costs says nothing rather than £0.00. */
export function hasWeekMoney(w: WeekMoney | null): w is WeekMoney {
  if (!w) return false;
  return w.grossEarningsPence > 0 || (w.earningsCount ?? 0) > 0;
}

export function weekMoneyHeadline(w: WeekMoney, formatPence: (p: number) => string): string {
  return `${formatPence(Math.abs(w.netProfitPence))} ${w.netProfitPence < 0 ? "short" : "left"} after costs`;
}

/** The week to ask for: only the Week view picks an older week. */
export function weeksBackFor(period: "week" | "month" | "tax_year", offset: number): number {
  return period === "week" ? Math.max(0, -offset) : 0;
}
