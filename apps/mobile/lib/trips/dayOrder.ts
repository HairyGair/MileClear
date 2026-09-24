/**
 * Day-ordered trip list.
 *
 * The trips tab loads newest first, which is right for finding today but
 * wrong for reading a day: a driver checking for missed journeys wants the
 * first trip of the day at the top and the rest in the order they drove
 * them. So days stay newest first (today at the top) and inside each day
 * the trips run oldest first, with a header row before every day.
 *
 * Pure: no React, no Date.now() unless `now` is omitted.
 */

export interface DayOrderable {
  startedAt: string;
  /** When present, a trip id that appears twice is shown once (see below). */
  id?: string;
}

export type DayHeaderRow = {
  kind: "header";
  key: string;
  /** "Today", "Yesterday", else "Mon 15 Sep" */
  label: string;
  /** Local calendar day, "YYYY-MM-DD" */
  dayKey: string;
};

export type DayTripRow<T extends DayOrderable> = {
  kind: "trip";
  trip: T;
};

export type DayRow<T extends DayOrderable> = DayHeaderRow | DayTripRow<T>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Local calendar day of a date, "YYYY-MM-DD". */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Header label for a local calendar day. Weekday and month are spelt by
 * hand: en-GB Intl writes "Sept", which reads oddly next to "Aug" and "Oct".
 */
export function dayLabel(d: Date, now: Date = new Date()): string {
  const key = localDayKey(d);
  if (key === localDayKey(now)) return "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === localDayKey(yesterday)) return "Yesterday";
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * Reorder trips into day sections: days newest first, trips inside a day
 * oldest first, a header row before each day. Trips with the same start
 * time keep their incoming relative order. Trips whose startedAt does not
 * parse are dropped rather than sorted to a random place.
 *
 * A trip id that appears more than once is shown once (the first copy).
 * The list keys rows by trip id, and two rows with one key make React leave
 * stale copies of the card mounted on every re-render: one drive showed 13
 * times for Chris Saunders on 24 Sep 2026. See pageMerge.ts.
 */
export function groupTripsByDay<T extends DayOrderable>(trips: readonly T[], now: Date = new Date()): DayRow<T>[] {
  const byDay = new Map<string, { date: Date; trips: { trip: T; ms: number; idx: number }[] }>();

  const seenIds = new Set<string>();
  trips.forEach((trip, idx) => {
    if (trip.id !== undefined) {
      if (seenIds.has(trip.id)) return;
      seenIds.add(trip.id);
    }
    const date = new Date(trip.startedAt);
    const ms = date.getTime();
    if (Number.isNaN(ms)) return;
    const key = localDayKey(date);
    let bucket = byDay.get(key);
    if (!bucket) {
      bucket = { date, trips: [] };
      byDay.set(key, bucket);
    }
    bucket.trips.push({ trip, ms, idx });
  });

  // Day keys are zero-padded ISO dates, so plain string order is date order.
  const dayKeys = [...byDay.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  const rows: DayRow<T>[] = [];
  for (const dayKey of dayKeys) {
    const bucket = byDay.get(dayKey)!;
    rows.push({ kind: "header", key: `day:${dayKey}`, label: dayLabel(bucket.date, now), dayKey });
    // Stable ascending sort: equal timestamps fall back to incoming order.
    const ordered = bucket.trips.sort((a, b) => a.ms - b.ms || a.idx - b.idx);
    for (const { trip } of ordered) rows.push({ kind: "trip", trip });
  }
  return rows;
}
