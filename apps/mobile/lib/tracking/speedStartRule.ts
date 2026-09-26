// Does one GPS fix at driving speed justify opening a recording?
//
// Both engines ask this. The foreground handler in nativeLocation.ts asks it
// of every fix while no recording is open, and the Android headless task asks
// it of the fixes it sees after the OS has ended the app. Until 22 Sep 2026
// each held its own copy of "12 mph within 30 m", and the headless task then
// handed the fix to the foreground handler, so the two had to agree or a
// woken engine would still refuse to record.
//
// Samantha Birch, Michelle Rustage and Abdifatah Abdulle, 22 Sep 2026: the
// first full day of `native_headless_wake_rejected` data showed 12 fixes on
// three Android phones at 19 to 30 mph with 33 to 50 m accuracy, and not one
// of those moments became a trip. On a phone whose app the OS has ended, that
// fix may be the only one of the drive, so turning it away loses the drive.
//
// So a looser fix is accepted when it is plainly faster than a run or a bike.
// A spike on a parked phone costs a short phantom recording, which the
// finalise guards already drop; a refused drive costs the driver the trip.
//
// Pure so it can be unit-tested; callers feed it the raw fix.

const MPH = 0.44704;

/** The tight tier: a fix this good only has to be faster than a run. */
export const SPEED_START_MIN_MS = 12 * MPH;
export const SPEED_START_TIGHT_ACCURACY_M = 30;

/** The loose tier: a looser fix has to be clearly faster before it counts. */
export const SPEED_START_LOOSE_MIN_MS = 15 * MPH;
export const SPEED_START_LOOSE_ACCURACY_M = 50;

export type SpeedStartTier = "tight" | "loose";

export type SpeedStartDecision =
  | { start: true; tier: SpeedStartTier }
  | { start: false; reason: "no_fix" | "too_slow" | "accuracy" };

export function decideSpeedStart(speedMs: number | null, accuracyM: number | null): SpeedStartDecision {
  if (speedMs == null || accuracyM == null || !Number.isFinite(speedMs) || !Number.isFinite(accuracyM)) {
    return { start: false, reason: "no_fix" };
  }
  if (speedMs < SPEED_START_MIN_MS) return { start: false, reason: "too_slow" };
  if (accuracyM <= SPEED_START_TIGHT_ACCURACY_M) return { start: true, tier: "tight" };
  if (accuracyM <= SPEED_START_LOOSE_ACCURACY_M && speedMs >= SPEED_START_LOOSE_MIN_MS) {
    return { start: true, tier: "loose" };
  }
  return { start: false, reason: "accuracy" };
}

/**
 * True for a refusal worth logging: the fix was at driving speed and only its
 * accuracy (or, in the loose band, its speed) kept it out. These near misses
 * are what the thresholds are judged on.
 */
export function isNearMiss(speedMs: number | null, accuracyM: number | null): boolean {
  const d = decideSpeedStart(speedMs, accuracyM);
  return !d.start && d.reason === "accuracy";
}

/**
 * The confirm tier (Samantha Birch, 26 Sep 2026). Her Android phone woke as
 * she set off at 08:21 with one fix at 40 mph, but 200 m accuracy. Both tiers
 * refused it, nothing asked for a better fix, and the morning's two drives
 * were lost. A fix like that is not good enough to open a recording on, but it
 * is good enough to look again: the caller wakes the SDK into moving mode, its
 * next fixes come in fast and tight, and those decide through the normal
 * tiers. A parked phone's junk reading costs a few minutes of GPS until the
 * SDK's own stop timer parks it again; a refused drive costs the trip.
 *
 * Bounded both ways: the speed must still be clearly faster than a bike and
 * not absurd (a 101 mph fix at 496 m was seen on 23 Sep and is junk), and the
 * accuracy no worse than 500 m. The caller also rate-limits it.
 */
export const SPEED_CONFIRM_MIN_MS = 15 * MPH;
export const SPEED_CONFIRM_MAX_MS = 100 * MPH;
export const SPEED_CONFIRM_MAX_ACCURACY_M = 500;

export function shouldConfirmCoarseFix(speedMs: number | null, accuracyM: number | null): boolean {
  if (!isNearMiss(speedMs, accuracyM)) return false;
  // isNearMiss has already checked both are finite numbers.
  return (
    (speedMs as number) >= SPEED_CONFIRM_MIN_MS &&
    (speedMs as number) <= SPEED_CONFIRM_MAX_MS &&
    (accuracyM as number) <= SPEED_CONFIRM_MAX_ACCURACY_M
  );
}
