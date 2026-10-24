// Only record in work hours: the pure rule.
//
// Ben Turner, 24 Oct 2026: "I've tried to set the app to only record
// journeys after 12pm as I don't tend to work in the morning. Doesn't seem to
// be working?" Work hours only sorted trips; recording ran all day. With this
// switch on, the app pauses its own recording outside the hours (the same
// pause as Pause recording, see lib/tracking/pauseRule.ts) and the pause ends
// a little before the next work hours begin. No I/O here, so it is tested on
// its own.

export interface WorkHoursSlot {
  dayOfWeek: number; // 0 = Sunday
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  enabled: boolean;
}

/** Recording comes back on this long before the hours start, so the drive to
 *  the first job is recorded. */
export const WORK_HOURS_LEAD_MS = 30 * 60 * 1000;

/** ...and stays on this long after they end, for the drive home. */
export const WORK_HOURS_TRAIL_MS = 30 * 60 * 1000;

function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Each enabled slot as real start/end times, for the days around `now`.
 *  The screen keeps start before end, so a slot never crosses midnight. */
function windows(slots: WorkHoursSlot[], now: number): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (let offset = -8; offset <= 8; offset++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    for (const slot of slots) {
      if (!slot.enabled || slot.dayOfWeek !== day.getDay()) continue;
      const a = minutesOf(slot.startTime);
      const b = minutesOf(slot.endTime);
      if (a === null || b === null || b <= a) continue;
      const start = new Date(day);
      start.setHours(Math.floor(a / 60), a % 60, 0, 0);
      const end = new Date(day);
      end.setHours(Math.floor(b / 60), b % 60, 0, 0);
      out.push({ start: start.getTime(), end: end.getTime() });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/**
 * Should recording be paused now, and until when?
 *
 * Null means record: inside the hours (with the lead and trail), or no
 * usable hours at all, as a switch with no hours behind it must never stop a
 * phone recording for good. Otherwise the epoch ms the pause should end: the
 * next hours' start, less the lead.
 */
export function workHoursPauseUntil(slots: WorkHoursSlot[], now: number): number | null {
  const wins = windows(slots, now);
  if (wins.length === 0) return null;
  for (const w of wins) {
    if (now >= w.start - WORK_HOURS_LEAD_MS && now < w.end + WORK_HOURS_TRAIL_MS) return null;
  }
  const next = wins.find((w) => w.start - WORK_HOURS_LEAD_MS > now);
  return next ? next.start - WORK_HOURS_LEAD_MS : null;
}

/** "Resume" on a work-hours pause records the rest of the day: until the
 *  next local midnight. */
export function endOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** When recording last stopped for the hours: the latest end of the hours
 *  plus the trail that is already past. A work-hours pause's window starts
 *  here, so the fixes since then are the pause's and a drive from the hours
 *  is not. Null with no usable hours in the last week. */
export function workHoursLastEnd(slots: WorkHoursSlot[], now: number): number | null {
  let last: number | null = null;
  for (const w of windows(slots, now)) {
    const stop = w.end + WORK_HOURS_TRAIL_MS;
    if (stop <= now && (last === null || stop > last)) last = stop;
  }
  return last;
}
