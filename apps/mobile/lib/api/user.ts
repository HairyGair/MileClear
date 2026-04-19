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
