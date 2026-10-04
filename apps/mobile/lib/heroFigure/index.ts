// Which figure leads the Work dashboard's hero card (4 Oct 2026).
//
// The hero used to show the current tax year's deduction, always. That is
// the right number for most of the year, but it opens the year at £0 and
// stays tiny for weeks: the 4 Oct design review found a driver whose hero
// read "£2.66 building up" on top of nine other cards. A small number at the
// top of the screen reads as "this app isn't doing much for me".
//
// The rule: never lead with a deflating number when a bigger honest one is
// available, and always say which period the number covers.
//   1. Early in the tax year, or whenever this year's deduction is small,
//      lead with LAST tax year's deduction if it is worth seeing and bigger.
//      This year's running total becomes the second line.
//   2. Otherwise, if this year's deduction is small but plenty of miles are
//      tracked (usually trips not yet marked Business), lead with the miles
//      and show the deduction as the second line.
//   3. Otherwise lead with this year's deduction, as before.
//
// Both deduction figures come from the server (MileageSummary and the Self
// Assessment summary), which applies the right HMRC rate for each tax year,
// so nothing here knows a rate. Pure and unit-tested so the thresholds can
// be proven without booting the native stack.

import { parseTaxYear } from "@mileclear/shared";

/** Below £50, this year's deduction does not lead the hero on its own. */
export const SMALL_DEDUCTION_PENCE = 5000;
/** The first 90 days of a tax year (6 April to early July) count as early. */
export const EARLY_TAX_YEAR_DAYS = 90;
/** Miles lead (rule 2) only once there are at least this many this year. */
export const MIN_MILES_TO_LEAD = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface HeroYearFigure {
  /** "2026-27" */
  taxYear: string;
  deductionPence: number;
  businessMiles: number;
}

export type HeroChoice =
  | { kind: "current" }
  | { kind: "previous_year"; previous: HeroYearFigure }
  | { kind: "miles_tracked"; miles: number };

export interface HeroInputs {
  now: Date;
  current: HeroYearFigure;
  /** Every tracked mile this tax year, business or not. */
  totalMilesThisYear: number;
  /** Last tax year's figure, or null when it isn't loaded or doesn't exist. */
  previous: HeroYearFigure | null;
}

/** "2026-27" -> "2025-26". Null for anything that isn't a tax year. */
export function previousTaxYear(taxYear: string): string | null {
  const match = taxYear.match(/^(\d{4})-\d{2}$/);
  if (!match) return null;
  const start = parseInt(match[1], 10) - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** Whole days since 6 April of `taxYear` (0 on 6 April itself). */
export function daysIntoTaxYear(now: Date, taxYear: string): number {
  try {
    const { start } = parseTaxYear(taxYear);
    return Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY_MS));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** True when this year's figure alone would make a deflating hero. */
export function isCurrentYearWeak(now: Date, current: HeroYearFigure): boolean {
  return (
    current.deductionPence < SMALL_DEDUCTION_PENCE ||
    daysIntoTaxYear(now, current.taxYear) < EARLY_TAX_YEAR_DAYS
  );
}

/** Whether the dashboard should bother fetching last tax year's figure. */
export function wantsPreviousYear(now: Date, current: HeroYearFigure): boolean {
  return isCurrentYearWeak(now, current) && previousTaxYear(current.taxYear) !== null;
}

export function chooseHeroFigure({
  now,
  current,
  totalMilesThisYear,
  previous,
}: HeroInputs): HeroChoice {
  const weak = isCurrentYearWeak(now, current);

  if (
    weak &&
    previous &&
    previous.taxYear === previousTaxYear(current.taxYear) &&
    previous.deductionPence >= SMALL_DEDUCTION_PENCE &&
    previous.deductionPence > current.deductionPence
  ) {
    return { kind: "previous_year", previous };
  }

  // Only for a small deduction, not merely an early date: £400 in May is
  // worth leading with even though it is early.
  if (
    current.deductionPence > 0 &&
    current.deductionPence < SMALL_DEDUCTION_PENCE &&
    totalMilesThisYear >= MIN_MILES_TO_LEAD
  ) {
    return { kind: "miles_tracked", miles: totalMilesThisYear };
  }

  return { kind: "current" };
}

/** 4752.3 -> "4,752". Separators by hand, like formatPence, so both phone
 *  engines print the same thing. */
export function formatWholeMiles(miles: number): string {
  return String(Math.round(Math.max(0, miles))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "2025-26" -> "5 April 2026", the day that tax year ended. */
export function taxYearEndLabel(taxYear: string): string | null {
  const match = taxYear.match(/^(\d{4})-\d{2}$/);
  if (!match) return null;
  return `5 April ${parseInt(match[1], 10) + 1}`;
}
