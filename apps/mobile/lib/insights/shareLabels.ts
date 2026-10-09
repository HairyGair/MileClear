// Words for the share picture, so the heading names the period actually
// shown (not today's month or year). Pure.

import {
  dayMonth,
  MONTHS_LONG,
  taxYearName,
  taxYearStartYear,
  type InsightsPeriod,
  type PeriodRange,
} from "./period";

/** "Week of 5 Oct 2026", "September 2026", "Tax year 2026-27". */
export function shareHeading(period: InsightsPeriod, offset: number, range: PeriodRange, now: Date = new Date()): string {
  if (period === "week") return `Week of ${dayMonth(range.start)} ${range.start.getFullYear()}`;
  if (period === "month") return `${MONTHS_LONG[range.start.getMonth()]} ${range.start.getFullYear()}`;
  return `Tax year ${taxYearName(taxYearStartYear(now) + offset)}`;
}

/** The line under the picture: "miles in the week of 5 Oct 2026". */
export function sharePeriodTotalLabel(period: InsightsPeriod, offset: number, range: PeriodRange, now: Date = new Date()): string {
  if (period === "week") return `miles in the week of ${dayMonth(range.start)} ${range.start.getFullYear()}`;
  if (period === "month") return `miles in ${shareHeading(period, offset, range, now)}`;
  return `miles in tax year ${taxYearName(taxYearStartYear(now) + offset)}`;
}
