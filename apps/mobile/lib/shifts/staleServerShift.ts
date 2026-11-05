// Sending again an end this phone made that never reached the server, and
// clearing the way when Start Shift is refused because of it. The rules are in
// staleServerShiftRule.ts, with why.

import { getDatabase } from "../db/index";
import { endShift as apiEndShift, fetchActiveShift } from "../api/shifts";
import { ApiError } from "../api/apiError";
import { isAlreadyApplied } from "../sync/queueRules";
import { isTargetMissing } from "../sync/errors";
import { queueAppEvent } from "../tracking/recordingDrops";
import { finishShift, isShiftEnding, wasShiftAutoEnded } from "../tracking/shiftEnd";
import {
  blockingShiftFromRefusal,
  canAttemptResend,
  FORGOTTEN_SHIFT_MS,
  phoneEndedShift,
  resendEndedAt,
  shouldResendEnd,
  startBlockedAction,
  type LocalShiftView,
} from "./staleServerShiftRule";

/** What this phone knows about the shift. Never throws. */
export async function readLocalShiftView(shiftId: string): Promise<LocalShiftView> {
  let row: LocalShiftView["row"] = null;
  try {
    const db = await getDatabase();
    const r = await db.getFirstAsync<{ status: string | null; ended_at: string | null }>(
      "SELECT status, ended_at FROM shifts WHERE id = ?",
      [shiftId]
    );
    if (r) row = { status: r.status, endedAt: r.ended_at };
  } catch {
    // unreadable: treated as a shift the phone does not hold
  }
  return { row, autoEnded: await wasShiftAutoEnded(shiftId), ending: isShiftEnding(shiftId) };
}

/** The last moment the phone saw anything happen in the shift. */
async function lastActivityAt(shiftId: string): Promise<string | null> {
  try {
    const db = await getDatabase();
    const trip = await db.getFirstAsync<{ at: string | null }>(
      "SELECT MAX(ended_at) AS at FROM trips WHERE shift_id = ?",
      [shiftId]
    );
    const fix = await db.getFirstAsync<{ at: string | null }>(
      "SELECT MAX(recorded_at) AS at FROM shift_coordinates WHERE shift_id = ?",
      [shiftId]
    );
    const times = [trip?.at, fix?.at].filter((t): t is string => !!t && Number.isFinite(Date.parse(t)));
    if (times.length === 0) return null;
    return times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
  } catch {
    return null;
  }
}

/** This phone is recording the shift (its GPS lock names it). */
async function holdsTrackingLock(shiftId: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    const lock = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    return lock?.value === shiftId;
  } catch {
    return false;
  }
}

/** The phone's copy matches the server's: ended, nothing left to send. */
async function markEndedHere(shiftId: string, endedAt: string): Promise<void> {
  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      "UPDATE shifts SET status = 'completed', ended_at = COALESCE(ended_at, ?), synced_at = ? WHERE id = ?",
      [endedAt, now, shiftId]
    );
    // A parked or waiting end for it is done too (it may be what lit the red
    // "Sync issues" badge).
    await db.runAsync(
      "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE entity_id = ? AND entity_type = 'shift' AND action = 'update' AND status != 'synced'",
      [now, shiftId]
    );
  } catch {
    // The server has it; the phone's copy catches up on the next end or sync.
  }
}

export type ResendResult = "ended" | "already_ended" | "gone" | "failed";

const inFlight = new Map<string, Promise<ResendResult>>();

/**
 * End the server's copy of a shift. With useLocalEndTime the end time is the
 * last one the phone recorded (see resendEndedAt); with endAtLastRecord, the
 * server's last trip in the shift; with neither, the shift ends now. Joins a send already going for the same shift. Never
 * throws. Every send is logged as shift.end_resent.
 */
export function resendShiftEnd(
  serverShift: { id: string; startedAt: string },
  reason: string,
  opts: { useLocalEndTime: boolean; endAtLastRecord?: boolean }
): Promise<ResendResult> {
  const running = inFlight.get(serverShift.id);
  if (running) return running;
  const run = sendEnd(serverShift, reason, opts).finally(() => inFlight.delete(serverShift.id));
  inFlight.set(serverShift.id, run);
  return run;
}

async function sendEnd(
  serverShift: { id: string; startedAt: string },
  reason: string,
  opts: { useLocalEndTime: boolean; endAtLastRecord?: boolean }
): Promise<ResendResult> {
  const id = serverShift.id;
  let endedAt: string | undefined;
  let local: LocalShiftView | null = null;
  if (opts.useLocalEndTime) {
    local = await readLocalShiftView(id);
    endedAt = resendEndedAt({
      serverStartedAt: serverShift.startedAt,
      localEndedAt: local.row?.endedAt ?? null,
      lastActivityAt: await lastActivityAt(id),
      nowMs: Date.now(),
    });
  } else if (opts.endAtLastRecord) {
    // A forgotten shift the phone knows nothing of: its start, which the
    // server moves up to the last trip it holds for the shift.
    endedAt = resendEndedAt({
      serverStartedAt: serverShift.startedAt,
      localEndedAt: null,
      lastActivityAt: null,
      nowMs: Date.now(),
    });
  }
  const hoursOpen = Math.round((Date.now() - Date.parse(serverShift.startedAt)) / 36e5);
  const report = (result: ResendResult, extra: Record<string, unknown> = {}) =>
    queueAppEvent("shift.end_resent", {
      reason,
      result,
      sentEndTime: !!endedAt,
      autoEnded: local?.autoEnded ?? null,
      localStatus: local?.row?.status ?? null,
      hoursOpen: Number.isFinite(hoursOpen) ? hoursOpen : null,
      ...extra,
    });

  let result: ResendResult;
  try {
    try {
      await apiEndShift(id, endedAt ? { endedAt } : undefined);
    } catch (err) {
      // A time the server will not take (a phone clock far out): end it now
      // rather than leave it running.
      const refusedTime =
        !!endedAt &&
        err instanceof ApiError &&
        err.statusCode === 400 &&
        !isAlreadyApplied("shift", "update", err.statusCode, err.message);
      if (!refusedTime) throw err;
      endedAt = undefined;
      await apiEndShift(id);
    }
    result = "ended";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ApiError && isAlreadyApplied("shift", "update", err.statusCode, msg)) {
      result = "already_ended";
    } else if (isTargetMissing(err)) {
      result = "gone";
    } else {
      void report("failed", { error: msg.slice(0, 120) });
      return "failed";
    }
  }
  await markEndedHere(id, endedAt ?? new Date().toISOString());
  void report(result);
  return result;
}

// Home: one send per shift at a time; after a failure, again in 10 minutes;
// after a success, not again until the app restarts.
const homeAttempts = new Map<string, { atMs: number; done: boolean }>();

/**
 * Home fetched a shift the server calls running. True when this phone had
 * already ended it, so Home must not show it (or put its GPS back on); the
 * end is then sent again in the background.
 */
export async function hideAndResendIfEndedHere(serverShift: {
  id: string;
  startedAt: string;
  status: string;
}): Promise<boolean> {
  const local = await readLocalShiftView(serverShift.id);
  if (!phoneEndedShift(local)) return false;
  const nowMs = Date.now();
  if (shouldResendEnd(serverShift, local) && canAttemptResend(homeAttempts.get(serverShift.id), nowMs)) {
    homeAttempts.set(serverShift.id, { atMs: nowMs, done: false });
    void resendShiftEnd(serverShift, "home", { useLocalEndTime: true }).then((r) => {
      homeAttempts.set(serverShift.id, { atMs: nowMs, done: r !== "failed" });
    });
  }
  return true;
}

export type ClearBlockingResult = "cleared" | "declined" | "not_blocked" | "failed";

/**
 * Start Shift was refused. When the refusal is "You already have an active
 * shift", end that shift (asking first unless this phone already ended it)
 * so the start can be tried once more. `ask` shows the question and resolves
 * true for "end it". Never throws.
 */
export async function clearBlockingShift(
  err: unknown,
  ask: (startedAt: string | null) => Promise<boolean>
): Promise<ClearBlockingResult> {
  if (!(err instanceof ApiError)) return "not_blocked";
  const named = blockingShiftFromRefusal(err.statusCode, err.message, err.body);
  if (!named) return "not_blocked";

  let blocking: { id: string; startedAt: string } | null =
    named.id && named.startedAt ? { id: named.id, startedAt: named.startedAt } : null;
  if (!blocking) {
    // An API older than this fix only sends the message: look it up.
    try {
      const res = await fetchActiveShift();
      const s = res.data[0];
      if (s) blocking = { id: s.id, startedAt: s.startedAt };
    } catch {
      // fall through
    }
  }
  if (!blocking) return "failed";

  const local = await readLocalShiftView(blocking.id);
  const action = startBlockedAction(local);
  void queueAppEvent("shift.start_blocked", {
    action,
    autoEnded: local.autoEnded,
    localStatus: local.row?.status ?? null,
    named: !!named.id,
  });

  if (action === "ask") {
    if (!(await ask(blocking.startedAt))) return "declined";
    if (local.row?.status === "active" && !local.ending && (await holdsTrackingLock(blocking.id))) {
      // This phone has it running: end it properly (GPS off, trips saved).
      try {
        await finishShift({ shiftId: blocking.id });
        return "cleared";
      } catch {
        // refused: fall back to ending the server's copy directly
      }
    }
    const openMs = Date.now() - Date.parse(blocking.startedAt);
    const r = await resendShiftEnd(blocking, "start_blocked_confirmed", {
      useLocalEndTime: false,
      endAtLastRecord: Number.isFinite(openMs) && openMs >= FORGOTTEN_SHIFT_MS,
    });
    return r === "failed" ? "failed" : "cleared";
  }

  const r = await resendShiftEnd(blocking, "start_blocked", { useLocalEndTime: true });
  return r === "failed" ? "failed" : "cleared";
}
