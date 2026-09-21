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

/** What a wake event should do about the stored pause.
 *  - "record": no pause, carry on as normal.
 *  - "sleep": still paused, refuse the drive and put the recorder back to
 *    sleep, which is what makes a pause save any battery at all.
 *  - "resume": the end time has passed, so clear the pause and record.
 */
export type PauseWake = "record" | "sleep" | "resume";

/**
 * Samantha Birch, 21 Sep 2026, verified on her phone: she chose "Until 6am
 * tomorrow" at 20:00 on the 20th, and the pause did exactly what it was
 * written to do, which was stop the engine. At 06:00 the pause expired and
 * nothing started the engine again, because the only two things that could
 * were a tap on the reminder and opening the app. She drove from 09:40, the
 * phone recorded nothing, and she found out at half three. She typed the day
 * in by hand and wrote "Not reliable so for now have to use 2 apps".
 *
 * So the pause stops being a stop command and becomes this decision, read
 * fresh on every wake. A paused phone stays armed and refuses each drive; an
 * expired one records the drive it just woke for. The end time is then kept
 * by the clock rather than by the driver remembering to open the app.
 */
export function pauseWakeDecision(until: number | null | undefined, now: number): PauseWake {
  if (until === null || until === undefined) return "record";
  // A malformed value is not a pause, and must not strand the recorder: it
  // reads as "never paused" here and gets cleared by the caller as expired.
  if (!Number.isFinite(until)) return "resume";
  return isPauseActive(until, now) ? "sleep" : "resume";
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
