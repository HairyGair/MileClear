import { getTaxYear } from "@mileclear/shared";

/** "2026-27" for the start year 2026. */
export function taxYearFromStart(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/** The last `count` tax years, newest first, starting with the current one. */
export function recentTaxYears(count: number, now: Date = new Date()): string[] {
  const startYear = parseInt(getTaxYear(now).split("-")[0], 10);
  return Array.from({ length: count }, (_, i) => taxYearFromStart(startYear - i));
}

/** The tax year before the current one ("2025-26" in October 2026). */
export function previousTaxYear(now: Date = new Date()): string {
  const startYear = parseInt(getTaxYear(now).split("-")[0], 10);
  return taxYearFromStart(startYear - 1);
}

/**
 * Default year for the box-by-box walkthrough and the platform-figures check:
 * the return that is due next when the Tax overview is cached, else last
 * tax year (the return a driver files in the autumn and winter).
 */
export function defaultReturnYear(
  returnTaxYear: string | null | undefined,
  now: Date = new Date(),
): string {
  return returnTaxYear && /^\d{4}-\d{2}$/.test(returnTaxYear) ? returnTaxYear : previousTaxYear(now);
}
