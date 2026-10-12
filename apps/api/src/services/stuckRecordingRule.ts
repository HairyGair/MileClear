// Whether to send a driver the server's "your trip is still recording" push.
//
// Kada (Amazon Flex), 9 Oct 2026: a Start Trip with "runs until I tap Arrived"
// on is deliberately left running through waits. The phone now owns the
// reminder for that case ("Still on your trip?", scheduled on the phone so it
// works without signal), so the server nudge must stay quiet or the driver gets
// two prompts for the same stop. Both senders (the diagnostic scan in
// jobs/notifications.ts and the dump upload in routes/user) used this one rule so
// they could not diverge. Since 12 Oct 2026 only the scan sends (see
// recordingAlreadySaved below); the upload no longer pushes.

export interface StuckRecordingInput {
  /** statusJson.autoRecordingActive from the dump */
  autoRecording: boolean | undefined;
  /** last_driving_speed_at from the dump's trackingState, as a string */
  lastDrivingStr: string | undefined;
  nowMs: number;
  /** statusJson.trackingState rows */
  trackingState: Array<{ key: string; value: string }> | undefined;
  /** Only send when the driver has been stopped longer than this */
  minElapsedMs: number;
  /** Ignore dumps older than this (the driver has probably resolved it). Omit for no ceiling. */
  maxElapsedMs?: number;
}

/**
 * True only when the dump shows a Start Trip running now (the quick-trip lock,
 * or the reminder's state row). The setting alone, or a reminder shown earlier
 * in the day, says nothing about the recording in this dump, so a stuck
 * automatic recording still gets its alert.
 */
export function isStartTripReminderOwned(
  trackingState: Array<{ key: string; value: string }> | undefined
): boolean {
  if (!Array.isArray(trackingState)) return false;
  for (const row of trackingState) {
    if (!row || typeof row.key !== "string") continue;
    if (row.key === "active_shift_id" && row.value === "__quick_trip__") return true;
    if (row.key === "start_trip_parked_reminder") return true;
  }
  return false;
}

export function shouldSendStuckRecordingAlert(input: StuckRecordingInput): boolean {
  if (input.autoRecording !== true || !input.lastDrivingStr) return false;
  const lastDrivingMs = parseInt(input.lastDrivingStr, 10);
  if (!Number.isFinite(lastDrivingMs)) return false;
  if (isStartTripReminderOwned(input.trackingState)) return false;
  const elapsed = input.nowMs - lastDrivingMs;
  if (elapsed <= input.minElapsedMs) return false;
  if (input.maxElapsedMs != null && elapsed >= input.maxElapsedMs) return false;
  return true;
}

/**
 * How far either side of the last-driving moment a saved trip may sit and still
 * count as "that recording". The phone stops writing last_driving_speed_at when
 * the car stops, and the trip it saves ends at about that moment. The stamp
 * and the saved trip can still disagree by a little (the last fix before the
 * stop was stamped but not part of the trip), so a trip ending up to this long
 * BEFORE the stamp still counts as that drive. Five minutes covers the
 * disagreement without reaching back to an earlier drive.
 */
export const RECORDING_SAVED_SLACK_MS = 5 * 60 * 1000;

export interface SavedTripRow {
  endedAt: Date | null;
}

/**
 * True when an automatic trip covering this recording has already been saved,
 * so the "Trip still recording" push would be wrong.
 *
 * 12 Oct 2026, measured over 14 days: 1,213 scan alerts, 96% of them sent after
 * an automatic trip covering the recording had been created, because the dump
 * records autoRecordingActive at upload time and nothing checked whether the
 * app had finished the trip since.
 *
 * The trip that saves a recording ends at or after the last driving moment, so
 * a trip counts only when endedAt >= lastDriving - slack. An earlier version
 * accepted any trip that ended up to 45 minutes BEFORE the stamp, which hid a
 * real stuck recording: trip A saves at T, trip B starts at T+5 and the app is
 * suspended at T+20 (last driving = T+20), B never ends, and A "ended within
 * 45 minutes" so B's alert was suppressed. A ended before B's last driving
 * moment, so it can no longer pass as B's save.
 *
 * The dump's trackingState has no recording-start key (the phone writes only
 * auto_recording_active = '1', never a start time), so the trip's startedAt
 * cannot also be compared with the recording's start.
 *
 * Pass automatic (isManualEntry false) trips only; the caller does the query.
 */
export function recordingAlreadySaved(
  trips: ReadonlyArray<SavedTripRow>,
  lastDrivingMs: number
): boolean {
  if (!Number.isFinite(lastDrivingMs)) return false;
  const since = lastDrivingMs - RECORDING_SAVED_SLACK_MS;
  return trips.some((t) => t.endedAt != null && t.endedAt.getTime() >= since);
}
