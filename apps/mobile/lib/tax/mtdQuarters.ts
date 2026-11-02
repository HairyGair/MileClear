// Small shared helper for the quarterly update screens. The hub branch has the
// same exported helper under the same name; keep the two identical so they
// merge into one.

/**
 * The tax year ("2026-27") an update period belongs to, from the day it starts.
 *
 * A period that starts on or after 1 April belongs to the tax year starting
 * that April. No old-year quarter starts between 1 and 5 April, so a calendar
 * quarter (1 April to 30 June) is in the new year, not the one before.
 * Anything starting January to March belongs to the year that began the April
 * before. Returns "" when the date can't be read.
 */
export function taxYearOfPeriodStart(periodStartIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(periodStartIso);
  let year: number;
  let month: number;
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
  } else {
    const d = new Date(periodStartIso);
    if (Number.isNaN(d.getTime())) return "";
    year = d.getFullYear();
    month = d.getMonth() + 1;
  }
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
