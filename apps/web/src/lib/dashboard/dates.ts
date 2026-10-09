// Date helpers for the driver dashboard. Pure (no imports) so they can be unit tested.

const DAY_NO_YEAR: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

/** Some engines print "Sept" for en-GB September. The app and API say "Sep". */
export function fixSep(text: string): string {
  return text.replace(/\bSept\b/g, "Sep");
}

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

/** "Thu 9 Oct" for this year, "Thu 9 Oct 2025" for any other year. */
export function formatDay(d: Date | string | number, now: Date = new Date()): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === now.getFullYear();
  const text = date.toLocaleDateString("en-GB", sameYear ? DAY_NO_YEAR : { ...DAY_NO_YEAR, year: "numeric" });
  // en-GB prints "Thu, 9 Oct" in some engines. The spec wants no comma.
  return fixSep(text.replace(",", ""));
}

/** "18:40" (24 hour). */
export function formatTime(d: Date | string | number): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "Thu 9 Oct . 18:40" with the separator the spec uses (a middle dot). */
export function formatDayTime(d: Date | string | number, now?: Date): string {
  return `${formatDay(d, now)} · ${formatTime(d)}`;
}

/** "08:30 to 08:55" */
export function formatRange(start: Date | string | number, end: Date | string | number): string {
  return `${formatTime(start)} to ${formatTime(end)}`;
}

/** "Good morning" / "Good afternoon" / "Good evening". */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
