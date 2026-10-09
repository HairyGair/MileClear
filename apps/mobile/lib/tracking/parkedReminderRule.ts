// "Still on your trip?" - the parked reminder for a Start Trip that runs until
// the driver taps Arrived (docs/parked-reminder-oct2026/SPEC.md).
//
// Kada (Amazon Flex), 9 Oct 2026, asked to be reminded after 5-10 minutes
// stopped. Nothing wakes the app at minute 10 while the car is parked (no
// location fixes while still, iOS suspends, Android Doze), so the reminder is a
// local notification the OS holds (a "deadman"): every driving fix pushes it 10
// minutes into the future, and when driving stops nothing moves it, so the OS
// fires it, with the app suspended, killed or offline.
//
// Pure, like quickTripLock.ts: detection.ts pulls in the whole native stack
// and the test runner cannot import it.

/** Stopped this long since the last driving fix, then the reminder fires. */
export const PARKED_REMINDER_MS = 10 * 60 * 1000;

/** Only move a scheduled reminder when driving has advanced this much (caps OS calls at ~1/min). */
export const PARKED_REMINDER_RESCHEDULE_STEP_MS = 60 * 1000;

/** Arrived tapped with driving this recent means the phone is moving again. */
export const PARKED_ARRIVED_RECENT_DRIVING_MS = 2 * 60 * 1000;

/** A reminder due now is given a few seconds, so a past DATE trigger is never handed to the OS. */
export const PARKED_REMINDER_MIN_LEAD_MS = 5 * 1000;

export const PARKED_REMINDER_NOTIFICATION_ID = "start-trip-parked-reminder";
export const PARKED_REMINDER_CATEGORY = "start_trip_parked";
export const PARKED_REMINDER_STATE_KEY = "start_trip_parked_reminder";
export const PARKED_ACTION_ARRIVED = "parked_arrived";
export const PARKED_ACTION_KEEP_GOING = "parked_keep_going";

export const PARKED_COPY = {
  title: "Still on your trip?",
  body: "You've been stopped for 10 minutes. Tap Arrived to save the trip, or Keep going if you're still working.",
  arrivedLabel: "Arrived",
  keepGoingLabel: "Keep going",
  saved: {
    title: "Trip saved",
    body: "Saved up to where you stopped driving. Your next drives record automatically.",
  },
  nothing: {
    title: "Start Trip ended",
    body: "There wasn't enough driving to save a trip. Your next drives record automatically.",
  },
  drivingAgain: {
    title: "Still recording",
    body: "You're moving again, so your trip is still running. Tap Arrived when you get there.",
  },
  formAlert: {
    title: "Trip saved",
    body: "You tapped Arrived on the notification, so your trip was saved up to where you stopped driving. You'll find it in Trips.",
  },
  settingsHintOn:
    "Waits and stops stay in the same trip. We'll remind you after 10 minutes stopped. Tap Arrived when you finish.",
  settingsHintNoPermission:
    "Turn on notifications to get a reminder when you've been stopped for 10 minutes.",
} as const;

export interface ParkedReminderState {
  /** The lastDrivingMs this reminder was armed for. */
  anchorMs: number;
  /** When the OS was asked to show it. */
  fireAtMs: number;
}

export function parseParkedReminderState(raw: string | null | undefined): ParkedReminderState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Number.isFinite(v?.anchorMs) && Number.isFinite(v?.fireAtMs)) {
      return { anchorMs: Number(v.anchorMs), fireAtMs: Number(v.fireAtMs) };
    }
  } catch {
    // malformed: treat as no state
  }
  return null;
}

export type ParkedCancelReason =
  | "arrived"
  | "discarded"
  | "auto_finished"
  | "setting_off"
  | "lock_released";

export type ParkedReminderPlan =
  | {
      action: "schedule";
      fireAtMs: number;
      anchorMs: number;
      /** A reminder already shown for an earlier stop is still on the lock screen: remove it. */
      dismissDelivered: boolean;
      /** First arm for this stop (not a push-back of a pending one): the one to log. */
      firstForStop: boolean;
    }
  | { action: "keep" }
  | { action: "cancel"; reason: ParkedCancelReason };

/**
 * Decide what to do with the deadman after a driving fix (or a reconcile).
 *
 * `lastDrivingMs` is the latest driving fix known (null = none). A reminder
 * counts as "fired" once the clock has passed its fireAtMs: iOS gives no
 * callback while suspended, and the OS fires on time.
 */
export function parkedReminderPlan(args: {
  nowMs: number;
  isQuickTrip: boolean;
  hasStartRow: boolean;
  untilArrived: boolean;
  quickTripStartMs: number | null;
  lastDrivingMs: number | null;
  state: ParkedReminderState | null;
}): ParkedReminderPlan {
  const { nowMs, state } = args;

  if (!args.isQuickTrip || !args.hasStartRow) {
    return state ? { action: "cancel", reason: "lock_released" } : { action: "keep" };
  }
  if (!args.untilArrived) {
    return state ? { action: "cancel", reason: "setting_off" } : { action: "keep" };
  }

  const drove = args.lastDrivingMs;
  const start = args.quickTripStartMs;
  // Never drove since Start Trip was tapped: waiting at the depot must not nag.
  if (
    drove == null ||
    !Number.isFinite(drove) ||
    start == null ||
    !Number.isFinite(start) ||
    drove < start
  ) {
    return { action: "keep" };
  }

  const fired = state != null && nowMs >= state.fireAtMs;

  if (state && drove < state.anchorMs + PARKED_REMINDER_RESCHEDULE_STEP_MS) {
    // Same stop (walking fixes, a re-read) or not enough new driving: leave it,
    // and in particular never arm a second reminder for a stop already shown.
    return { action: "keep" };
  }

  return {
    action: "schedule",
    fireAtMs: Math.max(drove + PARKED_REMINDER_MS, nowMs + PARKED_REMINDER_MIN_LEAD_MS),
    anchorMs: drove,
    dismissDelivered: fired,
    firstForStop: state == null || fired,
  };
}

export type ParkedArrivedOutcome = "finish" | "already_finished" | "driving_again";

export function parkedArrivedDecision(args: {
  nowMs: number;
  /** active_shift_id is still __quick_trip__ */
  lockHeld: boolean;
  lastDrivingMs: number | null;
  /** The stop the tapped reminder was armed for (its data.anchorMs), if known. */
  anchorMs?: number | null;
  /** When the Start Trip now running began (quick_trip_start), if known. */
  quickTripStartMs?: number | null;
}): ParkedArrivedOutcome {
  if (!args.lockHeld) return "already_finished";
  const anchor = args.anchorMs;
  const start = args.quickTripStartMs;
  const anchorKnown = anchor != null && Number.isFinite(anchor);
  // A reminder left over from an earlier Start Trip must never finish this one.
  if (anchorKnown && start != null && Number.isFinite(start) && anchor < start) {
    return "already_finished";
  }
  const drove = args.lastDrivingMs;
  if (drove == null || !Number.isFinite(drove)) return "finish"; // trims all, saves nothing
  if (args.nowMs - drove < PARKED_ARRIVED_RECENT_DRIVING_MS) return "driving_again";
  // Driven since the stop this reminder was about (a tap that only reached us
  // later, e.g. replayed at the next launch): that Arrived is out of date, and
  // finishing now would end the trip at a stop the driver never confirmed.
  if (anchorKnown && drove > anchor + PARKED_ARRIVED_RECENT_DRIVING_MS) return "driving_again";
  return "finish";
}

/**
 * The notification's Arrived may only finish the trip when nothing else is
 * saving it: the Start Trip screen's own Arrived does not take the lock (it
 * clears the engine's copy first), so without this the two could both save it.
 */
export function parkedArrivedMayFinish(args: {
  /** The Start Trip screen's Arrived is running. */
  formArriving: boolean;
  /** Another notification Arrived is already finishing it. */
  finishRunning: boolean;
}): boolean {
  return !args.formArriving && !args.finishRunning;
}

/** Quiet while the Start Trip screen is open and on screen; its Arrived button is already in front of the driver. */
export function parkedReminderForegroundDecision(args: {
  appActive: boolean;
  startTripScreenVisible: boolean;
}): "show" | "suppress" {
  return args.appActive && args.startTripScreenVisible ? "suppress" : "show";
}

/**
 * The Start Trip screen hears that the notification's Arrived saved its trip.
 * With the app in the background (Arrived tapped on the lock screen) an alert
 * raised now is lost, so the screen waits for the app to come back, where its
 * "active" handler lets go and shows the alert. Found on the simulator, 9 Oct.
 */
export function startTripFinishedListenerAction(appState: string): "let_go_now" | "wait_for_foreground" {
  return appState === "background" ? "wait_for_foreground" : "let_go_now";
}

/** Which of the two buttons, if either. */
export function parkedActionKind(actionId: string): "arrived" | "keep_going" | null {
  if (actionId === PARKED_ACTION_ARRIVED) return "arrived";
  if (actionId === PARKED_ACTION_KEEP_GOING) return "keep_going";
  return null;
}

/** Cold-start replay must not apply a response twice (the Arrived path is also idempotent through the lock claim). */
export function shouldApplyParkedResponse(args: {
  anchorMs: number | null;
  actionId: string;
  handledKey: string | null;
}): boolean {
  if (parkedActionKind(args.actionId) == null) return false;
  if (args.anchorMs == null) return true;
  return args.handledKey !== `${args.anchorMs}:${args.actionId}`;
}

/** What to post after an Arrived tap. */
export function parkedArrivedNotification(
  outcome: ParkedArrivedOutcome,
  tripsSaved: number
): { title: string; body: string; action: string } | null {
  if (outcome === "already_finished") return null;
  if (outcome === "driving_again") {
    return { ...PARKED_COPY.drivingAgain, action: "open_start_trip" };
  }
  return tripsSaved > 0
    ? { ...PARKED_COPY.saved, action: "open_trips" }
    : { ...PARKED_COPY.nothing, action: "open_dashboard" };
}

/**
 * What the Start Trip screen says when it finds its trip was finished
 * elsewhere. `tripsSaved` null = not known (the save was still running): the
 * usual message, since the trail is saved or kept for a retry.
 */
export function startTripFinishedAlert(args: {
  fromReminder: boolean;
  tripsSaved: number | null;
}): { title: string; body: string } {
  if (args.tripsSaved === 0) {
    return {
      title: "Start Trip ended",
      body: "There wasn't enough driving to save a trip. Your next drives record automatically.",
    };
  }
  return args.fromReminder
    ? PARKED_COPY.formAlert
    : {
        title: "Trip saved",
        body: "You'd parked, so your trip was finished and saved while the app was closed. You'll find it in Trips.",
      };
}
