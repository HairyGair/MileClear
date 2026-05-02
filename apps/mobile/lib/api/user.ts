import { apiRequest } from "./index";
import type { User, WeeklyProgress, CalendarDay } from "@mileclear/shared";

export interface UpdateProfileData {
  displayName?: string | null;
  fullName?: string | null;
  avatarId?: string | null;
  email?: string;
  currentPassword?: string;
  userIntent?: "work" | "personal" | "both" | null;
  workType?: "gig" | "employee" | "both";
  employerMileageRatePence?: number | null;
  dashboardMode?: "both" | "work" | "personal";
  weeklyEarningsGoalPence?: number | null;
}

export function fetchProfile() {
  return apiRequest<{ data: User }>("/user/profile");
}

export function updateProfile(data: UpdateProfileData) {
  return apiRequest<{ data: User }>("/user/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function exportUserData() {
  return apiRequest<Record<string, unknown>>("/user/export");
}

export function deleteAccount(password: string) {
  return apiRequest<{ message: string }>("/user/account", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

export function fetchWeeklyProgress() {
  return apiRequest<{ data: WeeklyProgress }>("/user/weekly-progress");
}

export function fetchCalendar(year: number, month: number) {
  return apiRequest<{ data: CalendarDay[] }>(`/user/calendar?year=${year}&month=${month}`);
}

export interface HeartbeatData {
  bgLocationPermission?: "granted" | "denied" | "undetermined" | "restricted";
  notificationPermission?: "granted" | "denied" | "undetermined";
  trackingTaskActive?: boolean;
  appVersion?: string;
  buildNumber?: string;
  osVersion?: string;
  pendingSyncCount?: number;
  // 1.1.3+ telemetry. Server schema will accept these on next deploy; for
  // now they're silently stripped, which is harmless.
  /** Sync queue breakdown by status. */
  syncQueueFailed?: number;
  syncQueuePermFailed?: number;
  /** Seconds since the most recent trip was successfully synced to server.
   *  Identifies users where sync is silently broken even if the queue counts
   *  look healthy. */
  secondsSinceLastTripPost?: number;
  /** Whole days since the most recent trip was recorded. Distinguishes
   *  active drivers from passive installs. */
  daysSinceLastTrip?: number;
  /** Free disk bytes (best-effort). When low, SQLite writes start failing
   *  silently — surface this so we can warn the user before they lose data. */
  freeDiskBytes?: number;
  /** iOS BackgroundFetch.BackgroundFetchStatus. If "denied" or "restricted",
   *  the user has Background App Refresh disabled and tracking is unreliable. */
  backgroundFetchStatus?: "available" | "denied" | "restricted";
  // Watchdog state. These let the server-side recording-watchdog cron spot
  // stuck recordings even when the device's setInterval watchdog is
  // suspended by iOS. The cron sends a silent push to wake the JS runtime
  // and finalise the stuck recording.
  /** True when the device currently has an active auto-recording. */
  autoRecordingActive?: boolean;
  /** ISO timestamp when the current recording started (null otherwise). */
  recordingStartedAt?: string;
  /** ISO timestamp of the most recent driving-speed observation. Stale
   *  value (>30 min) on the server means the recording is probably stuck. */
  lastDrivingSpeedAt?: string;
}

/**
 * Heartbeat ping - called once per app launch (rate-limited to once per 24h).
 * Reports current permission state + app/OS version so admin can spot silent
 * failures without waiting for a user-initiated diagnostic dump.
 */
export function sendHeartbeat(data: HeartbeatData) {
  return apiRequest<{ success: boolean }>("/user/heartbeat", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
