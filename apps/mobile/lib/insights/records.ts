// Personal records for the Insights screen. Hides empty records, adds dates
// and a "New" flag, and keeps Work words out of Personal mode.

import { dayMonth } from "./period";

export interface RecordsInput {
  mostMilesInDay: number;
  mostMilesInDayDate: string | null;
  mostTripsInShift: number;
  mostTripsInShiftDate: string | null;
  longestSingleTrip: number;
  longestSingleTripDate: string | null;
  longestStreakDays: number;
}

export interface RecordCell {
  key: "bestDay" | "longestTrip" | "tripsInShift" | "bestStreak";
  label: string;
  value: string;
  unit: string;
  /** "5 Oct" or null when the API has no date. */
  dateLabel: string | null;
  isNew: boolean;
  spoken: string;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function miles(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

/**
 * Personal: Best day, Longest trip. (Streaks there count weeks and live in
 * "Coming up"; "trips per shift" is a Work idea.)
 * Work: Best day, Longest trip, Most trips in a shift, Best streak.
 * A record whose value is 0 is dropped. `isNew` is true when the record was
 * set inside the shown period (start inclusive, end exclusive).
 */
export function buildRecords(
  r: RecordsInput,
  mode: "work" | "personal",
  period: { start: Date; end: Date }
): RecordCell[] {
  const cells: RecordCell[] = [];
  const isNewOn = (d: Date | null) =>
    !!d && d.getTime() >= period.start.getTime() && d.getTime() < period.end.getTime();

  const add = (
    key: RecordCell["key"],
    label: string,
    raw: number,
    value: string,
    unit: string,
    date: Date | null,
    spokenUnit: string
  ) => {
    if (!(raw > 0)) return;
    const dateLabel = date ? dayMonth(date) : null;
    cells.push({
      key,
      label,
      value,
      unit,
      dateLabel,
      isNew: isNewOn(date),
      spoken: `${label}, ${value} ${spokenUnit}${dateLabel ? `, ${dateLabel}` : ""}${isNewOn(date) ? ", new" : ""}`,
    });
  };

  const day = parseDate(r.mostMilesInDayDate);
  add("bestDay", "Best day", r.mostMilesInDay, miles(r.mostMilesInDay), "mi", day, "miles");
  const trip = parseDate(r.longestSingleTripDate);
  add("longestTrip", "Longest trip", r.longestSingleTrip, miles(r.longestSingleTrip), "mi", trip, "miles");

  if (mode === "work") {
    const shift = parseDate(r.mostTripsInShiftDate);
    add("tripsInShift", "Most trips in a shift", r.mostTripsInShift, String(r.mostTripsInShift), "", shift, "trips");
    add("bestStreak", "Best streak", r.longestStreakDays, String(r.longestStreakDays), r.longestStreakDays === 1 ? "day" : "days", null, r.longestStreakDays === 1 ? "day" : "days");
  }
  return cells;
}
