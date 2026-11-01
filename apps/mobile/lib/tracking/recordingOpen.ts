// The recording-open memory (recordingOpenRule.ts) in SQLite. Every function
// here never throws and never blocks the trip pipeline for long: it is
// diagnostics, and a failure leaves the recording exactly as it was.
//
// Headless-safe: nothing here touches React, and each call reads and writes
// tracking_state itself because the Android headless JS context is torn down
// between events.

import { AppState, Platform } from "react-native";
import { getDatabase } from "../db/index";
import { msSinceHeadlessEvent } from "./headlessMarker";
import {
  applyOpenFix,
  buildEngineSnapshot,
  newOpenId,
  OPEN_CTX_KEY,
  openFields,
  parseOpenContext,
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

export async function readOpenContext(): Promise<OpenContext | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [
      OPEN_CTX_KEY,
    ]);
    return parseOpenContext(row?.value);
  } catch {
    return null;
  }
}

async function writeOpenContext(ctx: OpenContext): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
    OPEN_CTX_KEY,
    JSON.stringify(ctx),
  ]);
}

/**
 * A new recording is about to be armed. First account for the previous one if
 * it never said how it ended, then store the new context. Returns it.
 */
export async function beginOpenContext(input: {
  reason: "motion" | "speed";
  seedTimestampMs: number | null;
}): Promise<OpenContext | null> {
  try {
    const now = Date.now();
    const prev = await readOpenContext();
    const lost = unaccountedDrop(prev, now);
    if (lost) {
      // Against the OLD id: noteRecordingDropped reads the stored context,
      // which is still the previous one here.
      const { noteRecordingDropped } = await import("./recordingDrops");
      await noteRecordingDropped(lost);
    }
    const ctx = startOpenContext({
      id: newOpenId(now),
      now,
      reason: input.reason,
      via: currentVia(),
      appState: currentAppState(),
      seedTimestampMs: input.seedTimestampMs,
    });
    await writeOpenContext(ctx);
    // The engine's state at the open, added a moment later so the open itself
    // never waits on the SDK. Android only.
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
    await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [OPEN_CTX_KEY]);
  } catch {}
}

async function captureOpenSnapshot(id: string): Promise<void> {
  try {
    const snap = await collectEngineSnapshot();
    if (!snap) return;
    const cur = await readOpenContext();
    if (!cur || cur.id !== id) return;
    await writeOpenContext({ ...cur, snap });
  } catch {}
}

/** One fix event against the current open. Cheap: one read, and a write only
 *  for the first few fixes. */
export async function noteOpenFix(ev: OpenFixEvent): Promise<void> {
  try {
    const cur = await readOpenContext();
    if (!cur) return;
    const next = applyOpenFix(cur, ev, Date.now());
    if (next) await writeOpenContext(next);
  } catch {}
}

/**
 * The current open has its outcome (a trip saved, or a drop reason). The first
 * outcome sticks, so a multi-leg journey keeps the one that explains the open.
 */
export async function markOpenOutcome(outcome: string): Promise<void> {
  try {
    if (!reasonClosesOpen(outcome)) return;
    const cur = await readOpenContext();
    if (!cur || cur.done) return;
    await writeOpenContext({ ...cur, done: outcome.slice(0, 30) });
  } catch {}
}

/** The fields a drop event quotes from the current open, or null. */
export async function currentOpenFields(): Promise<OpenFields | null> {
  const cur = await readOpenContext();
  return cur ? openFields(cur, Date.now()) : null;
}

/**
 * The engine and OS state, Android only. The SDK's answers, battery and phone
 * maker folded into a few primitives (recordingOpenRule.buildEngineSnapshot).
 */
export async function collectEngineSnapshot(): Promise<EngineSnapshot | null> {
  if (Platform.OS !== "android") return null;
  try {
    const { readNativeEngineRaw } = await import("./nativeLocation");
    const raw = await readNativeEngineRaw();
    let battery: { level: number | null; charging: boolean | null } | null = null;
    try {
      const { getBatterySnapshot } = await import("./batteryAware");
      const b = await getBatterySnapshot();
      battery = { level: b.level, charging: b.charging };
    } catch {}
    let manufacturer: string | null = null;
    try {
      const { getDeviceManufacturer } = await import("./batteryOptimisation");
      manufacturer = getDeviceManufacturer();
    } catch {}
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
