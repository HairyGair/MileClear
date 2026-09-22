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
