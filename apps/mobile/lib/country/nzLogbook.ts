// The New Zealand 90-day logbook download on the Downloads screen (23 Oct
// 2026). Pure helpers: which drivers see it, the dates the picker shows (New
// Zealand calendar days, picked as calendar days whatever the phone's time
// zone), and the path.
// IRD's rules and the period checks live in shared (tax/logbook.ts).
import { NZ_LOGBOOK_MIN_DAYS, addLogbookDays, regimeFor } from "@mileclear/shared";

/** True only for drivers whose (effective) country uses IRD rules. */
export function showsNzLogbook(country: string): boolean {
  return regimeFor(country)?.id === "nz-ird";
}

/**
 * The calendar day (YYYY-MM-DD) a driver picked, as the picker showed it. The
 * date picker works in the phone's own time zone, so the day is read with the
 * phone's local getters and used as that New Zealand calendar day as it is,
 * with no time-zone shift: a UK phone picking 5 October asks for 5 October,
 * even late in the evening when it's already the 6th in Auckland.
 */
export function calendarDayOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Midday on that calendar day in the phone's time zone, for the picker to show. */
export function dateForCalendarDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** The 90-day period that starts on `from`. */
export function nzLogbookEnd(from: string): string {
  return addLogbookDays(from, NZ_LOGBOOK_MIN_DAYS - 1);
}

export function nzLogbookPath(format: "pdf" | "csv", params: { vehicleId?: string; from: string }): string {
  const q = new URLSearchParams({ from: params.from, to: nzLogbookEnd(params.from) });
  if (params.vehicleId) q.set("vehicleId", params.vehicleId);
  return `/exports/logbook-${format}?${q.toString()}`;
}

export function nzLogbookFilename(format: "pdf" | "csv", from: string): string {
  return `mileclear-logbook-${from}-to-${nzLogbookEnd(from)}.${format}`;
}
