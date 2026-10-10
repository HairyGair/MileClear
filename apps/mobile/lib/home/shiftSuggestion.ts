// The sentence for the "Looks like a shift" ask: "6 trips, 4:10pm to 10:35pm,
// 38 miles", with the day in front when it was not today. Pure.

import type { ShiftSuggestion } from "../api/shifts";

function clockTime(d: Date): string {
  const h24 = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, "0");
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mins}${h24 < 12 ? "am" : "pm"}`;
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
    return `${s.tripCount} trips, ${Math.round(s.totalMiles)} miles`;
  }
  const day = sameDay(start, now)
    ? ""
    : `${start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, `;
  const miles = s.totalMiles < 10 ? s.totalMiles.toFixed(1) : String(Math.round(s.totalMiles));
  return `${s.tripCount} trips, ${day}${clockTime(start)} to ${clockTime(end)}, ${miles} miles`;
}
