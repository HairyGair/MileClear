// Battery over time (24 Sep 2026). Drivers left over battery drain (Rowena, a
// dog walker: "it was draining my battery") and we had no way to see it: the
// diagnostic dump carried one battery snapshot, taken when the app opened.
//
// This keeps a small series on the phone: one sample at most every ten
// minutes while the tracking engine is awake (a fix or a heartbeat reached
// JS), labelled with what the engine was doing, plus one when a dump is
// built. The dump ships the last 72 hours, so drain per hour unplugged can be
// read per driver and per engine state, before and after any change.
//
// Never throws, never awaits anything slow on the tracking path. expo-battery
// is already a dependency (batteryAware.ts) and reports on both platforms.

import { getDatabase } from "../db/index";
import { getBatterySnapshot } from "./batteryAware";

export const BATTERY_SAMPLE_GAP_MS = 10 * 60 * 1000;
export const BATTERY_SAMPLE_KEEP_MS = 72 * 60 * 60 * 1000;
export const BATTERY_SAMPLE_CAP = 600;

/** What the engine was doing when the sample was taken. */
export type BatteryContext = "recording" | "keepalive" | "awake" | "foreground";

const CONTEXT_CODE: Record<BatteryContext, number> = {
  recording: 1,
  keepalive: 2,
  awake: 3,
  foreground: 4,
};

export interface BatterySampleRow {
  recorded_at: number; // epoch ms
  level: number | null; // 0..1
  charging: number | null; // 1 / 0
  low_power: number | null; // 1 / 0
  context: string;
}

/** True when enough time has passed since the last sample. */
export function shouldRecordBatterySample(lastAtMs: number | null, nowMs: number): boolean {
  if (lastAtMs == null || !Number.isFinite(lastAtMs)) return true;
  if (nowMs < lastAtMs) return true; // clock went back: take a fresh one
  return nowMs - lastAtMs >= BATTERY_SAMPLE_GAP_MS;
}

/**
 * Compact form for the dump: [epochSeconds, percent, charging, lowPower,
 * context], oldest first. Nulls stay null so "unknown" is never read as 0.
 */
export function compactBatterySeries(
  rows: BatterySampleRow[]
): Array<[number, number | null, number | null, number | null, number]> {
  return [...rows]
    .sort((a, b) => a.recorded_at - b.recorded_at)
    .map((r) => [
      Math.round(r.recorded_at / 1000),
      r.level == null ? null : Math.round(r.level * 100),
      r.charging,
      r.low_power,
      CONTEXT_CODE[r.context as BatteryContext] ?? 0,
    ]);
}

/**
 * Percentage points lost per hour across consecutive unplugged samples, or
 * null when there is not enough unplugged time to say. Stretches where the
 * phone was charging, or the level went up, are skipped rather than averaged.
 */
export function unpluggedDrainPerHour(rows: BatterySampleRow[]): number | null {
  const sorted = [...rows].sort((a, b) => a.recorded_at - b.recorded_at);
  let lost = 0;
  let ms = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a.level == null || b.level == null) continue;
    if (a.charging !== 0 || b.charging !== 0) continue;
    if (b.level > a.level) continue;
    const gap = b.recorded_at - a.recorded_at;
    if (gap <= 0 || gap > 2 * 60 * 60 * 1000) continue; // a long gap says nothing about the engine
    lost += (a.level - b.level) * 100;
    ms += gap;
  }
  if (ms < 30 * 60 * 1000) return null;
  return Math.round((lost / (ms / 3_600_000)) * 10) / 10;
}

let inFlight = false;
/** Last sample this JS context knows about, so a fix every second while
 *  driving costs a comparison, not a database read. A fresh (headless)
 *  context starts at null and reads the table once. */
let lastKnownSampleAt: number | null = null;

/** Record a sample if one is due. Fire and forget from any engine callback. */
export async function recordBatterySample(context?: BatteryContext): Promise<void> {
  const now = Date.now();
  if (context !== "foreground" && lastKnownSampleAt != null && !shouldRecordBatterySample(lastKnownSampleAt, now)) {
    return;
  }
  if (inFlight) return;
  inFlight = true;
  try {
    const db = await getDatabase();
    const last = await db.getFirstAsync<{ t: number | null }>(
      "SELECT MAX(recorded_at) AS t FROM battery_samples"
    );
    lastKnownSampleAt = last?.t ?? null;
    if (!shouldRecordBatterySample(lastKnownSampleAt, now)) return;

    let ctx = context;
    if (!ctx) {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        "SELECT key, value FROM tracking_state WHERE key IN ('auto_recording_active', 'keepalive_until')"
      );
      const state = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      ctx =
        state.auto_recording_active === "1"
          ? "recording"
          : Number(state.keepalive_until ?? 0) > now
            ? "keepalive"
            : "awake";
    }

    const snap = await getBatterySnapshot();
    await db.runAsync(
      "INSERT INTO battery_samples (recorded_at, level, charging, low_power, context) VALUES (?, ?, ?, ?, ?)",
      [
        now,
        snap.level,
        snap.charging == null ? null : snap.charging ? 1 : 0,
        snap.lowPowerMode == null ? null : snap.lowPowerMode ? 1 : 0,
        ctx,
      ]
    );
    lastKnownSampleAt = now;
    await db.runAsync("DELETE FROM battery_samples WHERE recorded_at < ?", [now - BATTERY_SAMPLE_KEEP_MS]);
    await db.runAsync(
      `DELETE FROM battery_samples WHERE id NOT IN (SELECT id FROM battery_samples ORDER BY recorded_at DESC LIMIT ${BATTERY_SAMPLE_CAP})`
    );
  } catch {
    // best-effort: never let a battery sample disturb tracking
  } finally {
    inFlight = false;
  }
}

/** The last 72 hours, compact, for the diagnostic dump. */
export async function getBatterySeriesForDump(): Promise<ReturnType<typeof compactBatterySeries>> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<BatterySampleRow>(
      "SELECT recorded_at, level, charging, low_power, context FROM battery_samples WHERE recorded_at >= ? ORDER BY recorded_at ASC",
      [Date.now() - BATTERY_SAMPLE_KEEP_MS]
    );
    return compactBatterySeries(rows);
  } catch {
    return [];
  }
}
