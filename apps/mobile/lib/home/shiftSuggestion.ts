// The sentence for the "Looks like a shift" ask: "6 trips, 16:10 to 22:35,
// 38 miles", with the day in front when it was not today. 24-hour times, as
// the Last trip card above it uses. Pure.

import type { ShiftSuggestion } from "../api/shifts";

function clockTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function tripsText(n: number): string {
  return `${n} ${n === 1 ? "trip" : "trips"}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function describeSuggestion(
  s: Pick<ShiftSuggestion, "startedAt" | "endedAt" | "tripCount" | "totalMiles">,
  now: Date = new Date()
): string {
  const start = new Date(s.startedAt);
  const end = new Date(s.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${tripsText(s.tripCount)}, ${Math.round(s.totalMiles)} miles`;
  }
  const day = sameDay(start, now)
    ? ""
    : `${start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, `;
  const miles = s.totalMiles < 10 ? s.totalMiles.toFixed(1) : String(Math.round(s.totalMiles));
  return `${tripsText(s.tripCount)}, ${day}${clockTime(start)} to ${clockTime(end)}, ${miles} miles`;
}
