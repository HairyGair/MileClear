// Number and date formatting for the admin kit. Money is always pence.

export { formatNumber, formatPence } from "../format";

/** "12%" from a ratio of two counts; "-" when there is no denominator. */
export function formatShare(n: number, of: number): string {
  if (!of) return "-";
  return `${Math.round((n / of) * 100)}%`;
}

/** Percentage change between two periods, or null when the previous period
 *  is zero (a change from nothing has no meaningful percentage). */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/** "Mon 28 Sep" from "YYYY-MM-DD". Noon UTC so no timezone flips the day. */
export function formatDay(isoDay: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Date(`${isoDay}T12:00:00Z`).toLocaleDateString("en-GB", opts);
}

/** "Sep 2026" from "YYYY-MM". */
export function formatMonth(isoMonth: string, opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" }): string {
  return new Date(`${isoMonth}-15T12:00:00Z`).toLocaleDateString("en-GB", opts);
}

/** Local calendar day "YYYY-MM-DD" for a Date (UK admin, so local time). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
