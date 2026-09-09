// Should a headless location fix wake the native engine into tracking?
//
// Jenny Hyett-Bell's Galaxy S25+ (9 Sep 2026): Samsung ended the app between
// drives, so every drive after the first day ran with the SDK headless. In
// that state the only fixes were the single positions our heartbeat re-arm
// acquires, and the SDK's stationary geofence never fired an exit. One of
// those fixes read 22 m/s (50 mph) and was thrown away, because the headless
// task ignored location events and the speed backstop lives only in the
// app's foreground code. Result: three points for a nine-mile drive, and a
// 58-mile drive she had to type in herself.
//
// Pure decision so it can be unit-tested; the headless task feeds it the raw
// event and acts on the answer. Thresholds match the foreground backstop in
// nativeLocation.ts (12 mph, fix accuracy within 30 m).

export const HEADLESS_FORCE_START_SPEED_MS = 12 * 0.44704;
export const HEADLESS_FORCE_START_ACCURACY_M = 30;

export interface HeadlessFix {
  speedMs: number | null;
  accuracyM: number | null;
}

/** Pull speed and accuracy out of either headless event shape. */
export function readHeadlessFix(name: string, params: unknown): HeadlessFix | null {
  if (name !== "location" && name !== "motionchange") return null;
  const p = (params ?? {}) as Record<string, unknown>;
  const loc = (name === "motionchange" ? (p.location as Record<string, unknown> | undefined) : p) ?? {};
  const coords = (loc.coords ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { speedMs: num(coords.speed), accuracyM: num(coords.accuracy) };
}

export interface HeadlessWakeInput {
  fix: HeadlessFix | null;
  /** SDK state at the time; null when getState is unavailable. */
  isMoving: boolean | null;
  enabled: boolean | null;
}

/**
 * True when the fix is a confident driving-speed fix and the SDK is not
 * already tracking. A disabled SDK is never woken.
 */
export function decideHeadlessWake({ fix, isMoving, enabled }: HeadlessWakeInput): boolean {
  if (!fix) return false;
  if (enabled === false) return false;
  if (isMoving === true) return false;
  const { speedMs, accuracyM } = fix;
  if (speedMs == null || accuracyM == null) return false;
  if (speedMs < HEADLESS_FORCE_START_SPEED_MS) return false;
  if (accuracyM > HEADLESS_FORCE_START_ACCURACY_M) return false;
  return true;
}
