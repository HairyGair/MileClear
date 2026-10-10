// SQLite side of the 24-hour tracking log (see trackingLog.ts for what goes in
// and why). Written by logDetectionEvent alongside detection_events, read by
// the diagnostic dump and the missing-trip report. Every function is
// best-effort: a logging failure must never reach the code that logged.

import { getDatabase } from "../db/index";
import {
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
