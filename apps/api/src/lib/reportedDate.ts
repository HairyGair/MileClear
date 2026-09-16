// The calendar day a user says a missing drive happened, as filed from the
// "Missing a trip?" form. Added 16 Sep 2026 after a report that said only
// "To Peterborough" cost an hour on the wrong day (the drive was 6 August,
// the report 14 September).
//
// The app sends the user's LOCAL calendar day as "YYYY-MM-DD". It is a date,
// not an instant: never turn it into a Date with `new Date(str)` for display,
// which reads it as UTC midnight and shifts it a day west of Greenwich.

const REPORTED_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Accept only a real calendar day in the YYYY-MM-DD shape; "2026-02-30" and
 * "2026-13-01" both come back null. Returns the string unchanged when valid.
 */
export function parseReportedDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = REPORTED_DATE_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return value;
}

// Spelled out by hand: Node's en-GB locale data prints September as "Sept",
// and the admin pages want the three-letter form throughout.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-14" becomes "Mon 14 Sep". Anything else becomes "no date". */
export function formatReportedDate(value: string | null | undefined): string {
  const valid = parseReportedDate(value);
  if (!valid) return "no date";
  const [y, m, d] = valid.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
