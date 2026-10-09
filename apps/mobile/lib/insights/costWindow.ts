// The window the Running costs card covers. The running-cost endpoint takes
// week or month, so Tax year has no figure of its own: the card then shows
// this month and says "this month" plainly rather than pretending to follow.

import { MONTHS_LONG, type InsightsPeriod, type PeriodRange } from "./period";

export interface CostWindow {
  period: "week" | "month";
  /** Local start/end of the window, for the fill-ups list. */
  start: Date;
  end: Date;
  /** "this week", "last week", "this month", "September 2026". */
  label: string;
}

export function costWindowLabel(period: "week" | "month", offset: number, range: PeriodRange): string {
  if (period === "week") {
    if (offset === 0) return "this week";
    if (offset === -1) return "last week";
    return "that week";
  }
  if (offset === 0) return "this month";
  return `${MONTHS_LONG[range.start.getMonth()]} ${range.start.getFullYear()}`;
}

/** `monthRange` is the range for the current month (used when the period is Tax year). */
export function costWindow(
  period: InsightsPeriod,
  offset: number,
  range: PeriodRange,
  monthRange: PeriodRange
): { window: CostWindow; fellBackToMonth: boolean } {
  if (period === "tax_year") {
    return {
      window: { period: "month", start: monthRange.start, end: monthRange.end, label: "this month" },
      fellBackToMonth: true,
    };
  }
  return {
    window: { period, start: range.start, end: range.end, label: costWindowLabel(period, offset, range) },
    fellBackToMonth: false,
  };
}
