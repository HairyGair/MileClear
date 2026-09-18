// Pause recording: the pure rule.
//
// Anthony, 16 Sep 2026: "it's only a matter of time before people complain
// about the amount of battery it uses". 26 of 738 phones had already found
// the permanent off switch buried in Settings, which is the failure mode we
// are trying to avoid: a switch that is easy to flip and easy to forget, so
// a week later "the app didn't record" arrives as a capture bug. A pause has
// an end. It comes back on by itself, the dashboard says so while it is off,
// and nothing is left to remember. The permanent switch stays in Settings.
//
// Pure and tested on its own, like gapStop / quickTripLock / walk.

export type PauseChoiceId = "tomorrow" | "week";

export interface PauseChoice {
  id: PauseChoiceId;
  label: string;
  until: number;
}

/** The hour recording comes back on for a "rest of today" pause. Before
 *  most people's first drive, after every night shift. */
export const PAUSE_RESUME_HOUR = 6;

/** Local 06:00 tomorrow, from `now`. */
export function tomorrowAtResumeHour(now: number): number {
  const d = new Date(now);
  d.setHours(PAUSE_RESUME_HOUR, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** The two pauses offered. Two, not five: a day off and a holiday cover the
 *  real cases, and a phone's alert can only hold three buttons. */
export function pauseChoices(now: number): PauseChoice[] {
  return [
    { id: "tomorrow", label: "Until 6am tomorrow", until: tomorrowAtResumeHour(now) },
    { id: "week", label: "For a week", until: now + 7 * 24 * 60 * 60 * 1000 },
  ];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 23 Sep", the same on every phone. The en-GB locale writes "Sept",
 *  and other locales write other things; this is a UK app. */
export function shortDay(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** A stored pause is live only while its end is still ahead. A missing or
 *  malformed value is "not paused", never "paused forever". */
export function isPauseActive(until: number | null | undefined, now: number): boolean {
  return typeof until === "number" && Number.isFinite(until) && until > now;
}

/** "Paused until 06:00 tomorrow" or "Paused until Tue 23 Sep". */
export function describePause(until: number, now: number): string {
  const end = new Date(until);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hhmm = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  if (sameDay(end, today)) return `Paused until ${hhmm} today`;
  if (sameDay(end, tomorrow)) return `Paused until ${hhmm} tomorrow`;
  return `Paused until ${shortDay(end)}`;
}

/** "Recording has been off since Wed 3 Sep." for the settings switch. */
export function describeOffSince(offAt: number): string {
  return `Recording has been off since ${shortDay(new Date(offAt))}.`;
}
