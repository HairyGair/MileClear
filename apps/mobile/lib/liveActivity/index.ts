/**
 * Live Activity (Dynamic Island) bridge
 *
 * Wraps the native LiveActivityModule with graceful fallbacks.
 * Returns null/void silently when not supported (Expo Go, Android, iOS < 16.2).
 */

import { NativeModules, Platform } from "react-native";

const LiveActivityModule = NativeModules.LiveActivityModule;

let currentActivityId: string | null = null;
let activityStartDateMs: number | null = null;

// The last error from a failed startActivity - typically iOS refusing a
// background start. Surfaced to the diagnostics so we can see WHY a background
// auto-start was blocked (e.g. an ActivityAuthorizationError) instead of
// guessing. Foreground starts succeed; the gap is the background path.
let lastStartError: string | null = null;
export function getLastLiveActivityStartError(): string | null {
  return lastStartError;
}

/**
 * Check if Live Activities are supported and enabled on this device.
 */
export async function isLiveActivitySupported(): Promise<boolean> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return false;
  try {
    return await LiveActivityModule.isSupported();
  } catch {
    return false;
  }
}

/**
 * Start a Live Activity (Dynamic Island + lock screen widget).
 * Returns the activity ID, or null if unsupported/failed.
 */
export async function startLiveActivity(params: {
  activityType: "trip" | "shift";
  vehicleName?: string;
  isBusinessMode: boolean;
  /**
   * Override the LA's start time. Defaults to Date.now() (the moment startLiveActivity
   * was called). Used by watch-and-wait promotion: the trip's actual GPS coords have
   * been buffering since BEFORE the LA was started, so the LA's clock should reflect
   * the earliest buffered coord time, not the moment of promotion.
   */
  startDateMs?: number;
  /**
   * Optional context label rendered below the header — e.g. "From Home"
   * for a geofence-detected trip departing a saved location. Fixed for
   * the activity's lifetime (lives on attrs, not state).
   */
  tripContextLabel?: string;
}): Promise<string | null> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return null;
  try {
    const id = await LiveActivityModule.startActivity({
      activityType: params.activityType,
      vehicleName: params.vehicleName ?? "",
      isBusinessMode: params.isBusinessMode,
      tripContextLabel: params.tripContextLabel ?? "",
    });
    currentActivityId = id;
    activityStartDateMs = params.startDateMs ?? Date.now();
    lastStartError = null;
    return id;
  } catch (e) {
    lastStartError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

/**
 * Update the current Live Activity with new state.
 *
 * Phase semantics:
 * - "active": normal in-progress view (timer counts up)
 * - "saving": flipped by the App Intent (iOS 17+) or the URL handler fallback
 *   immediately when the user taps End Trip - shows "Saving trip..." while the
 *   main app does the actual finalize work
 * - "ended": final "Trip Complete" view with frozen duration and classify CTA
 */
export async function updateLiveActivity(params: {
  distanceMiles: number;
  speedMph: number;
  tripCount?: number;
  phase?: "active" | "saving" | "ended";
  endDateMs?: number;
  needsClassification?: boolean;
  /** Today's total business+personal miles across all trips. Powers the
   *  "TODAY" subtitle on the lock screen. Only shown when meaningfully
   *  different from the per-trip distance — pass 0 to hide. */
  dailyTotalMiles?: number;
  /** Milestone proximity message — "5.4 mi to 10K Club", "100 miles
   *  tonight!". Shown as the "NEXT" subtitle. Pass null/undefined to
   *  hide. */
  milestoneText?: string | null;
  /** Today's earnings tally in pence, sum of manual + CSV + open-banking
   *  sources. Shown on shift activities only — the "EARNED" subtitle.
   *  Pass null/undefined to hide. */
  earningsTodayPence?: number | null;
}): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule || !currentActivityId) return;
  try {
    await LiveActivityModule.updateActivity({
      activityId: currentActivityId,
      distanceMiles: params.distanceMiles,
      speedMph: params.speedMph,
      tripCount: params.tripCount ?? 0,
      startDateMs: activityStartDateMs ?? Date.now(),
      phase: params.phase ?? "active",
      endDateMs: params.endDateMs ?? 0,
      needsClassification: params.needsClassification ?? false,
      dailyTotalMiles: params.dailyTotalMiles ?? 0,
      milestoneText: params.milestoneText ?? null,
      earningsTodayPence: params.earningsTodayPence ?? null,
    });
  } catch {}
}

/**
 * Flip the Live Activity into the "saving" phase immediately. Called as the
 * first action when the user taps End Trip on the lock screen, so they see
 * "Saving trip..." before the main app starts running finalize.
 *
 * On iOS 17+ the App Intent already does this in the widget process, so this
 * is a no-op double-check. On iOS 16.x the URL handler relies on it for
 * visual feedback.
 */
export async function markLiveActivitySaving(currentDistanceMiles: number): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return;
  try {
    await LiveActivityModule.updateActivity({
      activityId: currentActivityId,
      distanceMiles: currentDistanceMiles,
      speedMph: 0,
      tripCount: 0,
      startDateMs: activityStartDateMs ?? Date.now(),
      phase: "saving",
      endDateMs: Date.now(),
      needsClassification: false,
    });
  } catch {}
}

/**
 * Read the current Live Activity phase, or null if none is running.
 * Used on app startup / AppState active to detect when an App Intent has
 * flipped the activity to "saving" and the main app now needs to finalize.
 */
export async function getLiveActivityPhase(): Promise<string | null> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return null;
  try {
    const phase = await LiveActivityModule.getLiveActivityPhase();
    return phase ?? null;
  } catch {
    return null;
  }
}

/**
 * End the current Live Activity immediately.
 */
export async function endLiveActivity(): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return;
  try {
    await LiveActivityModule.endActivity();
    currentActivityId = null;
    activityStartDateMs = null;
  } catch {}
}

/**
 * End the current Live Activity with a final summary that stays on the lock screen briefly.
 * The resulting state is rendered in the "Trip Complete" phase view with a frozen
 * duration, large distance, and an optional "Classify Trip" CTA.
 */
export async function endLiveActivityWithSummary(params: {
  distanceMiles: number;
  tripCount?: number;
  startDateMs?: number;
  endDateMs?: number;
  needsClassification?: boolean;
  /**
   * HMRC deduction earned by the trip, in pence. Rendered in the
   * frozen summary's third stat column as "£X.XX · HMRC" for
   * business trips. Pass null/undefined or 0 to keep the default
   * "SAVED" checkmark.
   */
  hmrcDeductionPence?: number | null;
}): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return;
  try {
    await LiveActivityModule.endActivityWithSummary({
      distanceMiles: params.distanceMiles,
      tripCount: params.tripCount ?? 0,
      startDateMs: params.startDateMs ?? activityStartDateMs ?? Date.now(),
      endDateMs: params.endDateMs ?? Date.now(),
      needsClassification: params.needsClassification ?? false,
      hmrcDeductionPence: params.hmrcDeductionPence ?? null,
    });
    currentActivityId = null;
    activityStartDateMs = null;
  } catch {}
}

/**
 * Clear the "Classify Trip" CTA from any active or ended Live Activity
 * once the user has classified the trip in the app.
 */
export async function markLiveActivityClassified(): Promise<void> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return;
  try {
    await LiveActivityModule.markClassified();
  } catch {}
}

/**
 * Get the ID of any currently running Live Activity.
 * Used for recovery after app kill - if a Live Activity is still alive
 * but our JS state was lost, we can resume updating it.
 */
export async function getActiveActivityId(): Promise<string | null> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return null;
  try {
    return await LiveActivityModule.getActiveActivityId();
  } catch {
    return null;
  }
}

/**
 * Recover a Live Activity after app restart.
 * If a Live Activity is still running but our in-memory state was lost,
 * this restores the currentActivityId so updates can resume.
 */
export async function recoverLiveActivity(startDateMs?: number): Promise<boolean> {
  const id = await getActiveActivityId();
  if (id) {
    currentActivityId = id;
    activityStartDateMs = startDateMs ?? Date.now();
    return true;
  }
  return false;
}

/** Restart the Live Activity to work around the 8-hour expiry. */
export async function restartLiveActivity(params: {
  activityType: "trip" | "shift";
  vehicleName?: string;
  isBusinessMode: boolean;
  originalStartDateMs: number;
}): Promise<string | null> {
  if (Platform.OS !== "ios" || !LiveActivityModule) return null;
  try {
    // End existing
    await LiveActivityModule.endActivity();
    // Start fresh
    const id = await LiveActivityModule.startActivity({
      activityType: params.activityType,
      vehicleName: params.vehicleName ?? "",
      isBusinessMode: params.isBusinessMode,
    });
    currentActivityId = id;
    // Keep original start date so the timer shows total elapsed time
    activityStartDateMs = params.originalStartDateMs;
    // Immediately send an update with the correct startDate so the timer
    // doesn't reset to 00:00
    if (id) {
      await LiveActivityModule.updateActivity({
        activityId: id,
        distanceMiles: 0,
        speedMph: 0,
        tripCount: 0,
        startDateMs: params.originalStartDateMs,
      });
    }
    return id;
  } catch {
    return null;
  }
}
