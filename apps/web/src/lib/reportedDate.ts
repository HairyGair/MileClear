// The calendar day a user said a missing drive happened ("YYYY-MM-DD", their
// local day), as stored on trip.report_missing events since 16 Sep 2026.
// It is a date, not an instant: build it in UTC and print it in UTC so it
// never shifts a day either side of Greenwich.

const REPORTED_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Spelled out by hand: browser and Node en-GB locale data print September as
// "Sept", and the admin pages want the three-letter form throughout.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-14" becomes "Mon 14 Sep". Missing or malformed becomes "no date". */
export function formatReportedDate(value: string | null | undefined): string {
  if (!value) return "no date";
  const m = REPORTED_DATE_RE.exec(value);
  if (!m) return "no date";
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "no date";
  const date = new Date(Date.UTC(Number(m[1]), month - 1, day));
  if (Number.isNaN(date.getTime())) return "no date";
  return `${WEEKDAYS[date.getUTCDay()]} ${day} ${MONTHS[month - 1]}`;
}
