// Apply a decision the driver made on the Live Activity itself.
//
// LiveActivityIntent runs in the WIDGET process, which owns none of the app's
// state - no SQLite, no API client, no sync queue. Two channels carry the tap
// back here:
//
// 1. App Group UserDefaults (builds >= 90, 11 Sep 2026). The intent records
//    {kind, classification?, atMs} and ends the activity itself, so the card
//    clears at the kerb. The app reads the record on every native location
//    fix, every heartbeat, and at launch/foreground - the first of those that
//    runs applies it. "Not Driving" is read while the car is still moving,
//    which is the only moment cancelling the recording is worth anything.
//
// 2. The activity's own `phase` (older widgets; pre-App-Group fallback). Only
//    readable while the activity is still up, which after a finished trip
//    means only at the next launch. Kept so a stale widget still works.
//
// Called from every place the app checks the phase: launch, foreground, the
// legacy detection task, the native location + heartbeat handlers.

import {
  getLiveActivityPhase,
  markLiveActivityClassified,
  endLiveActivity,
  getPendingLiveActivityDecision,
  clearPendingLiveActivityDecision,
} from "./index";
import { decidePendingDecision, parsePendingDecision, type NewestTrip } from "./pendingRule";

export type PendingLiveActivityAction =
  | { kind: "classified"; classification: "business" | "personal"; tripId: string }
  | { kind: "cancelled_recording" }
  | { kind: "add_short_trip" }
  | null;

function logEvent(event: string, meta?: Record<string, unknown>): void {
  import("../tracking/detection")
    .then((m) => m.logDetectionEvent(event, meta))
    .catch(() => {});
}

async function newestLocalTrip(): Promise<NewestTrip | null> {
  const { getDatabase } = await import("../db/index");
  const db = await getDatabase();
  const trip = await db.getFirstAsync<{ id: string; classification: string | null; ended_at: string | null }>(
    "SELECT id, classification, ended_at FROM trips ORDER BY started_at DESC LIMIT 1"
  );
  if (!trip) return null;
  const endedAtMs = trip.ended_at ? new Date(trip.ended_at).getTime() : null;
  return {
    id: trip.id,
    classification: trip.classification,
    endedAtMs: endedAtMs != null && Number.isFinite(endedAtMs) ? endedAtMs : null,
  };
}

async function classifyTrip(tripId: string, classification: "business" | "personal"): Promise<void> {
  const { syncUpdateTrip } = await import("../sync/actions");
  await syncUpdateTrip(tripId, { classification });
}

/**
 * Channel 1: the App Group record. Returns the action taken, or null when
 * there was nothing to do. A failed apply leaves the record for the next poll.
 */
async function applySharedDecision(): Promise<PendingLiveActivityAction> {
  const decision = parsePendingDecision(await getPendingLiveActivityDecision());
  if (!decision) return null;

  const { getDatabase } = await import("../db/index");
  const db = await getDatabase();
  const recording = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
  );
  const verdict = decidePendingDecision({
    decision,
    nowMs: Date.now(),
    recordingActive: recording?.value === "1",
    newestTrip: decision.kind === "classified" ? await newestLocalTrip() : null,
  });

  switch (verdict.action) {
    case "none":
      return null;
    case "clear":
      await clearPendingLiveActivityDecision();
      logEvent("la_decision_dropped", { kind: decision.kind, reason: verdict.reason });
      // The activity may still be up if the widget could not end it; nothing
      // is pending on it any more.
      await endLiveActivity().catch(() => {});
      return null;
    case "cancel_recording": {
      const { cancelAutoRecording } = await import("../tracking/detection");
      // clearCoords: discard the buffered drive, empty the native store, and
      // arm the not-driving cooldown so the next fix does not re-open it.
      await cancelAutoRecording(true);
      await clearPendingLiveActivityDecision();
      logEvent("la_not_driving_applied", { ageMs: Date.now() - decision.atMs });
      return { kind: "cancelled_recording" };
    }
    case "classify":
      await classifyTrip(verdict.tripId, verdict.classification);
      await clearPendingLiveActivityDecision();
      await markLiveActivityClassified().catch(() => {});
      await endLiveActivity().catch(() => {});
      return { kind: "classified", classification: verdict.classification, tripId: verdict.tripId };
  }
}

/**
 * Channel 2: the activity's phase, for widgets that predate the shared store.
 */
async function applyPhaseDecision(): Promise<PendingLiveActivityAction> {
  const phase = await getLiveActivityPhase().catch(() => null);
  if (!phase) return null;

  if (phase === "classified_business" || phase === "classified_personal") {
    const classification = phase === "classified_business" ? "business" : "personal";
    const trip = await newestLocalTrip();
    if (!trip) {
      await endLiveActivity();
      return null;
    }
    if (trip.classification && trip.classification !== "unclassified") {
      // Already decided elsewhere; just clear the activity.
      await markLiveActivityClassified().catch(() => {});
      await endLiveActivity();
      return null;
    }
    await classifyTrip(trip.id, classification);
    await markLiveActivityClassified().catch(() => {});
    await endLiveActivity();
    return { kind: "classified", classification, tripId: trip.id };
  }

  if (phase === "too_short_add") {
    // The app has to own this one - it needs the manual-entry form. The
    // caller decides whether it can navigate (foreground) or should leave
    // the phase for the next launch (background task).
    return { kind: "add_short_trip" };
  }

  return null;
}

/**
 * Resolve and apply anything the driver tapped on the activity.
 *
 * Classification is applied to their most recent trip: the ended activity
 * describes the drive that just finished, and the intent only offers the
 * buttons while `needsClassification` is set on that same activity, so the
 * newest trip is the one being answered about. Guarded anyway - if the newest
 * trip is already classified we do nothing rather than overwrite a decision
 * the user made somewhere else.
 */
export async function applyPendingLiveActivityAction(): Promise<PendingLiveActivityAction> {
  try {
    const shared = await applySharedDecision();
    if (shared) return shared;
  } catch (err) {
    // Leave the record in place; the next poll tries again rather than
    // silently losing the user's tap.
    logEvent("la_decision_apply_error", {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    });
  }
  try {
    return await applyPhaseDecision();
  } catch {
    return null;
  }
}
