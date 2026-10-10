// SQLite side of the 24-hour tracking log (see trackingLog.ts for what goes in
// and why). Written by logDetectionEvent alongside detection_events, read by
// the diagnostic dump and the missing-trip report. Every function is
// best-effort: a logging failure must never reach the code that logged.

import { scrubDiagnosticEventData } from "@mileclear/shared";
import { getDatabase } from "../db/index";
import {
  buildReportSnapshot,
  TRACKING_LOG_CAP,
  TRACKING_LOG_WINDOW_MS,
  clampTrackingLogData,
  shouldWriteTrackingLog,
  type LogRow,
} from "./trackingLog";

type DB = Awaited<ReturnType<typeof getDatabase>>;

/**
 * Prune at most once per this many writes. The time cut and the row cap are
 * both cheap on the primary key, but a write path that runs on every motion
 * change and app open does not need to pay for them each time.
 */
const PRUNE_EVERY = 25;
let writesSincePrune = PRUNE_EVERY; // prune on the first write of a process

export async function appendTrackingLog(
  db: DB,
  recordedAt: string,
  event: string,
  payload: string | null
): Promise<void> {
  try {
    if (!shouldWriteTrackingLog(event, payload)) return;
    await db.runAsync("INSERT INTO tracking_log (recorded_at, event, data) VALUES (?, ?, ?)", [
      recordedAt,
      event,
      clampTrackingLogData(payload),
    ]);
    writesSincePrune++;
    if (writesSincePrune >= PRUNE_EVERY) {
      writesSincePrune = 0;
      const cutoff = new Date(Date.now() - TRACKING_LOG_WINDOW_MS).toISOString();
      await db.runAsync("DELETE FROM tracking_log WHERE recorded_at < ?", [cutoff]);
      await db.runAsync(
        "DELETE FROM tracking_log WHERE id <= (SELECT id FROM tracking_log ORDER BY id DESC LIMIT 1 OFFSET ?)",
        [TRACKING_LOG_CAP]
      );
    }
  } catch {
    // Best-effort, like detection_events
  }
}

/** Every row from the last 24 h, newest first, at most TRACKING_LOG_CAP. */
export async function getTrackingLog(): Promise<LogRow[]> {
  try {
    const db = await getDatabase();
    const cutoff = new Date(Date.now() - TRACKING_LOG_WINDOW_MS).toISOString();
    return await db.getAllAsync<LogRow>(
      "SELECT recorded_at, event, data FROM tracking_log WHERE recorded_at >= ? ORDER BY id DESC LIMIT ?",
      [cutoff, TRACKING_LOG_CAP]
    );
  } catch {
    return [];
  }
}

/**
 * What a missing-trip report carries from the phone (10 Oct 2026): the slice
 * of the tracking and lifecycle logs around the reported departure, and a
 * small picture of the phone's tracking state now. Scrubbed of coordinates
 * before it leaves the phone; the API scrubs again on receipt.
 *
 * Never throws and never takes long: anything that fails is left out, because
 * the report itself matters more than what rides along with it.
 */
export async function collectMissingTripPhoneLog(departAt: Date): Promise<{
  from: string;
  to: string;
  oldestHeld: string | null;
  truncated: boolean;
  rows: Array<[string, string, string | null]>;
  state: Record<string, unknown>;
} | null> {
  try {
    // Lazy: detection imports this module, so a static edge would be a cycle.
    const detection = await import("./detection");
    const [tracking, lifecycle] = await Promise.all([getTrackingLog(), detection.getRecentLifecycleEvents()]);
    const snap = buildReportSnapshot(departAt.getTime(), tracking, lifecycle);
    return {
      ...snap,
      rows: snap.rows.map(([at, event, data]) => [at, event, scrubDiagnosticEventData(data)]),
      state: await collectPhoneState(),
    };
  } catch {
    return null;
  }
}

/** The handful of facts that decide whether this phone can record a drive. */
async function collectPhoneState(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  const take = async (key: string, read: () => Promise<unknown>) => {
    try {
      state[key] = await read();
    } catch {
      state[key] = null;
    }
  };
  const { Platform } = await import("react-native");
  state.platform = Platform.OS;
  await take("diagnostics", async () => {
    const { getDriveDetectionDiagnostics } = await import("./detection");
    const d = await getDriveDetectionDiagnostics();
    return {
      enabled: d.enabled,
      foregroundPermission: d.foregroundPermission,
      backgroundPermission: d.backgroundPermission,
      motionPermission: d.motionPermission,
      autoRecordingActive: d.autoRecordingActive,
      nativeEngineEnabled: d.nativeEngineEnabled,
      lastNativeLocationAt: d.lastNativeLocationAt,
      bufferedCoordinates: d.bufferedCoordinates,
      activeShift: d.activeShiftId != null,
    };
  });
  await take("pausedUntil", async () => {
    const { getDrivePauseUntil } = await import("./detection");
    return await getDrivePauseUntil();
  });
  await take("enginePower", async () => {
    const { readEnginePower } = await import("./nativeLocation");
    return (await readEnginePower()).mode;
  });
  await take("pendingUploads", async () => {
    const { getPendingCount } = await import("../sync/queue");
    return await getPendingCount();
  });
  await take("lowPowerMode", async () => {
    const { getBatterySnapshot } = await import("./batteryAware");
    return (await getBatterySnapshot()).lowPowerMode;
  });
  return state;
}

/** Resolve to the promise's value, or null once `ms` has passed. Never rejects. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}
