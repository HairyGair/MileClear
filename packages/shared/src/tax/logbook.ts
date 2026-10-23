// New Zealand 90-day logbook (23 Oct 2026). The rules as IRD states them on
// "Use a logbook", read 23 Oct 2026:
// https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/claiming-vehicle-expenses/use-a-logbook
//
//   "keeping a logbook for at least 90 consecutive days"
//   The logbook records: "the start date and the vehicle's odometer reading
//   on that day", "the date, distance and reason for each business journey",
//   "the end date of the 90-day period, and the vehicle's odometer reading on
//   that day", "any other information we may require".
//   "Your calculation can be used for up to 3 years if the proportion of
//   business use doesn't change by more than 20%."
//
// And on "Claiming vehicle expenses" (same date):
// https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/claiming-vehicle-expenses
//   "If no logbook is kept ... The claim will be limited to 25% of the
//   vehicle running costs as a business expense."
//
// Pure rules only: the period, the rows and the totals. The server builds the
// PDF and CSV from these (apps/api/src/services/nzLogbook.ts); the app and the
// website use the period helpers for the picker.
import { milesToKm } from "../utils/distanceUnit.js";
import { GIG_PLATFORMS } from "../constants/index.js";
import { zonedParts } from "./zonedTime.js";

export const NZ_LOGBOOK_TIME_ZONE = "Pacific/Auckland";
/** IRD: "at least 90 consecutive days". */
export const NZ_LOGBOOK_MIN_DAYS = 90;
/** A logbook covers a test period, not years: one year at most. */
export const NZ_LOGBOOK_MAX_DAYS = 366;
/** IRD: the percentage "can be used for up to 3 years". */
export const NZ_LOGBOOK_REUSE_YEARS = 3;
/** IRD: "if the proportion of business use doesn't change by more than 20%". */
export const NZ_LOGBOOK_REUSE_CHANGE_PERCENT = 20;
/** IRD: without a logbook "the claim will be limited to 25%". */
export const NZ_NO_LOGBOOK_CAP_PERCENT = 25;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function isoFromUtcDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Calendar days from `from` to `to`, both included. */
export function logbookDayCount(from: string, to: string): number {
  return utcDay(to) - utcDay(from) + 1;
}

/** `iso` plus `days` calendar days. */
export function addLogbookDays(iso: string, days: number): string {
  return isoFromUtcDay(utcDay(iso) + days);
}

/** Today's date (YYYY-MM-DD) in New Zealand. */
export function nzToday(now: Date = new Date()): string {
  const p = zonedParts(now, NZ_LOGBOOK_TIME_ZONE);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The last 90 complete days in New Zealand: ends yesterday, starts 89 days before. */
export function defaultLogbookPeriod(now: Date = new Date()): { from: string; to: string } {
  const to = addLogbookDays(nzToday(now), -1);
  return { from: addLogbookDays(to, -(NZ_LOGBOOK_MIN_DAYS - 1)), to };
}

export type LogbookPeriodResult =
  | { ok: true; from: string; to: string; days: number }
  | { ok: false; error: string };

/**
 * Check a requested period. `to` left out: the 90 days from `from`. The period
 * must be at least 90 days (IRD), at most a year, and end no later than today
 * in New Zealand.
 */
export function resolveLogbookPeriod(
  from: string | undefined | null,
  to: string | undefined | null,
  now: Date = new Date()
): LogbookPeriodResult {
  if (!from || !isRealDate(from)) return { ok: false, error: "Pick the first day of the logbook (YYYY-MM-DD)." };
  const end = to ? to : addLogbookDays(from, NZ_LOGBOOK_MIN_DAYS - 1);
  if (!isRealDate(end)) return { ok: false, error: "The last day of the logbook doesn't look right (YYYY-MM-DD)." };
  const days = logbookDayCount(from, end);
  if (days < NZ_LOGBOOK_MIN_DAYS) {
    return {
      ok: false,
      error: `IRD asks for a logbook of at least ${NZ_LOGBOOK_MIN_DAYS} days in a row. This one is ${Math.max(days, 0)} ${days === 1 ? "day" : "days"}.`,
    };
  }
  if (days > NZ_LOGBOOK_MAX_DAYS) return { ok: false, error: "Pick a period of a year or less." };
  if (end > nzToday(now)) {
    return { ok: false, error: "The logbook can't end after today. Pick an earlier first day, or come back when the 90 days are up." };
  }
  return { ok: true, from, to: end, days };
}

export interface LogbookTripInput {
  startedAt: Date;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  classification: string;
  platformTag: string | null;
  projectLabel: string | null;
  notes: string | null;
}

export type LogbookUse = "Business" | "Private" | "Not sorted";

export interface LogbookRow {
  /** YYYY-MM-DD in New Zealand. */
  date: string;
  /** HH:MM in New Zealand. */
  time: string;
  from: string;
  to: string;
  /** km, 1 decimal place. */
  km: number;
  use: LogbookUse;
  /** The reason for the journey: platform, client and notes, as recorded. */
  reason: string;
}

function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

function platformLabel(tag: string): string {
  return GIG_PLATFORMS.find((p) => p.value === tag)?.label ?? tag;
}

export function logbookUse(classification: string): LogbookUse {
  if (classification === "business") return "Business";
  if (classification === "personal") return "Private";
  return "Not sorted";
}

export function logbookRow(t: LogbookTripInput): LogbookRow {
  const p = zonedParts(t.startedAt, NZ_LOGBOOK_TIME_ZONE);
  const pad = (n: number) => String(n).padStart(2, "0");
  const reason = [
    t.platformTag ? platformLabel(t.platformTag) : null,
    t.projectLabel?.trim() || null,
    t.notes?.trim().replace(/\s+/g, " ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    from: t.startAddress?.trim() || "",
    to: t.endAddress?.trim() || "",
    km: round1(milesToKm(t.distanceMiles)),
    use: logbookUse(t.classification),
    reason,
  };
}

export interface LogbookTotals {
  trips: number;
  totalKm: number;
  businessKm: number;
  privateKm: number;
  notSortedKm: number;
  notSortedTrips: number;
  /** Business trips with no reason recorded: IRD asks for the reason for each. */
  businessWithoutReason: number;
  /** Business km as a share of all km, 0-100, 1 decimal place. null when nothing was driven. */
  businessPercent: number | null;
}

/** Totals over the rows. Km are summed from stored miles and converted once, so rounding doesn't add up. */
export function logbookTotals(trips: LogbookTripInput[]): LogbookTotals {
  let total = 0;
  let business = 0;
  let priv = 0;
  let notSorted = 0;
  let notSortedTrips = 0;
  let businessWithoutReason = 0;
  for (const t of trips) {
    total += t.distanceMiles;
    const use = logbookUse(t.classification);
    if (use === "Business") {
      business += t.distanceMiles;
      if (!logbookRow(t).reason) businessWithoutReason++;
    } else if (use === "Private") priv += t.distanceMiles;
    else {
      notSorted += t.distanceMiles;
      notSortedTrips++;
    }
  }
  return {
    trips: trips.length,
    totalKm: round1(milesToKm(total)),
    businessKm: round1(milesToKm(business)),
    privateKm: round1(milesToKm(priv)),
    notSortedKm: round1(milesToKm(notSorted)),
    notSortedTrips,
    businessWithoutReason,
    businessPercent: total > 0 ? round1((business / total) * 100) : null,
  };
}

/** "25/12/2025" from "2025-12-25" (how New Zealand writes dates). */
export function nzDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
