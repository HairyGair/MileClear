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
  employerMileageRatePenceAfter10k?: number | null;
  otherAnnualIncomePence?: number | null;
  /** PAYE tax already deducted by an employer this tax year, in pence.
   *  Drives the Tax Readiness "what's still owed" calculation for
   *  mixed PAYE+self-employed users. Laura Joyce request 10 May 2026. */
  payeAnnualPaidTaxPence?: number | null;
  /** Accounting basis. cash = count when paid; accruals = count when
   *  invoiced. Affects invoice → Tax Readiness aggregation. */
  taxBasis?: "cash" | "accruals";
  /** Accountant name. Laura Joyce 11 May 2026 — when set, the annual
   *  fee gets amortised across 52 weeks and added to the Tax
   *  Readiness weekly set-aside. */
  accountantName?: string | null;
  /** Accountant contact info (email or phone, free text). */
  accountantContact?: string | null;
  /** Annual accountant fee in pence. */
  accountantAnnualFeePence?: number | null;
  dashboardMode?: "both" | "work" | "personal";
  weeklyEarningsGoalPence?: number | null;
  // Business profile for the invoice builder (Get Paid, Jul 2026).
  // Bank details are encrypted at rest server-side; the profile GET
  // returns them decrypted for the owner.
  tradingName?: string | null;
  businessAddress?: string | null;
  vatRegistered?: boolean;
  vatNumber?: string | null;
  invoiceAccentColor?: string | null;
  invoicePaymentTermsDays?: number;
  bankAccountName?: string | null;
  bankSortCode?: string | null;
  bankAccountNumber?: string | null;
}

/** Business-profile fields returned by /user/profile alongside the shared
 *  User shape (the shared type doesn't carry them yet). */
export interface BusinessProfileFields {
  tradingName: string | null;
  businessAddress: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  invoiceAccentColor: string | null;
  invoicePaymentTermsDays: number;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
}

export function fetchProfile() {
  return apiRequest<{ data: User & Partial<BusinessProfileFields> }>("/user/profile");
}

// ── Business logo (invoice branding) ─────────────────────────────────
// Multipart upload can't go through apiRequest (it forces a JSON
// Content-Type on any body) — raw fetch with the stored token, matching
// the exports.ts pattern.

import * as SecureStore from "expo-secure-store";

const RAW_API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.mileclear.com";
const LOGO_TOKEN_KEY = "mileclear_access_token";

export async function uploadLogo(fileUri: string, mime: "image/png" | "image/jpeg"): Promise<void> {
  const token = await SecureStore.getItemAsync(LOGO_TOKEN_KEY);
  if (!token) throw new Error("Not authenticated");
  const form = new FormData();
  // React Native FormData file part: { uri, name, type }
  form.append("file", {
    uri: fileUri,
    name: mime === "image/png" ? "logo.png" : "logo.jpg",
    type: mime,
  } as unknown as Blob);
  const res = await fetch(`${RAW_API_URL}/user/logo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Upload failed (${res.status})`);
  }
}

/** Returns a data URI for previewing the stored logo, or null when none. */
export async function fetchLogoDataUri(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(LOGO_TOKEN_KEY);
  if (!token) return null;
  const res = await fetch(`${RAW_API_URL}/user/logo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export function deleteLogo() {
  return apiRequest<{ data: { deleted: boolean } }>("/user/logo", { method: "DELETE" });
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

export interface DataQualityImprovement {
  improvedTripCount: number;
  milesGained: number;
  firstImprovementAt: string | null;
  lastImprovementAt: string | null;
}

/**
 * Fetch the user's recent server-side data corrections (last 14 days).
 * Powers the dashboard celebration banner that fires once when the user
 * first opens the app after a backfill ran.
 */
export function fetchDataQualityImprovement() {
  return apiRequest<{ data: DataQualityImprovement }>("/user/data-quality-improvement");
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
