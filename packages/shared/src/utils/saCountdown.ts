// "Ready for 31 January?" Self Assessment countdown: the date maths shared by
// the API (checklist endpoint + reminder pushes), the app (when to show the
// dashboard card) and the web dashboard.
//
// The 31 January deadline is always for the tax year that ended the April
// before it: 31 January 2027 is the online filing deadline for 2025-26
// (6 April 2025 to 5 April 2026). Whatever the date today, the return a
// driver is working towards is the tax year before the current one.
//
// Every date here is read as a UK calendar date, so a phone abroad or a
// server on UTC agrees with a driver in Sunderland about what "today" is.

import { getTaxYear, parseTaxYear } from "./index.js";

export const SA_COUNTDOWN_TZ = "Europe/London";

/**
 * The countdown season, inclusive, as UK calendar months (1 = January).
 * 1 December to 31 January. This is the ONE place the window is set: the
 * API's `inSeason` flag, the reminder job and the app card all read it.
 */
export const SA_COUNTDOWN_SEASON = {
  startMonth: 12,
  startDay: 1,
  endMonth: 1,
  endDay: 31,
} as const;

export interface UkDateParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  /** 0-23 */
  hour: number;
}

/**
 * UK calendar date and hour for an instant. Falls back to the device's own
 * clock if the runtime has no time zone data (some JS engines ship without
 * it); for a UK driver that is the same answer.
 */
export function ukDateParts(now: Date, tz: string = SA_COUNTDOWN_TZ): UkDateParts {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: tz,
    }).formatToParts(now);
    const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "", 10);
    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = get("hour") % 24;
    if ([year, month, day, hour].every((n) => Number.isFinite(n))) {
      return { year, month, day, hour };
    }
  } catch {
    // fall through to the local clock
  }
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
  };
}

/** A Date at local noon on the given UK calendar day. Only its y/m/d are
 *  read (getTaxYear works on calendar components), so noon keeps it clear
 *  of any midnight edge. */
function calendarDate(p: Pick<UkDateParts, "year" | "month" | "day">): Date {
  return new Date(p.year, p.month - 1, p.day, 12, 0, 0, 0);
}

/** "2025-26" -> "2024-25". */
export function previousTaxYear(taxYear: string): string {
  const start = parseInt(taxYear.slice(0, 4), 10) - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/**
 * The tax year a driver's next 31 January deadline is for: the one that
 * ended the April before. 2 October 2026, 15 January 2027 and 5 April 2027
 * all give "2025-26"; from 6 April 2027 it moves on to "2026-27".
 */
export function saReturnTaxYear(now: Date): string {
  return previousTaxYear(getTaxYear(calendarDate(ukDateParts(now))));
}

/** 31 January after the tax year ends. 2025-26 -> 31 January 2027. */
export function saFilingDeadlineParts(taxYear: string): { year: number; month: 1; day: 31 } {
  const { end } = parseTaxYear(taxYear);
  return { year: end.getFullYear() + 1, month: 1, day: 31 };
}

/** The deadline as an instant: 23:59:59 UTC on 31 January. In January the
 *  UK is on GMT, so this is one second before midnight UK time too. */
export function saFilingDeadline(taxYear: string): Date {
  const d = saFilingDeadlineParts(taxYear);
  return new Date(Date.UTC(d.year, d.month - 1, d.day, 23, 59, 59));
}

/**
 * Whole UK calendar days from today to 31 January. 0 on the day itself,
 * 1 on 30 January, negative once it has passed.
 */
export function daysUntilSaDeadline(now: Date, taxYear: string = saReturnTaxYear(now)): number {
  const today = ukDateParts(now);
  const d = saFilingDeadlineParts(taxYear);
  const a = Date.UTC(today.year, today.month - 1, today.day);
  const b = Date.UTC(d.year, d.month - 1, d.day);
  return Math.round((b - a) / 86_400_000);
}

/** True from 1 December to 31 January inclusive (UK dates). */
export function isSaCountdownSeason(now: Date): boolean {
  const { month, day } = ukDateParts(now);
  const s = SA_COUNTDOWN_SEASON;
  if (month === s.startMonth) return day >= s.startDay;
  if (month === s.endMonth) return day <= s.endDay;
  return false;
}

/** "6 April 2025 to 5 April 2026" for a tax year string. */
export function taxYearRangeLabel(taxYear: string): string {
  const start = parseInt(taxYear.slice(0, 4), 10);
  return `6 April ${start} to 5 April ${start + 1}`;
}
