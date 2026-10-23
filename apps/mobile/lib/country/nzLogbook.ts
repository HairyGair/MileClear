// The New Zealand 90-day logbook download on the Downloads screen (23 Oct
// 2026). Pure helpers: which drivers see it, the dates the picker shows (New
// Zealand calendar days, whatever the phone's own time zone), and the path.
// IRD's rules and the period checks live in shared (tax/logbook.ts).
import {
  NZ_LOGBOOK_MIN_DAYS,
  NZ_LOGBOOK_TIME_ZONE,
  addLogbookDays,
  regimeFor,
  zonedMidnight,
  zonedParts,
} from "@mileclear/shared";

/** True only for drivers whose (effective) country uses IRD rules. */
export function showsNzLogbook(country: string): boolean {
  return regimeFor(country)?.id === "nz-ird";
}

/** The New Zealand calendar day (YYYY-MM-DD) a picked Date falls on. */
export function nzDayOf(date: Date): string {
  const p = zonedParts(date, NZ_LOGBOOK_TIME_ZONE);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Midday on a New Zealand calendar day, so the picker shows that day in any time zone near NZ. */
export function dateForNzDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(zonedMidnight(y, m, d, NZ_LOGBOOK_TIME_ZONE).getTime() + 12 * 3_600_000);
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
