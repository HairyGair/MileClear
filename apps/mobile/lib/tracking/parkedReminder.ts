// "Still on your trip?" - runtime half of the parked reminder for Start Trip
// (rules and copy are in parkedReminderRule.ts; spec in
// docs/parked-reminder-oct2026/SPEC.md).
//
// Everything here is best-effort and never throws: it is called from the
// Start Trip location task and from notification callbacks, and a failure must
// never cost a driver breadcrumbs or a trip.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { getDatabase } from "../db/index";
import {
  PARKED_COPY,
  PARKED_REMINDER_CATEGORY,
  PARKED_REMINDER_NOTIFICATION_ID,
  PARKED_REMINDER_STATE_KEY,
  parkedActionKind,
  parkedArrivedDecision,
  parkedArrivedMayFinish,
  parkedArrivedNotification,
  parkedReminderPlan,
  parseParkedReminderState,
  shouldApplyParkedResponse,
  type ParkedCancelReason,
} from "./parkedReminderRule";
import {
  finishParkedQuickTrip,
  getStartTripUntilArrived,
  logDetectionEvent,
  quickTripLastDrivingMs,
} from "./detection";

const QUICK_TRIP_SHIFT_ID = "__quick_trip__"; // mirrors lib/tracking/index.ts
const HANDLED_KEY = "parked_reminder_handled";
const SHOWN_REPORTED_KEY = "parked_reminder_shown_reported";
const NO_PERMISSION_LOGGED_KEY = "start_trip_parked_no_perm_logged";

// ── Is the Start Trip screen on screen? ─────────────────────────────────────

let startTripScreenVisible = false;
/** Set by the Start Trip screen while it is mounted in driving mode. */
export function setStartTripScreenVisible(visible: boolean): void {
  startTripScreenVisible = visible;
}
export function isStartTripScreenVisible(): boolean {
  return startTripScreenVisible;
}

// ── Tell an open Start Trip screen its trip was finished here ───────────────

const finishedListeners = new Set<() => void>();
/**
 * The Start Trip screen listens while it is in driving mode: an Arrived from
 * the notification can finish the trip while the app is in the foreground
 * (notification centre), with no AppState change for the screen to notice,
 * and its own Arrived would then save the drive a second time.
 */
export function onParkedReminderFinished(listener: () => void): () => void {
  finishedListeners.add(listener);
  return () => {
    finishedListeners.delete(listener);
  };
}
function notifyFinishedElsewhere(): void {
  for (const l of [...finishedListeners]) {
    try {
      l();
    } catch {
      // a listener must not break the others
    }
  }
}

// ── One Arrived at a time: the screen's or the notification's ───────────────
//
// The lock claim in finishParkedQuickTrip stops two background finishes, but
// the Start Trip screen's Arrived does not claim the lock (it must clear the
// engine's copy before the lock goes). So the two Arriveds take turns here,
// in the same JS context: no await between each check and its claim.

let formArriving = false;
let finishInFlight: Promise<unknown> | null = null;

/** The Start Trip screen's Arrived is running: the notification's stands aside. */
export function setStartTripFormArriving(on: boolean): void {
  formArriving = on;
}

/** Resolves once a notification Arrived already under way has finished. */
export async function waitForParkedReminderFinish(): Promise<void> {
  const running = finishInFlight;
  if (running) await running.catch(() => {});
}

// ── Server events (best effort, never block) ────────────────────────────────

function reportServerEvent(type: string, metadata?: Record<string, unknown>): void {
  import("../api/index")
    .then(({ apiRequest }) =>
      apiRequest("/user/event", {
        method: "POST",
        body: JSON.stringify({ type, ...(metadata && { metadata }) }),
      })
    )
    .catch(() => {});
}

// ── Cancel ──────────────────────────────────────────────────────────────────

/**
 * Cancel the scheduled reminder, remove one already on the lock screen and
 * forget its state. Safe to call at any time.
 */
export async function cancelParkedReminder(reason: ParkedCancelReason): Promise<void> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [PARKED_REMINDER_STATE_KEY]
    );
    try {
      await Notifications.cancelScheduledNotificationAsync(PARKED_REMINDER_NOTIFICATION_ID);
    } catch {
      // nothing scheduled
    }
    try {
      await Notifications.dismissNotificationAsync(PARKED_REMINDER_NOTIFICATION_ID);
    } catch {
      // nothing delivered
    }
    if (row) {
      await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [PARKED_REMINDER_STATE_KEY]);
      logDetectionEvent("start_trip.parked_reminder_cancelled", { reason }).catch(() => {});
    }
  } catch {
    // best effort
  }
}

// ── Arm / re-arm ────────────────────────────────────────────────────────────

let permissionCheckedAtMs = 0;
let permissionGranted = false;

async function notificationsGranted(): Promise<boolean> {
  if (Date.now() - permissionCheckedAtMs < 5 * 60 * 1000) return permissionGranted;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    permissionGranted = status === "granted";
  } catch {
    permissionGranted = false;
  }
  permissionCheckedAtMs = Date.now();
  return permissionGranted;
}

/**
 * Run the deadman rule for the Start Trip. `lastDrivingMs` is the latest
 * driving fix the caller knows (the location task's batch, or the whole trail
 * from the reconcile in shiftSuppressesAutoDetection). Never throws.
 */
export async function reconcileParkedReminder(lastDrivingMs: number | null): Promise<void> {
  try {
    const db = await getDatabase();
    const lock = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    const qts = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'quick_trip_start'"
    );
    const stateRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [PARKED_REMINDER_STATE_KEY]
    );
    const state = parseParkedReminderState(stateRow?.value);
    const isQuickTrip = lock?.value === QUICK_TRIP_SHIFT_ID;

    let startedAtRaw: string | null = null;
    let quickTripStartMs: number | null = null;
    if (qts) {
      try {
        startedAtRaw = String(JSON.parse(qts.value).startedAt);
        const ms = new Date(startedAtRaw).getTime();
        quickTripStartMs = Number.isFinite(ms) ? ms : null;
      } catch {
        // malformed start row: not a usable anchor
      }
    }
    const untilArrived = isQuickTrip ? await getStartTripUntilArrived().catch(() => false) : false;

    const plan = parkedReminderPlan({
      nowMs: Date.now(),
      isQuickTrip,
      hasStartRow: quickTripStartMs != null,
      untilArrived,
      quickTripStartMs,
      lastDrivingMs,
      state,
    });
    if (plan.action === "keep") return;
    if (plan.action === "cancel") {
      await cancelParkedReminder(plan.reason);
      return;
    }

    if (!(await notificationsGranted())) {
      // The trip keeps running; log once per trip so we can size the gap.
      const logged = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = ?",
        [NO_PERMISSION_LOGGED_KEY]
      );
      if (logged?.value !== startedAtRaw) {
        await db.runAsync(
          "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
          [NO_PERMISSION_LOGGED_KEY, startedAtRaw ?? ""]
        );
        logDetectionEvent("start_trip.parked_reminder_no_permission").catch(() => {});
      }
      return;
    }

    if (plan.dismissDelivered) {
      try {
        await Notifications.dismissNotificationAsync(PARKED_REMINDER_NOTIFICATION_ID);
      } catch {
        // already gone
      }
      logDetectionEvent("start_trip.parked_reminder_dismissed_on_drive", {
        anchorMs: state?.anchorMs ?? null,
      }).catch(() => {});
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(PARKED_REMINDER_NOTIFICATION_ID);
    } catch {
      // nothing scheduled
    }
    await Notifications.scheduleNotificationAsync({
      identifier: PARKED_REMINDER_NOTIFICATION_ID,
      content: {
        title: PARKED_COPY.title,
        body: PARKED_COPY.body,
        categoryIdentifier: PARKED_REMINDER_CATEGORY,
        sound: "default",
        data: { type: "start_trip_parked", action: "open_start_trip", anchorMs: plan.anchorMs },
        ...(Platform.OS === "ios" && { interruptionLevel: "active" as const }),
        ...(Platform.OS === "android" && { channelId: "reminders" }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(plan.fireAtMs),
      },
    });
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      PARKED_REMINDER_STATE_KEY,
      JSON.stringify({ anchorMs: plan.anchorMs, fireAtMs: plan.fireAtMs }),
    ]);
    // The trip can end while this ran (Arrived in the app, a self-heal): its
    // cancel may have come before the schedule above. Never leave a
    // "Still on your trip?" behind for a trip that is over.
    const after = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    if (after?.value !== QUICK_TRIP_SHIFT_ID) {
      await cancelParkedReminder("lock_released");
      return;
    }
    if (plan.firstForStop) {
      logDetectionEvent("start_trip.parked_reminder_armed", {
        fireAtMs: plan.fireAtMs,
        anchorMs: plan.anchorMs,
      }).catch(() => {});
    }
  } catch {
    // never break breadcrumb storage
  }
}

// ── Buttons ─────────────────────────────────────────────────────────────────

const handledInMemory = new Set<string>();

async function postResult(
  note: { title: string; body: string; action: string } | null
): Promise<void> {
  if (!note) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: note.title,
        body: note.body,
        data: { type: "start_trip_parked_result", action: note.action },
        ...(Platform.OS === "android" && { channelId: "reminders" }),
      },
      trigger: null,
    });
  } catch {
    // a missing notification permission must not undo the save
  }
}

/**
 * Arrived / Keep going pressed on the reminder (foreground, background, or
 * replayed at launch). Idempotent: the lock claim in finishParkedQuickTrip is
 * the one gate against a double finalise. Never throws.
 */
export async function handleParkedReminderResponse(
  actionId: string,
  data: Record<string, unknown> | undefined
): Promise<void> {
  try {
    const kind = parkedActionKind(actionId);
    if (!kind) return;
    const anchorRaw = Number(data?.anchorMs);
    const anchorMs = Number.isFinite(anchorRaw) ? anchorRaw : null;
    const db = await getDatabase();
    const handled = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [HANDLED_KEY]
    );
    const memKey = `${anchorMs}:${actionId}`;
    if (
      handledInMemory.has(memKey) ||
      !shouldApplyParkedResponse({ anchorMs, actionId, handledKey: handled?.value ?? null })
    ) {
      return;
    }
    handledInMemory.add(memKey);
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      HANDLED_KEY,
      memKey,
    ]);
    reportServerEvent("start_trip.parked_reminder_shown", { anchorMs });

    if (kind === "keep_going") {
      // No snooze: the same stop never prompts twice (the state row stays, so
      // nothing re-arms until a new driving fix). The trip simply keeps running.
      try {
        // iOS removes it on the tap; Android may leave it in the shade.
        await Notifications.dismissNotificationAsync(PARKED_REMINDER_NOTIFICATION_ID);
      } catch {
        // already gone
      }
      logDetectionEvent("start_trip.parked_reminder_keep_going", { anchorMs }).catch(() => {});
      reportServerEvent("start_trip.parked_reminder_keep_going");
      return;
    }

    const lock = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
    );
    const lockHeld = lock?.value === QUICK_TRIP_SHIFT_ID;
    let quickTripStartMs: number | null = null;
    try {
      const qts = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'quick_trip_start'"
      );
      const ms = qts ? new Date(JSON.parse(qts.value).startedAt).getTime() : NaN;
      quickTripStartMs = Number.isFinite(ms) ? ms : null;
    } catch {
      // malformed start row: the anchor check is skipped
    }
    const read = lockHeld ? await quickTripLastDrivingMs(db) : null;
    if (read !== null && Number.isNaN(read)) {
      // Unreadable trail: finishing would trim it. Leave the trip running.
      logDetectionEvent("start_trip.parked_reminder_arrived", { outcome: "unreadable" }).catch(() => {});
      return;
    }
    const nowMs = Date.now();
    const lastDrivingMs = read;
    const decision = parkedArrivedDecision({
      nowMs,
      lockHeld,
      lastDrivingMs,
      anchorMs,
      quickTripStartMs,
    });
    const minutesSinceDriving =
      lastDrivingMs != null ? Math.round((nowMs - lastDrivingMs) / 60_000) : null;

    let outcome: "saved" | "nothing" | "already_finished" | "driving_again";
    let tripsSaved = 0;
    if (
      decision === "finish" &&
      !parkedArrivedMayFinish({ formArriving, finishRunning: finishInFlight != null })
    ) {
      // The Start Trip screen is saving it (or another tap is): stand aside.
      outcome = "already_finished";
    } else if (decision === "finish") {
      const run = finishParkedQuickTrip(db, "reminder_arrived", lastDrivingMs, {
        whole: true,
        keptGoing: true,
      });
      finishInFlight = run;
      let result: Awaited<typeof run>;
      try {
        result = await run;
      } finally {
        finishInFlight = null;
      }
      if (!result.claimed) {
        outcome = "already_finished";
      } else {
        tripsSaved = result.tripsSaved;
        outcome = tripsSaved > 0 ? "saved" : "nothing";
        notifyFinishedElsewhere();
      }
    } else {
      outcome = decision;
    }

    await postResult(parkedArrivedNotification(outcome === "saved" || outcome === "nothing" ? "finish" : outcome, tripsSaved));
    const detail = { tripsSaved, minutesSinceDriving, outcome };
    logDetectionEvent("start_trip.parked_reminder_arrived", detail).catch(() => {});
    reportServerEvent("start_trip.parked_reminder_arrived", detail);
  } catch {
    // best effort
  }
}

/** Body tap: the router opens the Start Trip screen; this just records it. */
export function noteParkedReminderOpened(): void {
  logDetectionEvent("start_trip.parked_reminder_opened").catch(() => {});
  reportServerEvent("start_trip.parked_reminder_opened");
  reportServerEvent("start_trip.parked_reminder_shown");
}

/**
 * Launch-time safety net: replay a button response the listener may have
 * missed (a background launch subscribes late), and report a reminder that was
 * delivered while the app was suspended (iOS gives no callback for that).
 */
export async function replayParkedReminderOnLaunch(): Promise<void> {
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    const data = last?.notification.request.content.data as Record<string, unknown> | undefined;
    if (last && data?.type === "start_trip_parked" && parkedActionKind(last.actionIdentifier)) {
      await handleParkedReminderResponse(last.actionIdentifier, data);
    }
  } catch {
    // best effort
  }
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const ours = presented.find((n) => n.request.identifier === PARKED_REMINDER_NOTIFICATION_ID);
    const anchor = Number((ours?.request.content.data as Record<string, unknown> | undefined)?.anchorMs);
    if (ours && Number.isFinite(anchor)) {
      const db = await getDatabase();
      const reported = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = ?",
        [SHOWN_REPORTED_KEY]
      );
      if (reported?.value !== String(anchor)) {
        await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
          SHOWN_REPORTED_KEY,
          String(anchor),
        ]);
        reportServerEvent("start_trip.parked_reminder_shown", { anchorMs: anchor });
      }
    }
  } catch {
    // best effort
  }
}
