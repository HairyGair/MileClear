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
 * the car stops, and the trip it saves ends at about that moment, so a trip
 * whose end is within 45 minutes of it is the same drive.
 */
export const RECORDING_SAVED_WINDOW_MS = 45 * 60 * 1000;

export interface SavedTripRow {
  endedAt: Date | null;
  createdAt: Date;
}

/**
 * True when an automatic trip covering this recording has already been saved,
 * so the "Trip still recording" push would be wrong.
 *
 * 12 Oct 2026, measured over 14 days: 1,213 scan alerts, 96% of them sent after
 * an automatic trip covering the recording had been created, because the dump
 * records autoRecordingActive at upload time and nothing checked whether the
 * app had finished the trip since. The upload path raced the app's own save
 * the same way. A trip counts when it ended within the window of the
 * last-driving moment AND was created after the window began (a trip that was
 * created long before is an earlier drive, not the saved recording). A real
 * stuck recording has no such trip, so it is still caught.
 *
 * Pass automatic (isManualEntry false) trips only; the caller does the query.
 */
export function recordingAlreadySaved(
  trips: ReadonlyArray<SavedTripRow>,
  lastDrivingMs: number
): boolean {
  if (!Number.isFinite(lastDrivingMs)) return false;
  const since = lastDrivingMs - RECORDING_SAVED_WINDOW_MS;
  return trips.some(
    (t) => t.endedAt != null && t.endedAt.getTime() >= since && t.createdAt.getTime() >= since
  );
}
