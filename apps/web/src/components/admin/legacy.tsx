"use client";

// Types and helpers carried over from the old single-file admin page (Sep 2026
// redesign). Every section page imports what it needs from here. Trim as the
// sections stop using pieces of it.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RatingFunnel {
  promptsShown: number;
  loveIt: number;
  couldBeBetter: number;
  alreadyRated: number;
  notNow: number;
  nativeDialogRequested: number;
}

export interface Analytics {
  totalUsers: number;
  activeUsers30d: number;
  premiumUsers: number;
  payingSubscribers?: number;
  compPro?: number;
  referralPro?: number;
  sandboxPro?: number;
  totalTrips: number;
  totalMiles: number;
  totalEarningsPence: number;
  usersThisMonth: number;
  platformCounts?: { ios: number; android: number; both: number; web: number; unknown: number };
  tripsThisMonth: number;
  ratingFunnel?: RatingFunnel;
  referrals?: {
    attached: number;
    qualified: number;
    activeCreditUsers: number;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  isPremium: boolean;
  proSource?: "paying" | "comp" | "referral" | "sandbox" | null;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  lastTripAt?: string | null;
  platforms?: string[];
  signupPlatform?: string | null;
  signupLocation?: string | null;
  _count: {
    trips: number;
    vehicles: number;
    earnings: number;
  };
  diagnosticDump?: {
    verdict: string;
    capturedAt: string;
  } | null;
  // Per-user health score (audit follow-up #2). 0-100 + coarse band.
  healthScore?: number;
  healthBand?: "good" | "warning" | "critical" | "unknown";
  buildNumber?: string | null;
  appVersion?: string | null;
  trialUsedAt?: string | null;
  referralProUntil?: string | null;
  marketingEmailsEnabled?: boolean;
  hasPushToken?: boolean;
  // Placeholder Apple Sign-In email + no push token: no channel reaches them.
  unreachable?: boolean;
}

// One row of the deleted_trips archive (GET /admin/users/:userId/deleted-trips).
export interface AdminDeletedTrip {
  id: string;
  originalTripId: string;
  deletedAt: string;
  deletedBy: "user" | "admin" | string;
  restoredTripId: string | null;
  restoredAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  distanceMiles: number | null;
  startAddress: string | null;
  endAddress: string | null;
  classification: string;
}

export interface AdminUserDetail extends AdminUser {
  platforms?: string[];
  signupPlatform?: string | null;
  signupLocation?: string | null;
  totalMiles: number;
  totalEarningsPence: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  appleId: string | null;
  googleId: string | null;
  premiumExpiresAt: string | null;
  notes: string | null;
  // Heartbeat telemetry (1.0.10+ basic + 1.1.3+ extended)
  lastHeartbeatAt?: string | null;
  bgLocationPermission?: string | null;
  notificationPermission?: string | null;
  trackingTaskActive?: boolean | null;
  appVersion?: string | null;
  buildNumber?: string | null;
  osVersion?: string | null;
  lastPendingSyncCount?: number | null;
  // 1.1.3+ telemetry
  lastSyncQueueFailed?: number | null;
  lastSyncQueuePermFailed?: number | null;
  secondsSinceLastTripPost?: number | null;
  daysSinceLastTrip?: number | null;
  freeDiskBytes?: string | null; // BigInt serialised as string by JSON
  backgroundFetchStatus?: string | null;
  autoRecordingActive?: boolean | null;
  recordingStartedAt?: string | null;
  lastDrivingSpeedAt?: string | null;
  vehicles: { id: string; make: string; model: string; fuelType: string; vehicleType: string }[];
  trips: {
    id: string;
    distanceMiles: number;
    classification: string;
    startedAt: string;
    platformTag: string | null;
  }[];
  // Monetisation
  subscriptionPlatform?: "apple" | "stripe" | "none";
  subscriptionEnvironment?: "production" | "sandbox" | null;
  subscriptionPeriod?: "monthly" | "annual" | null;
  subscriptionPeriodInferred?: boolean;
  referralCode?: string | null;
  referralProUntil?: string | null;
  referredByCode?: string | null;
  // Reachability
  marketingEmailsDisabledAt?: string | null;
  marketingEmailsDisabledSource?: string | null;
  // Profile / segmentation
  fullName?: string | null;
  workType?: string;
  dashboardMode?: string;
  userIntent?: string | null;
  // Feature adoption counts (superset of the list _count)
  _count: {
    trips: number;
    vehicles: number;
    earnings: number;
    shifts: number;
    fuelLogs: number;
    expenses: number;
    invoices: number;
    savedLocations: number;
    achievements: number;
    feedback: number;
    plaidConnections: number;
    accountantAccess: number;
    referralsMade: number;
  };
  integrations?: {
    hmrc: boolean;
    quickbooks: boolean;
    discord: boolean;
    openBanking: boolean;
    accountantSharing: boolean;
  };
  lifecycle?: {
    firstTripAt: string | null;
    weeklyTrips: number[]; // last 8 weeks, oldest first
    churnRisk: boolean;
  };
}

export interface AdminUserEvent {
  id: string;
  type: string;
  metadata: Record<string, unknown> | null;
  buildNumber: string | null;
  createdAt: string;
}

export type UsersSortBy = "createdAt" | "lastTripAt" | "lastLoginAt";

/** "Apple", "Android", "Both", "Web" or "-" from the platforms-seen set. */
export function platformLabel(platforms?: string[] | null): string {
  const set = new Set(platforms ?? []);
  if (set.has("ios") && set.has("android")) return "Both";
  if (set.has("ios")) return "Apple";
  if (set.has("android")) return "Android";
  if (set.has("web")) return "Web";
  return "-";
}

export interface UsersFilters {
  plan: string;
  provider: string;
  lifecycle: string;
  healthBand: string;
  unreachable: boolean;
  syncBroken: boolean;
  marketingOff: boolean;
}

export const EMPTY_USERS_FILTERS: UsersFilters = {
  plan: "",
  provider: "",
  lifecycle: "",
  healthBand: "",
  unreachable: false,
  syncBroken: false,
  marketingOff: false,
};

export function usersFilterParams(filters: UsersFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.plan) params.set("plan", filters.plan);
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.lifecycle) params.set("lifecycle", filters.lifecycle);
  if (filters.healthBand) params.set("healthBand", filters.healthBand);
  if (filters.unreachable) params.set("unreachable", "1");
  if (filters.syncBroken) params.set("syncBroken", "1");
  if (filters.marketingOff) params.set("marketing", "off");
  return params;
}

export interface AdminTripPath {
  id: string;
  startedAt: string;
  endedAt: string | null;
  distanceMiles: number;
  classification: string;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  isManualEntry: boolean;
  coordinates: Array<{ lat: number; lng: number }>;
}

export type TripMapRange = "last20" | "last50" | "last7d";

export interface UsersResponse {
  data: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DiagnosticDump {
  id: string;
  userId: string;
  capturedAt: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  buildNumber: string;
  verdict: string;
  statusJson: Record<string, unknown>;
  eventsJson: Array<{ recorded_at: string; event: string; data: string | null }>;
  createdAt: string;
}

export interface HealthData {
  api: string;
  database: string;
  databaseLatencyMs: number;
  recordCounts: {
    users: number;
    trips: number;
    shifts: number;
    vehicles: number;
    fuelLogs: number;
    earnings: number;
    achievements: number;
  };
  uptime: number;
  memoryUsageMb: number;
  nodeVersion: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatPence(pence: number): string {
  return (pence / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Full numbers with thousands separators. The overview used to abbreviate
// anything from 1,000 up ("1.0K"), which turned the day the fleet passed a
// thousand users into a rounded label (Anthony, 8 Sep 2026). Every count on
// these cards fits in full.
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildDiagnosticDumpText(diag: DiagnosticDump, user: AdminUserDetail): string {
  const lines: string[] = [];
  const sep = "=".repeat(60);
  const sub = "-".repeat(60);

  lines.push("MileClear Drive Detection Diagnostic");
  lines.push(sep);
  lines.push("");
  lines.push("User");
  lines.push(sub);
  lines.push(`Email:        ${user.email}`);
  lines.push(`User ID:      ${user.id}`);
  if (user.displayName) lines.push(`Display name: ${user.displayName}`);
  lines.push(`Premium:      ${user.isPremium ? "yes" : "no"}`);
  lines.push(`Admin:        ${user.isAdmin ? "yes" : "no"}`);
  lines.push(`Joined:       ${new Date(user.createdAt).toISOString()}`);
  lines.push("");

  lines.push("Capture");
  lines.push(sub);
  lines.push(`Diagnostic ID: ${diag.id}`);
  lines.push(`Captured at:   ${new Date(diag.capturedAt).toISOString()}`);
  lines.push(`Uploaded at:   ${new Date(diag.createdAt).toISOString()}`);
  lines.push(`Verdict:       ${diag.verdict}`);
  lines.push(`Platform:      ${diag.platform} ${diag.osVersion}`);
  lines.push(`App version:   ${diag.appVersion} (build ${diag.buildNumber})`);
  lines.push("");

  lines.push(`Status (${Object.keys(diag.statusJson || {}).length} fields)`);
  lines.push(sub);
  const status = diag.statusJson || {};
  const statusKeys = Object.keys(status).sort();
  for (const key of statusKeys) {
    const value = status[key];
    const display =
      value === null || value === undefined
        ? "-"
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    lines.push(`${key.padEnd(32)} ${display}`);
  }
  lines.push("");

  lines.push(`Events (${diag.eventsJson.length})`);
  lines.push(sub);
  if (diag.eventsJson.length === 0) {
    lines.push("(no events recorded)");
  } else {
    for (const ev of diag.eventsJson) {
      const ts = new Date(ev.recorded_at).toISOString();
      lines.push(`[${ts}] ${ev.event}${ev.data ? ` ${ev.data}` : ""}`);
    }
  }
  lines.push("");

  lines.push("Raw statusJson");
  lines.push(sub);
  lines.push(JSON.stringify(diag.statusJson, null, 2));
  lines.push("");

  lines.push("Raw eventsJson");
  lines.push(sub);
  lines.push(JSON.stringify(diag.eventsJson, null, 2));
  lines.push("");

  return lines.join("\n");
}

export function StatusDot({ status }: { status: string }) {
  const ok = status === "ok";
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: ok ? "var(--emerald-400)" : "var(--dash-red)",
        boxShadow: ok
          ? "0 0 8px rgba(16,185,129,0.4)"
          : "0 0 8px rgba(239,68,68,0.4)",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------

// Feedback constants shared by the Support and Overview sections.
export const FB_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
];

export const FB_CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "feature_request", label: "Feature Request" },
  { value: "bug_report", label: "Bug Report" },
  { value: "improvement", label: "Improvement" },
  { value: "other", label: "Other" },
];

export const FB_STATUSES = [
  { value: "new", label: "New", color: "#8494a7" },
  { value: "planned", label: "Planned", color: "#3b82f6" },
  { value: "in_progress", label: "In Progress", color: "#f5a623" },
  { value: "done", label: "Done", color: "#34c759" },
  { value: "declined", label: "Declined", color: "#ef4444" },
];

export const KI_STATUSES = [
  { value: "investigating", label: "Investigating", color: "#f59e0b" },
  { value: "fix_in_progress", label: "Fix in Progress", color: "#3b82f6" },
  { value: "fixed", label: "Fixed", color: "#10b981" },
];

export interface FbItem {
  id: string;
  displayName: string | null;
  title: string;
  body: string;
  category: string;
  status: string;
  upvoteCount: number;
  replyCount: number;
  isKnownIssue: boolean;
  knownIssueStatus: string | null;
  createdAt: string;
  hasVoted: boolean;
  isOwner: boolean;
  replies: { id: string; body: string; adminName: string; createdAt: string }[];
}

