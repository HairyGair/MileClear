// Background upkeep: the I/O side. See backgroundUpkeepRule.ts for why.
//
// Called from wakes that were already happening: the native engine's
// heartbeat (iOS: during a recording and the post-trip keep-alive window;
// Android: every minute while the app is alive), the Android headless
// heartbeat (when Android has ended the app), and the background fetch.
// Throttled to one pass every ten minutes, persisted in SQLite because
// Android tears the headless JavaScript context down between events.
//
// Never throws. Every step is independent: a failed sweep still lets the
// uploads go, and the whole pass is bounded by UPKEEP_TIME_BUDGET_MS.

import { getDatabase } from "../db/index";
import { hasWork, planUpkeep, upkeepDue, UPKEEP_TIME_BUDGET_MS } from "./backgroundUpkeepRule";
import { withTimeout } from "./trackingLogStore";

const UPKEEP_AT_KEY = "background_upkeep_at";

let running = false;

async function readUpkeepAt(): Promise<number> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [
      UPKEEP_AT_KEY,
    ]);
    const at = row ? Number(row.value) : 0;
    return Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

async function noteUpkeepAt(at: number): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [UPKEEP_AT_KEY, String(at)]);
  } catch {}
}

async function count(sql: string): Promise<number> {
  try {
    const db = await getDatabase();
    return (await db.getFirstAsync<{ n: number }>(sql))?.n ?? 0;
  } catch {
    return 0;
  }
}

/**
 * One upkeep pass, if one is due. Returns true when it found work to do
 * (whether or not that work succeeded), for the background fetch's result.
 */
export async function runBackgroundUpkeep(source: string): Promise<boolean> {
  if (running) return false;
  running = true;
  try {
    const now = Date.now();
    if (!upkeepDue(await readUpkeepAt(), now)) return false;
    // Stamp first: a pass that dies half way must not be retried every minute.
    await noteUpkeepAt(now);
    const result = await withTimeout(upkeepPass(source), UPKEEP_TIME_BUDGET_MS);
    return result ?? true;
  } catch {
    return false;
  } finally {
    running = false;
  }
}

async function upkeepPass(source: string): Promise<boolean> {
  const db = await getDatabase();
  const detection = await import("./detection");
  const recordingOpen =
    (await db
      .getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = 'auto_recording_active'")
      .catch(() => null))?.value === "1";
  // A plain read of the lock, not shiftSuppressesAutoDetection: that one
  // self-heals (ends stale shifts, releases locks) and logs, which is the
  // engine's business on its own events. The sweep, if it runs, applies the
  // full check itself. Unreadable reads as "a shift may own the GPS".
  const shiftActive = await db
    .getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = 'active_shift_id'")
    .then((r) => !!r)
    .catch(() => true);
  const { getNativeStoreCountAndMotion } = await import("./nativeLocation");
  const native = await getNativeStoreCountAndMotion();
  const { getPendingCount } = await import("../sync/queue");
  const plan = planUpkeep({
    recordingOpen,
    shiftActive,
    jsCoords: await count("SELECT COUNT(*) AS n FROM detection_coordinates"),
    nativeCoords: native.count,
    sdkMoving: native.isMoving,
    pendingUploads: await getPendingCount().catch(() => 0),
    pendingEvents: await count("SELECT COUNT(*) AS n FROM event_outbox"),
  });
  if (!hasWork(plan)) return false;

  const outcome: Record<string, unknown> = { source, ...plan };
  if (plan.sweep) {
    // Its own rules decide: too recent, already saved, switched off, or a
    // finished route to save through finalizeAutoTrip and its guards.
    try {
      await detection.sweepOrphanedRoute(`upkeep_${source}`);
    } catch {}
  }
  if (plan.drainUploads) {
    try {
      const { processSyncQueue } = await import("../sync/index");
      await processSyncQueue();
      const { getPendingCount: after } = await import("../sync/queue");
      outcome.uploadsLeft = await after().catch(() => null);
    } catch {}
  }
  if (plan.flushEvents) {
    try {
      const { flushEventOutbox } = await import("./recordingDrops");
      outcome.eventsSent = await flushEventOutbox();
    } catch {}
  }
  detection.logDetectionEvent("background_upkeep", outcome).catch(() => {});
  return true;
}
