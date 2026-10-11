// Background upkeep: finish and send what a drive left behind, without
// waiting for the driver to open the app. The pure part.
//
// Missing-trip analysis, 10 Oct 2026 (docs/missing-trips-oct2026): 12.9% of
// iOS trips and 14.1% of Android trips reached the server more than two hours
// after they ended, and 11 of 56 missing-trip reports were exactly that: the
// drive was on the phone, and became a trip (or reached the server) only when
// the app was next opened. Tamara's five morning drives landed at 16:54, one
// minute after she reported them missing.
//
// The kerbside finalise already runs in the background (the stop handlers,
// the Android headless task since 15 Sep 2026). What still waited for an app
// open was everything that went wrong around it:
//   - an upload that failed at the kerb (weak signal, a token refresh with the
//     phone locked) sat in the sync queue until the next app open;
//   - a route held only in the engine's own store, with no recording flag
//     (the SteveG shape, see orphanRoute.ts), was swept only at app open;
//   - drop events (recordingDrops.ts) waiting in their outbox.
//
// So whenever the phone is awake in the background anyway (a heartbeat, an
// Android headless heartbeat, a background fetch), it looks at those three,
// at most once every UPKEEP_MIN_INTERVAL_MS, and deals with whichever has
// work. Nothing here turns GPS on or keeps the phone awake for longer: it
// only uses wakes that were already happening.

import { ORPHAN_MIN_COORDS } from "./orphanRoute";

/** Least time between two upkeep passes. A heartbeat comes every minute;
 *  ten minutes keeps the cost to a few SQLite reads per wake. */
export const UPKEEP_MIN_INTERVAL_MS = 10 * 60 * 1000;

/** Longest a single pass may hold the wake before giving up for this time. */
export const UPKEEP_TIME_BUDGET_MS = 25 * 1000;

/** May a pass run now? A clock that went backwards counts as long ago. */
export function upkeepDue(lastAt: number, now: number, minIntervalMs = UPKEEP_MIN_INTERVAL_MS): boolean {
  return !(lastAt > 0) || now < lastAt || now - lastAt >= minIntervalMs;
}

export interface UpkeepInput {
  /** tracking_state.auto_recording_active === '1'. A live recording belongs
   *  to the stop handlers and the heartbeat finalise, never to this sweep. */
  recordingOpen: boolean;
  /** A shift or Start Trip owns the GPS. */
  shiftActive: boolean;
  /** Rows in detection_coordinates. */
  jsCoords: number;
  /** Fixes in the engine's own store; null when unknown. */
  nativeCoords: number | null;
  /** The engine's own isMoving; null when unknown. A moving engine is a drive
   *  in progress (even with no recording flag), so its route is not swept:
   *  a ten-minute standstill in traffic must not end someone's trip. */
  sdkMoving: boolean | null;
  /** Sync queue rows still to send. */
  pendingUploads: number;
  /** App events (recording drops) still to send. */
  pendingEvents: number;
}

export interface UpkeepPlan {
  /** Look for a finished route nothing is armed to save (sweepOrphanedRoute,
   *  which applies its own age, duplicate and switched-off rules). */
  sweep: boolean;
  /** Retry the sync queue. */
  drainUploads: boolean;
  /** Send waiting app events. */
  flushEvents: boolean;
}

/**
 * Fixes the engine's store must hold before a background sweep looks at it.
 * A parked phone collects the odd stationary fix (the Android headless re-arm
 * takes one every half hour), and sweeping those would only turn them into a
 * "phantom" drop every hour. A real drive, even a half-mile hop at the 20 m
 * distance filter, is comfortably over this. The JS buffer is only written
 * while a recording is open, so any route there (ORPHAN_MIN_COORDS) counts.
 * The app-open sweep keeps its own lower bar.
 */
export const UPKEEP_SWEEP_MIN_NATIVE = 10;

export function planUpkeep(input: UpkeepInput): UpkeepPlan {
  const route = input.jsCoords >= ORPHAN_MIN_COORDS || (input.nativeCoords ?? 0) >= UPKEEP_SWEEP_MIN_NATIVE;
  return {
    sweep: !input.recordingOpen && !input.shiftActive && input.sdkMoving !== true && route,
    drainUploads: input.pendingUploads > 0,
    flushEvents: input.pendingEvents > 0,
  };
}

export function hasWork(plan: UpkeepPlan): boolean {
  return plan.sweep || plan.drainUploads || plan.flushEvents;
}
