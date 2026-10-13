// Two pure rules about the line between an automatic recording and a
// Start Trip / shift. No React Native, no SQLite, so they run under vitest.
//
// 1. WHICH BUFFERED FIXES BELONG TO THE WINDOW (12 Oct 2026, iOS, native
//    engine). An automatic recording of a 20-minute drive (168 fixes) was still
//    open when the driver parked and tapped Start Trip. The Start Trip lock
//    kept detection off the buffer, so the drive sat there unsaved for fifty
//    minutes; at Arrived the cleanup called cancelAutoRecording(true), which
//    deletes EVERY buffered fix on the grounds that they are the engine's
//    duplicate copy of the Start Trip. Only the fixes recorded at or after the
//    Start Trip began are that copy. The earlier ones are a different drive.
//    About seven drivers hit this shape in two and a half days.
//
// 2. MAY A RECORDING OPEN NOW (13 Oct 2026, iOS 27.2). A passenger tapped
//    "Not driving"; one second later the server was told a new recording had
//    started. cancelAutoRecording wrote its 20-minute cooldown LAST, after
//    several awaits, and a fix or motion callback landing in that window found
//    no cooldown and opened a recording. Every opener now asks this one rule.

/** A buffered fix, as far as these rules care. */
export interface DatedFix {
  recorded_at: string;
}

export interface WindowSplit<T extends DatedFix> {
  /** Recorded before the window began: an earlier drive. Kept and saved. */
  earlier: T[];
  /** Recorded at or after the window began: the duplicate copy. Discarded. */
  inWindow: T[];
}

/**
 * Split a buffer at the moment a Start Trip / shift began.
 *
 * Conservative on purpose: a fix whose time cannot be read is treated as
 * EARLIER (kept), because a duplicate trip can be merged or deleted later and
 * a deleted drive cannot be recovered. An unknown window start (null) falls
 * back to the old behaviour, everything in the window, because with nothing to
 * measure against the caller has no better answer; it is logged by the caller.
 */
export function partitionBufferByWindow<T extends DatedFix>(
  rows: readonly T[],
  windowStartMs: number | null
): WindowSplit<T> {
  const earlier: T[] = [];
  const inWindow: T[] = [];
  for (const r of rows) {
    if (windowStartMs == null || !Number.isFinite(windowStartMs)) {
      inWindow.push(r);
      continue;
    }
    const t = Date.parse(r.recorded_at);
    if (!Number.isFinite(t) || t < windowStartMs) earlier.push(r);
    else inWindow.push(r);
  }
  return { earlier, inWindow };
}

/**
 * When did the window begin? The EARLIEST of every start marker we have: a
 * Start Trip promoted from an automatic recording starts at its first
 * transferred fix (before the lock time), a fresh one at the tap. Earliest
 * wins, because the engine's copy of a promoted drive reaches back that far.
 * Null when nothing is known.
 */
export function windowStartMs(markers: {
  quickTripStartIso?: string | null;
  lockTakenAtMs?: number | null;
  firstBreadcrumbIso?: string | null;
}): number | null {
  const candidates: number[] = [];
  const iso = (s: string | null | undefined) => {
    if (!s) return;
    const t = Date.parse(s);
    if (Number.isFinite(t)) candidates.push(t);
  };
  iso(markers.quickTripStartIso);
  iso(markers.firstBreadcrumbIso);
  const lock = markers.lockTakenAtMs;
  if (typeof lock === "number" && Number.isFinite(lock) && lock > 0) candidates.push(lock);
  return candidates.length === 0 ? null : Math.min(...candidates);
}

/** Fewer native fixes than this are the stray stationary ones the store
 *  collects between drives, not a drive. */
export const NATIVE_DRIVE_MIN_FIXES = 10;

/**
 * Is there an earlier automatic drive to save before a Start Trip / shift
 * takes the lock? Two or more JS fixes, or a native store with a drive's worth.
 * Cheap to evaluate, so the common case (nothing buffered) costs a couple of
 * queries and no delay, and stray stationary fixes do not trigger a save that
 * would only report a phantom.
 */
export function earlierDriveToSave(state: { jsCount: number; nativeCount: number | null }): boolean {
  return state.jsCount >= 2 || (state.nativeCount ?? 0) >= NATIVE_DRIVE_MIN_FIXES;
}

/** How long Start Trip / shift start waits for the earlier drive to be saved. */
export const PRE_LOCK_FINALIZE_TIMEOUT_MS = 4000;
/** How long Start Trip / shift end waits for the earlier drive to be saved. */
export const POST_LOCK_FINALIZE_TIMEOUT_MS = 8000;

// ── May a recording open now? ───────────────────────────────────────────────

/** An in-memory "Not driving" this recent refuses a recording even when the
 *  cooldown row never reached SQLite (a failed write). */
export const RECENT_CANCEL_MS = 30 * 1000;

export type OpenRefusal = "cooldown" | "shift_lock" | "recent_cancel";

export interface OpenGateInput {
  nowMs: number;
  /** tracking_state.not_driving_until, epoch ms, or null. */
  notDrivingUntilMs: number | null;
  /** A shift / Start Trip owns the GPS (shiftSuppressesAutoDetection). */
  shiftLocked: boolean;
  /** When "Not driving" last ran in THIS process, or null. */
  cancelledAtMs: number | null;
}

export function openRecordingGate(i: OpenGateInput): { open: true } | { open: false; refusal: OpenRefusal } {
  if (i.shiftLocked) return { open: false, refusal: "shift_lock" };
  if (i.notDrivingUntilMs != null && Number.isFinite(i.notDrivingUntilMs) && i.nowMs < i.notDrivingUntilMs) {
    return { open: false, refusal: "cooldown" };
  }
  if (i.cancelledAtMs != null && i.nowMs >= i.cancelledAtMs && i.nowMs - i.cancelledAtMs < RECENT_CANCEL_MS) {
    return { open: false, refusal: "recent_cancel" };
  }
  return { open: true };
}
