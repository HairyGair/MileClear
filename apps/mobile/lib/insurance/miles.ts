// Insurance miles (Nov 2026, a driver's idea): a yearly mileage limit, like the
// one every UK driver declares to their insurer, with how far through it they
// are, whether they are ahead of or behind an even pace, and the miles a day
// left to stay under it.
//
// Pure and unit-tested. The setting lives on this phone (./store.ts); the miles
// come from the server's trip summary for the insurance year, every trip
// whatever it was marked as (insurance counts all driving).

export interface InsuranceMilesSetting {
  /** The yearly limit, in miles. */
  limitMiles: number;
  /** The day the insurance year starts, "YYYY-MM-DD". Only the day and month
   *  matter after the first year: the year renews on that date every year. */
  startDate: string;
  /** One car's miles only; null counts every car. */
  vehicleId: string | null;
}

export const MAX_LIMIT_MILES = 200_000;

/** "10,000", " 8000 " -> 10000. Blank, zero, negative, decimals or silly numbers are not a limit. */
export function parseLimitInput(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n > 0 && n <= MAX_LIMIT_MILES ? n : null;
}

/** Stored text to a setting; anything unreadable is "not set". */
export function parseSetting(raw: string | null | undefined): InsuranceMilesSetting | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<InsuranceMilesSetting>;
    if (typeof v.limitMiles !== "number" || !(v.limitMiles > 0) || v.limitMiles > MAX_LIMIT_MILES) return null;
    if (typeof v.startDate !== "string" || !parseDay(v.startDate)) return null;
    return {
      limitMiles: Math.round(v.limitMiles),
      startDate: v.startDate,
      vehicleId: typeof v.vehicleId === "string" && v.vehicleId ? v.vehicleId : null,
    };
  } catch {
    return null;
  }
}

function parseDay(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

/** A Date's local calendar day as "YYYY-MM-DD". */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local midnight of the anniversary in a given year. 29 Feb falls back to 28 Feb. */
function anniversary(year: number, month: number, day: number): Date {
  const last = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, last));
}

const DAY_MS = 86_400_000;

/** Whole calendar days from a to b (local), DST-proof. */
function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

export interface InsurancePeriod {
  /** Local midnight the current insurance year began. */
  start: Date;
  /** Local midnight it renews (the next year's start). */
  renews: Date;
  /** Days in this insurance year (365 or 366). */
  days: number;
  /** Days so far, counting today: 1 on the first day. */
  dayNumber: number;
}

/**
 * The insurance year that contains `now`: from the most recent anniversary of
 * the start date (on or before today) to the next one. A start date in the
 * future means the driver's current year began a year before it.
 */
export function insurancePeriod(startDate: string, now: Date): InsurancePeriod | null {
  const p = parseDay(startDate);
  if (!p) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = anniversary(today.getFullYear(), p.m, p.d);
  if (start > today) start = anniversary(today.getFullYear() - 1, p.m, p.d);
  const renews = anniversary(start.getFullYear() + 1, p.m, p.d);
  return { start, renews, days: daysBetween(start, renews), dayNumber: daysBetween(start, today) + 1 };
}

export interface InsuranceProgress {
  usedMiles: number;
  limitMiles: number;
  /** used / limit, 0..1 for the bar (capped at 1). */
  fraction: number;
  /** Miles an even pace allows by the end of today. */
  paceMiles: number;
  /** pace minus used: positive is under pace (miles in hand), negative is over. */
  aheadMiles: number;
  /** Miles a day left to stay under the limit, today included. Null once over. */
  perDayLeft: number | null;
  overLimit: boolean;
  daysLeft: number;
}

export function insuranceProgress(limitMiles: number, usedMiles: number, period: InsurancePeriod): InsuranceProgress {
  const used = Math.max(0, usedMiles);
  const paceMiles = (limitMiles * period.dayNumber) / period.days;
  // Today is still to drive, so it counts as a day left.
  const daysLeft = Math.max(1, period.days - period.dayNumber + 1);
  const overLimit = used > limitMiles;
  return {
    usedMiles: used,
    limitMiles,
    fraction: Math.min(1, used / limitMiles),
    paceMiles,
    aheadMiles: paceMiles - used,
    perDayLeft: overLimit ? null : (limitMiles - used) / daysLeft,
    overLimit,
    daysLeft,
  };
}

const whole = (n: number) => Math.round(n).toLocaleString("en-GB");

/** "4,210 of 10,000 miles" */
export function figureText(pr: InsuranceProgress): string {
  return `${whole(pr.usedMiles)} of ${whole(pr.limitMiles)} miles`;
}

/** The line under the bar: ahead or behind pace, then the daily allowance. */
export function paceLine(pr: InsuranceProgress): string {
  if (pr.overLimit) return `${whole(pr.usedMiles - pr.limitMiles)} miles over your limit`;
  const ahead = Math.round(pr.aheadMiles);
  const pace =
    ahead === 0 ? "Right on pace" : ahead > 0 ? `${whole(ahead)} miles under pace` : `${whole(-ahead)} miles over pace`;
  const perDay = pr.perDayLeft ?? 0;
  const day = perDay >= 10 ? whole(perDay) : (Math.round(perDay * 10) / 10).toLocaleString("en-GB");
  return `${pace} · ${day} miles a day left`;
}

/** A policy set up ahead of time: the start date is after today. Its year has
 *  not begun, so nothing is counted yet (last year's miles belong to the old
 *  policy). Returns the start as a local Date, or null when it has begun. */
export function startsLater(startDate: string, now: Date): Date | null {
  const p = parseDay(startDate);
  if (!p) return null;
  const start = new Date(p.y, p.m - 1, p.d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start > today ? start : null;
}

/** "Starts 1 Dec 2026" */
export function startsText(start: Date): string {
  return `Starts ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

/** "Renews 1 Nov 2027" */
export function renewsText(period: InsurancePeriod): string {
  return `Renews ${period.renews.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Over the limit, or over pace by more than a day's allowance: the bar turns amber. */
export function isBehind(pr: InsuranceProgress, period: InsurancePeriod): boolean {
  return pr.overLimit || -pr.aheadMiles > pr.limitMiles / period.days;
}

export function a11yText(pr: InsuranceProgress, period: InsurancePeriod): string {
  return `Insurance miles. ${figureText(pr)}. ${paceLine(pr).replace(" · ", ". ")}. ${renewsText(period)}.`;
}
