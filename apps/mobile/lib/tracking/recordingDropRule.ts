// A recording that ended without a new trip, and why: the pure part.
//
// Missing-trip analysis, 10 Oct 2026 (docs/missing-trips-oct2026): in 5 of 56
// cases the phone told the server a drive had started (trip.signal_start) and
// no trip ever arrived. The phone always knew why: finalize logs a reason on
// every exit (too short, a walk, a phantom, no fixes, merged into the last
// trip, already saved, an error). But those lines lived only in the phone's
// own log, which reaches the server in one overwritten dump, so the cases
// could be neither counted nor explained.
//
// Now every such exit also sends one `trip.recording_dropped` app event with
// the reason (recordingDrops.ts). This file decides what the event says. No
// React Native, no SQLite, so it runs under vitest.

export type DropReason =
  /** Fewer than two fixes: nothing to draw. */
  | "no_coords"
  /** A momentary or walking-pace blip, not a drive. */
  | "phantom"
  /** Under the shortest trip we save. */
  | "too_short"
  /** The walk guard: positive evidence of walking. */
  | "walk"
  /** A sparse straight line over an implausible distance. */
  | "crow_flies"
  /** An aeroplane, not a drive: the airborne fixes were cut out (flightRule.ts). */
  | "flight"
  /** Over the server's 2,000-mile cap, by our own sum before sending or by the
   *  server's "Distance exceeds reasonable limit" verdict: known garbage (a
   *  flight the flight rule missed). The only refusal that clears the fixes. */
  | "implausible_distance"
  /** The server refused the trip with some other 4xx (a phone clock ahead, a
   *  tag it does not know yet). NOT lost: the fixes are kept and the save is
   *  tried again after a growing wait (15 min, 1 h, 6 h, daily). */
  | "rejected"
  /** Merged onto the previous trip locally; the server refused the update, so
   *  it sits in the sync queue. Not lost: the miles are on the trip. */
  | "merge_queued"
  /** The tail trim left nothing (should never happen; logged so it shows). */
  | "tail_trim"
  /** Joined onto the previous trip (a fuel stop, a drop-off). Not lost. */
  | "merged"
  /** The same drive was saved already, by another path or an earlier pass. Not lost. */
  | "deduped"
  /** Automatic trips switched off: the route was thrown away on purpose. */
  | "switched_off"
  /** The driver said "Not driving". */
  | "cancelled"
  /** Old fixes cleared when a new recording opened. */
  | "stale_buffer_cleared"
  /** A previous recording the phone could not save, found as a new one
   *  opened: handed to the upload queue (a trip row plus a queued create)
   *  instead of being cleared (rescueHandoff.ts). Not lost: it is in the trip
   *  list and the Uploads screen. */
  | "rescued_to_queue"
  /** The engine's duplicate copy of a Start Trip / shift, cleared when it
   *  ended (detail "start_trip_end" / "shift_end"). The drive is on the Start
   *  Trip or shift; an earlier drive in the buffer is saved, not counted here.
   *  Not lost, and never an explanation for a missing trip. */
  | "duplicate_cleared"
  /** The save threw. The fixes are kept and retried at the next app open. */
  | "error";

/** Reasons that leave the drive's miles out of the trip list. Merged and
 *  deduped drives are in it already; an error is retried. */
const LOST: ReadonlySet<DropReason> = new Set<DropReason>([
  "no_coords",
  "phantom",
  "too_short",
  "walk",
  "crow_flies",
  "flight",
  "implausible_distance",
  "tail_trim",
  "switched_off",
  "cancelled",
  "stale_buffer_cleared",
]);

export function isLostReason(reason: DropReason): boolean {
  return LOST.has(reason);
}

/** What a sweep of fixes no recording was armed for usually finds: a few
 *  stationary fixes, not a drive. Dropped for one of these reasons, they are
 *  housekeeping, not a lost drive. */
const RESIDUE_REASONS: ReadonlySet<DropReason> = new Set<DropReason>(["no_coords", "phantom", "tail_trim"]);

/** Did a drop lose a drive's miles? A residue sweep (source "orphan_...")
 *  that found only stationary fixes did not. */
export function dropIsLost(reason: DropReason, source: string | null | undefined): boolean {
  if (!isLostReason(reason)) return false;
  if (source && source.startsWith("orphan_") && RESIDUE_REASONS.has(reason)) return false;
  return true;
}

export interface DropInput {
  reason: DropReason;
  /** A finer reason, such as the walk guard's own verdict or "momentary". */
  detail?: string | null;
  /** First and last buffered fix, ISO, when there were any. */
  startedAt?: string | null;
  endedAt?: string | null;
  coords?: number | null;
  distanceMiles?: number | null;
  /** Fixes RNBG's native store still held: a drop judged on a handful of
   *  JS fixes while the store held a route is a starved buffer. */
  nativeCoords?: number | null;
  /** Which code path dropped it, for the paths outside finalize. */
  source?: string | null;
  /** Buffered fixes removed because an earlier save already holds them
   *  (savedFixes.ts), so the server can see how often a refill brought back
   *  driving that was already saved. */
  savedFixesSkipped?: number | null;
}

export interface DropEvent {
  reason: DropReason;
  lost: boolean;
  detail?: string;
  startedAt?: string;
  endedAt?: string;
  droppedAt: string;
  coords?: number;
  distanceMiles?: number;
  nativeCoords?: number;
  durationSec?: number;
  source?: string;
  savedFixesSkipped?: number;
  platform: string;
}

function finiteOrUndefined(v: number | null | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * The event metadata for one dropped recording. Compact, and never carries a
 * coordinate: times, counts, a distance and the reason only.
 */
export function buildDropEvent(input: DropInput, now: number, platform: string): DropEvent {
  const startedMs = input.startedAt ? Date.parse(input.startedAt) : Number.NaN;
  const endedMs = input.endedAt ? Date.parse(input.endedAt) : Number.NaN;
  const distance = finiteOrUndefined(input.distanceMiles);
  const ev: DropEvent = {
    reason: input.reason,
    lost: dropIsLost(input.reason, input.source),
    droppedAt: new Date(now).toISOString(),
    platform,
  };
  if (input.detail) ev.detail = String(input.detail).slice(0, 120);
  if (Number.isFinite(startedMs)) ev.startedAt = new Date(startedMs).toISOString();
  if (Number.isFinite(endedMs)) ev.endedAt = new Date(endedMs).toISOString();
  if (Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs >= startedMs) {
    ev.durationSec = Math.round((endedMs - startedMs) / 1000);
  }
  const coords = finiteOrUndefined(input.coords);
  if (coords !== undefined) ev.coords = coords;
  if (distance !== undefined) ev.distanceMiles = Math.round(distance * 100) / 100;
  const nativeCoords = finiteOrUndefined(input.nativeCoords);
  if (nativeCoords !== undefined) ev.nativeCoords = nativeCoords;
  if (input.source) ev.source = String(input.source).slice(0, 60);
  const skipped = finiteOrUndefined(input.savedFixesSkipped);
  if (skipped !== undefined && skipped > 0) ev.savedFixesSkipped = skipped;
  return ev;
}

// ── Outbox ──────────────────────────────────────────────────────────────────
// Drops happen at the kerb, often with the app closed and sometimes offline,
// so each event waits in a small SQLite outbox until /user/events takes it.

/** Most events kept waiting. The oldest go first when it is full. */
export const OUTBOX_CAP = 200;
/** Most events per request (the API's /user/events maximum is 50). */
export const OUTBOX_BATCH = 50;
/** An event older than this is not worth sending. */
export const OUTBOX_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
