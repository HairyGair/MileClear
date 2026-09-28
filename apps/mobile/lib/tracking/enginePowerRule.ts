// When the automatic engine should stop paying for GPS (26 Sep 2026).
//
// The native engine (RNBG) has only one job: record drives nobody asked it
// to. There are three times when nothing it hears can be used:
//   - a pause is running (the drive would be refused anyway),
//   - a shift is running (the shift's own expo-location task records),
//   - a Start Trip is running (same task, under QUICK_TRIP_SHIFT_ID).
// Until now the engine ran at full navigation accuracy through all three and
// every fix was thrown away on arrival.
//
// Peter Hazelgrove (iPhone, build 89, paused "for a week"): MileClear was 46%
// of his battery on 26 Sep and ~48% on the 25th, seven hours in the
// background and four minutes on screen, while recording nothing. The engine
// kept deciding he was driving, going to navigation-grade GPS, handing the
// fix to a handler that put it back to sleep, and waking again: 6,000 fixes
// stored natively and later discarded, on each of three app opens. Fleet-wide
// in the 48 h to 26 Sep, iPhones logged `detection_skipped` 6,261 times for a
// shift and 3,129 times for a Start Trip: every one a navigation fix taken in
// parallel with the shift's own navigation fix, only to be skipped.
//
// So the engine has two power modes. "low" keeps it enabled and able to wake
// the app (the 21 Sep 2026 lesson: a stopped engine never hears that a pause
// has ended, and Samantha Birch lost a working day), but takes it off
// continuous GPS. "normal" is exactly the launch config. The config values
// per platform live here too, so the launch config and the restore can never
// drift apart: buildConfig spreads enginePowerConfig("normal").

import { isPauseActive } from "./pauseRule";

/** Mirrors QUICK_TRIP_SHIFT_ID in lib/tracking/index.ts and detection.ts. */
export const QUICK_TRIP_LOCK_ID = "__quick_trip__";

export type EnginePowerMode = "low" | "normal";
export type EnginePowerReason = "paused" | "shift" | "quick_trip" | "off" | null;

export interface EnginePowerDecision {
  mode: EnginePowerMode;
  reason: EnginePowerReason;
}

export interface EnginePowerInput {
  /** tracking_state.drive_pause_until as a number, or null when absent. */
  pausedUntil: number | null | undefined;
  now: number;
  /** tracking_state.active_shift_id, or null when absent. */
  activeShiftId: string | null | undefined;
  /** The driver switched Automatic trips off (not a pause). Optional so a
   *  caller that does not know reads as on, the old behaviour. */
  detectionOff?: boolean;
}

/**
 * Low while the engine's fixes cannot be used, normal otherwise.
 *
 * An expired pause is normal: the next drive must record at full accuracy
 * even if nothing has cleared the stored row yet (the row is cleared by the
 * first wake, resolvePauseOnWake). A malformed pause value is "not paused",
 * the same rule isPauseActive applies everywhere else, so a bad row can never
 * hold a phone in low power. The pause is checked first because it is the
 * reason that ends on a clock rather than by a tap, and the one worth seeing
 * in a dump.
 */
export function decideEnginePower({ pausedUntil, now, activeShiftId, detectionOff }: EnginePowerInput): EnginePowerDecision {
  if (isPauseActive(pausedUntil ?? null, now)) return { mode: "low", reason: "paused" };
  const lock = typeof activeShiftId === "string" ? activeShiftId.trim() : "";
  if (lock === QUICK_TRIP_LOCK_ID) return { mode: "low", reason: "quick_trip" };
  if (lock.length > 0) return { mode: "low", reason: "shift" };
  // Automatic trips off (28 Sep 2026): the engine should be stopped outright
  // (detectionOffRule.ts). This is belt and braces for the moments it is not,
  // such as a stop that failed, so a switched-off phone never runs full GPS.
  if (detectionOff === true) return { mode: "low", reason: "off" };
  return { mode: "normal", reason: null };
}

/** The SDK accuracy constants the config needs, read off the module. */
export interface EngineAccuracyConstants {
  navigation: number;
  medium: number;
}

/** Normal: today's launch values, unchanged. */
export const NORMAL_DISTANCE_FILTER_M = 20;
/** Low: moot on iOS under significant changes, and a floor on Android. */
export const LOW_DISTANCE_FILTER_M = 200;

/**
 * The config keys that differ between the two modes, per platform. Only these
 * keys are ever passed to setConfig by a mode change, so nothing else in the
 * launch config (preventSuspend, triggers, persistence) is touched.
 *
 * iOS low: `useSignificantChangesOnly: true`. The SDK's own docs (Config.d.ts,
 * v4.19.4): it "engages the iOS Significant Location Changes API for only
 * periodic location updates every 500-1000 meters" with "significant
 * power-saving". Significant changes are also what iOS uses to relaunch a
 * terminated app, so the engine can still wake and notice that a pause ended
 * or a shift lock was left behind. desiredAccuracy MEDIUM ("Wifi + Cellular")
 * and a wide distanceFilter are belt and braces: they cover the position the
 * SDK takes at each motion change, and any moving session that was already
 * running when the switch landed.
 *
 * Android low: desiredAccuracy MEDIUM ("Wifi + Cellular, medium power") and a
 * wide distanceFilter, and NOT significant changes. On Android that option
 * also means "No foreground-service will be run" (same doc). Switching the
 * foreground service off and back on at runtime is exactly the kind of change
 * Android 12+ refuses from the background, and a service that fails to come
 * back is a phone that records nothing: the 44%-silent-days problem we are
 * already fighting. Keeping the service and only lowering accuracy keeps the
 * wake path identical (stationary geofence + activity recognition) and takes
 * the GPS chip off the moving state. The trade-off: the stationary position
 * taken while low is coarse (~100 m), so the first wake after low ends can
 * come a little earlier or later than usual until the engine re-arms.
 *
 * Normal omits useSignificantChangesOnly on Android so the Android launch
 * config stays byte-for-byte what it was; on iOS it states the SDK default
 * (false) explicitly so leaving low actually turns significant changes off.
 */
export function enginePowerConfig(
  mode: EnginePowerMode,
  platform: string,
  acc: EngineAccuracyConstants
): Record<string, unknown> {
  const ios = platform === "ios";
  if (mode === "low") {
    return {
      desiredAccuracy: acc.medium,
      distanceFilter: LOW_DISTANCE_FILTER_M,
      ...(ios ? { useSignificantChangesOnly: true } : {}),
    };
  }
  return {
    desiredAccuracy: acc.navigation,
    distanceFilter: NORMAL_DISTANCE_FILTER_M,
    ...(ios ? { useSignificantChangesOnly: false } : {}),
  };
}

/** What the SDK is currently configured as, stored in tracking_state. */
export interface StoredEnginePower {
  mode: EnginePowerMode;
  reason: EnginePowerReason;
}

export function serializeEnginePower(d: StoredEnginePower): string {
  return `${d.mode}:${d.reason ?? "none"}`;
}

/**
 * Anything unreadable or absent is "normal", because that is what every
 * ready() leaves the SDK in and what every build before this one ran. Reading
 * a phone as low when it is not would only cost a redundant setConfig;
 * reading it as normal when it is low is corrected by the next applyEnginePower.
 */
export function parseEnginePower(value: string | null | undefined): StoredEnginePower {
  if (typeof value !== "string") return { mode: "normal", reason: null };
  const [mode, reason] = value.split(":");
  if (mode !== "low") return { mode: "normal", reason: null };
  const r: EnginePowerReason =
    reason === "paused" || reason === "shift" || reason === "quick_trip" || reason === "off" ? reason : null;
  return { mode: "low", reason: r };
}

/**
 * Should a mode change also put the SDK back on its stationary region? Only
 * when entering low, and never with a recording open: changePace(false) makes
 * the SDK report "stationary", which is the event that finalises a recording.
 * Every path into low closes the recording first (pause finalises, a shift or
 * Start Trip cancels), so the guard is defence, not the normal case.
 */
export function shouldPaceDownOnEnter(
  from: EnginePowerMode,
  to: EnginePowerMode,
  recordingOpen: boolean
): boolean {
  return from === "normal" && to === "low" && !recordingOpen;
}

/**
 * Leaving low power while parked: re-take the stationary position at full
 * accuracy. In low power the SDK's parked position is a significant-change or
 * MEDIUM fix (up to ~100 m off, or none at all on iOS), and the stationary
 * region is what notices the car pulling away. Without a re-arm the first
 * drive after a shift, a Start Trip or a pause could start late or not at all
 * (26 Sep 2026 review). Only when nothing is recording and the SDK itself says
 * it is stationary, so this can never cut a moving session short.
 */
export function shouldRearmOnExit(
  from: EnginePowerMode,
  to: EnginePowerMode,
  recordingOpen: boolean,
  sdkIsMoving: boolean | null
): boolean {
  return from === "low" && to === "normal" && !recordingOpen && sdkIsMoving === false;
}
