// New Zealand: "Note each car's odometer for 31 March" (23 Oct 2026). IRD
// asks for each vehicle's odometer reading at every balance date (OS 19/04a
// para 21: "must record their odometer reading every balance date for each
// vehicle covered by an election"), and most sole traders' balance date is 31
// March. Shown on Home from 25 March to 15 April, New Zealand time, once a
// year: dismissing it (or tapping it) stores the year.
import { zonedParts } from "@mileclear/shared";

export const NZ_BALANCE_DATE_ASK_KEY = "nz_balance_date_ask_year";

const NZ_TIME_ZONE = "Pacific/Auckland";

/** The balance-date year whose window `now` is in (25 Mar to 15 Apr, NZ), or null. */
export function nzBalanceDateWindowYear(now: Date): number | null {
  const p = zonedParts(now, NZ_TIME_ZONE);
  const inWindow = (p.month === 3 && p.day >= 25) || (p.month === 4 && p.day <= 15);
  return inWindow ? p.year : null;
}

/** Due when it's a New Zealand driver, inside the window, and not yet dealt with this year. */
export function nzBalanceDateAskDue(args: { country: string; now: Date; doneYear: string | null }): boolean {
  if (args.country !== "NZ") return false;
  const year = nzBalanceDateWindowYear(args.now);
  return year != null && args.doneYear !== String(year);
}
