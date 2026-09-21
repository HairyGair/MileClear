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
}

export type MotionStartDecision =
  /** Open a recording as normal. */
  | { skip: false; reason: null }
  /** Refuse: the phone is being carried, not driven. */
  | { skip: true; reason: "on_foot" };

export function decideMotionStart({
  activityType,
  confidence,
  speedMs,
  onFoot,
  minConfidence,
}: MotionStartInput): MotionStartDecision {
  if (!activityType || !onFoot.has(activityType)) return { skip: false, reason: null };
  if (confidence !== null && confidence < minConfidence) return { skip: false, reason: null };
  // The override: a fix at driving speed outranks any on-foot verdict.
  if (speedMs !== null && Number.isFinite(speedMs) && speedMs >= ON_FOOT_OVERRIDE_SPEED_MS) {
    return { skip: false, reason: null };
  }
  return { skip: true, reason: "on_foot" };
}
