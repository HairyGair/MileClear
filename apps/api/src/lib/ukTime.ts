// UK calendar helpers for Insights periods (9 Oct 2026).
//
// Every "this week / this month / today" figure on Insights must use the
// same boundaries, whatever timezone the API process runs in. Before this,
// three different rules were in use: server-local setHours (right only
// because Pixelish runs in Europe/London), "UK wall clock stored in the UTC
// fields" (an hour late in BST: a trip at 00:30 on a Monday counted in the
// week before), and plain UTC. These return real instants.
//
// Earnings are stored as a DATE (Earning.periodStart @db.Date), which
// Prisma hands back as UTC midnight of that calendar date. Read their day
// with the UTC getters (dateOnlyParts), never with getHours / getDay: a
// date has no time of day, and in BST getHours() on it says 1 AM.

const UK_TZ = "Europe/London";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface UkParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday, as Date.getDay() */
  dow: number;
  /** "YYYY-MM-DD" in UK time */
  dateKey: string;
}

/** Wall-clock parts of an instant in Europe/London. */
export function ukParts(d: Date): UkParts {
  const parts = partsFmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour")) % 24;
  return {
    year,
    month,
    day,
    hour,
    minute: Number(get("minute")),
    dow: WEEKDAY_INDEX[get("weekday")] ?? 0,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** The instant of 00:00 UK time on a calendar date (month 1-12; day may
 *  overflow, as Date.UTC allows). */
export function ukMidnight(year: number, month: number, day: number): Date {
  // Start from midnight UTC, then correct by the UK offset at that moment.
  // The UK offset is 0 or +1 h, and clocks change at 01:00/02:00, so the
  // offset at UTC midnight is the offset at UK midnight.
  const utc = Date.UTC(year, month - 1, day);
  const p = ukParts(new Date(utc));
  const offsetHours = p.hour; // 0 in GMT, 1 in BST
  return new Date(utc - offsetHours * 3_600_000);
}

export interface Bounds {
  start: Date;
  /** Inclusive end: one millisecond before the next period starts. */
  end: Date;
}

function endBefore(next: Date): Date {
  return new Date(next.getTime() - 1);
}

export function ukDayBounds(ref: Date = new Date()): Bounds {
  const p = ukParts(ref);
  const start = ukMidnight(p.year, p.month, p.day);
  return { start, end: endBefore(ukMidnight(p.year, p.month, p.day + 1)) };
}

/** Monday-to-Sunday week in UK time containing `ref`, moved back
 *  `weeksBack` weeks. */
export function ukWeekBounds(ref: Date = new Date(), weeksBack = 0): Bounds {
  const p = ukParts(ref);
  const sinceMonday = p.dow === 0 ? 6 : p.dow - 1;
  const mondayDay = p.day - sinceMonday - weeksBack * 7;
  return {
    start: ukMidnight(p.year, p.month, mondayDay),
    end: endBefore(ukMidnight(p.year, p.month, mondayDay + 7)),
  };
}

/** Calendar month in UK time containing `ref`, moved back `monthsBack`. */
export function ukMonthBounds(ref: Date = new Date(), monthsBack = 0): Bounds {
  const p = ukParts(ref);
  return {
    start: ukMidnight(p.year, p.month - monthsBack, 1),
    end: endBefore(ukMidnight(p.year, p.month - monthsBack + 1, 1)),
  };
}

/** The same period one step earlier (week before, month before, day before). */
export function previousBounds(period: "daily" | "weekly" | "monthly", ref: Date = new Date()): Bounds {
  if (period === "weekly") return ukWeekBounds(ref, 1);
  if (period === "monthly") return ukMonthBounds(ref, 1);
  const p = ukParts(ref);
  const start = ukMidnight(p.year, p.month, p.day - 1);
  return { start, end: endBefore(ukMidnight(p.year, p.month, p.day)) };
}

export function periodBounds(period: "daily" | "weekly" | "monthly", ref: Date = new Date()): Bounds {
  if (period === "weekly") return ukWeekBounds(ref);
  if (period === "monthly") return ukMonthBounds(ref);
  return ukDayBounds(ref);
}

/** Bounds for a DATE column (earnings): UTC midnight of the first and last
 *  UK calendar dates in the period, so the comparison is date to date. */
export function dateColumnRange(b: Bounds): { gte: Date; lte: Date } {
  const s = ukParts(b.start);
  const e = ukParts(b.end);
  return {
    gte: new Date(Date.UTC(s.year, s.month - 1, s.day)),
    lte: new Date(Date.UTC(e.year, e.month - 1, e.day)),
  };
}

/** Day of a DATE column value (UTC midnight from Prisma). */
export function dateOnlyParts(d: Date): { dow: number; dateKey: string } {
  return { dow: d.getUTCDay(), dateKey: d.toISOString().slice(0, 10) };
}
