// The recording-open memory (recordingOpenRule.ts) in SQLite. Every function
// here never throws: it is diagnostics, and a failure leaves the recording
// exactly as it was.
//
// Rules this file keeps (1 Nov 2026 review):
//   - Nothing on the per-fix path is awaited by the caller. noteOpenFix is
//     synchronous (it only bumps in-memory counts); flushOpenCounts writes
//     them after the fix is persisted, and stops altogether once the counts
//     are capped or the open has its outcome.
//   - No row is read-modify-written. Counters are atomic SQL increments and
//     the outcome is one INSERT OR IGNORE keyed by the open's id.
//   - A finalize pins the open it started with (beginFinalizeScope), so a new
//     recording opening while it runs cannot be given its drive's id or
//     outcome.
// Headless-safe: nothing here touches React, and state lives in SQLite
// because the Android headless JS context is torn down between events.

import { AppState, Platform } from "react-native";
import { getDatabase } from "../db/index";
import { msSinceHeadlessEvent } from "./headlessMarker";
import {
  assembleOpenContext,
  buildEngineSnapshot,
  dropBelongsToOpen,
  FIX_COUNT_CAP,
  newOpenId,
  OPEN_BUFFERED_KEY,
  OPEN_CTX_KEY,
  OPEN_DONE_PREFIX,
  OPEN_FIRST_KEY,
  OPEN_GATE_KEY,
  OPEN_KEYS_LIKE,
  openKey,
  OPEN_SEEN_KEY,
  OPEN_SNAP_KEY,
  openFields,
  reasonClosesOpen,
  startOpenContext,
  unaccountedDrop,
  type EngineSnapshot,
  type OpenContext,
  type OpenFields,
  type OpenFixEvent,
  type OpenVia,
} from "./recordingOpenRule";

const HEADLESS_WINDOW_MS = 30 * 1000;
/** How long "this open is done or capped" is trusted before it is re-read, so
 *  an open begun by the other JS context is picked up. */
const CACHE_TTL_MS = 60 * 1000;

function currentAppState(): string | null {
  try {
    return AppState.currentState ?? null;
  } catch {
    return null;
  }
}

/** Did the headless task hand us this event (the app was not on screen)? */
export function currentVia(): OpenVia {
  const state = currentAppState();
  return msSinceHeadlessEvent(Date.now()) < HEADLESS_WINDOW_MS && state !== "active" ? "headless" : "live";
}

// ── Reading ────────────────────────────────────────────────────────────────

export async function readOpenContext(): Promise<OpenContext | null> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM tracking_state WHERE key LIKE ?",
      [OPEN_KEYS_LIKE]
    );
    return assembleOpenContext(rows);
  } catch {
    return null;
  }
}

// ── Finalize scope ─────────────────────────────────────────────────────────

let scope: OpenContext | null = null;

/** A finalize is starting: pin the open it is about to save or drop. */
export async function beginFinalizeScope(): Promise<void> {
  scope = await readOpenContext();
}

export function endFinalizeScope(): void {
  scope = null;
}

/** The open a finalize in progress is working on, if one is pinned. */
export function finalizeScopeContext(): OpenContext | null {
  return scope;
}

/**
 * Is a finalize running anywhere? The headless task and the app are separate
 * JS runtimes, so the in-process flag cannot see the other one; the row
 * finalize writes can. Fresh (under two minutes) means "still being saved".
 */
export async function finalizeRecentlyStarted(now: number): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'finalizing_trip_at'"
    );
    const at = row ? Number(row.value) : 0;
    return Number.isFinite(at) && at > 0 && now - at < 2 * 60 * 1000;
  } catch {
    return false;
  }
}

// ── Begin / end ────────────────────────────────────────────────────────────

interface CountCache {
  id: string | null;
  stop: boolean;
  seenSent: number;
  loadedAt: number;
}
let cache: CountCache | null = null;
let pendingSeen = 0;
let pendingBuffered = 0;
let pendingGate: string | null = null;
let flushing = false;

/**
 * A new recording is about to be armed. Account for the previous one if it
 * never said how it ended (not awaited, and skipped while a finalize or a kept
 * buffer still owns that drive), then store the new context. Returns it.
 */
export async function beginOpenContext(input: {
  reason: "motion" | "speed";
  seedTimestampMs: number | null;
  /** A save of the previous drive is still running or its buffer was kept:
   *  it will report its own outcome, so say nothing about it. */
  previousStillOwned?: boolean;
}): Promise<OpenContext | null> {
  try {
    const now = Date.now();
    const owned = input.previousStillOwned || (await finalizeRecentlyStarted(now));
    const prev = owned ? null : await readOpenContext();
    const lost = unaccountedDrop(prev);
    if (lost && prev) {
      // Not awaited: it is ~8 SQLite operations and the recording must not
      // wait for them. Explicit open fields so it is filed under the OLD id.
      void import("./recordingDrops")
        .then((m) => m.noteRecordingDropped({ ...lost, open: openFields(prev, now) }))
        .catch(() => {});
    }
    const ctx = startOpenContext({
      id: newOpenId(now),
      now,
      reason: input.reason,
      via: currentVia(),
      appState: currentAppState(),
      seedTimestampMs: input.seedTimestampMs,
    });
    const db = await getDatabase();
    await db.runAsync("DELETE FROM tracking_state WHERE key LIKE ?", [OPEN_KEYS_LIKE]);
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      OPEN_CTX_KEY,
      JSON.stringify({
        id: ctx.id,
        at: ctx.at,
        reason: ctx.reason,
        via: ctx.via,
        appState: ctx.appState,
        seedAgeMs: ctx.seedAgeMs,
      }),
    ]);
    cache = { id: ctx.id, stop: false, seenSent: 0, loadedAt: now };
    pendingSeen = 0;
    pendingBuffered = 0;
    pendingGate = null;
    void captureOpenSnapshot(ctx.id);
    return ctx;
  } catch {
    return null;
  }
}

/** The open was refused after the context was written (a Not driving tap). */
export async function discardOpenContext(id: string): Promise<void> {
  try {
    const cur = await readOpenContext();
    if (cur?.id !== id) return;
    const db = await getDatabase();
    await db.runAsync("DELETE FROM tracking_state WHERE key LIKE ?", [OPEN_KEYS_LIKE]);
    cache = null;
  } catch {}
}

async function captureOpenSnapshot(id: string): Promise<void> {
  try {
    const snap = await collectEngineSnapshot();
    if (!snap) return;
    const db = await getDatabase();
    // Only if this open is still the current one: its own row, so no other
    // writer can be overwritten.
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM tracking_state WHERE key = ? AND value LIKE ?)",
      [openKey(OPEN_SNAP_KEY, id), JSON.stringify(snap), OPEN_CTX_KEY, `%"id":"${id}"%`]
    );
  } catch {}
}

// ── Per-fix counting (hot path) ────────────────────────────────────────────

/**
 * Note one fix event. Synchronous and free: it bumps an in-memory count and
 * returns. The counts reach SQLite in flushOpenCounts, after the fix itself
 * has been persisted. Nothing happens once the open is capped or done.
 */
export function noteOpenFix(ev: OpenFixEvent): void {
  if (cache?.stop && Date.now() - cache.loadedAt < CACHE_TTL_MS) return;
  if (ev.kind === "seen") pendingSeen++;
  else if (ev.kind === "buffered") pendingBuffered++;
  else pendingGate = ev.gate.slice(0, 30);
}

/** Write the pending counts. Call without await, after the fix is stored. */
export async function flushOpenCounts(): Promise<void> {
  if (flushing) return;
  if (pendingSeen === 0 && pendingBuffered === 0 && pendingGate === null) return;
  flushing = true;
  try {
    const now = Date.now();
    if (!cache || (cache.stop && now - cache.loadedAt >= CACHE_TTL_MS)) {
      const cur = await readOpenContext();
      cache = { id: cur?.id ?? null, stop: !cur || !!cur.done || cur.seen >= FIX_COUNT_CAP, seenSent: cur?.seen ?? 0, loadedAt: now };
    }
    if (cache.stop) {
      pendingSeen = pendingBuffered = 0;
      pendingGate = null;
      return;
    }
    const id = cache.id;
    if (!id) {
      pendingSeen = pendingBuffered = 0;
      pendingGate = null;
      return;
    }
    const seen = Math.min(pendingSeen, Math.max(0, FIX_COUNT_CAP - cache.seenSent));
    const buffered = Math.min(pendingBuffered, FIX_COUNT_CAP);
    const gate = pendingGate;
    pendingSeen = pendingBuffered = 0;
    pendingGate = null;
    const db = await getDatabase();
    const bump = `INSERT INTO tracking_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + CAST(excluded.value AS INTEGER)`;
    if (seen > 0) {
      await db.runAsync(bump, [openKey(OPEN_SEEN_KEY, id), String(seen)]);
      await db.runAsync("INSERT OR IGNORE INTO tracking_state (key, value) VALUES (?, ?)", [
        openKey(OPEN_FIRST_KEY, id),
        String(now),
      ]);
      cache.seenSent += seen;
    }
    if (buffered > 0) await db.runAsync(bump, [openKey(OPEN_BUFFERED_KEY, id), String(buffered)]);
    if (gate) {
      await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
        openKey(OPEN_GATE_KEY, id),
        gate,
      ]);
    }
    if (cache.seenSent >= FIX_COUNT_CAP) cache.stop = true;
  } catch {
  } finally {
    flushing = false;
    // A fix noted while this flush was writing (the last one of a recording
    // has no later fix to carry it): write it now.
    if (pendingSeen > 0 || pendingBuffered > 0 || pendingGate !== null) void flushOpenCounts();
  }
}

// ── Outcomes ───────────────────────────────────────────────────────────────

/**
 * The open `id` has its outcome (a trip saved, or a drop reason). Keyed by the
 * id, first outcome sticks, and an outcome for an open that is no longer the
 * current one cannot touch the new one.
 */
export async function markOpenOutcome(id: string | null | undefined, outcome: string): Promise<void> {
  try {
    if (!id || !reasonClosesOpen(outcome)) return;
    const db = await getDatabase();
    await db.runAsync("INSERT OR IGNORE INTO tracking_state (key, value) VALUES (?, ?)", [
      OPEN_DONE_PREFIX + id,
      outcome.slice(0, 30),
    ]);
    if (cache?.id === id) cache.stop = true;
  } catch {}
}

/**
 * Start Trip, a shift or "Not driving" is clearing an armed automatic
 * recording: that is the open's outcome. Only when the flag was armed.
 */
export async function closeArmedOpen(outcome: string): Promise<void> {
  try {
    const db = await getDatabase();
    const armed = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
    );
    if (armed?.value !== "1") return;
    // The CURRENT open, never the pinned one: a tap or takeover during an old
    // drive's save is about the recording that is armed now.
    const cur = await readOpenContext();
    await markOpenOutcome(cur?.id, outcome);
  } catch {}
}

/**
 * What a drop event should say about the open, and which open it closes.
 * Inside a finalize it is the open that finalize pinned; outside, the current
 * one, but only if the drop's fixes belong to it (dropBelongsToOpen).
 */
export async function resolveDropOpen(input: {
  open?: OpenFields | null;
  startedAt?: string | null;
  /** The finalize itself is reporting this: use the open it pinned. */
  pinned?: boolean;
}): Promise<{ fields: OpenFields | null; closeId: string | null }> {
  try {
    if (input.open) return { fields: input.open, closeId: input.open.openId };
    // The pinned open only for the finalize's own reports; any other drop
    // during a save (a tap, a takeover) is about the current recording. Either
    // way the fixes must belong to the open: an orphan sweep's old fixes are
    // not filed under, or closing, a recording they are not part of.
    const ctx = input.pinned && scope ? scope : await readOpenContext();
    if (!ctx) return { fields: null, closeId: null };
    const startedMs = input.startedAt ? Date.parse(input.startedAt) : Number.NaN;
    if (!dropBelongsToOpen(ctx, Number.isFinite(startedMs) ? startedMs : null)) {
      return { fields: null, closeId: null };
    }
    return { fields: openFields(ctx, Date.now()), closeId: ctx.id };
  } catch {
    return { fields: null, closeId: null };
  }
}

// ── Engine snapshot ────────────────────────────────────────────────────────

/** Whole snapshot bound: the SDK, battery and maker reads share one deadline. */
const SNAPSHOT_DEADLINE_MS = 2000;

/**
 * The engine and OS state, Android only. The SDK's answers, battery and phone
 * maker folded into a few primitives (recordingOpenRule.buildEngineSnapshot).
 * One 2 s deadline for everything; null if it is not met.
 */
export async function collectEngineSnapshot(): Promise<EngineSnapshot | null> {
  if (Platform.OS !== "android") return null;
  const work = (async (): Promise<EngineSnapshot | null> => {
    try {
      const { readNativeEngineRaw } = await import("./nativeLocation");
      const [raw, battery, manufacturer] = await Promise.all([
        readNativeEngineRaw(),
        (async () => {
          try {
            const { getBatterySnapshot } = await import("./batteryAware");
            const b = await getBatterySnapshot();
            return { level: b.level, charging: b.charging };
          } catch {
            return null;
          }
        })(),
        (async () => {
          try {
            const { getDeviceManufacturer } = await import("./batteryOptimisation");
            return getDeviceManufacturer();
          } catch {
            return null;
          }
        })(),
      ]);
      return buildEngineSnapshot({
        state: raw?.state ?? null,
        provider: raw?.provider ?? null,
        powerSave: raw?.powerSave ?? null,
        battery,
        manufacturer,
      });
    } catch {
      return null;
    }
  })();
  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), SNAPSHOT_DEADLINE_MS));
  return Promise.race([work, deadline]);
}

/** Seconds since the newest native fix the JS side stamped, or null. */
export async function nativeFixAgeSec(): Promise<number | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'last_native_location_at'"
    );
    const at = row ? Number(row.value) : 0;
    if (!Number.isFinite(at) || at <= 0) return null;
    return Math.max(0, Math.round((Date.now() - at) / 1000));
  } catch {
    return null;
  }
}
