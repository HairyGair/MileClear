/**
 * Quarter maths for the Quarterly updates hub. Pure: give it the obligations
 * HMRC listed (open and fulfilled) and "now", get back the quarters in plain
 * months, which one is next, what is late and how many are sent.
 *
 * Nothing here invents a date. Every start, end and due date comes from an
 * obligation. The only date worked out is the year-end deadline (31 January
 * after the tax year closes), which is a fixed rule.
 */

export interface ObligationLike {
  start: string;
  end: string;
  due: string;
  status: "Open" | "Fulfilled";
  receivedDate?: string;
}

export type QuarterState = "sent" | "overdue" | "due" | "upcoming";

export interface Quarter {
  start: string;
  end: string;
  due: string;
  /** "April to July", from the obligation dates. */
  label: string;
  /** sent: HMRC has it. overdue: open and past its due date. due: open, the period has ended. upcoming: period not over yet. */
  state: QuarterState;
  /** Date HMRC received it, when sent. */
  sentOn?: string;
  /** Sent after the due date. */
  late: boolean;
  /** Whole days from today to the due date. Negative when late. */
  daysLeft: number;
  /** 1-based position in the tax year. */
  position: number;
}

export interface QuarterSummary {
  /** Every quarter in the tax year, in order. */
  quarters: Quarter[];
  /** Quarters not yet sent, in order (an earlier year's overdue quarter comes first). */
  unsent: Quarter[];
  /** The one to send now: the earliest unsent quarter whose period has ended. Null when none. */
  next: Quarter | null;
  /** The first quarter still to come (period not over). Null when none. */
  following: Quarter | null;
  /**
   * The next running quarter, when it ends within 10 days. GOV.UK lets an
   * update go in up to 10 days before the period ends. Null otherwise.
   */
  early: Quarter | null;
  /** Unsent quarters past their due date. */
  overdue: Quarter[];
  sentCount: number;
  total: number;
  /** Everything HMRC listed for the year is sent. */
  allSent: boolean;
  /** Nothing to send right now (all sent, or only quarters still running). */
  upToDate: boolean;
  /** Standard quarters start on the 6th. Calendar quarters start on the 1st. */
  style: "standard" | "calendar";
}

/** HMRC accepts a quarterly update up to this many days before the period ends. */
export const EARLY_SEND_DAYS = 10;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** YYYY-MM-DD part of an ISO string, or null when it isn't a date. */
function datePart(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function utcDay(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Today as YYYY-MM-DD in the phone's own calendar. */
export function localToday(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** "April to July" from a quarter's start and end dates. */
export function quarterLabel(start: string, end: string): string {
  const s = datePart(start);
  const e = datePart(end);
  if (!s || !e) return "This period";
  return `${MONTHS[Number(s.slice(5, 7)) - 1]} to ${MONTHS[Number(e.slice(5, 7)) - 1]}`;
}

/** Calendar quarters start on the 1st; HMRC's standard quarters start on the 6th. */
export function quarterStyle(obligations: Pick<ObligationLike, "start">[]): "standard" | "calendar" {
  const first = obligations.map((o) => datePart(o.start)).find((d): d is string => d !== null);
  return first && first.endsWith("-01") ? "calendar" : "standard";
}

function yearLabel(start: number): string {
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Tax year (YYYY-YY) a date falls in, using the 6 April boundary. */
export function taxYearOfDate(ymd: string): string {
  const y = Number(ymd.slice(0, 4));
  return yearLabel(ymd.slice(5) >= "04-06" ? y : y - 1);
}

/**
 * Tax year a reporting period belongs to, from the period's START date.
 * Standard quarters start on 6 April and calendar quarters on 1 April, and no
 * quarter of the old year starts between 1 and 5 April, so for a period start
 * the new year begins on 1 April. Use this (not taxYearOfDate) for periods.
 */
export function taxYearOfPeriodStart(ymd: string): string {
  const y = Number(ymd.slice(0, 4));
  return yearLabel(ymd.slice(5) >= "04-01" ? y : y - 1);
}

/**
 * The from/to dates to ask HMRC for a tax year's obligations: 6 April to 5
 * April. HMRC allows at most 366 days between them and matches obligations by
 * their END date, and this window holds the end date of every quarter of both
 * styles (calendar Q1 30 Jun, calendar Q4 31 Mar, standard Q4 5 Apr).
 */
export function obligationsWindow(taxYear: string): { from: string; to: string } {
  const y = Number(taxYear.slice(0, 4));
  return { from: `${y}-04-06`, to: `${y + 1}-04-05` };
}

/**
 * Build the summary. `taxYear` (YYYY-YY) limits the timeline to that year;
 * leave it out to use the tax year of the earliest unsent quarter, or today's.
 * An unsent quarter from an earlier year still counts as overdue and as `next`
 * so a missed quarter is never hidden.
 */
export function summariseQuarters(
  obligations: ObligationLike[],
  now: Date = new Date(),
  taxYear?: string,
): QuarterSummary {
  const today = localToday(now);
  const todayDay = utcDay(today);

  // One entry per period. Fulfilled wins over Open for the same dates.
  const byPeriod = new Map<string, ObligationLike>();
  for (const o of obligations) {
    const s = datePart(o.start);
    const e = datePart(o.end);
    if (!s || !e || !datePart(o.due)) continue;
    const key = `${s}|${e}`;
    const prev = byPeriod.get(key);
    if (!prev || (prev.status === "Open" && o.status === "Fulfilled")) byPeriod.set(key, o);
  }

  const all: Quarter[] = [...byPeriod.values()]
    .sort((a, b) => datePart(a.start)!.localeCompare(datePart(b.start)!))
    .map((o) => {
      const start = datePart(o.start)!;
      const end = datePart(o.end)!;
      const due = datePart(o.due)!;
      const daysLeft = utcDay(due) - todayDay;
      const received = datePart(o.receivedDate);
      const sent = o.status === "Fulfilled";
      const state: QuarterState = sent
        ? "sent"
        : daysLeft < 0
          ? "overdue"
          : end < today
            ? "due"
            : "upcoming";
      return {
        start,
        end,
        due,
        label: quarterLabel(start, end),
        state,
        sentOn: sent && received ? received : undefined,
        late: sent && received ? received > due : false,
        daysLeft,
        position: 0,
      };
    });

  const unsentAll = all.filter((q) => q.state !== "sent");
  const year =
    taxYear ??
    (unsentAll.length > 0
      ? taxYearOfPeriodStart(unsentAll[0].start)
      : all.length > 0
        ? taxYearOfPeriodStart(all[all.length - 1].start)
        : taxYearOfDate(today));

  const inYear = all
    .filter((q) => taxYearOfPeriodStart(q.start) === year)
    .map((q, i) => ({ ...q, position: i + 1 }));
  const earlierOverdue = all.filter((q) => (q.state === "overdue" || q.state === "due") && q.start < `${year.slice(0, 4)}-04-01`);

  const unsent = [...earlierOverdue, ...inYear.filter((q) => q.state !== "sent")];
  const next = unsent.find((q) => q.state === "overdue" || q.state === "due") ?? null;
  const following = unsent.find((q) => q.state === "upcoming") ?? null;
  const sentCount = inYear.filter((q) => q.state === "sent").length;

  return {
    quarters: inYear,
    unsent,
    next,
    following,
    early: following && utcDay(following.end) - todayDay <= EARLY_SEND_DAYS ? following : null,
    overdue: unsent.filter((q) => q.state === "overdue"),
    sentCount,
    total: inYear.length,
    allSent: unsent.length === 0 && inYear.length > 0,
    upToDate: next === null && inYear.length > 0,
    style: quarterStyle(all),
  };
}

// ── Words ─────────────────────────────────────────────────────────────

/** "Saturday 7 November". Adds the year when it isn't this one. */
export function formatDueLong(ymd: string, now: Date = new Date()): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `${weekday} ${d} ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ""}`;
}

/** "7 November", with the year when it isn't this one. */
export function formatDueShort(ymd: string, now: Date = new Date()): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ""}`;
}

/** "6 days left", "1 day left", "Due today", "3 days late". */
export function daysLeftText(daysLeft: number): string {
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    return `${n} ${n === 1 ? "day" : "days"} late`;
  }
  if (daysLeft === 0) return "Due today";
  return `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
}

/** Pill tone: late, within two weeks, or calm. */
export function daysLeftTone(daysLeft: number): "late" | "soon" | "calm" {
  if (daysLeft < 0) return "late";
  return daysLeft <= 14 ? "soon" : "calm";
}

/** The year-end deadline for a tax year: 31 January, two calendar years after it starts. "2026-27" gives 2028-01-31. */
export function yearEndDeadline(taxYear: string): string | null {
  const m = /^(\d{4})-\d{2}$/.exec(taxYear);
  return m ? `${Number(m[1]) + 2}-01-31` : null;
}
