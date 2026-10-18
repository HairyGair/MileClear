// The first-week payoff on Home (18 Oct 2026). Of the drivers who recorded and
// then stopped, 60% stopped in their first week, and 31% of them never sorted
// a single trip (6% of those who stayed). So a new driver with a few trips and
// nothing sorted sees what those trips add up to, on the Last trip card, right
// above the Business / Personal choice for their newest (unsorted) trip.
//
// It is an ask in lib/home/ask.ts ("first_week"), so it stands down while the
// status line is red and nothing else asks while it shows. It goes for good
// after the first sort (either way) or once the account is 14 days old.
//
// The money uses the same rule as the "trips to sort" email: car rates for the
// current tax year (55p a mile from 6 Apr 2026), or the driver's employer rate.
// Personal mode and company-car drivers see miles only, and Personal mode is
// not asked to sort.
//
// Pure and unit-tested.

import { calculateMileageDeduction, getTaxYear, resolveMileageRates } from "@mileclear/shared";
import type { HomePersona } from "./persona";

export const FIRST_WEEK_MIN_TRIPS = 3;
export const FIRST_WEEK_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FirstWeekInputs {
  persona: HomePersona;
  /** The account's creation date (ISO), from the profile. */
  createdAt: string | null | undefined;
  now: number;
  /** From this phone's trips table. Null while it hasn't been read. */
  local: { trips: number; miles: number; sorted: number } | null;
  /** This phone has seen the driver sort a trip before (it never comes back). */
  doneBefore: boolean;
  /** The driver's employer rate, when they have one. */
  rates: {
    workType: string | null | undefined;
    employerMileageRatePence: number | null | undefined;
    employerMileageRatePenceAfter10k: number | null | undefined;
  };
}

export interface FirstWeekView {
  /** "Your first 3 trips: 24 miles." */
  title: string;
  /** "If they were for work, that's up to £13 you can claim." or null (miles only). */
  value: string | null;
  /** Read out in one go. */
  a11y: string;
  /** Work mode: it takes the one ask slot. Personal mode gets the miles as a
   *  plain note on the card and no sort ask, so other asks carry on. */
  isAsk: boolean;
}

/** Whole miles, with thousands separators, never "0" for a short trip. */
function wholeMiles(miles: number): string {
  const n = miles > 0 && miles < 1 ? 1 : Math.round(Math.max(0, miles));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Whole pounds, rounded down ("up to" must never overstate). */
function wholePounds(pence: number): string {
  return `£${String(Math.floor(pence / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** What the trips would be worth as a mileage claim, in pence. */
export function firstWeekClaimPence(miles: number, rates: FirstWeekInputs["rates"], now: number): number {
  return calculateMileageDeduction("car", Math.max(0, miles), {
    ...resolveMileageRates({
      workType: rates.workType ?? "gig",
      employerMileageRatePence: rates.employerMileageRatePence ?? null,
      employerMileageRatePenceAfter10k: rates.employerMileageRatePenceAfter10k ?? null,
    }),
    taxYear: getTaxYear(new Date(now)),
  }).deductionPence;
}

/** True while the first-week card should show (before the persona's copy is chosen). */
export function firstWeekEligible(i: FirstWeekInputs): boolean {
  if (i.doneBefore || !i.local) return false;
  if (i.local.sorted > 0 || i.local.trips < FIRST_WEEK_MIN_TRIPS) return false;
  const created = i.createdAt ? Date.parse(i.createdAt) : NaN;
  if (!Number.isFinite(created)) return false;
  return i.now - created < FIRST_WEEK_DAYS * DAY_MS;
}

export function selectFirstWeek(i: FirstWeekInputs): FirstWeekView | null {
  if (!firstWeekEligible(i)) return null;
  const { trips, miles } = i.local!;
  const title = `Your first ${trips} trips: ${wholeMiles(miles)} miles.`;
  const money = i.persona === "gig" || i.persona === "both" || i.persona === "employee";
  let value: string | null = null;
  if (money) {
    const pence = firstWeekClaimPence(miles, i.rates, i.now);
    // Under £1 is not worth a sentence (the email uses the same floor).
    if (pence >= 100) value = `If they were for work, that's up to ${wholePounds(pence)} you can claim.`;
  }
  return { title, value, a11y: value ? `${title} ${value}` : title, isAsk: i.persona !== "personal" };
}
