// Period maths for the Insights screen: Week | Month | Tax year, with an
// offset (0 = now, -1 = the one before). Pure and local-time, so it can be
// tested without a phone. Weeks start on Monday.

export type InsightsPeriod = "week" | "month" | "tax_year";

export const PERIOD_KEY = "insights_period";

export interface PeriodRange {
  /** Inclusive start, local midnight. */
  start: Date;
  /** Exclusive end, local midnight. */
  end: Date;
  /** "This week", "Last week", "29 Sep to 5 Oct", "September 2026"... */
  label: string;
  /** True when offset is 0. */
  isCurrent: boolean;
  /** A date safely inside the period, for the recap API's `date` parameter. */
  anchor: Date;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function isInsightsPeriod(v: unknown): v is InsightsPeriod {
  return v === "week" || v === "month" || v === "tax_year";
}

export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay(); // 0 = Sunday
  out.setDate(out.getDate() - (dow === 0 ? 6 : dow - 1));
  return out;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** The first year of the tax year a date falls in (6 April boundary). */
export function taxYearStartYear(d: Date): number {
  const afterBoundary =
    d.getMonth() > 3 || (d.getMonth() === 3 && d.getDate() >= 6);
  return afterBoundary ? d.getFullYear() : d.getFullYear() - 1;
}

/** "2026-27" */
export function taxYearName(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function dayMonth(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function getPeriodRange(
  period: InsightsPeriod,
  offset: number,
  now: Date = new Date()
): PeriodRange {
  const isCurrent = offset === 0;

  if (period === "week") {
    const start = addDays(startOfWeek(now), offset * 7);
    const end = addDays(start, 7);
    const label = isCurrent
      ? "This week"
      : offset === -1
        ? "Last week"
        : `${dayMonth(start)} to ${dayMonth(addDays(end, -1))}`;
    return {
      start,
      end,
      label,
      isCurrent,
      anchor: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 2, 12),
    };
  }

  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const label = isCurrent
      ? "This month"
      : `${MONTHS_LONG[start.getMonth()]} ${start.getFullYear()}`;
    return {
      start,
      end,
      label,
      isCurrent,
      anchor: new Date(start.getFullYear(), start.getMonth(), 15, 12),
    };
  }

  const y = taxYearStartYear(now) + offset;
  const start = new Date(y, 3, 6);
  const end = new Date(y + 1, 3, 6);
  const label = isCurrent
    ? `6 April ${y} to now`
    : `6 April ${y} to 5 April ${y + 1}`;
  return { start, end, label, isCurrent, anchor: new Date(y, 8, 1, 12) };
}

/** Name of the thing being compared with: "last week", "last month". */
export function previousWord(period: InsightsPeriod): string {
  return period === "week" ? "last week" : period === "month" ? "last month" : "last year";
}

export function periodNoun(period: InsightsPeriod): string {
  return period === "week" ? "week" : period === "month" ? "month" : "tax year";
}

/** Heading for the summary card: "Your week", "Last week", "Tax year 2025-26". */
export function summaryTitle(
  period: InsightsPeriod,
  offset: number,
  range: PeriodRange,
  now: Date = new Date()
): string {
  if (offset === 0) return `Your ${periodNoun(period)}`;
  if (period === "week") return offset === -1 ? "Last week" : `Week of ${dayMonth(range.start)}`;
  if (period === "month") return MONTHS_LONG[range.start.getMonth()];
  return `Tax year ${taxYearName(taxYearStartYear(now) + offset)}`;
}

// ── Bars ───────────────────────────────────────────────────────────

export interface Bucket {
  label: string;
  /** Spoken name: "Monday", "Week of 6 Oct", "April". */
  name: string;
  miles: number;
  trips: number;
  isCurrent: boolean;
  isFuture: boolean;
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_LETTERS = ["A", "M", "J", "J", "A", "S", "O", "N", "D", "J", "F", "M"];

export interface TripLike {
  startedAt: string;
  distanceMiles: number;
}

/**
 * Spread trips over the bars for a period: 7 days for a week, one bar per
 * week for a month, 12 months for a tax year.
 */
export function bucketTrips(
  trips: TripLike[],
  period: InsightsPeriod,
  offset: number,
  now: Date = new Date()
): Bucket[] {
  const range = getPeriodRange(period, offset, now);
  const nowMs = now.getTime();
  let buckets: Bucket[];
  let indexOf: (t: Date) => number;

  if (period === "week") {
    buckets = DAY_LETTERS.map((label, i) => {
      const day = addDays(range.start, i);
      return {
        label,
        name: DAY_NAMES[i],
        miles: 0,
        trips: 0,
        isCurrent: day.getTime() <= nowMs && addDays(day, 1).getTime() > nowMs,
        isFuture: day.getTime() > nowMs,
      };
    });
    indexOf = (t) =>
      Math.round(
        (new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - range.start.getTime()) /
          86_400_000
      );
  } else if (period === "month") {
    const firstWeek = startOfWeek(range.start);
    const count = Math.ceil((range.end.getTime() - firstWeek.getTime()) / (7 * 86_400_000));
    buckets = Array.from({ length: count }, (_, i) => {
      const wk = addDays(firstWeek, i * 7);
      const shown = wk.getTime() < range.start.getTime() ? range.start : wk;
      return {
        label: `w/c ${shown.getDate()}`,
        name: `Week of ${dayMonth(shown)}`,
        miles: 0,
        trips: 0,
        isCurrent: wk.getTime() <= nowMs && addDays(wk, 7).getTime() > nowMs,
        isFuture: wk.getTime() > nowMs,
      };
    });
    indexOf = (t) =>
      Math.round((startOfWeek(t).getTime() - firstWeek.getTime()) / (7 * 86_400_000));
  } else {
    const y = range.start.getFullYear();
    buckets = MONTH_LETTERS.map((label, i) => {
      const m = new Date(y, 3 + i, 1);
      const next = new Date(y, 4 + i, 1);
      return {
        label,
        name: MONTHS_LONG[m.getMonth()],
        miles: 0,
        trips: 0,
        isCurrent: m.getTime() <= nowMs && next.getTime() > nowMs,
        isFuture: m.getTime() > nowMs,
      };
    });
    // April..March bars. Trips on 1 to 5 April belong to the year before and
    // are skipped by the range check below.
    indexOf = (t) => (t.getMonth() - 3 + 12) % 12;
  }

  for (const trip of trips) {
    const t = new Date(trip.startedAt);
    if (t.getTime() < range.start.getTime() || t.getTime() >= range.end.getTime()) continue;
    const i = indexOf(t);
    if (i >= 0 && i < buckets.length) {
      buckets[i].miles += trip.distanceMiles;
      buckets[i].trips += 1;
    }
  }
  return buckets;
}

/** One sentence a screen reader can read for the whole chart. */
export function chartLabel(buckets: Bucket[], period: InsightsPeriod, offset: number): string {
  const total = buckets.reduce((s, b) => s + b.miles, 0);
  const lead =
    offset === 0 ? `This ${periodNoun(period)}` : offset === -1 ? `Last ${periodNoun(period)}` : "This period";
  const driven = buckets.filter((b) => b.miles >= 0.05 && !b.isFuture);
  if (driven.length === 0) return `${lead}, no driving yet.`;
  const parts = driven.map((b) => `${b.name} ${Math.round(b.miles)}`);
  return `${lead}, ${Math.round(total)} miles. ${parts.join(", ")}.`;
}
