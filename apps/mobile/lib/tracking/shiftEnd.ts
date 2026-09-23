// Ending a shift, by the driver or on its own.
//
// finishShift is the End Shift button's work, lifted out of the dashboard so
// the automatic end below runs exactly the same steps: stop the shift's GPS
// (which also hands tracking back to automatic detection), close the Live
// Activity, turn the shift's breadcrumbs into trips, then end the shift
// offline-aware so the server scorecard and sync queue behave as normal.
//
// autoEndShiftIfStale ends a shift left running with no driving (see
// staleShiftRule.ts for the rule and why). It is called from
// shiftSuppressesAutoDetection, which every native engine callback (location,
// motion change, heartbeat, live and Android headless) and every JS-engine
// detection start already passes through while a shift is active - so the
// check runs on exactly the wakes a forgotten shift is currently wasting, with
// no new timers. It must never throw: its callers are native callbacks.

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getDatabase } from "../db/index";
import { syncEndShift } from "../sync/actions";
import { endLiveActivityWithSummary } from "../liveActivity";
import { stopShiftTracking, processShiftTrips } from "./index";
import { clearNotDrivingCooldown, logDetectionEvent } from "./detection";
import {
  staleShiftDecision,
  lastDrivingFixMs,
  STALE_SHIFT_MIN_OPEN_MS,
  STALE_SHIFT_NO_DRIVING_MS,
  DRIVING_MAX_IMPLIED_GAP_MS,
  type ShiftFix,
} from "./staleShiftRule";

/**
 * The End Shift button's steps, in the button's order. Returns what
 * syncEndShift returned (the server response with the scorecard, or null
 * when offline). Throws if the server definitively rejects the end, as the
 * button always has.
 */
export async function finishShift(params: {
  shiftId: string;
  vehicleId?: string | null;
  liveDistanceMiles?: number;
}): Promise<Awaited<ReturnType<typeof syncEndShift>>> {
  await releaseShiftTracking();
  return closeShift(params);
}

// Split so the automatic path can release the GPS lock (fast, must finish
// before the engine callback that triggered it carries on) and do the slow,
// network-bound rest in the background.
async function releaseShiftTracking(): Promise<void> {
  // 1. Stop GPS tracking; this clears active_shift_id and restarts detection.
  await stopShiftTracking();
}

async function closeShift(params: {
  shiftId: string;
  vehicleId?: string | null;
  liveDistanceMiles?: number;
}): Promise<Awaited<ReturnType<typeof syncEndShift>>> {
  endLiveActivityWithSummary({ distanceMiles: params.liveDistanceMiles ?? 0, tripCount: 0 }).catch(
    () => {}
  );
  // 2. Process GPS coordinates into trips (before ending the shift so the
  //    scorecard counts them).
  await processShiftTrips(params.shiftId, params.vehicleId ?? undefined);
  // 3. End shift (offline-aware - syncs when online).
  return syncEndShift(params.shiftId);
}

// ── Automatic end ────────────────────────────────────────────────────────────

export type AutoEndVerdict = "ended" | "kept" | "busy";

/** Look at a given shift at most this often per JS context. */
const CHECK_THROTTLE_MS = 60 * 1000;
/** tracking_state key: the shift id we already told the driver about. */
const NOTIFIED_KEY = "stale_shift_auto_ended_id";
/** Enough breadcrumbs to cover three hours of driving at 50 m spacing. */
const MAX_FIXES = 4000;

let inFlight = false;
let lastCheck: { shiftId: string; atMs: number } | null = null;
const listeners = new Set<(shiftId: string) => void>();

/** Called after a shift ends on its own, so an open dashboard can refresh. */
export function onShiftAutoEnded(listener: (shiftId: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function gatherLastDrivingMs(
  db: Awaited<ReturnType<typeof getDatabase>>,
  shiftId: string,
  nowMs: number
): Promise<number | null> {
  // Only the window that can matter, plus one gap's worth before it so the
  // first fix in the window still has a neighbour for implied speed.
  const sinceIso = new Date(
    nowMs - STALE_SHIFT_NO_DRIVING_MS - DRIVING_MAX_IMPLIED_GAP_MS
  ).toISOString();
  const rows = await db.getAllAsync<{
    lat: number;
    lng: number;
    speed: number | null;
    accuracy: number | null;
    recorded_at: string;
  }>(
    `SELECT lat, lng, speed, accuracy, recorded_at FROM shift_coordinates
     WHERE shift_id = ? AND recorded_at >= ? ORDER BY recorded_at DESC LIMIT ${MAX_FIXES}`,
    [shiftId, sinceIso]
  );
  const fixes: ShiftFix[] = rows.map((r) => ({
    lat: r.lat,
    lng: r.lng,
    speed: r.speed,
    accuracy: r.accuracy,
    recordedAtMs: new Date(r.recorded_at).getTime(),
  }));
  const fromFixes = lastDrivingFixMs(fixes);

  // A trip's end is the last moment of driving. Trips made during this shift,
  // or any tracked (non-manual) trip the phone holds.
  const trip = await db.getFirstAsync<{ ended_at: string | null }>(
    `SELECT MAX(ended_at) AS ended_at FROM trips
     WHERE ended_at IS NOT NULL AND (shift_id = ? OR is_manual_entry = 0)`,
    [shiftId]
  );
  const tripMs = trip?.ended_at ? new Date(trip.ended_at).getTime() : NaN;
  const fromTrips = Number.isFinite(tripMs) ? tripMs : null;

  if (fromFixes == null) return fromTrips;
  if (fromTrips == null) return fromFixes;
  return Math.max(fromFixes, fromTrips);
}

async function notifyAutoEnded(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Shift ended",
      body: "Your shift ended on its own after 3 hours without driving. Trips now record automatically again.",
      data: { type: "shift_auto_ended", action: "open_dashboard" },
      ...(Platform.OS === "android" && { channelId: "reminders" }),
    },
    trigger: null,
  });
}

/**
 * End the given shift if it has been open for 3+ hours with no driving in the
 * last 3 hours. "ended": the GPS lock is released and detection may proceed
 * right now; "busy": another caller is ending it, keep suppressing for this
 * event; "kept": leave the shift alone. Never throws.
 */
export async function autoEndShiftIfStale(
  shiftId: string,
  trigger: string
): Promise<AutoEndVerdict> {
  if (inFlight) return "busy";
  const nowMs = Date.now();
  if (lastCheck && lastCheck.shiftId === shiftId && nowMs - lastCheck.atMs < CHECK_THROTTLE_MS) {
    return "kept";
  }
  lastCheck = { shiftId, atMs: nowMs };
  inFlight = true;
  let released = false;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      started_at: string | null;
      ended_at: string | null;
      status: string | null;
      vehicle_id: string | null;
    }>("SELECT started_at, ended_at, status, vehicle_id FROM shifts WHERE id = ?", [shiftId]);
    if (!row || row.ended_at || row.status === "completed") return "kept";
    const startedMs = row.started_at ? new Date(row.started_at).getTime() : NaN;
    // Cheap exit for the common case: a shift under three hours old.
    if (!Number.isFinite(startedMs) || nowMs - startedMs < STALE_SHIFT_MIN_OPEN_MS) return "kept";

    const decision = staleShiftDecision({
      nowMs,
      shiftStartedMs: startedMs,
      lastDrivingMs: await gatherLastDrivingMs(db, shiftId, nowMs),
    });
    if (decision.action !== "end") return "kept";

    // The lock must be gone before we answer, or the engine event that woke
    // us (often the first fix of a drive) would be turned away again.
    const lock = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    if (lock?.value !== shiftId) return "kept";
    await releaseShiftTracking();
    // stopShiftTracking arms the 20-minute "Not driving" cooldown (it goes
    // through cancelAutoRecording(true)). Nobody said "not driving" here, and
    // the drive that woke this check must record, so lift it. No genuine
    // cooldown can be pending: starting the shift cleared it, and detection
    // has been standing aside ever since.
    await clearNotDrivingCooldown();
    released = true;

    logDetectionEvent("shift_auto_ended", {
      hoursOpen: decision.hoursOpen,
      hoursSinceDriving: decision.hoursSinceDriving,
      trigger,
    }).catch(() => {});

    // Tell the driver once per shift, even if the server end has to be retried.
    const told = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [NOTIFIED_KEY]
    );
    if (told?.value !== shiftId) {
      await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
        NOTIFIED_KEY,
        shiftId,
      ]);
      notifyAutoEnded().catch(() => {});
    }

    // The slow part (trip processing, server end) runs detached, so an engine
    // callback is never held up by the network. If the app is suspended or
    // killed part way, the shift is still active on the server, the dashboard
    // re-attaches to it on the next open, and this check ends it again.
    void closeShift({ shiftId, vehicleId: row.vehicle_id })
      .then((res) => {
        logDetectionEvent("shift_auto_end_synced", { online: res != null }).catch(
          () => {}
        );
      })
      .catch((err) => {
        logDetectionEvent("shift_auto_end_failed", {
          error: err instanceof Error ? err.message.slice(0, 120) : String(err),
        }).catch(() => {});
      })
      .finally(() => {
        for (const l of listeners) {
          try {
            l(shiftId);
          } catch {
            // a listener's problem is not ours
          }
        }
      });
    return "ended";
  } catch (err) {
    logDetectionEvent("shift_auto_end_error", {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    }).catch(() => {});
    // If the lock was already released, detection must be allowed to proceed.
    return released ? "ended" : "kept";
  } finally {
    inFlight = false;
  }
}

/**
 * True once this shift has ended on its own on this phone. The dashboard uses
 * it so a server that has not yet heard about the end (the detached sync is
 * still running, or queued offline) does not make it re-attach GPS to the
 * shift and switch automatic tracking off again.
 */
export async function wasShiftAutoEnded(shiftId: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [NOTIFIED_KEY]
    );
    return row?.value === shiftId;
  } catch {
    return false;
  }
}

/**
 * The same check from the app side (the dashboard on focus), for devices whose
 * engine has not woken since the shift went stale. Reads the lock itself.
 */
export async function checkActiveShiftForAutoEnd(trigger: string): Promise<AutoEndVerdict> {
  try {
    const db = await getDatabase();
    const lock = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    if (!lock?.value || lock.value === "__quick_trip__") return "kept";
    return await autoEndShiftIfStale(lock.value, trigger);
  } catch {
    return "kept";
  }
}
