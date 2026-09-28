// What "Automatic trips: off" means for the recorder (28 Sep 2026).
//
// A shift-only driver wrote in: "I have it set for manual tracking and only
// want it to track whilst I have a shift started yet it is adding personal
// trips for review outside shift times and has even sent me a notification
// that it is ignoring 2 walks... I do not want my private time tracked."
//
// The switch (Settings > Automatic trips, and now the dashboard row) only
// ever stopped the old expo-location detection task. The native engine
// (RNBG) kept running at full GPS, stopOnTerminate:false and startOnBoot, and
// kept every fix in its own store. Its live handlers refused each drive, but
// the next app open's orphan sweep read the store and saved the drive, or
// posted it as a journey to check, or told the driver about the walks it had
// dropped. Off was only off while the app was on screen.
//
// Now off is off: the engine is stopped and its store emptied, and nothing
// the store still holds becomes a trip or an offer. A shift or a Start Trip is
// the one exception, because the driver started those on purpose: while one
// runs the engine is left alone (it is in low power, see enginePowerRule.ts),
// and the off is applied when it ends. A pause is a different thing and is
// not handled here: a pause ends on its own and must stay armed to notice.
//
// Pure, like enginePowerRule.ts and nativeStopRule.ts, because detection.ts
// pulls in the whole native tracking stack and the test runner cannot import it.

/**
 * The permanent switch, from tracking_state.drive_detection_enabled. Absent
 * means on (the default every install starts with); only "1" is on otherwise,
 * the same reading isDriveDetectionEnabled has always used.
 */
export function readDetectionSwitch(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === "1";
}

export type DetectionOffAction =
  /** Automatic trips are on: nothing to do here. */
  | "on"
  /** Off, but a shift or Start Trip is running: leave the engine for now and
   *  apply the off when it ends (stopShiftTracking / stopQuickTripTracking
   *  both finish in startDriveDetection, which asks again). */
  | "wait_for_lock"
  /** Off and nothing the driver started is running: stop the engine and
   *  throw away whatever it stored. */
  | "stop_engine";

export interface DetectionOffInput {
  /** readDetectionSwitch of the stored row. A pause does not count as off. */
  switchOn: boolean;
  /** tracking_state.active_shift_id: a shift id, "__quick_trip__" for a
   *  Start Trip, or null. */
  activeShiftId: string | null | undefined;
}

export function detectionOffAction({ switchOn, activeShiftId }: DetectionOffInput): DetectionOffAction {
  if (switchOn) return "on";
  const lock = typeof activeShiftId === "string" ? activeShiftId.trim() : "";
  if (lock.length > 0) return "wait_for_lock";
  return "stop_engine";
}

/**
 * Should a route the automatic recorder buffered be thrown away rather than
 * saved, offered as a journey to check, or reported as a dropped walk?
 *
 * Only automatic recordings reach this question (finalizeAutoTrip, the orphan
 * sweep, the discard reports); a shift's and a Start Trip's routes are saved
 * from their own breadcrumbs by other code. So a running shift is no reason to
 * keep an automatic route: with the switch off, nobody asked for it.
 */
export function shouldDiscardAutoRoute(switchOn: boolean): boolean {
  return !switchOn;
}
