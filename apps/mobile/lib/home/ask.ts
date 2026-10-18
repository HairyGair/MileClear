// The single ask slot at the bottom of Home (PROPOSALS 0.7).
//
// Only one ask shows at a time, below the door rows and never above the trip
// buttons. It stands down while the status line is red (one problem at a time),
// and once a driver dismisses one, the next waits until tomorrow. The order is
// fixed here; each ask keeps its own "gone for good" or snooze rule elsewhere.
//
// Pure and unit-tested.

export type AskId =
  | "practice" // An accountant's practice asked something (share, keep sharing, a request)
  | "first_week" // What your first trips add up to: sort one (lib/home/firstWeek.ts)
  | "acquisition" // Where did you hear about MileClear? (first 30 days)
  | "vehicle" // Add your vehicle
  | "odometer" // Odometer readings for work
  | "employer" // Does your employer pay your mileage? Invite your manager
  | "shift" // Looks like a shift: grade it
  | "saved_places" // Save the places you visit often
  | "pro" // Pro (free drivers with 5+ trips)
  | "referral" // Invite a friend, get Pro free
  | "android_beta"; // Retired 11 Oct 2026 (not in ASK_ORDER): Android is public

export const ASK_ORDER: readonly AskId[] = [
  // First: someone (the driver's accountant) is waiting on an answer, often
  // with a deadline. Outranks every other ask, Pro included.
  "practice",
  // Add your vehicle first: it sets the rate the first-week figure uses.
  "vehicle",
  // A new driver's first trips and what they could claim, with the sort on
  // the Last trip card. Above the rest: 60% of drivers who stopped did so in
  // week one, and a third of them never sorted a trip (18 Oct 2026). Drawn on
  // the Last trip card, not the ask row.
  "first_week",
  "acquisition",
  "odometer",
  "employer",
  "shift",
  "saved_places",
  "pro",
  "referral",
  // "android_beta" retired 11 Oct 2026: Android has been public on Google Play
  // since 21 Sep, so "In closed testing" was wrong. The id stays in AskId so
  // stored dismissals still parse.
];

export interface AskInputs {
  /** The status line is red: no ask while the driver has a problem to fix. */
  statusRed: boolean;
  /** An ask was dismissed earlier today. */
  quietToday: boolean;
  eligible: Partial<Record<AskId, boolean>>;
}

export function selectAsk(i: AskInputs): AskId | null {
  if (i.statusRed || i.quietToday) return null;
  for (const id of ASK_ORDER) {
    if (i.eligible[id]) return id;
  }
  return null;
}

/** True when `lastDismissedAt` was on the same local calendar day as `now`. */
export function isQuietToday(lastDismissedAt: number | null, now: number): boolean {
  if (lastDismissedAt == null || !Number.isFinite(lastDismissedAt)) return false;
  const a = new Date(lastDismissedAt);
  const b = new Date(now);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Pro lines that rotate daily. The one that repeated the hero figure is gone,
 *  and so is the recaps one: every recap period has been free since 8 May. */
export const PRO_ASK_LINES: readonly string[] = [
  "Download your mileage records for your return",
  "See which platform pays best",
  "Save as many places as you like",
];

export function proAskLine(now: number): string {
  const day = Math.floor(now / (24 * 60 * 60 * 1000));
  return PRO_ASK_LINES[day % PRO_ASK_LINES.length];
}
