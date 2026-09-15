// Which handler should an Android headless location-SDK event go to?
//
// Android audit, 15 Sep 2026 (30 days, automatic trips only): distances on
// Android were right, but the median gap between a trip ending and it
// reaching the server was 90 minutes (iOS: 12), and 34% of trips arrived
// more than six hours late (iOS: 10%). Drivers then reported the trips as
// missing when they were simply not saved yet. The cause is in the headless
// task: when Android has ended the app between drives, the SDK's
// `motionchange {isMoving:false}` for the parked car reaches the headless
// task, which until now only knew how to re-arm the stationary region and
// wake on speed. The open recording sat in SQLite until the driver next
// opened the app, and the orphan sweep saved it then.
//
// The dumps show the shape: 786 `native_headless_rearmed` events across the
// 25 Android phones (headless most of the time) against 16 live finalises
// and 12 app-open finalises; on iOS the same split is 7,191 to 910.
//
// This module is the pure decision, tested on its own like headlessSpeedRule.
// The headless task reads the recording flag and hands the event to the SAME
// foreground handler (handleNativeMotionChange / handleNativeLocation), so no
// verdict, distance or walk logic lives here.

export type HeadlessRoute =
  /** Parked with a recording open: run the foreground stop handler. */
  | "finalize"
  /** A fix while a recording is open: buffer it as the foreground does. */
  | "buffer"
  /** No recording open: the existing speed-wake rule decides. */
  | "wake"
  | "ignore";

export interface HeadlessRouteInput {
  platform: string;
  name: string;
  /** The event's own isMoving flag (motionchange only); null when absent. */
  isMoving: boolean | null;
  /** tracking_state.auto_recording_active === '1' at the time of the event. */
  recordingOpen: boolean;
}

/** Pull the motionchange event's own isMoving flag; null for anything else. */
export function readHeadlessIsMoving(name: string, params: unknown): boolean | null {
  if (name !== "motionchange") return null;
  const p = (params ?? {}) as Record<string, unknown>;
  return typeof p.isMoving === "boolean" ? p.isMoving : null;
}

export function routeHeadlessEvent({ platform, name, isMoving, recordingOpen }: HeadlessRouteInput): HeadlessRoute {
  if (platform !== "android") return "ignore";
  if (name !== "location" && name !== "motionchange") return "ignore";
  if (!recordingOpen) return "wake";
  if (name === "location") return "buffer";
  // motionchange with a recording open: only the stop matters. A "moving"
  // while already recording is what the foreground handler treats as a
  // no-op, and an event with no flag cannot be read as a stop.
  return isMoving === false ? "finalize" : "ignore";
}
