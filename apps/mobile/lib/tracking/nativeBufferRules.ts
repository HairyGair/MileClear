// Rules for keeping the recording buffer clean on the native path. No React
// Native, no SQLite, so they run under vitest.

import { fixTimeMs } from "./savedFixes";

// ── One open at a time ──────────────────────────────────────────────────────
//
// The native engine calls handleNativeLocation without awaiting it, so two
// fixes that arrive together both see "no recording yet" and both open one.
// Each open rescues, clears and plants the departure anchor: the second one
// finalizes the recording the first has just opened, or clears its fixes
// (15 Oct 2026: five to eight stale_buffer_cleared drops within three seconds
// of one open).
//
// The opens are put in a line instead. Whoever comes second waits for the
// first and then, finding the recording already open, only buffers its own
// fix: nothing is dropped, and the rescue and clear run once.

export interface SerialOpenerDeps<S> {
  /** The recording is open (auto_recording_active = 1). */
  isOpen: () => Promise<boolean>;
  /** The full open: gate, rescue, clear, arm, seed. */
  open: (seed: S) => Promise<void>;
  /** A recording is already open: just keep this fix. */
  bufferOnly: (seed: S) => Promise<void>;
}

export function createSerialOpener<S>(deps: SerialOpenerDeps<S>): (seed: S) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (seed: S) => {
    const run = async (): Promise<void> => {
      let open = false;
      try {
        open = await deps.isOpen();
      } catch {
        // Cannot tell: do the full open, as before this existed.
      }
      if (open) {
        await deps.bufferOnly(seed);
        return;
      }
      await deps.open(seed);
    };
    // Run after the previous one whether it succeeded or not.
    const mine = tail.then(run, run);
    tail = mine.then(
      () => undefined,
      () => undefined
    );
    return mine;
  };
}

// ── Reconcile: add only what is missing ─────────────────────────────────────

/**
 * The native-store fixes the JS buffer does not hold yet, oldest first and
 * without repeats. Time is the identity of a fix. Fixes with an unreadable time
 * are skipped (they cannot be placed). Only inserts follow from this: nothing
 * already in the buffer is deleted, so fixes a finalize has trimmed or saved
 * are not brought back by a refill (they are still subject to the saved-fix
 * memory).
 */
export function missingNativeFixes<T extends { timestamp: string | number }>(
  native: ReadonlyArray<T>,
  bufferTimes: ReadonlyArray<string | number>
): T[] {
  const have = new Set<number>();
  for (const b of bufferTimes) {
    const t = fixTimeMs(b);
    if (t > 0) have.add(t);
  }
  const out: T[] = [];
  for (const n of native) {
    const t = fixTimeMs(n.timestamp);
    if (t > 0 && !have.has(t)) {
      have.add(t);
      out.push(n);
    }
  }
  return out;
}

/** Newest `max` of a list that is already in time order (native stores are). */
export function newestOnly<T>(list: ReadonlyArray<T>, max: number): T[] {
  return list.length > max ? list.slice(list.length - max) : list.slice();
}

// ── Migration: collapse duplicate timestamps ────────────────────────────────

/**
 * Of buffer rows, the ids of extra copies of a fix (same normalised time),
 * keeping the lowest id of each time. Rows with an unreadable time are never
 * touched.
 */
export function duplicateRowIds(rows: ReadonlyArray<{ id: number; recorded_at: string | number }>): number[] {
  const keep = new Map<number, number>();
  const extra: number[] = [];
  const ordered = [...rows].sort((a, b) => a.id - b.id);
  for (const r of ordered) {
    const t = fixTimeMs(r.recorded_at);
    if (t <= 0) continue;
    if (keep.has(t)) extra.push(r.id);
    else keep.set(t, r.id);
  }
  return extra;
}
