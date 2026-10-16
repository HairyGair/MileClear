// A memory of the exact GPS fixes that already went into a saved trip.
//
// Why: the phone could save the same stretch of driving twice. The native
// location store (RNBG) keeps its fixes until a finalize clears it, and that
// clear is skipped under a shift or Start Trip lock and never runs if Android
// kills the app between the save and the clear. The next finalize then refills
// the buffer from the store, the saved fixes and the new driving join into one
// leg, and either the whole leg is saved again (a doubled trip) or the whole
// leg is dropped as "already saved" and the new driving with it (e84b24f3,
// 15 Oct 2026: 141 coordinates dropped, about ten minutes of real driving
// lost). Nothing compared fixes one by one against fixes already saved.
//
// This is that comparison. A fix is "saved" when its exact timestamp is in
// saved_fix_times. Rows are written only AFTER a save is durable on the phone
// (a local trip row, a queued create, a merge written locally), so the only
// failure the ordering allows is a missing row, which can cost a duplicate the
// server trims, never an extra row that hides real driving. Prefer a
// duplicate to a loss.
//
// Pure rules plus small helpers that take the database handle, so it runs
// under vitest (detection.ts pulls in the native stack).

import { normaliseRecordedAt } from "./finalizeSaveRule";

/** The native store keeps about three days, so a longer memory buys nothing. */
export const SAVED_FIX_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

/** Largest number of timestamps per INSERT (3 parameters a row, well under
 *  SQLite's 999-variable cap). */
const INSERT_CHUNK = 150;

/** The minimal database surface used here. expo-sqlite satisfies it. */
export interface SavedFixDb {
  runAsync(sql: string, params: Array<string | number | null>): Promise<unknown>;
  getAllAsync<T>(sql: string, params: Array<string | number | null>): Promise<T[]>;
}

/** recorded_at is an ISO string from the JS engine and can be a raw native
 *  epoch (ms, or seconds) from the native engine: read either. 0 = unreadable. */
export function fixTimeMs(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const iso = normaliseRecordedAt(v);
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
}

export interface BufferRow {
  id: number;
  recorded_at: string;
  speed?: number | null;
  accuracy?: number | null;
  activity?: string | null;
}

/**
 * The synthetic departure anchor planted by plantNativeAnchorBackfill: speed 0,
 * accuracy 50, no motion activity, a timestamp of its own. It stands for "the
 * parked spot", not a fix the phone recorded, so this memory never judges it.
 * A real fix that happens to look the same is kept too, which costs at worst a
 * duplicate.
 */
export function isAnchorSignature(r: BufferRow): boolean {
  return r.speed === 0 && r.accuracy === 50 && (r.activity === null || r.activity === undefined);
}

export interface SavedFixPlan {
  /** detection_coordinates ids to delete. */
  removeIds: number[];
  removed: number;
  /** Fixes left in the buffer (new driving plus its joining points). */
  kept: number;
  /** Every real fix was already saved: nothing new in the buffer. */
  allSaved: boolean;
  /** Saved fixes kept only as the joining point before new driving. */
  joiningKept: number;
}

/**
 * Which buffered fixes are already saved, and which to keep.
 *
 * Removed: a fix whose exact time is in `savedMs`. Kept: everything else, plus
 * the LAST saved fix directly before each run of new fixes. That one stays as
 * the joining point so the continuation starts where the saved trip stopped
 * (finalize can then merge it onto that trip) instead of starting from
 * nowhere. If nothing new remains, nothing is kept.
 */
export function planSavedFixRemoval(rows: ReadonlyArray<BufferRow>, savedMs: ReadonlySet<number>): SavedFixPlan {
  const empty: SavedFixPlan = { removeIds: [], removed: 0, kept: rows.length, allSaved: false, joiningKept: 0 };
  if (rows.length === 0 || savedMs.size === 0) return empty;
  const ordered = rows
    .map((r) => ({ r, ms: fixTimeMs(r.recorded_at) }))
    // Unreadable times are never judged: they stay.
    .sort((a, b) => a.ms - b.ms || a.r.id - b.r.id);
  const isSaved = (x: { r: BufferRow; ms: number }): boolean =>
    x.ms > 0 && savedMs.has(x.ms) && !isAnchorSignature(x.r);
  const flags = ordered.map(isSaved);
  const anySaved = flags.some(Boolean);
  if (!anySaved) return empty;
  const anyNew = flags.some((f) => !f);
  if (!anyNew) {
    return {
      removeIds: ordered.map((x) => x.r.id),
      removed: ordered.length,
      kept: 0,
      allSaved: true,
      joiningKept: 0,
    };
  }
  const removeIds: number[] = [];
  let joiningKept = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (!flags[i]) continue;
    // The last saved fix before a new one is the joining point.
    if (i + 1 < ordered.length && !flags[i + 1]) {
      joiningKept++;
      continue;
    }
    removeIds.push(ordered[i].r.id);
  }
  return {
    removeIds,
    removed: removeIds.length,
    kept: ordered.length - removeIds.length,
    allSaved: false,
    joiningKept,
  };
}

export interface SameStartSplit {
  /** Fixes at or before the saved trip's end. */
  savedCount: number;
  /** Fixes after it: driving the saved trip does not cover. */
  newCount: number;
  /** Number of leading saved fixes that can go (all but the joining one). */
  removableLeading: number;
}

/**
 * A leg starts at the exact time a saved trip started (the old same_start_saved
 * test). The saved trip covers the fixes up to its own end; anything after is
 * new driving, which the old test dropped with the rest of the leg.
 * `legMs` ascending.
 */
export function splitLegAtSavedEnd(legMs: ReadonlyArray<number>, savedEndMs: number): SameStartSplit {
  if (!Number.isFinite(savedEndMs)) return { savedCount: 0, newCount: legMs.length, removableLeading: 0 };
  let savedCount = 0;
  while (savedCount < legMs.length && legMs[savedCount] <= savedEndMs) savedCount++;
  const newCount = legMs.length - savedCount;
  return { savedCount, newCount, removableLeading: newCount > 0 ? Math.max(0, savedCount - 1) : savedCount };
}

/** Fixes with a time between two instants (inclusive), for recording what a
 *  save covered. */
export function fixesWithin<T extends { recorded_at: string | number }>(
  fixes: ReadonlyArray<T>,
  fromMs: number,
  toMs: number
): T[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return [];
  return fixes.filter((f) => {
    const ms = fixTimeMs(f.recorded_at);
    return ms > 0 && ms >= fromMs && ms <= toMs;
  });
}

/**
 * Remember these fixes as saved. Call only once the save is durable (local
 * trip row written, create queued, merge written). Never throws: a failure
 * leaves the fixes unrecorded, which can only cost a duplicate.
 * Returns how many timestamps were offered.
 */
export async function recordSavedFixes(
  db: SavedFixDb,
  fixes: ReadonlyArray<{ recorded_at: string | number }>,
  tripKey: string,
  now: number = Date.now()
): Promise<number> {
  try {
    const times = new Set<number>();
    for (const f of fixes) {
      const ms = fixTimeMs(f.recorded_at);
      if (ms > 0) times.add(ms);
    }
    if (times.size === 0) return 0;
    const list = [...times];
    for (let i = 0; i < list.length; i += INSERT_CHUNK) {
      const chunk = list.slice(i, i + INSERT_CHUNK);
      const placeholders = chunk.map(() => "(?, ?, ?)").join(", ");
      const params: (number | string)[] = [];
      for (const ms of chunk) params.push(ms, tripKey, now);
      await db.runAsync(
        `INSERT OR IGNORE INTO saved_fix_times (recorded_ms, trip_key, saved_at) VALUES ${placeholders}`,
        params
      );
    }
    await pruneSavedFixTimes(db, now);
    return list.length;
  } catch {
    return 0;
  }
}

/** Forget anything older than the native store could still hold. Never throws. */
export async function pruneSavedFixTimes(db: SavedFixDb, now: number = Date.now()): Promise<void> {
  try {
    await db.runAsync("DELETE FROM saved_fix_times WHERE saved_at < ?", [now - SAVED_FIX_RETENTION_MS]);
  } catch {}
}

/**
 * Remove from the buffer the fixes a saved trip already holds (see
 * planSavedFixRemoval). Returns the plan that was applied, or null when
 * nothing was removed or anything failed (the buffer is then as it was).
 */
export async function dropSavedFixesFromBuffer(db: SavedFixDb): Promise<SavedFixPlan | null> {
  try {
    const rows = await db.getAllAsync<BufferRow>(
      "SELECT id, recorded_at, speed, accuracy, activity FROM detection_coordinates",
      []
    );
    if (rows.length === 0) return null;
    let minMs = Number.POSITIVE_INFINITY;
    let maxMs = 0;
    for (const r of rows) {
      const ms = fixTimeMs(r.recorded_at);
      if (ms <= 0) continue;
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }
    if (!Number.isFinite(minMs) || maxMs === 0) return null;
    const saved = await loadSavedFixTimes(db, minMs, maxMs);
    if (saved.size === 0) return null;
    const plan = planSavedFixRemoval(rows, saved);
    if (plan.removed === 0) return null;
    for (let i = 0; i < plan.removeIds.length; i += 400) {
      const chunk = plan.removeIds.slice(i, i + 400);
      await db.runAsync(
        `DELETE FROM detection_coordinates WHERE id IN (${chunk.map(() => "?").join(",")})`,
        chunk
      );
    }
    return plan;
  } catch {
    return null;
  }
}

export type SameStartDecision =
  /** Every fix is covered by the saved trip: a copy, drop it. */
  | { kind: "duplicate" }
  /** New driving follows: remove these rows (by id), remember `covered`. */
  | {
      kind: "trim";
      removeIds: number[];
      covered: Array<{ recorded_at: string }>;
      savedCount: number;
      newCount: number;
    }
  /** New driving, but nothing can be trimmed safely: save it as it is. */
  | { kind: "continue"; savedCount: number; newCount: number };

/**
 * A leg starts at the exact time of a saved trip. `leg` is the processed leg
 * as read from the buffer (rows with ids), `filtered` the cleaned trace that
 * would be saved. Rows are removed by id, and only when every one has an id.
 */
export function decideSameStart(
  leg: ReadonlyArray<{ id?: number; recorded_at: string }>,
  filtered: ReadonlyArray<{ recorded_at: string }>,
  savedEndMs: number
): SameStartDecision {
  const split = splitLegAtSavedEnd(
    filtered.map((c) => fixTimeMs(c.recorded_at)),
    savedEndMs
  );
  if (split.newCount === 0) return { kind: "duplicate" };
  if (split.removableLeading > 0 && filtered.length > 0 && leg.length > 0) {
    const joiningMs = fixTimeMs(filtered[split.savedCount - 1].recorded_at);
    const firstMs = Math.min(fixTimeMs(filtered[0].recorded_at), fixTimeMs(leg[0].recorded_at));
    const covered = fixesWithin(leg, firstMs, joiningMs);
    const removable = covered.filter((c) => fixTimeMs(c.recorded_at) < joiningMs);
    const ids = removable.map((c) => c.id);
    if (removable.length > 0 && ids.every((id): id is number => typeof id === "number")) {
      return { kind: "trim", removeIds: ids, covered, savedCount: split.savedCount, newCount: split.newCount };
    }
  }
  return { kind: "continue", savedCount: split.savedCount, newCount: split.newCount };
}

/**
 * Apply a "trim" decision: remember the covered fixes FIRST (they are in a
 * saved trip, so remembering them can only be right), then delete the rows by
 * id. Returns how many rows went.
 */
export async function applySameStartTrim(
  db: SavedFixDb,
  decision: Extract<SameStartDecision, { kind: "trim" }>,
  tripKey: string
): Promise<number> {
  await recordSavedFixes(db, decision.covered, tripKey);
  let removed = 0;
  for (let i = 0; i < decision.removeIds.length; i += 400) {
    const chunk = decision.removeIds.slice(i, i + 400);
    await db.runAsync(
      `DELETE FROM detection_coordinates WHERE id IN (${chunk.map(() => "?").join(",")})`,
      chunk
    );
    removed += chunk.length;
  }
  return removed;
}

/** The saved fix times between two instants, as a set. Empty on any error
 *  (nothing is dropped when the memory cannot be read). */
export async function loadSavedFixTimes(db: SavedFixDb, fromMs: number, toMs: number): Promise<Set<number>> {
  try {
    const rows = await db.getAllAsync<{ recorded_ms: number }>(
      "SELECT recorded_ms FROM saved_fix_times WHERE recorded_ms >= ? AND recorded_ms <= ?",
      [fromMs, toMs]
    );
    return new Set(rows.map((r) => Number(r.recorded_ms)));
  } catch {
    return new Set();
  }
}
