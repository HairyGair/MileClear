// Fixes the automatic engine holds that another recording already owns.
//
// The phone can record a drive twice. While a shift runs, its own location
// task writes breadcrumbs to shift_coordinates, and the native engine (RNBG)
// keeps storing the same fixes in its own store: detection stands aside for
// the shift, but the store fills regardless. If the shift's lock is released
// without its breadcrumbs being turned into trips and without that store being
// cleared, the next finalize saves the engine's copy AND the shift later saves
// its own. The 28 Sep 2026 sweep found this behind 191 of 333 overlapping
// pairs of automatic trips in 14 days:
//
//   4cc04bac, 27 Sep: 09:46 stale_active_shift_cleared "active_too_long"
//     (the 18-hour ghost-shift release, which leaves the breadcrumbs and the
//     native store alone); 10:28:29 orphan_route_finalize saves 52.0 + 9.9 mi
//     from the native store; 10:28:32 the shift is closed and saves 55.1 +
//     10.8 mi from its breadcrumbs. Same afternoon, twice.
//   05bb9c56, 26 Sep: the same release at 10:20:59, 74.4 + 6.2 mi saved from
//     the native store that second, the shift's 76.1 mi 21 minutes later.
//   f02756e7, 27 Sep: shift_auto_ended and orphan_route_finalize in the same
//     second of an app open; five engine trips inside the shift's own.
//
// The fix is the rule the orphan sweep's "already saved" check (Lohitha,
// 5-8 Sep) was reaching for, applied per fix at the one place every finalize
// passes through: a buffered fix recorded while a shift's recorder was
// recording, or inside a trip already saved from a shift's breadcrumbs, is a
// second copy. Drop it before finalize judges the route. Whatever is left (a
// drive before or after the shift) is finalized as usual.
//
// Only SHIFT trips count among saved trips, because only their window is
// their recording: processShiftTrips sets start and end to the segment's
// first and last breadcrumb. An automatic trip's end can sit far past its
// last fix (8644f381, 28 Sep: fixes 06:43-06:45, trip to 06:54; 25ccbab0,
// 21 Sep: trip from 07:17, fixes only from 13:08), and treating that stretch
// as recorded would drop a real drive inside it. A second copy of an
// automatic trip is refused by the server instead, on its breadcrumbs.
//
// Pure: detection.ts pulls in the native stack and cannot be imported by the
// test runner.

/** Breadcrumbs of one shift further apart than this belong to separate
 *  stretches of recording. The shift task records every 50 m while moving
 *  and nothing while parked, so a parked hour is not "owned": the engine
 *  would not have recorded anything there either, and if the shift's
 *  recorder died mid-shift the engine's drive in that hole is kept. */
export const SHIFT_RUN_GAP_MS = 10 * 60 * 1000;
/** Edge slack around a shift's breadcrumbs: the shift task and the engine
 *  start and stop a few seconds apart. Saved trips get none; their window is
 *  already their recording's first and last fix, and padding it would clip
 *  the start of a drive that set off straight after. */
export const OWNED_EDGE_PAD_MS = 60 * 1000;
/** A saved trip longer than this is not trusted as evidence of recording all
 *  the way through: 4cc04bac's 21 Sep shift trip ran from 15:45 to 20:30 the
 *  next day across a night of silence, and a real drive in that silence must
 *  not be dropped because of it. Shift breadcrumbs, which are the real
 *  recording, have no such limit. */
export const SAVED_TRIP_MAX_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface OwnedWindow {
  startMs: number;
  endMs: number;
}

/** Contiguous stretches of one shift's breadcrumbs (epoch ms, any order). */
export function breadcrumbRuns(times: number[], gapMs: number = SHIFT_RUN_GAP_MS): OwnedWindow[] {
  const sorted = times.filter(Number.isFinite).sort((a, b) => a - b);
  const runs: OwnedWindow[] = [];
  for (const t of sorted) {
    const last = runs[runs.length - 1];
    if (last && t - last.endMs <= gapMs) last.endMs = t;
    else runs.push({ startMs: t, endMs: t });
  }
  // A run of one fix is a moment, not a stretch of recording.
  return runs.filter((r) => r.endMs > r.startMs);
}

export interface SavedTripWindow {
  startedMs: number;
  endedMs: number;
  isManualEntry: boolean;
}

/**
 * Windows a buffered fix must not fall in: every stretch of real-shift
 * breadcrumbs, plus every saved shift trip of a plausible length (the caller
 * passes only those; see the note above). Hand-typed trips never count: their
 * times are the driver's estimate, not a recording.
 */
export function ownedWindows(
  shiftBreadcrumbs: Map<string, number[]>,
  savedTrips: SavedTripWindow[]
): OwnedWindow[] {
  const windows: OwnedWindow[] = [];
  for (const times of shiftBreadcrumbs.values()) {
    for (const r of breadcrumbRuns(times)) {
      windows.push({ startMs: r.startMs - OWNED_EDGE_PAD_MS, endMs: r.endMs + OWNED_EDGE_PAD_MS });
    }
  }
  for (const t of savedTrips) {
    if (t.isManualEntry) continue;
    if (!Number.isFinite(t.startedMs) || !Number.isFinite(t.endedMs)) continue;
    const span = t.endedMs - t.startedMs;
    if (span <= 0 || span > SAVED_TRIP_MAX_WINDOW_MS) continue;
    windows.push({ startMs: t.startedMs, endMs: t.endedMs });
  }
  return windows;
}

export function isOwned(tMs: number, windows: OwnedWindow[]): boolean {
  for (const w of windows) {
    if (tMs >= w.startMs && tMs <= w.endMs) return true;
  }
  return false;
}

/** Split buffered fixes into the ones to finalize and the second copies. */
export function partitionOwnedFixes<T extends { recorded_at: string }>(
  fixes: T[],
  windows: OwnedWindow[]
): { kept: T[]; owned: T[] } {
  const kept: T[] = [];
  const owned: T[] = [];
  for (const f of fixes) {
    const t = Date.parse(f.recorded_at);
    if (Number.isFinite(t) && isOwned(t, windows)) owned.push(f);
    else kept.push(f);
  }
  return { kept, owned };
}
