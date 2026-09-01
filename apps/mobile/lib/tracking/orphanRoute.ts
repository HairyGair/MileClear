// A recorded route that nothing is looking after any more.
//
// Every finalize path in the app is armed by a pair of tracking_state keys:
// `auto_recording_active` says a recording is open and `last_driving_speed_at`
// says when the car last moved. checkStaleAutoRecording, the background-fetch
// finalizer and the native engine's own stop handlers all read the flag FIRST
// and return silently when it is missing. The buffered fixes are never
// consulted.
//
// So a route whose flag is gone but whose coordinates remain is invisible.
// Nothing finalizes it, nothing reports it, and the user's drive simply is not
// there. Worse, it is not merely delayed: the next drive's openNativeRecording
// clears the buffer and calls destroyLocations() on RNBG's native store, so the
// route is DESTROYED by the act of driving again.
//
// SteveG, 1 Sep 2026 (Android 5, cd645fa4): Bristol BS10 to Hatfield AL10,
// 135.7 miles, captured perfectly — 2,766 fixes, every one high accuracy, in
// RNBG's native store. He arrived at 11:10, opened the app five times over the
// next 90 minutes, saw nothing, typed the journey in by hand and filed a
// missing-trip report. The route finally landed at 17:53, six hours and
// forty-three minutes after he parked, and only by accident: the native engine
// happened to fail its start that once ("Waiting for previous start action to
// complete"), the code fell back to the JS engine, and the JS location task has
// a catch-all — `coordCount > 5 → finalizeAutoTrip()` — that the native engine
// has no equivalent of. Had he driven anywhere before that, the 135 miles would
// have been deleted instead.
//
// This module is the rule that catch-all should have been: look at the
// COORDINATES, not the flag. Pure, like gapStop.ts and journeyBoundary.ts,
// because detection.ts pulls in the whole native stack and the test runner
// cannot import it.

/** A route this old cannot be the drive happening right now. Matches
 *  STOP_TIMEOUT_MS in detection.ts: the same ten minutes that ends a journey
 *  decides that buffered fixes are finished being added to. The guard matters
 *  most at openNativeRecording, where the JS engine's pre-recording buffer
 *  holds fixes from the approach to THIS drive — seconds old, and not a trip of
 *  their own. */
export const ORPHAN_MIN_AGE_MS = 10 * 60 * 1000;

/** Two fixes is what finalize itself needs to draw a line. Below that it logs
 *  finalize_no_coords and clears up. Deliberately low: an orphan sweep that
 *  runs finalize is SAFER than one that does not, because finalize consumes
 *  the buffer through the guarded path — trim, phantom checks, too-short
 *  checks, dedup — instead of the blind DELETE that used to follow. */
export const ORPHAN_MIN_COORDS = 2;

export type OrphanSource = "js_buffer" | "native_store";

export type OrphanReason =
  | "orphaned_route"
  | "recording_armed"
  | "too_few_coords"
  | "still_current"
  | "shift_owns_gps";

export interface OrphanDecision {
  finalize: boolean;
  reason: OrphanReason;
  /** Where the evidence came from, for the log line. */
  source: OrphanSource | null;
  /** How long ago the newest buffered fix was recorded. */
  ageMs: number;
}

export interface OrphanInputs {
  /** tracking_state.auto_recording_active === "1". An armed recording belongs
   *  to checkStaleAutoRecording, which knows about the stop timeout and the
   *  still-driving aliveness check. This sweep must not race it. */
  armed: boolean;
  /** Rows in detection_coordinates. */
  jsCoordCount: number;
  /** Newest detection_coordinates row, epoch ms; 0 when the buffer is empty. */
  jsNewestMs: number;
  /** Fixes in RNBG's native store, which survives JS-runtime death and is what
   *  actually held SteveG's 135 miles. Null when the native engine is off or
   *  the module is absent. */
  nativeCount?: number | null;
  /** Newest fix in the native store, epoch ms. */
  nativeNewestMs?: number | null;
  /** A shift or live quick trip owns the GPS; its coordinates are its own. */
  shiftActive: boolean;
  now: number;
}

/**
 * Is there a finished route sitting in the buffers that nothing will ever save?
 *
 * Reads both stores because either can be the sole holder: the JS buffer when
 * the runtime stayed alive, RNBG's native store when Android killed it mid
 * drive (SteveG had 61 fixes in one and 2,766 in the other). Takes the newer of
 * the two ages, so a live native store is never mistaken for a finished route.
 */
export function orphanRouteDecision(input: OrphanInputs): OrphanDecision {
  const nativeCount = input.nativeCount ?? 0;
  const jsCount = input.jsCoordCount;
  const source: OrphanSource | null =
    nativeCount > jsCount ? "native_store" : jsCount > 0 ? "js_buffer" : null;

  const newestMs = Math.max(input.jsNewestMs || 0, input.nativeNewestMs || 0);
  const ageMs = newestMs > 0 ? input.now - newestMs : 0;

  if (input.armed) return { finalize: false, reason: "recording_armed", source, ageMs };
  if (input.shiftActive) return { finalize: false, reason: "shift_owns_gps", source, ageMs };

  const coords = Math.max(jsCount, nativeCount);
  if (coords < ORPHAN_MIN_COORDS) {
    return { finalize: false, reason: "too_few_coords", source, ageMs };
  }

  // No timestamp to judge by means the fixes are of unknown age. Treat that as
  // finished: a buffer with coordinates and no readable time is exactly the
  // corrupt state this sweep exists to clear, and finalize's own guards decide
  // whether it becomes a trip.
  if (newestMs > 0 && ageMs < ORPHAN_MIN_AGE_MS) {
    return { finalize: false, reason: "still_current", source, ageMs };
  }

  return { finalize: true, reason: "orphaned_route", source, ageMs };
}
