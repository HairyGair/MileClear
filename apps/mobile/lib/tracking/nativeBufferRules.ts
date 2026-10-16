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

/** How long a queued open waits for the one ahead before acting anyway. An
 *  open that never finishes (a hung native call) must not freeze recording. */
export const OPEN_WAIT_LIMIT_MS = 15_000;

export function createSerialOpener<S>(
  deps: SerialOpenerDeps<S>,
  waitLimitMs: number = OPEN_WAIT_LIMIT_MS
): (seed: S) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  const waitForPrevious = (prev: Promise<void>): Promise<void> =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, waitLimitMs);
      prev.then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        () => {
          clearTimeout(timer);
          resolve();
        }
      );
    });
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
    // Run after the previous one, whether it succeeded or not, or after the
    // wait limit if it is stuck: then the fix is buffered when a recording is
    // open and otherwise a full open is done, as before this queue existed.
    const mine = waitForPrevious(tail).then(run);
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

export interface ReconcileDb {
  runAsync(sql: string, params: Array<string | number | null>): Promise<unknown>;
  getAllAsync<T>(sql: string, params: Array<string | number | null>): Promise<T[]>;
  execAsync(sql: string): Promise<unknown>;
}

export interface NativeFixLike {
  timestamp: string | number;
  coords?: { latitude: number; longitude: number; speed?: number | null; accuracy?: number | null } | null;
  activity?: { type?: string | null; confidence?: number | null } | null;
}

/**
 * Insert into the buffer only the native-store fixes it is missing (insert
 * only: nothing already there is deleted, so a refill cannot bring back fixes
 * a finalize trimmed, and the saved-fix memory strips the ones already
 * saved). No count check: a buffer with MORE rows than the native store can
 * still lack some of its fixes. The flight cut is not harmed: a re-run
 * re-detects the same flight from the fixes and cuts it again
 * (planFlightCut is deterministic and keeps its markers). The newest `max`
 * missing fixes are added. Returns what was added and left out.
 */
export async function insertMissingNativeFixes(
  db: ReconcileDb,
  native: ReadonlyArray<NativeFixLike>,
  max: number
): Promise<{ added: number; leftOut: number }> {
  const haveRows = await db.getAllAsync<{ recorded_at: string }>("SELECT recorded_at FROM detection_coordinates", []);
  const missing = missingNativeFixes(
    native.filter((l) => l.coords),
    haveRows.map((r) => r.recorded_at)
  );
  const kept = newestOnly(missing, max);
  if (kept.length === 0) return { added: 0, leftOut: 0 };
  await db.execAsync("BEGIN IMMEDIATE");
  try {
    const CHUNK = 100; // 8 params/row, safely under SQLite's 999-variable cap
    for (let i = 0; i < kept.length; i += CHUNK) {
      const rows = kept.slice(i, i + CHUNK);
      const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const params: (number | string | null)[] = [];
      for (const loc of rows) {
        const c = loc.coords!;
        params.push(
          c.latitude,
          c.longitude,
          c.speed ?? null,
          c.accuracy ?? null,
          loc.activity?.type ?? null,
          typeof loc.activity?.confidence === "number" ? loc.activity.confidence : null,
          typeof loc.timestamp === "number" ? String(loc.timestamp) : loc.timestamp,
          fixTimeMs(loc.timestamp) || null
        );
      }
      await db.runAsync(
        `INSERT OR IGNORE INTO detection_coordinates (lat, lng, speed, accuracy, activity, activity_confidence, recorded_at, recorded_ms) VALUES ${placeholders}`,
        params
      );
    }
    await db.execAsync("COMMIT");
  } catch (err) {
    await db.execAsync("ROLLBACK").catch(() => {});
    throw err;
  }
  return { added: kept.length, leftOut: missing.length - kept.length };
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
