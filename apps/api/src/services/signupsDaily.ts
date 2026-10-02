// Daily sign-up counts on UK calendar days (Europe/London), for the admin
// "New sign-ups" chart. The route selects only createdAt for users created in
// the range and this pure function buckets them, so the day boundaries are
// right across the BST/GMT changes without relying on MySQL's time zone
// tables (which may not be loaded on the server).

const LONDON = "Europe/London";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LONDON,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" of the UK calendar day an instant falls on. */
export function londonDayKey(d: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return dayFormatter.format(d);
}

/** Offset of Europe/London from UTC at an instant, in ms (0 or +1h). */
function londonOffsetMs(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** The UTC instant at which a UK calendar day ("YYYY-MM-DD") starts. */
export function londonDayStart(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // UK midnight is never inside a clock change (they happen at 01:00 UTC),
  // so the offset just after the guess is the offset at midnight.
  const guess = new Date(utcMidnight - londonOffsetMs(new Date(utcMidnight)));
  return new Date(utcMidnight - londonOffsetMs(guess));
}

/** The UK day keys for the last `days` days, oldest first, ending today. */
export function londonDayKeys(days: number, now: Date): string[] {
  const todayKey = londonDayKey(now);
  const [y, m, d] = todayKey.split("-").map(Number);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    // Noon UTC on the calendar date, so stepping whole days never lands on
    // the wrong side of a boundary.
    keys.push(new Date(Date.UTC(y, m - 1, d - i, 12)).toISOString().slice(0, 10));
  }
  return keys;
}

/** The first instant to query from: the start of the oldest UK day shown. */
export function signupsDailyRangeStart(days: number, now: Date): Date {
  return londonDayStart(londonDayKeys(days, now)[0]);
}

export interface SignupsDaily {
  days: Array<{ date: string; count: number }>;
  total: number;
}

/** Count sign-ups per UK day for the last `days` days ending today. Days with
 *  none are filled with 0; stamps outside the range are ignored. */
export function bucketSignupsDaily(createdAt: Date[], days: number, now: Date): SignupsDaily {
  const keys = londonDayKeys(days, now);
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  let total = 0;
  for (const d of createdAt) {
    const k = londonDayKey(d);
    const c = counts.get(k);
    if (c === undefined) continue;
    counts.set(k, c + 1);
    total++;
  }
  return { days: keys.map((date) => ({ date, count: counts.get(date) ?? 0 })), total };
}
