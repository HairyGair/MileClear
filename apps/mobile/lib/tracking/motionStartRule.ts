// Should a "moving" motion event be refused because the phone says its owner
// is on foot?
//
// The suppression itself is right and was measured: until 15 Sep 2026 any
// movement opened a recording, so a round of golf arrived as a drive. The
// coprocessor's verdict is the only signal that can tell a walk from a drive
// before the route exists (neither average nor peak speed can do it, both
// dry-run proven, see the walk detection work of 13 Sep 2026).
//
// What was missing is the other half: the coprocessor can be wrong, and when
// it is, the fix that came with the event says so. Nobody walks at 12 mph. On
// Android the cost of being wrong is higher than on iOS, because 46% of
// Android phones have never granted motion at all (21 Sep 2026), so the
// handful that do report activity carry more weight than they have earned.
//
// So: keep the suppression, and refuse to apply it to a fix that is already
// travelling at driving speed. The speed backstop in handleNativeLocation
// would open the recording on the next fix anyway; this only saves the first
// few hundred metres of a drive that was never a walk.
//
// Pure and tested on its own, like pauseRule / gapStop / headlessSpeedRule.

/** Matches the force-start backstop in nativeLocation.ts. A walk cannot. */
export const ON_FOOT_OVERRIDE_SPEED_MS = 12 * 0.44704;

export interface MotionStartInput {
  /** The coprocessor's classification, null when it did not say. */
  activityType: string | null;
  /** 0-100, null when the platform did not give one. */
  confidence: number | null;
  /** Speed of the fix that came with the motion event, m/s, null when absent. */
  speedMs: number | null;
  /** Activity types that count as on foot. */
  onFoot: ReadonlySet<string>;
  /** Minimum confidence before the classification is believed. */
  minConfidence: number;
  /** Refuse a slow start that no vehicle reading backs. iOS only: Android
   *  reports no activity, and its captures are too fragile to hold back. */
  requireVehicleWhenSlow?: boolean;
}

export type MotionStartDecision =
  /** Open a recording as normal. */
  | { skip: false; reason: null }
  /** Refuse: the phone is being carried, not driven. */
  | { skip: true; reason: "on_foot" }
  /** Refuse: moving at walking pace with nothing saying it is a vehicle. */
  | { skip: true; reason: "slow_without_vehicle" };

/** Below this (m/s, 10 mph) a motion start needs the phone to say it is in a
 *  vehicle. A scan of 98 walks dropped at finalize (23 Sep 2026) found about
 *  half opened by a motion event at 1.2-3.5 m/s that carried no on-foot label,
 *  so the on-foot check never saw them. A real drive loses nothing: the speed
 *  backstop opens it at 12 mph and the wake-lag extension restores the start. */
export const SLOW_MOTION_START_MAX_MS = 10 * 0.44704;

const IN_VEHICLE: ReadonlySet<string> = new Set(["in_vehicle", "automotive"]);

export function decideMotionStart({
  activityType,
  confidence,
  speedMs,
  onFoot,
  minConfidence,
  requireVehicleWhenSlow = false,
}: MotionStartInput): MotionStartDecision {
  if (!activityType || !onFoot.has(activityType)) {
    const inVehicle = activityType != null && IN_VEHICLE.has(activityType);
    if (
      requireVehicleWhenSlow &&
      !inVehicle &&
      speedMs !== null &&
      Number.isFinite(speedMs) &&
      speedMs >= 0 &&
      speedMs < SLOW_MOTION_START_MAX_MS
    ) {
      return { skip: true, reason: "slow_without_vehicle" };
    }
    return { skip: false, reason: null };
  }
  if (confidence !== null && confidence < minConfidence) return { skip: false, reason: null };
  // The override: a fix at driving speed outranks any on-foot verdict.
  if (speedMs !== null && Number.isFinite(speedMs) && speedMs >= ON_FOOT_OVERRIDE_SPEED_MS) {
    return { skip: false, reason: null };
  }
  return { skip: true, reason: "on_foot" };
}
