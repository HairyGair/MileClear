// The single ask slot at the bottom of Home (PROPOSALS 0.7).
//
// Only one ask shows at a time, below the door rows and never above the trip
// buttons. It stands down while the status line is red (one problem at a time),
// and once a driver dismisses one, the next waits until tomorrow. The order is
// fixed here; each ask keeps its own "gone for good" or snooze rule elsewhere.
//
// Pure and unit-tested.

export type AskId =
  | "acquisition" // Where did you hear about MileClear? (first 30 days)
  | "vehicle" // Add your vehicle
  | "odometer" // Odometer readings for work
  | "employer" // Does your employer pay your mileage? Invite your manager
  | "shift" // Looks like a shift: grade it
  | "saved_places" // Save the places you visit often
  | "pro" // Pro (free drivers with 5+ trips)
  | "referral" // Invite a friend, get Pro free
  | "android_beta"; // Android beta (retire when the public Play release ships)

export const ASK_ORDER: readonly AskId[] = [
  "acquisition",
  "vehicle",
  "odometer",
  "employer",
  "shift",
  "saved_places",
  "pro",
  "referral",
  "android_beta",
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
