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

import { normaliseRecordedAt } from "./finalizeSaveRule";

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
    const t = fixTimeMs(r.recorded_at);
    if (!Number.isFinite(t) || t < windowStartMs) earlier.push(r);
    else inWindow.push(r);
  }
  return { earlier, inWindow };
}

/** A fix time in ms. The native engine stores its raw timestamp (an epoch
 *  string) while the JS engine stores ISO, so both are read the same way the
 *  save path reads them (normaliseRecordedAt). NaN when truly unreadable. */
export function fixTimeMs(v: string | number): number {
  const iso = normaliseRecordedAt(v);
  return iso ? Date.parse(iso) : Number.NaN;
}

/**
 * Native-store fixes from BEFORE the window that the buffer does not hold yet.
 * The end-of-trip cleanup adds only these; it never replaces the buffer from
 * the native store, because that store holds the whole Start Trip and a
 * wholesale reconcile keeps only its newest 6,000 fixes and deletes the
 * buffer's copy of the earlier drive (review of 12 Oct fix). Unreadable
 * times are skipped (they cannot be placed before the window).
 */
export function nativeFixesBeforeWindow<T extends { timestamp: string | number }>(
  native: readonly T[],
  bufferTimes: readonly (string | number)[],
  windowStartMs: number | null
): T[] {
  if (windowStartMs == null || !Number.isFinite(windowStartMs)) return [];
  const have = new Set<number>();
  for (const b of bufferTimes) {
    const t = fixTimeMs(b);
    if (Number.isFinite(t)) have.add(t);
  }
  const out: T[] = [];
  for (const n of native) {
    const t = fixTimeMs(n.timestamp);
    if (Number.isFinite(t) && t < windowStartMs && !have.has(t)) {
      have.add(t);
      out.push(n);
    }
  }
  return out;
}

/** An abandoned Start Trip's start row can be days old. A marker this much
 *  older than the lock is ignored unless the first breadcrumb agrees. */
export const STALE_START_ROW_MS = 3 * 60 * 60 * 1000;
const AGREE_MS = 10 * 60 * 1000;

/** Rows an open added itself: recorded within a minute before its seed fix
 *  (covering the planted departure fix) or later. Everything older belongs
 *  to something else (an in-flight finalize's buffer) and is left alone. */
export function rowsAddedByOpen<T extends DatedFix & { id: number }>(rows: readonly T[], seedMs: number): number[] {
  const floor = seedMs - 60 * 1000;
  const ids: number[] = [];
  for (const r of rows) {
    const t = fixTimeMs(r.recorded_at);
    if (Number.isFinite(t) && t >= floor) ids.push(r.id);
  }
  return ids;
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
  /** "shift" ignores quick_trip_start altogether (it belongs to a Start Trip,
   *  and a stale one would make a shift's window days old). */
  kind?: "shift" | "start_trip";
}): number | null {
  const candidates: number[] = [];
  const parse = (s: string | null | undefined) => {
    if (!s) return Number.NaN;
    return Date.parse(s);
  };
  const crumb = parse(markers.firstBreadcrumbIso);
  if (Number.isFinite(crumb)) candidates.push(crumb);
  const lock = markers.lockTakenAtMs;
  const lockOk = typeof lock === "number" && Number.isFinite(lock) && lock > 0;
  if (lockOk) candidates.push(lock);
  const qts = parse(markers.quickTripStartIso);
  if (markers.kind !== "shift" && Number.isFinite(qts)) {
    const stale = lockOk && lock - qts > STALE_START_ROW_MS;
    const agrees = Number.isFinite(crumb) && Math.abs(crumb - qts) <= AGREE_MS;
    if (!stale || agrees) candidates.push(qts);
  }
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
