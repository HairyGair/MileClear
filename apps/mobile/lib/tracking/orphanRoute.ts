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
  | "shift_owns_gps"
  | "already_saved";

export interface OrphanDecision {
  finalize: boolean;
  reason: OrphanReason;
  /** The buffered fixes are a second copy of a trip that is already saved:
   *  throw them away instead of finalizing OR keeping them. */
  discard: boolean;
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
  /** How much of the buffered route's time span is already covered by a saved
   *  trip (0..1), from savedTripOverlap. Null when the span is unknown. */
  savedOverlap?: number | null;
  now: number;
}

/** A buffered route whose span is at least this much covered by a saved trip
 *  is that trip's second copy, not a lost drive. Half, not all: the shift
 *  recording and the native store start and stop a few minutes apart. */
export const ALREADY_SAVED_MIN_OVERLAP = 0.5;

export interface SavedTripSpan {
  id: string;
  startedMs: number;
  endedMs: number;
}

/**
 * Fraction of [spanStartMs, spanEndMs] that saved trips cover. Overlaps are
 * merged so two legs of one journey are not double counted.
 *
 * Lohitha (lsstart24, 5-8 Sep 2026, Android 5): she tracked three evenings by
 * shift or Start Trip. The native engine stored the same fixes throughout,
 * detection was correctly suppressed while the shift ran, and at the next app
 * open, hours later, this sweep found a "finished route nobody was looking
 * after" and saved it again: 85.75, 33.44 and 31.87 duplicate miles she then
 * had to find and delete.
 */
export function savedTripOverlap(spanStartMs: number, spanEndMs: number, trips: SavedTripSpan[]): number {
  const span = spanEndMs - spanStartMs;
  if (!(span > 0)) return 0;
  const pieces = trips
    .map((t) => [Math.max(t.startedMs, spanStartMs), Math.min(t.endedMs, spanEndMs)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let covered = 0;
  let cur: [number, number] | null = null;
  for (const piece of pieces) {
    if (!cur || piece[0] > cur[1]) {
      if (cur) covered += cur[1] - cur[0];
      cur = [piece[0], piece[1]];
    } else if (piece[1] > cur[1]) {
      cur[1] = piece[1];
    }
  }
  if (cur) covered += cur[1] - cur[0];
  return Math.min(1, covered / span);
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

  if (input.armed) return { finalize: false, reason: "recording_armed", source, ageMs, discard: false };
  if (input.shiftActive) return { finalize: false, reason: "shift_owns_gps", source, ageMs, discard: false };

  const coords = Math.max(jsCount, nativeCount);
  if (coords < ORPHAN_MIN_COORDS) {
    return { finalize: false, reason: "too_few_coords", source, ageMs, discard: false };
  }

  // A second copy of a trip already in the list is not a lost drive. Checked
  // before the age bound: the copy is also "finished", and finalizing it is
  // exactly the duplicate this guards against.
  if ((input.savedOverlap ?? 0) >= ALREADY_SAVED_MIN_OVERLAP) {
    return { finalize: false, reason: "already_saved", source, ageMs, discard: true };
  }

  // No timestamp to judge by means the fixes are of unknown age. Treat that as
  // finished: a buffer with coordinates and no readable time is exactly the
  // corrupt state this sweep exists to clear, and finalize's own guards decide
  // whether it becomes a trip.
  if (newestMs > 0 && ageMs < ORPHAN_MIN_AGE_MS) {
    return { finalize: false, reason: "still_current", source, ageMs, discard: false };
  }

  return { finalize: true, reason: "orphaned_route", source, ageMs, discard: false };
}
