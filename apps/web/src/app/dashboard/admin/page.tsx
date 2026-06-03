"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Modal } from "../../../components/ui/Modal";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { Pagination } from "../../../components/ui/Pagination";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RatingFunnel {
  promptsShown: number;
  loveIt: number;
  couldBeBetter: number;
  alreadyRated: number;
  notNow: number;
  nativeDialogRequested: number;
}

interface Analytics {
  totalUsers: number;
  activeUsers30d: number;
  premiumUsers: number;
  totalTrips: number;
  totalMiles: number;
  totalEarningsPence: number;
  usersThisMonth: number;
  tripsThisMonth: number;
  ratingFunnel?: RatingFunnel;
  referrals?: {
    attached: number;
    qualified: number;
    activeCreditUsers: number;
  };
}

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  lastTripAt?: string | null;
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
}

interface AdminUserDetail extends AdminUser {
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
}

type UsersSortBy = "createdAt" | "lastTripAt" | "lastLoginAt";

interface AdminTripPath {
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

type TripMapRange = "last20" | "last50" | "last7d";

interface UsersResponse {
  data: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface DiagnosticDump {
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

interface HealthData {
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

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function timeAgo(date: string): string {
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function downloadTextFile(filename: string, content: string) {
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

function buildDiagnosticDumpText(diag: DiagnosticDump, user: AdminUserDetail): string {
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

function StatusDot({ status }: { status: string }) {
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
// Overview Tab
// ---------------------------------------------------------------------------

interface RatingDiagnostics {
  totalLoveItEvents: number;
  distinctUsers: number;
  usersWithSinglePrompt: number;
  usersWithRepeat: number;
  usersAt3Plus: number;
  byBuild: Array<{ buildNumber: string; appVersion: string | null; count: number }>;
  generatedAt: string;
}

function OverviewTab() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [ratingDiag, setRatingDiag] = useState<RatingDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ data: Analytics }>("/admin/analytics"),
      api.get<{ data: { total: number; byStatus: Record<string, number> } }>("/feedback/stats"),
      api.get<{ data: RatingDiagnostics }>("/admin/rating/diagnostics"),
    ])
      .then(([analyticsRes, fbRes, diagRes]) => {
        setAnalytics(analyticsRes.data);
        setFeedbackStats(fbRes.data);
        setRatingDiag(diagRes.data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <div className="stats-grid" style={{ marginBottom: "1rem" }}>
          <LoadingSkeleton variant="card" count={4} style={{ height: 90 }} />
        </div>
        <div className="stats-grid">
          <LoadingSkeleton variant="card" count={4} style={{ height: 90 }} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="alert alert--error" role="alert">
        Failed to load analytics: {error}
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <>
      {/* Row 1 */}
      <div className="stats-grid" style={{ marginBottom: "1rem" }}>
        <div className="stat-card">
          <p className="stat-card__label">Total Users</p>
          <p className="stat-card__value">{formatNumber(analytics.totalUsers)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Active (30d)</p>
          <p className="stat-card__value stat-card__value--emerald">
            {formatNumber(analytics.activeUsers30d)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Premium Users</p>
          <p className="stat-card__value stat-card__value--amber">
            {formatNumber(analytics.premiumUsers)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Total Trips</p>
          <p className="stat-card__value">{formatNumber(analytics.totalTrips)}</p>
        </div>
      </div>

      {/* Row 2 */}
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">Total Miles</p>
          <p className="stat-card__value">{formatNumber(Math.round(analytics.totalMiles))} mi</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Total Earnings</p>
          <p className="stat-card__value stat-card__value--emerald">
            {formatPence(analytics.totalEarningsPence)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">New This Month</p>
          <p className="stat-card__value">{formatNumber(analytics.usersThisMonth)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Trips This Month</p>
          <p className="stat-card__value">{formatNumber(analytics.tripsThisMonth)}</p>
        </div>
      </div>

      {/* Referral program */}
      {analytics.referrals && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ color: "var(--text-2, #8494a7)", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            Referral Program
          </h3>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-card__label">Friends Signed Up</p>
              <p className="stat-card__value">{formatNumber(analytics.referrals.attached)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Free Months Granted</p>
              <p className="stat-card__value stat-card__value--emerald">{formatNumber(analytics.referrals.qualified)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">On Referral Pro Now</p>
              <p className="stat-card__value stat-card__value--amber">{formatNumber(analytics.referrals.activeCreditUsers)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Rating Funnel */}
      {analytics.ratingFunnel && analytics.ratingFunnel.promptsShown > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ color: "var(--text-2, #8494a7)", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            App Store Rating Funnel
          </h3>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-card__label">Prompts Shown</p>
              <p className="stat-card__value">{formatNumber(analytics.ratingFunnel.promptsShown)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Love it!</p>
              <p className="stat-card__value stat-card__value--emerald">{formatNumber(analytics.ratingFunnel.loveIt)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Native Dialog</p>
              <p className="stat-card__value stat-card__value--emerald">{formatNumber(analytics.ratingFunnel.nativeDialogRequested)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Could Be Better</p>
              <p className="stat-card__value stat-card__value--amber">{formatNumber(analytics.ratingFunnel.couldBeBetter)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Already Rated</p>
              <p className="stat-card__value">{formatNumber(analytics.ratingFunnel.alreadyRated)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Not Now</p>
              <p className="stat-card__value">{formatNumber(analytics.ratingFunnel.notNow)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Rating diagnostics — by build + per-user repeat tally. Helps
          explain the gap between "Love it!" intent and ratings actually
          showing up in App Store Connect. */}
      {ratingDiag && ratingDiag.totalLoveItEvents > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ color: "var(--text-2, #8494a7)", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            Rating Diagnostics
          </h3>

          <div className="stat-grid" style={{ marginBottom: "0.75rem" }}>
            <div className="stat-card">
              <p className="stat-card__label">Distinct users</p>
              <p className="stat-card__value">{formatNumber(ratingDiag.distinctUsers)}</p>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>fired Love it! at least once</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Single prompt</p>
              <p className="stat-card__value">{formatNumber(ratingDiag.usersWithSinglePrompt)}</p>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>1 Love it! event</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Repeats (≥2)</p>
              <p className="stat-card__value" style={{ color: ratingDiag.usersWithRepeat > 0 ? "#f59e0b" : undefined }}>
                {formatNumber(ratingDiag.usersWithRepeat)}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>likely hitting Apple&apos;s 3/yr ceiling</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Heavy (≥3)</p>
              <p className="stat-card__value" style={{ color: ratingDiag.usersAt3Plus > 0 ? "#ef4444" : undefined }}>
                {formatNumber(ratingDiag.usersAt3Plus)}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>almost certainly silent-no-op&apos;d</p>
            </div>
          </div>

          {ratingDiag.byBuild.length > 0 && (
            <div
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                padding: "0.75rem 0.875rem",
              }}
            >
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #f9fafb)", marginBottom: "0.5rem" }}>
                Love it! events by build at event time
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.4rem 1rem", fontSize: "0.8125rem" }}>
                {ratingDiag.byBuild.map((b) => (
                  <div key={b.buildNumber} style={{ display: "contents" }}>
                    <span style={{ color: "#cbd5e1", fontFamily: "monospace" }}>
                      {b.appVersion ? `${b.appVersion} (` : ""}build {b.buildNumber}{b.appVersion ? ")" : ""}
                    </span>
                    <span style={{ color: "#fcd34d", fontWeight: 600, fontFamily: "monospace" }}>{b.count}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.5rem" }}>
                Public App Store builds carry through to App Store Connect; TestFlight builds are silently dropped by Apple.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Row 3: Feedback */}
      {feedbackStats && (
        <div className="stats-grid" style={{ marginTop: "1rem" }}>
          <div className="stat-card">
            <p className="stat-card__label">Feedback Total</p>
            <p className="stat-card__value">{feedbackStats.total}</p>
          </div>
          <div className="stat-card">
            <p className="stat-card__label">New</p>
            <p className="stat-card__value" style={{ color: "#8494a7" }}>{feedbackStats.byStatus["new"] || 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-card__label">Planned</p>
            <p className="stat-card__value" style={{ color: "#3b82f6" }}>{feedbackStats.byStatus["planned"] || 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-card__label">In Progress</p>
            <p className="stat-card__value stat-card__value--amber">{feedbackStats.byStatus["in_progress"] || 0}</p>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// User Detail Modal
// ---------------------------------------------------------------------------

function UserDetailModal({
  userId,
  open,
  onClose,
}: {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiagnosticDump | null>(null);
  // Trip filter for the diagnostic events panel — when set, the events
  // list is scoped to that trip's time window (±60s). Mirrors the
  // mobile Drive Detection screen pattern.
  const [tripFilter, setTripFilter] = useState<{
    id: string;
    started_at: string;
    ended_at: string | null;
  } | null>(null);

  // Push notification to specific user
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushSending, setPushSending] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);

  // Notes editor
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesMessage, setNotesMessage] = useState<string | null>(null);

  // Trip map
  const [tripPaths, setTripPaths] = useState<AdminTripPath[] | null>(null);
  const [tripMapRange, setTripMapRange] = useState<TripMapRange>("last20");
  const [tripMapLoading, setTripMapLoading] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // Add trip form
  const [tripOpen, setTripOpen] = useState(false);
  const [tripVehicleId, setTripVehicleId] = useState("");
  const [tripStartedAt, setTripStartedAt] = useState("");
  const [tripEndedAt, setTripEndedAt] = useState("");
  const [tripStartLat, setTripStartLat] = useState("");
  const [tripStartLng, setTripStartLng] = useState("");
  const [tripEndLat, setTripEndLat] = useState("");
  const [tripEndLng, setTripEndLng] = useState("");
  const [tripStartAddress, setTripStartAddress] = useState("");
  const [tripEndAddress, setTripEndAddress] = useState("");
  const [tripDistance, setTripDistance] = useState("");
  const [tripClassification, setTripClassification] = useState<"business" | "personal" | "unclassified">("unclassified");
  const [tripPlatform, setTripPlatform] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [tripSaving, setTripSaving] = useState(false);
  const [tripResult, setTripResult] = useState<string | null>(null);

  const resetTripForm = useCallback(() => {
    setTripVehicleId("");
    setTripStartedAt("");
    setTripEndedAt("");
    setTripStartLat("");
    setTripStartLng("");
    setTripEndLat("");
    setTripEndLng("");
    setTripStartAddress("");
    setTripEndAddress("");
    setTripDistance("");
    setTripClassification("unclassified");
    setTripPlatform("");
    setTripNotes("");
    setTripResult(null);
  }, []);

  useEffect(() => {
    if (!userId || !open) return;
    setLoading(true);
    setError(null);
    setUser(null);
    setDiag(null);
    setPushTitle("");
    setPushBody("");
    setPushResult(null);
    setNotesDraft("");
    setNotesMessage(null);
    setTripOpen(false);
    setTripPaths(null);
    resetTripForm();
    Promise.all([
      api.get<{ data: AdminUserDetail }>(`/admin/users/${userId}`),
      api.get<{ data: DiagnosticDump | null }>(`/admin/users/${userId}/diagnostics`).catch(() => ({ data: null })),
    ])
      .then(([userRes, diagRes]) => {
        setUser(userRes.data);
        setDiag(diagRes.data);
        setNotesDraft(userRes.data.notes ?? "");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId, open, resetTripForm]);

  // Fetch trip paths whenever the modal opens or the range changes
  useEffect(() => {
    if (!userId || !open) return;
    setTripMapLoading(true);
    const params = new URLSearchParams();
    if (tripMapRange === "last20") params.set("limit", "20");
    else if (tripMapRange === "last50") params.set("limit", "50");
    else if (tripMapRange === "last7d") { params.set("days", "7"); params.set("limit", "100"); }
    api
      .get<{ data: AdminTripPath[] }>(`/admin/users/${userId}/trip-paths?${params}`)
      .then((res) => setTripPaths(res.data))
      .catch(() => setTripPaths([]))
      .finally(() => setTripMapLoading(false));
  }, [userId, open, tripMapRange]);

  // Render the Leaflet map when trip paths + container are ready
  useEffect(() => {
    if (!open || !tripPaths || tripPaths.length === 0 || !mapContainerRef.current) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    const renderMap = () => {
      const L = (window as any).L;
      if (!L || !mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      const colours = [
        "#fbbf24", "#60a5fa", "#34d399", "#f472b6", "#a78bfa",
        "#fb923c", "#2dd4bf", "#f87171", "#c084fc", "#facc15",
      ];

      const allLatlngs: [number, number][] = [];
      tripPaths!.forEach((t, i) => {
        const colour = colours[i % colours.length];
        if (t.coordinates.length >= 2) {
          const latlngs = t.coordinates.map((c) => [c.lat, c.lng] as [number, number]);
          L.polyline(latlngs, { color: colour, weight: 3, opacity: 0.8, smoothFactor: 1.5 }).addTo(map);
          allLatlngs.push(...latlngs);
        } else if (t.endLat !== null && t.endLng !== null) {
          const start: [number, number] = [t.startLat, t.startLng];
          const end: [number, number] = [t.endLat, t.endLng];
          L.polyline([start, end], {
            color: colour,
            weight: 2,
            opacity: 0.6,
            dashArray: "6, 8",
          }).addTo(map);
          allLatlngs.push(start, end);
        }
      });

      if (allLatlngs.length > 0) {
        map.fitBounds(L.latLngBounds(allLatlngs), { padding: [30, 30] });
      } else {
        map.setView([54.5, -2.5], 6);
      }

      mapInstanceRef.current = map;
    };

    if ((window as any).L) {
      renderMap();
      return;
    }

    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = renderMap;
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [open, tripPaths]);

  const handleSaveNotes = async () => {
    if (!userId) return;
    setNotesSaving(true);
    setNotesMessage(null);
    try {
      const res = await api.patch<{ data: { id: string; notes: string | null } }>(
        `/admin/users/${userId}/notes`,
        { notes: notesDraft.trim() || null },
      );
      if (user) setUser({ ...user, notes: res.data.notes });
      setNotesMessage("Saved");
      setTimeout(() => setNotesMessage(null), 2000);
    } catch (err: any) {
      setNotesMessage(`Error: ${err.message}`);
    } finally {
      setNotesSaving(false);
    }
  };

  const handleCreateTrip = async () => {
    if (!userId) return;
    if (!tripVehicleId || !tripStartedAt || !tripEndedAt || !tripStartLat || !tripStartLng || !tripEndLat || !tripEndLng) {
      setTripResult("Error: vehicle, start/end times, and start/end coords are required");
      return;
    }
    setTripSaving(true);
    setTripResult(null);
    try {
      const body: Record<string, unknown> = {
        vehicleId: tripVehicleId,
        startLat: Number(tripStartLat),
        startLng: Number(tripStartLng),
        endLat: Number(tripEndLat),
        endLng: Number(tripEndLng),
        startedAt: new Date(tripStartedAt).toISOString(),
        endedAt: new Date(tripEndedAt).toISOString(),
        classification: tripClassification,
      };
      if (tripStartAddress.trim()) body.startAddress = tripStartAddress.trim();
      if (tripEndAddress.trim()) body.endAddress = tripEndAddress.trim();
      if (tripDistance.trim()) body.distanceMiles = Number(tripDistance);
      if (tripPlatform.trim()) body.platformTag = tripPlatform.trim();
      if (tripNotes.trim()) body.notes = tripNotes.trim();

      await api.post<{ data: unknown }>(`/admin/users/${userId}/trips`, body);
      setTripResult("Trip created");
      resetTripForm();
      setTripOpen(false);
      // Refresh user detail to show the new trip in Recent Trips
      const refreshed = await api.get<{ data: AdminUserDetail }>(`/admin/users/${userId}`);
      setUser(refreshed.data);
    } catch (err: any) {
      setTripResult(`Error: ${err.message}`);
    } finally {
      setTripSaving(false);
    }
  };

  const handleSendPush = async (dryRun: boolean) => {
    if (!pushTitle.trim() || !pushBody.trim() || !userId) return;
    setPushSending(true);
    setPushResult(null);
    try {
      const res = await api.post<{ data: { sent: number; dryRun: boolean } }>("/admin/send-push", {
        audience: "specific",
        userId,
        title: pushTitle.trim(),
        body: pushBody.trim(),
        dryRun,
      });
      setPushResult(dryRun ? `Dry run: would send to ${res.data.sent} device(s)` : `Sent to ${res.data.sent} device(s)`);
      if (!dryRun) { setPushTitle(""); setPushBody(""); }
    } catch (err: any) {
      setPushResult(`Error: ${err.message}`);
    } finally {
      setPushSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="User Details" large>
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <LoadingSkeleton variant="text" count={4} />
        </div>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      {user && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Identity */}
          <div className="settings-section">
            <h4 className="settings-section__title">Identity</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem 1.5rem",
                fontSize: "0.875rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Email</span>
                <p style={{ marginTop: 2, fontWeight: 500 }}>{user.email}</p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Name</span>
                <p style={{ marginTop: 2 }}>{user.displayName || "—"}</p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Joined</span>
                <p style={{ marginTop: 2 }}>
                  {new Date(user.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Status</span>
                <div style={{ marginTop: 4, display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                  {user.isPremium && <Badge variant="pro">PRO</Badge>}
                  {user.isAdmin && <Badge variant="primary">Admin</Badge>}
                  {!user.isPremium && !user.isAdmin && <Badge variant="source">Free</Badge>}
                  {user.emailVerified && <Badge variant="success">Verified</Badge>}
                  {!user.emailVerified && <Badge variant="danger">Unverified</Badge>}
                </div>
              </div>
            </div>
          </div>

          {/* OAuth providers */}
          {(user.appleId || user.googleId) && (
            <div className="settings-section">
              <h4 className="settings-section__title">OAuth Providers</h4>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {user.appleId && <Badge variant="source">Apple</Badge>}
                {user.googleId && <Badge variant="source">Google</Badge>}
              </div>
            </div>
          )}

          {/* Stripe */}
          {(user.stripeCustomerId || user.stripeSubscriptionId) && (
            <div className="settings-section">
              <h4 className="settings-section__title">Stripe</h4>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                  fontSize: "0.8125rem",
                  fontFamily: "monospace",
                  color: "var(--text-secondary)",
                }}
              >
                {user.stripeCustomerId && <span>Customer: {user.stripeCustomerId}</span>}
                {user.stripeSubscriptionId && (
                  <span>Subscription: {user.stripeSubscriptionId}</span>
                )}
              </div>
            </div>
          )}

          {/* Activity */}
          <div className="settings-section">
            <h4 className="settings-section__title">Activity</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem 1.5rem",
                fontSize: "0.875rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Last trip</span>
                <p style={{ marginTop: 2 }} title={user.lastTripAt ? new Date(user.lastTripAt).toLocaleString() : ""}>
                  {user.lastTripAt ? `${timeAgo(user.lastTripAt)} (${new Date(user.lastTripAt).toLocaleDateString("en-GB")})` : "—"}
                </p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Last login</span>
                <p style={{ marginTop: 2 }} title={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : ""}>
                  {user.lastLoginAt ? `${timeAgo(user.lastLoginAt)} (${new Date(user.lastLoginAt).toLocaleDateString("en-GB")})` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="settings-section">
            <h4 className="settings-section__title">Stats</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.75rem",
              }}
            >
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <p className="stat-card__label">Miles</p>
                <p className="stat-card__value" style={{ fontSize: "1.25rem" }}>
                  {user.totalMiles.toFixed(1)}
                </p>
              </div>
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <p className="stat-card__label">Trips</p>
                <p className="stat-card__value" style={{ fontSize: "1.25rem" }}>
                  {user._count.trips}
                </p>
              </div>
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <p className="stat-card__label">Earnings</p>
                <p
                  className="stat-card__value stat-card__value--emerald"
                  style={{ fontSize: "1.25rem" }}
                >
                  {formatPence(user.totalEarningsPence)}
                </p>
              </div>
            </div>
          </div>

          {/* Trip Map */}
          <div className="settings-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", gap: "0.5rem", flexWrap: "wrap" }}>
              <h4 className="settings-section__title" style={{ margin: 0 }}>Trip Map</h4>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                {([
                  { v: "last20", label: "Last 20" },
                  { v: "last50", label: "Last 50" },
                  { v: "last7d", label: "Last 7 days" },
                ] as Array<{ v: TripMapRange; label: string }>).map((opt) => (
                  <button
                    key={opt.v}
                    className={`filter-chip ${tripMapRange === opt.v ? "filter-chip--active" : ""}`}
                    onClick={() => setTripMapRange(opt.v)}
                    type="button"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {tripMapLoading ? (
              <LoadingSkeleton variant="card" style={{ height: 320 }} />
            ) : tripPaths && tripPaths.length > 0 ? (
              <>
                <div
                  ref={mapContainerRef}
                  style={{
                    height: 320,
                    width: "100%",
                    borderRadius: 8,
                    overflow: "hidden",
                    border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                  }}
                />
                <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", margin: "0.5rem 0 0" }}>
                  {tripPaths.length} trip{tripPaths.length !== 1 ? "s" : ""} plotted. Each colour is a different trip.
                </p>
              </>
            ) : (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                No trips in the selected range.
              </p>
            )}
          </div>

          {/* Admin Notes */}
          <div className="settings-section">
            <h4 className="settings-section__title">Admin Notes</h4>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Private notes about this user (support history, context, etc.)"
              rows={4}
              maxLength={10000}
              style={{
                width: "100%",
                padding: "0.625rem 0.75rem",
                background: "var(--bg-elevated, rgba(255,255,255,0.03))",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                borderRadius: "6px",
                color: "var(--text-primary, #fff)",
                fontSize: "0.8125rem",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveNotes}
                disabled={notesSaving || notesDraft === (user.notes ?? "")}
              >
                {notesSaving ? "Saving..." : "Save notes"}
              </Button>
              {notesMessage && (
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: notesMessage.startsWith("Error") ? "var(--dash-red)" : "var(--emerald-400)",
                  }}
                >
                  {notesMessage}
                </span>
              )}
            </div>
          </div>

          {/* Add Trip (restore missing trip) */}
          <div className="settings-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h4 className="settings-section__title" style={{ margin: 0 }}>Add Trip</h4>
              <Button variant="ghost" size="sm" onClick={() => setTripOpen((v) => !v)}>
                {tripOpen ? "Hide" : "Show form"}
              </Button>
            </div>
            {tripOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {user.vehicles.length === 0 ? (
                  <p style={{ fontSize: "0.8125rem", color: "var(--dash-red)", margin: 0 }}>
                    This user has no vehicles. Cannot create a trip until they add one.
                  </p>
                ) : (
                  <>
                    <Select
                      id="trip-vehicle"
                      value={tripVehicleId}
                      onChange={(e) => setTripVehicleId(e.target.value)}
                      aria-label="Vehicle"
                      placeholder="Select vehicle..."
                      options={user.vehicles.map((v) => ({
                        value: v.id,
                        label: `${v.make} ${v.model} (${v.vehicleType}, ${v.fuelType})`,
                      }))}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <Input
                        id="trip-started-at"
                        type="datetime-local"
                        value={tripStartedAt}
                        onChange={(e) => setTripStartedAt(e.target.value)}
                        placeholder="Started at"
                      />
                      <Input
                        id="trip-ended-at"
                        type="datetime-local"
                        value={tripEndedAt}
                        onChange={(e) => setTripEndedAt(e.target.value)}
                        placeholder="Ended at"
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <Input
                        id="trip-start-lat"
                        type="number"
                        value={tripStartLat}
                        onChange={(e) => setTripStartLat(e.target.value)}
                        placeholder="Start lat"
                      />
                      <Input
                        id="trip-start-lng"
                        type="number"
                        value={tripStartLng}
                        onChange={(e) => setTripStartLng(e.target.value)}
                        placeholder="Start lng"
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <Input
                        id="trip-end-lat"
                        type="number"
                        value={tripEndLat}
                        onChange={(e) => setTripEndLat(e.target.value)}
                        placeholder="End lat"
                      />
                      <Input
                        id="trip-end-lng"
                        type="number"
                        value={tripEndLng}
                        onChange={(e) => setTripEndLng(e.target.value)}
                        placeholder="End lng"
                      />
                    </div>
                    <Input
                      id="trip-start-address"
                      value={tripStartAddress}
                      onChange={(e) => setTripStartAddress(e.target.value)}
                      placeholder="Start address (optional)"
                    />
                    <Input
                      id="trip-end-address"
                      value={tripEndAddress}
                      onChange={(e) => setTripEndAddress(e.target.value)}
                      placeholder="End address (optional)"
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <Input
                        id="trip-distance"
                        type="number"
                        value={tripDistance}
                        onChange={(e) => setTripDistance(e.target.value)}
                        placeholder="Distance (mi, optional)"
                      />
                      <Select
                        id="trip-classification"
                        value={tripClassification}
                        onChange={(e) => setTripClassification(e.target.value as "business" | "personal" | "unclassified")}
                        aria-label="Classification"
                        options={[
                          { value: "unclassified", label: "Unclassified" },
                          { value: "business", label: "Business" },
                          { value: "personal", label: "Personal" },
                        ]}
                      />
                    </div>
                    <Input
                      id="trip-platform"
                      value={tripPlatform}
                      onChange={(e) => setTripPlatform(e.target.value)}
                      placeholder="Platform tag (e.g. uber, deliveroo) - optional"
                    />
                    <Input
                      id="trip-notes"
                      value={tripNotes}
                      onChange={(e) => setTripNotes(e.target.value)}
                      placeholder="Trip notes (optional)"
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleCreateTrip}
                        disabled={tripSaving}
                      >
                        {tripSaving ? "Creating..." : "Create trip"}
                      </Button>
                      {tripResult && (
                        <span
                          style={{
                            fontSize: "0.8125rem",
                            color: tripResult.startsWith("Error") ? "var(--dash-red)" : "var(--emerald-400)",
                          }}
                        >
                          {tripResult}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Vehicles */}
          {user.vehicles.length > 0 && (
            <div className="settings-section">
              <h4 className="settings-section__title">
                Vehicles ({user.vehicles.length})
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {user.vehicles.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-secondary)",
                      padding: "0.375rem 0.5rem",
                      background: "var(--bg-secondary)",
                      borderRadius: 6,
                    }}
                  >
                    {v.make} {v.model} ({v.fuelType})
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Trips */}
          {user.trips.length > 0 && (
            <div className="settings-section">
              <h4 className="settings-section__title">Recent Trips</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Distance</th>
                      <th>Type</th>
                      <th>Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.trips.map((trip) => (
                      <tr key={trip.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                          {new Date(trip.startedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                          })}
                        </td>
                        <td style={{ fontSize: "0.8125rem" }}>
                          {trip.distanceMiles.toFixed(1)} mi
                        </td>
                        <td>
                          <Badge
                            variant={trip.classification === "business" ? "business" : trip.classification === "personal" ? "personal" : "source"}
                          >
                            {trip.classification}
                          </Badge>
                        </td>
                        <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                          {trip.platformTag || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Drive Detection Diagnostics */}
          <div className="settings-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <h4 className="settings-section__title" style={{ margin: 0 }}>Drive Detection</h4>
              {diag && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const safeEmail = user.email.replace(/[^a-z0-9]/gi, "_");
                    const ts = new Date(diag.capturedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
                    downloadTextFile(`mileclear-diagnostics-${safeEmail}-${ts}.txt`, buildDiagnosticDumpText(diag, user));
                  }}
                >
                  Download .txt
                </Button>
              )}
            </div>
            {diag ? (() => {
              const st = diag.statusJson as Record<string, unknown>;
              const verdictColor = diag.verdict === "healthy" ? "var(--emerald-400)"
                : diag.verdict === "error" ? "var(--dash-red)"
                : diag.verdict === "warning" ? "var(--amber-500)"
                : "var(--dash-blue, #3b82f6)";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{
                      padding: "0.15rem 0.5rem",
                      borderRadius: "6px",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: verdictColor,
                      background: `color-mix(in srgb, ${verdictColor} 15%, transparent)`,
                    }}>
                      {diag.verdict}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      v{diag.appVersion} (build {diag.buildNumber}) - {diag.platform} {diag.osVersion}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {new Date(diag.capturedAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem 1rem", fontSize: "0.8125rem" }}>
                    {[
                      ["Task running", st.taskRunning, st.taskRunning === true],
                      ["BG permission", st.backgroundPermission, st.backgroundPermission === "granted"],
                      ["Enabled", st.enabled, st.enabled === true],
                      ["Auto-recording", st.autoRecordingActive, st.autoRecordingActive !== true],
                      ["Buffered coords", st.bufferedCoordinates, undefined],
                      ["Quiet hours", st.quietHours, undefined],
                    ].map(([label, value, good], i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.15rem 0" }}>
                        <span style={{ color: "var(--text-secondary)" }}>{String(label)}</span>
                        <span style={{
                          fontWeight: 600,
                          color: good === undefined ? "var(--text-secondary)"
                            : good ? "var(--emerald-400)" : "var(--dash-red)",
                        }}>
                          {String(value ?? "-")}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* App state — current foreground/background + seconds since last
                      transition. Lets a reviewer spot 'iOS suspended the app for
                      14 minutes here' at a glance. */}
                  {(() => {
                    const appState = st.appState as { currentState?: string; secondsInCurrentState?: number; lastForegroundedAt?: string; lastBackgroundedAt?: string } | undefined;
                    if (!appState) return null;
                    return (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", padding: "0.5rem 0.625rem", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                        <strong style={{ color: "var(--text-primary)" }}>App state:</strong> {appState.currentState ?? "?"}
                        {typeof appState.secondsInCurrentState === "number" && (
                          <> ({Math.round(appState.secondsInCurrentState / 60)} min ago)</>
                        )}
                        {appState.lastForegroundedAt && (
                          <> · last fg {new Date(appState.lastForegroundedAt).toLocaleTimeString()}</>
                        )}
                      </div>
                    );
                  })()}

                  {/* Activity summary (24h event counts) — matches the mobile
                      Drive Detection screen layout. */}
                  {(() => {
                    const summary = st.activitySummary as Record<string, number> | undefined;
                    const entries = summary ? Object.entries(summary).sort(([, a], [, b]) => b - a) : [];
                    if (entries.length === 0) return null;
                    return (
                      <div>
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 0.375rem" }}>
                          Activity (last 24h)
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
                          {entries.map(([event, count]) => (
                            <div key={event} style={{ display: "flex", justifyContent: "space-between", padding: "0.15rem 0" }}>
                              <span style={{ color: "var(--text-tertiary)" }}>{event}</span>
                              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Recent trips (last 10) — gives the reviewer a quick view of
                      what the device thinks it's been recording. Tap to filter
                      the events list below to that trip's time window. */}
                  {(() => {
                    const trips = st.recentTrips as Array<{
                      id: string;
                      start_address: string | null;
                      end_address: string | null;
                      distance_miles: number;
                      started_at: string;
                      ended_at: string | null;
                      classification: string | null;
                      synced_at: string | null;
                    }> | undefined;
                    if (!trips || trips.length === 0) return null;
                    return (
                      <div>
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 0.375rem" }}>
                          Recent trips on device (tap to filter events)
                        </p>
                        {tripFilter && (
                          <button
                            type="button"
                            onClick={() => setTripFilter(null)}
                            style={{ background: "none", border: "none", color: "var(--amber-500)", fontSize: "0.75rem", cursor: "pointer", padding: "0.25rem 0", marginBottom: "0.25rem" }}
                          >
                            ← Show all events
                          </button>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "240px", overflow: "auto" }}>
                          {trips.map((t) => {
                            const selected = tripFilter?.id === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setTripFilter(selected ? null : t)}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                  padding: "0.375rem 0.5rem",
                                  fontSize: "0.75rem",
                                  background: selected ? "rgba(245,166,35,0.12)" : "rgba(255,255,255,0.02)",
                                  border: selected ? "1px solid rgba(245,166,35,0.4)" : "1px solid transparent",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  opacity: tripFilter && !selected ? 0.5 : 1,
                                  color: "var(--text-primary)",
                                }}
                              >
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {t.start_address ?? "?"} → {t.end_address ?? "?"}
                                </span>
                                <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>
                                  {t.distance_miles.toFixed(1)} mi · {new Date(t.started_at).toLocaleTimeString()}
                                  {!t.synced_at && <span style={{ color: "var(--amber-500)" }}> · unsynced</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Routing stats (24h call breakdown by source) */}
                  {(() => {
                    const routing = st.routingStats as { totalCalls?: number; bySource?: Record<string, { count: number; avgLatencyMs: number }> } | undefined;
                    if (!routing || !routing.totalCalls) return null;
                    return (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", padding: "0.5rem 0.625rem", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                        <strong style={{ color: "var(--text-primary)" }}>Routing (24h):</strong> {routing.totalCalls} calls
                        {routing.bySource && Object.entries(routing.bySource).map(([source, stats]) => (
                          <span key={source} style={{ marginLeft: "0.5rem" }}>
                            · {source} ×{stats.count} (~{stats.avgLatencyMs}ms)
                          </span>
                        ))}
                      </div>
                    );
                  })()}

                  {diag.eventsJson.length > 0 && (() => {
                    // Resolve saved-location UUIDs to names in event payloads
                    // (mirrors the mobile Drive Detection screen).
                    const savedLocations = st.savedLocations as Array<{ id: string; name: string }> | undefined;
                    const lookup = new Map<string, string>();
                    if (savedLocations) for (const l of savedLocations) lookup.set(l.id, l.name);

                    // Filter to the selected trip's time window (±60s).
                    const filtered = tripFilter
                      ? diag.eventsJson.filter((ev) => {
                          const t = new Date(ev.recorded_at).getTime();
                          const start = new Date(tripFilter.started_at).getTime() - 60_000;
                          const end = tripFilter.ended_at
                            ? new Date(tripFilter.ended_at).getTime() + 60_000
                            : Date.now();
                          return t >= start && t <= end;
                        })
                      : diag.eventsJson;
                    return (
                      <div>
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 0.375rem" }}>
                          Events ({filtered.length}{tripFilter ? ` of ${diag.eventsJson.length}, filtered` : ""})
                        </p>
                        <div style={{ maxHeight: "400px", overflow: "auto", fontSize: "0.75rem", lineHeight: 1.6, color: "var(--text-tertiary)", border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))", borderRadius: "6px", padding: "0.5rem 0.625rem" }}>
                          {filtered.map((ev, i) => {
                            // Replace any locationId UUID in the data with `${uuid} (${name})`
                            let dataDisplay = ev.data;
                            if (dataDisplay) {
                              for (const [id, name] of lookup) {
                                if (dataDisplay.includes(id)) {
                                  dataDisplay = dataDisplay.replace(id, `${id} (${name})`);
                                  break;
                                }
                              }
                            }
                            return (
                              <div key={i}>
                                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{ev.event}</span>
                                {dataDisplay && <span> {dataDisplay}</span>}
                                <span style={{ marginLeft: "0.5rem", opacity: 0.6 }}>
                                  {new Date(ev.recorded_at).toLocaleTimeString()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })() : (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                No diagnostics uploaded yet
              </p>
            )}
          </div>

          {/* Send Push Notification */}
          <div className="settings-section">
            <h4 className="settings-section__title">Send Push Notification</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <Input
                id="pushTitle"
                placeholder="Notification title"
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                maxLength={100}
              />
              <Input
                id="pushBody"
                placeholder="Notification body"
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
                maxLength={200}
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSendPush(true)}
                  disabled={pushSending || !pushTitle.trim() || !pushBody.trim()}
                >
                  Dry Run
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSendPush(false)}
                  disabled={pushSending || !pushTitle.trim() || !pushBody.trim()}
                >
                  {pushSending ? "Sending..." : "Send"}
                </Button>
              </div>
              {pushResult && (
                <p style={{ fontSize: "0.8125rem", color: pushResult.startsWith("Error") ? "var(--dash-red)" : "var(--emerald-400)", margin: 0 }}>
                  {pushResult}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Users Tab
// ---------------------------------------------------------------------------

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Sort
  const [sortBy, setSortBy] = useState<UsersSortBy>("createdAt");

  // User detail modal
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Toggle premium confirm
  const [toggleTarget, setToggleTarget] = useState<AdminUser | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 when search or sort changes
  useEffect(() => {
    setPage(1);
  }, [search, sortBy]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        sortBy,
      });
      if (search.trim()) {
        params.set("q", search.trim());
      }
      const res = await api.get<UsersResponse>(`/admin/users?${params}`);
      setUsers(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, sortBy]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openDetail = (user: AdminUser) => {
    setViewUserId(user.id);
    setShowDetail(true);
  };

  const handleTogglePremium = async () => {
    if (!toggleTarget) return;
    setToggleLoading(true);
    try {
      await api.patch(`/admin/users/${toggleTarget.id}/premium`, {
        isPremium: !toggleTarget.isPremium,
      });
      setToggleTarget(null);
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggleLoading(false);
    }
  };

  return (
    <>
      {/* Search + Sort */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 260px", maxWidth: 400 }}>
          <Input
            id="user-search"
            placeholder="Search by email or name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <Select
            id="user-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as UsersSortBy)}
            aria-label="Sort users by"
            options={[
              { value: "createdAt", label: "Newest signups" },
              { value: "lastTripAt", label: "Last trip" },
              { value: "lastLoginAt", label: "Last login" },
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="row" count={8} style={{ marginBottom: 8 }} />
      ) : users.length === 0 ? (
        <Card>
          <p
            style={{
              textAlign: "center",
              color: "var(--text-secondary)",
              padding: "2rem",
              fontSize: "0.9375rem",
            }}
          >
            {search ? `No users found for "${search}"` : "No users found."}
          </p>
        </Card>
      ) : (
        <>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              marginBottom: "0.75rem",
            }}
          >
            {total} user{total !== 1 ? "s" : ""}
            {search && ` matching "${search}"`}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th title="Per-user health score (0-100). Composed from heartbeat fields: bg-location, tracking task, sync queue, recent driving signal.">Health</th>
                  <th>Trips</th>
                  <th>Last trip</th>
                  <th>Last login</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td style={{ fontSize: "0.875rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        {user.email}
                        {user.diagnosticDump && user.diagnosticDump.verdict !== "healthy" && (
                          <span
                            title={`Detection: ${user.diagnosticDump.verdict} (${new Date(user.diagnosticDump.capturedAt).toLocaleString()})`}
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              flexShrink: 0,
                              background: user.diagnosticDump.verdict === "error" ? "var(--dash-red)"
                                : user.diagnosticDump.verdict === "warning" ? "var(--amber-500)"
                                : "var(--dash-blue, #3b82f6)",
                            }}
                          />
                        )}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                      {user.displayName || "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                        {user.isPremium && <Badge variant="pro">PRO</Badge>}
                        {user.isAdmin && <Badge variant="primary">Admin</Badge>}
                        {!user.isPremium && !user.isAdmin && (
                          <Badge variant="source">Free</Badge>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                      {user.healthScore !== undefined && user.healthBand ? (
                        <span
                          style={{
                            color:
                              user.healthBand === "good"
                                ? "#10b981"
                                : user.healthBand === "warning"
                                  ? "#f59e0b"
                                  : user.healthBand === "critical"
                                    ? "#ef4444"
                                    : "var(--text-secondary)",
                            fontWeight: 600,
                          }}
                          title={`${user.healthBand} (${user.healthScore}/100)`}
                        >
                          {user.healthBand === "unknown" ? "—" : user.healthScore}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ fontSize: "0.875rem" }}>{user._count.trips}</td>
                    <td
                      style={{ fontSize: "0.8125rem", whiteSpace: "nowrap", color: "var(--text-secondary)" }}
                      title={user.lastTripAt ? new Date(user.lastTripAt).toLocaleString() : ""}
                    >
                      {user.lastTripAt ? timeAgo(user.lastTripAt) : "—"}
                    </td>
                    <td
                      style={{ fontSize: "0.8125rem", whiteSpace: "nowrap", color: "var(--text-secondary)" }}
                      title={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : ""}
                    >
                      {user.lastLoginAt ? timeAgo(user.lastLoginAt) : "—"}
                    </td>
                    <td style={{ fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                      {new Date(user.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </td>
                    <td>
                      <div className="table__actions">
                        <button
                          className="table__action-btn"
                          onClick={() => setToggleTarget(user)}
                          aria-label={
                            user.isPremium
                              ? `Remove premium from ${user.email}`
                              : `Grant premium to ${user.email}`
                          }
                        >
                          {user.isPremium ? "Remove PRO" : "Grant PRO"}
                        </button>
                        <button
                          className="table__action-btn"
                          onClick={() => openDetail(user)}
                          aria-label={`View details for ${user.email}`}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {/* User Detail Modal */}
      <UserDetailModal
        userId={viewUserId}
        open={showDetail}
        onClose={() => {
          setShowDetail(false);
          setViewUserId(null);
        }}
      />

      {/* Toggle Premium Confirmation */}
      <ConfirmModal
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleTogglePremium}
        title={toggleTarget?.isPremium ? "Remove Premium" : "Grant Premium"}
        message={
          toggleTarget?.isPremium
            ? `Remove premium access from ${toggleTarget?.email}? Their subscription data will remain but premium features will be disabled.`
            : `Grant premium access to ${toggleTarget?.email}? This will enable all premium features without a Stripe subscription.`
        }
        confirmLabel={toggleTarget?.isPremium ? "Remove PRO" : "Grant PRO"}
        loading={toggleLoading}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Health Tab
// ---------------------------------------------------------------------------

interface RoutingHealthData {
  config: { graphhopperUrl: string; googleConfigured: boolean };
  graphhopper: { reachable: boolean | null; latencyMs: number | null; error: string | null };
  cache: { rowCount: number; bySource: Record<string, number>; totalHits: number };
  last24h: {
    routesComputed: number;
    routesUnavailable: number;
    bySource: Record<string, number>;
    fallbackRate: number;
  };
  generatedAt: string;
}

function HealthTab() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [routingHealth, setRoutingHealth] = useState<RoutingHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, routingRes] = await Promise.all([
        api.get<{ data: HealthData }>("/admin/health"),
        api.get<{ data: RoutingHealthData }>("/admin/routing-health").catch(() => null),
      ]);
      setHealth(healthRes.data);
      if (routingRes) setRoutingHealth(routingRes.data);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const recordCountRows = health
    ? ([
        ["Users", health.recordCounts.users],
        ["Trips", health.recordCounts.trips],
        ["Shifts", health.recordCounts.shifts],
        ["Vehicles", health.recordCounts.vehicles],
        ["Fuel Logs", health.recordCounts.fuelLogs],
        ["Earnings", health.recordCounts.earnings],
        ["Achievements", health.recordCounts.achievements],
      ] as [string, number][])
    : [];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: "1rem", gap: "0.75rem" }}>
        {lastRefreshed && (
          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Last refreshed {lastRefreshed.toLocaleTimeString("en-GB")}
          </span>
        )}
        <Button variant="secondary" size="sm" onClick={loadHealth} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }} role="alert">
          Failed to load health data: {error}
        </div>
      )}

      {loading && !health && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <LoadingSkeleton variant="card" style={{ height: 100 }} />
          <LoadingSkeleton variant="card" style={{ height: 200 }} />
        </div>
      )}

      {health && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Status indicators */}
          <Card title="System Status">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  fontSize: "0.9375rem",
                }}
              >
                <StatusDot status={health.api} />
                <span style={{ fontWeight: 500 }}>API</span>
                <span
                  style={{
                    color:
                      health.api === "ok" ? "var(--emerald-400)" : "var(--dash-red)",
                    fontSize: "0.875rem",
                    marginLeft: "auto",
                  }}
                >
                  {health.api === "ok" ? "Operational" : "Degraded"}
                </span>
              </div>
              <div
                style={{
                  height: 1,
                  background: "var(--border-default)",
                  margin: "0 -1.25rem",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  fontSize: "0.9375rem",
                }}
              >
                <StatusDot status={health.database} />
                <span style={{ fontWeight: 500 }}>Database</span>
                <span
                  style={{
                    color:
                      health.database === "ok" ? "var(--emerald-400)" : "var(--dash-red)",
                    fontSize: "0.875rem",
                    marginLeft: "auto",
                  }}
                >
                  {health.database === "ok" ? "Operational" : "Degraded"}
                </span>
              </div>
            </div>
          </Card>

          {/* System metrics */}
          <div className="stats-grid">
            <div className="stat-card">
              <p className="stat-card__label">DB Latency</p>
              <p className="stat-card__value stat-card__value--emerald">
                {health.databaseLatencyMs}
                <span style={{ fontSize: "0.875rem", fontWeight: 400, marginLeft: 2 }}>ms</span>
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Uptime</p>
              <p className="stat-card__value">{formatUptime(health.uptime)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Memory</p>
              <p className="stat-card__value">
                {health.memoryUsageMb.toFixed(0)}
                <span style={{ fontSize: "0.875rem", fontWeight: 400, marginLeft: 2 }}>MB</span>
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Node.js</p>
              <p className="stat-card__value" style={{ fontSize: "1.125rem" }}>
                {health.nodeVersion}
              </p>
            </div>
          </div>

          {/* Record counts */}
          <Card title="Database Records">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th style={{ textAlign: "right" }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {recordCountRows.map(([label, count]) => (
                    <tr key={label}>
                      <td style={{ fontSize: "0.9375rem" }}>{label}</td>
                      <td
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 500,
                          fontSize: "0.9375rem",
                        }}
                      >
                        {count.toLocaleString("en-GB")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Routing stack health (added 10 May 2026) */}
          {routingHealth && (
            <Card title="Routing Stack Health">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "0.25rem 0.625rem",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: routingHealth.graphhopper.reachable ? "var(--emerald-400)" : "var(--dash-red)",
                      backgroundColor: routingHealth.graphhopper.reachable
                        ? "rgba(52, 211, 153, 0.10)"
                        : "rgba(239, 68, 68, 0.10)",
                      border: `1px solid ${routingHealth.graphhopper.reachable ? "rgba(52, 211, 153, 0.30)" : "rgba(239, 68, 68, 0.30)"}`,
                    }}
                  >
                    {routingHealth.graphhopper.reachable
                      ? `GraphHopper · ${routingHealth.graphhopper.latencyMs ?? "?"} ms`
                      : routingHealth.config.graphhopperUrl === "missing"
                      ? "GraphHopper not configured"
                      : `GraphHopper down${routingHealth.graphhopper.error ? `: ${routingHealth.graphhopper.error}` : ""}`}
                  </span>
                  <span
                    style={{
                      padding: "0.25rem 0.625rem",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: routingHealth.config.googleConfigured ? "var(--emerald-400)" : "var(--text-secondary)",
                      backgroundColor: routingHealth.config.googleConfigured
                        ? "rgba(52, 211, 153, 0.10)"
                        : "rgba(132, 148, 167, 0.10)",
                      border: `1px solid ${routingHealth.config.googleConfigured ? "rgba(52, 211, 153, 0.30)" : "rgba(132, 148, 167, 0.30)"}`,
                    }}
                  >
                    {routingHealth.config.googleConfigured ? "Google fallback ready" : "Google fallback not configured"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
                  <div className="stat-card">
                    <p className="stat-card__label">Cache rows</p>
                    <p className="stat-card__value" style={{ fontSize: "1.5rem" }}>
                      {routingHealth.cache.rowCount.toLocaleString("en-GB")}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
                      {routingHealth.cache.totalHits.toLocaleString("en-GB")} hits served
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-card__label">Routes 24h</p>
                    <p className="stat-card__value" style={{ fontSize: "1.5rem" }}>
                      {routingHealth.last24h.routesComputed.toLocaleString("en-GB")}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
                      {routingHealth.last24h.routesUnavailable} failed
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-card__label">Fallback rate</p>
                    <p
                      className="stat-card__value"
                      style={{
                        fontSize: "1.5rem",
                        color:
                          routingHealth.last24h.fallbackRate > 50
                            ? "var(--dash-red)"
                            : routingHealth.last24h.fallbackRate > 10
                            ? "var(--amber-500)"
                            : "var(--emerald-400)",
                      }}
                    >
                      {routingHealth.last24h.fallbackRate}%
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
                      Google was used (vs GraphHopper)
                    </p>
                  </div>
                </div>

                <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", margin: 0 }}>
                  Cache by source:{" "}
                  {Object.entries(routingHealth.cache.bySource)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ") || "—"}
                </p>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Revenue Tab
// ---------------------------------------------------------------------------

interface RevenueData {
  currentPremiumCount: number;
  mrrPence: number;
  stripeSubscribers: number;
  appleSubscribers: number;
  adminGranted: number;
  churnedLast30d: number;
  churnRatePercent: number;
  arpuPence: number;
  monthlyTrend: Array<{
    month: string;
    premiumCount: number;
    newPremium: number;
    churned: number;
  }>;
}

function RevenueTab() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: RevenueData }>("/admin/revenue")
      .then((res) => setData(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="card" count={2} style={{ height: 90 }} />;
  if (error) return <div className="alert alert--error">{error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">MRR</p>
          <p className="stat-card__value stat-card__value--emerald">{formatPence(data.mrrPence)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Subscribers</p>
          <p className="stat-card__value stat-card__value--amber">{data.currentPremiumCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Churn (30d)</p>
          <p className="stat-card__value">{data.churnRatePercent}%</p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
            {data.churnedLast30d} lost
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">ARPU</p>
          <p className="stat-card__value">{formatPence(data.arpuPence)}</p>
        </div>
      </div>

      {/* Platform split */}
      <Card title="Subscription Platform">
        <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.9375rem" }}>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Stripe </span>
            <strong>{data.stripeSubscribers}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Apple IAP </span>
            <strong>{data.appleSubscribers}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Admin-granted </span>
            <strong>{data.adminGranted}</strong>
          </div>
        </div>
      </Card>

      {/* Monthly trend */}
      {data.monthlyTrend.length > 0 && (
        <Card title="Monthly Trend">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: "right" }}>Premium</th>
                  <th style={{ textAlign: "right" }}>New</th>
                  <th style={{ textAlign: "right" }}>Churned</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlyTrend.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.premiumCount}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--emerald-400)" }}>
                      +{row.newPremium}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.churned > 0 ? "var(--dash-red)" : undefined }}>
                      {row.churned > 0 ? `-${row.churned}` : "0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Engagement Tab
// ---------------------------------------------------------------------------

interface EngagementData {
  dau: number;
  wau: number;
  mau: number;
  totalUsers: number;
  usersWithZeroTrips: number;
  retentionCurve: Array<{
    month: string;
    signups: number;
    retainedCount: number;
    retentionPercent: number;
  }>;
  recentlyActive: Array<{
    userId: string;
    email: string;
    displayName: string | null;
    lastTripAt: string;
    tripCount: number;
  }>;
}

function EngagementTab() {
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: EngagementData }>("/admin/engagement")
      .then((res) => setData(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="card" count={2} style={{ height: 90 }} />;
  if (error) return <div className="alert alert--error">{error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">DAU</p>
          <p className="stat-card__value stat-card__value--emerald">{data.dau}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">WAU</p>
          <p className="stat-card__value">{data.wau}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">MAU</p>
          <p className="stat-card__value">{data.mau}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Zero Trips</p>
          <p className="stat-card__value" style={{ color: data.usersWithZeroTrips > 0 ? "var(--dash-red)" : undefined }}>
            {data.usersWithZeroTrips}
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
            of {data.totalUsers} users
          </p>
        </div>
      </div>

      {/* Retention curve */}
      {data.retentionCurve.length > 0 && (
        <Card title="Retention by Signup Month">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th style={{ textAlign: "right" }}>Signups</th>
                  <th style={{ textAlign: "right" }}>Active (30d)</th>
                  <th style={{ textAlign: "right" }}>Retention</th>
                </tr>
              </thead>
              <tbody>
                {data.retentionCurve.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.signups}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.retainedCount}</td>
                    <td style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 500,
                      color: row.retentionPercent >= 50 ? "var(--emerald-400)" : row.retentionPercent >= 25 ? "var(--amber-400)" : "var(--dash-red)",
                    }}>
                      {row.retentionPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recently active */}
      {data.recentlyActive.length > 0 && (
        <Card title="Recently Active Users">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th style={{ textAlign: "right" }}>Trips</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {data.recentlyActive.map((u) => (
                  <tr key={u.userId}>
                    <td style={{ fontSize: "0.875rem" }}>{u.email}</td>
                    <td style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{u.displayName || "-"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{u.tripCount}</td>
                    <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {new Date(u.lastTripAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-trip Health Tab
// ---------------------------------------------------------------------------

interface AutoTripData {
  autoTripsTotal: number;
  autoTripsClassified: number;
  autoTripsUnclassified: number;
  manualTripsTotal: number;
  classificationRatePercent: number;
  usersWithAutoTrips7d: number;
  usersWithPushToken: number;
  detectionAdoptionPercent: number;
  avgTripDurationMinutes: number;
  avgAutoTripDistanceMiles: number;
  dailyAutoTrips: Array<{ date: string; autoCount: number; manualCount: number }>;
}

interface DetectionFleetData {
  engineSplit: {
    nativeOn: number;
    jsEngine: number;
    nativeFresh: number;
    nativeStale: number;
    nativeNever: number;
    dumpsTotal: number;
  };
  nativeNeedsAttention: Array<{
    email: string;
    displayName: string | null;
    lastNativeLocationAt: string | null;
    dumpAt: string;
  }>;
  quietDrivers: Array<{
    email: string;
    displayName: string | null;
    lastTripAt: string;
    priorTrips: number;
    daysSinceLastTrip: number;
  }>;
  kpis: {
    activeDrivers7d: number;
    autoTrips7d: number;
    manualTrips7d: number;
    autoSharePercent: number;
    shortAutoTrips7d: number;
    shortManualTrips7d: number;
    shortAutoSharePercent: number;
  };
}

function AutoTripsTab() {
  const [data, setData] = useState<AutoTripData | null>(null);
  const [fleet, setFleet] = useState<DetectionFleetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api
        .get<{ data: AutoTripData }>("/admin/auto-trip-health")
        .then((res) => setData(res.data)),
      api
        .get<{ data: DetectionFleetData }>("/admin/detection-fleet")
        .then((res) => setFleet(res.data))
        .catch(() => {}), // fleet view is non-fatal context
    ])
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="card" count={2} style={{ height: 90 }} />;
  if (error) return <div className="alert alert--error">{error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">Auto Trips (30d)</p>
          <p className="stat-card__value stat-card__value--amber">{data.autoTripsTotal}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Classification Rate</p>
          <p className="stat-card__value" style={{
            color: data.classificationRatePercent >= 70 ? "var(--emerald-400)" : data.classificationRatePercent >= 40 ? "var(--amber-400)" : "var(--dash-red)",
          }}>
            {data.classificationRatePercent}%
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
            {data.autoTripsClassified} classified / {data.autoTripsUnclassified} pending
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Detection Adoption</p>
          <p className="stat-card__value">{data.detectionAdoptionPercent}%</p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
            {data.usersWithAutoTrips7d} of {data.usersWithPushToken} with app
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Manual Trips (30d)</p>
          <p className="stat-card__value">{data.manualTripsTotal}</p>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="stat-card">
          <p className="stat-card__label">Avg Duration</p>
          <p className="stat-card__value">{data.avgTripDurationMinutes} min</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Avg Distance</p>
          <p className="stat-card__value">{data.avgAutoTripDistanceMiles} mi</p>
        </div>
      </div>

      {fleet && (
        <>
          <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", margin: "1rem 0 -0.25rem" }}>
            Fleet detection health
          </h3>
          <div className="stats-grid">
            <div className="stat-card">
              <p className="stat-card__label">Active Drivers (7d)</p>
              <p className="stat-card__value stat-card__value--amber">{fleet.kpis.activeDrivers7d}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Auto Share (7d)</p>
              <p className="stat-card__value" style={{ color: fleet.kpis.autoSharePercent >= 60 ? "var(--emerald-400)" : "var(--amber-400)" }}>{fleet.kpis.autoSharePercent}%</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>{fleet.kpis.autoTrips7d} auto / {fleet.kpis.manualTrips7d} manual</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Native Engine</p>
              <p className="stat-card__value">{fleet.engineSplit.nativeOn}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>vs {fleet.engineSplit.jsEngine} JS · {fleet.engineSplit.dumpsTotal} dumps</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Native Healthy</p>
              <p className="stat-card__value" style={{ color: fleet.engineSplit.nativeStale + fleet.engineSplit.nativeNever === 0 ? "var(--emerald-400)" : "var(--amber-400)" }}>{fleet.engineSplit.nativeFresh}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>{fleet.engineSplit.nativeStale} stale / {fleet.engineSplit.nativeNever} no fix</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Short-trip Auto-share (7d)</p>
              <p className="stat-card__value" style={{ color: fleet.kpis.shortAutoSharePercent >= 70 ? "var(--emerald-400)" : fleet.kpis.shortAutoSharePercent >= 50 ? "var(--amber-400)" : "var(--dash-red)" }}>{fleet.kpis.shortAutoSharePercent}%</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>&lt;2mi · {fleet.kpis.shortAutoTrips7d} auto / {fleet.kpis.shortManualTrips7d} manual</p>
            </div>
          </div>

          <Card title={`Drivers gone quiet (${fleet.quietDrivers.length})`}>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
              Were capturing (≥3 auto-trips in the prior 30→7 days) but have recorded nothing in the last 7 days — the silent-capture-failure / churn signal.
            </p>
            {fleet.quietDrivers.length === 0 ? (
              <p style={{ fontSize: "0.875rem", color: "var(--emerald-400)" }}>None — every recently-active driver is still capturing.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Driver</th><th style={{ textAlign: "right" }}>Prior trips</th><th style={{ textAlign: "right" }}>Last trip</th><th style={{ textAlign: "right" }}>Quiet for</th></tr></thead>
                  <tbody>
                    {fleet.quietDrivers.map((q) => (
                      <tr key={q.email}>
                        <td>{q.displayName || q.email}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{q.priorTrips}</td>
                        <td style={{ textAlign: "right" }}>{new Date(q.lastTripAt).toLocaleDateString("en-GB")}</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: q.daysSinceLastTrip >= 10 ? "var(--dash-red)" : "var(--amber-400)" }}>{q.daysSinceLastTrip}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {fleet.nativeNeedsAttention.length > 0 && (
            <Card title={`Native engine needs attention (${fleet.nativeNeedsAttention.length})`}>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                On the native engine, but their last diagnostic dump showed no recent native fix — native may not be delivering for them.
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Driver</th><th style={{ textAlign: "right" }}>Last native fix</th><th style={{ textAlign: "right" }}>Last dump</th></tr></thead>
                  <tbody>
                    {fleet.nativeNeedsAttention.map((n) => (
                      <tr key={n.email}>
                        <td>{n.displayName || n.email}</td>
                        <td style={{ textAlign: "right", color: n.lastNativeLocationAt ? undefined : "var(--dash-red)" }}>{n.lastNativeLocationAt ? new Date(n.lastNativeLocationAt).toLocaleDateString("en-GB") : "never"}</td>
                        <td style={{ textAlign: "right" }}>{new Date(n.dumpAt).toLocaleDateString("en-GB")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {data.dailyAutoTrips.length > 0 && (
        <Card title="Daily Breakdown (7d)">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Auto</th>
                  <th style={{ textAlign: "right" }}>Manual</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyAutoTrips.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--amber-400)" }}>{row.autoCount}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.manualCount}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{row.autoCount + row.manualCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Push Notifications Tab
// ---------------------------------------------------------------------------

type PushAudience = "all" | "premium" | "free" | "inactive" | "specific" | "selected";
type PushHealthBand = "" | "good" | "warning" | "critical" | "unknown";
type PushMode = "" | "work" | "personal" | "both";

function PushTab() {
  const [audience, setAudience] = useState<PushAudience>("all");
  const [userId, setUserId] = useState("");
  const [userIdsRaw, setUserIdsRaw] = useState("");
  const [inactiveDays, setInactiveDays] = useState("14");
  const [buildNumber, setBuildNumber] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [healthBand, setHealthBand] = useState<PushHealthBand>("");
  const [dashboardMode, setDashboardMode] = useState<PushMode>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; totalTargeted: number; dryRun: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Parse the textarea: split on commas/whitespace/newlines, strip empties.
  const userIds = userIdsRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const send = async (dryRun: boolean) => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ data: typeof result }>("/admin/send-push", {
        audience,
        userId: audience === "specific" ? userId : undefined,
        userIds: audience === "selected" ? userIds : undefined,
        inactiveDays: audience === "inactive" ? parseInt(inactiveDays) || 14 : undefined,
        buildNumber: buildNumber.trim() || undefined,
        appVersion: appVersion.trim() || undefined,
        healthBand: healthBand || undefined,
        dashboardMode: dashboardMode || undefined,
        title,
        body,
        dryRun,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  };

  const audienceLabel = (a: PushAudience) => {
    switch (a) {
      case "all": return "All Users";
      case "premium": return "Pro Only";
      case "free": return "Free Only";
      case "inactive": return "Inactive";
      case "specific": return "Single User";
      case "selected": return "Multi-Select";
    }
  };

  const activeFilterCount = [buildNumber.trim(), appVersion.trim(), healthBand, dashboardMode].filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 600 }}>
      <Card title="Send Push Notification">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Audience */}
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>
              Audience
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {(["all", "premium", "free", "inactive", "specific", "selected"] as const).map((a) => (
                <button
                  key={a}
                  className={`filter-chip ${audience === a ? "filter-chip--active" : ""}`}
                  onClick={() => setAudience(a)}
                >
                  {audienceLabel(a)}
                </button>
              ))}
            </div>
          </div>

          {audience === "specific" && (
            <Input id="push-user-id" label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Enter user ID..." />
          )}
          {audience === "selected" && (
            <div>
              <label htmlFor="push-user-ids" style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                User IDs ({userIds.length} selected)
              </label>
              <textarea
                id="push-user-ids"
                value={userIdsRaw}
                onChange={(e) => setUserIdsRaw(e.target.value)}
                placeholder="Paste user IDs separated by commas, spaces, or newlines..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                  fontSize: "0.8125rem",
                  fontFamily: "monospace",
                  resize: "vertical",
                }}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary, #64748b)", marginTop: 4 }}>
                Tip: open the Users tab in another window, copy IDs from the User Detail page.
              </p>
            </div>
          )}
          {audience === "inactive" && (
            <Input id="push-inactive-days" label="Inactive for (days)" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} type="number" />
          )}

          {/* Optional filters — compose with the audience cut */}
          <div
            style={{
              padding: "0.75rem 0.875rem",
              background: "rgba(15,23,42,0.5)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.625rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Filters
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary, #64748b)" }}>
                {activeFilterCount === 0 ? "none — applies to whole audience" : `${activeFilterCount} active — AND'd with audience`}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.625rem" }}>
              <Input
                id="push-build"
                label="Build number"
                value={buildNumber}
                onChange={(e) => setBuildNumber(e.target.value)}
                placeholder="e.g. 55"
              />
              <Input
                id="push-app-version"
                label="App version"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
                placeholder="e.g. 1.1.3"
              />
              <div>
                <label htmlFor="push-health-band" style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                  Health band
                </label>
                <select
                  id="push-health-band"
                  value={healthBand}
                  onChange={(e) => setHealthBand(e.target.value as PushHealthBand)}
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    color: "var(--text-primary)",
                    fontSize: "0.9375rem",
                  }}
                >
                  <option value="">Any</option>
                  <option value="good">Good (≥75)</option>
                  <option value="warning">Warning (50-74)</option>
                  <option value="critical">Critical (&lt;50)</option>
                  <option value="unknown">Unknown (no heartbeat)</option>
                </select>
              </div>
              <div>
                <label htmlFor="push-mode" style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>
                  Dashboard mode
                </label>
                <select
                  id="push-mode"
                  value={dashboardMode}
                  onChange={(e) => setDashboardMode(e.target.value as PushMode)}
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.75rem",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    color: "var(--text-primary)",
                    fontSize: "0.9375rem",
                  }}
                >
                  <option value="">Any</option>
                  <option value="work">Work</option>
                  <option value="personal">Personal</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
          </div>

          <Input id="push-title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notification title..." />
          <div>
            <label htmlFor="push-body" style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 6 }}>Body</label>
            <textarea
              id="push-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification body..."
              rows={3}
              style={{
                width: "100%",
                padding: "0.625rem 0.75rem",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                color: "var(--text-primary)",
                fontSize: "0.9375rem",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Button variant="secondary" onClick={() => send(true)} disabled={!title || !body || sending}>
              {sending ? "Checking..." : "Preview (Dry Run)"}
            </Button>
            <Button variant="primary" onClick={() => setShowConfirm(true)} disabled={!title || !body || sending}>
              Send
            </Button>
          </div>
        </div>
      </Card>

      {error && <div className="alert alert--error">{error}</div>}

      {result && (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9375rem" }}>
            <p>
              <strong>{result.dryRun ? "Dry run" : "Sent"}:</strong>{" "}
              {result.dryRun ? `Would send to ${result.totalTargeted} user${result.totalTargeted !== 1 ? "s" : ""}` : `${result.sent} sent, ${result.failed} failed`}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
              Total targeted: {result.totalTargeted}
            </p>
          </div>
        </Card>
      )}

      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => send(false)}
        title="Send Push Notification"
        message={
          result?.dryRun
            ? `This will send a push to ${result.totalTargeted} user${result.totalTargeted !== 1 ? "s" : ""}. Are you sure?`
            : `Audience: ${audienceLabel(audience)}${activeFilterCount > 0 ? ` + ${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""}` : ""}. Tip: run a Dry Run first to see the exact count.`
        }
        confirmLabel="Send Now"
        loading={sending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email Campaigns Tab
// ---------------------------------------------------------------------------

const EMAIL_AUDIENCES = [
  { value: "test", label: "Send a test to one address" },
  { value: "all", label: "All users" },
  { value: "active", label: "Active users (1+ trips)" },
  { value: "inactive", label: "Inactive users (0 trips)" },
  { value: "premium", label: "Premium users" },
  { value: "free", label: "Free users" },
];

function EmailTab() {
  // ── Campaigns ──
  const [sending, setSending] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: string; sent: number; errors: number; dryRun: boolean; totalUsers: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; html: string } | null>(null);

  const sendEmail = async (type: string, dryRun: boolean) => {
    setSending(type);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams();
      if (dryRun) params.set("dryRun", "true");
      if (type === "re-engagement" && onlyInactive) params.set("onlyInactive", "true");
      const res = await api.post<{ data: any }>(`/admin/send-${type}?${params}`, {});
      setResult({ type, sent: res.data.sent, errors: res.data.errors, dryRun, totalUsers: res.data.totalUsers });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(null);
      setShowConfirm(null);
    }
  };

  const previewTemplate = async (id: string, title: string) => {
    setPreviewLoading(id);
    setError(null);
    try {
      const res = await api.get<{ data: { html: string } }>(`/admin/email/template-preview?type=${id}`);
      setPreview({ title, html: res.data.html });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPreviewLoading(null);
    }
  };

  const campaigns = [
    { id: "re-engagement", title: "Re-engagement", desc: "Personalised email to bring users back, with their trip stats.", cohort: false },
    { id: "update", title: "Product Update", desc: "Send the latest changelog/update email (reads the 'Latest' release notes).", cohort: false },
    { id: "service-status", title: "Service Status", desc: "Quick 'we're back up' notification to all users.", cohort: false },
    { id: "permission-nudge", title: "Permission nudge (can't-record cohort)", desc: "Email + push to users active in 30d whose latest diagnostic shows background location is OFF — they physically can't auto-record. Dry-run shows the cohort size.", cohort: true },
    { id: "update-nudge", title: "Update nudge (old builds)", desc: "Push to users active in 30d on an old build (<62) telling them to update for the reliability fixes. Dry-run shows the cohort size.", cohort: true },
  ];

  // ── Custom composer ──
  const [subject, setSubject] = useState("");
  const [eyebrow, setEyebrow] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [preheader, setPreheader] = useState("");
  const [includeGreeting, setIncludeGreeting] = useState(true);
  const [includeSignoff, setIncludeSignoff] = useState(true);
  const [audience, setAudience] = useState("test");
  const [testEmail, setTestEmail] = useState("anthonygair@icloud.com");
  const [gated, setGated] = useState(true);
  const [composerPreview, setComposerPreview] = useState("");
  const [composerSending, setComposerSending] = useState(false);
  const [composerResult, setComposerResult] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerConfirm, setComposerConfirm] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const composerPayload = useCallback(
    () => ({ subject, eyebrow, title, bodyMarkdown: body, ctaLabel, ctaUrl, preheader, includeGreeting, includeSignoff }),
    [subject, eyebrow, title, body, ctaLabel, ctaUrl, preheader, includeGreeting, includeSignoff]
  );

  // Live, debounced preview as the form is typed.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await api.post<{ data: { html: string } }>("/admin/email/preview-custom", composerPayload());
        setComposerPreview(res.data.html);
      } catch {
        /* preview errors are non-fatal */
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [composerPayload]);

  const sendCustom = async (dryRun: boolean) => {
    setComposerSending(true);
    setComposerError(null);
    setComposerResult(null);
    try {
      const res = await api.post<{ data: any }>("/admin/email/send-custom", {
        ...composerPayload(),
        audience,
        testEmail,
        gated,
        dryRun,
      });
      const d = res.data;
      setComposerResult(
        d.test
          ? dryRun
            ? `Dry run OK — would send a test to ${testEmail}`
            : `Test sent to ${testEmail}`
          : dryRun
            ? `Dry run: would send to ${d.sent} of ${d.totalUsers} users`
            : `Sent to ${d.sent} users, ${d.errors} errors`
      );
    } catch (err: any) {
      setComposerError(err.message);
    } finally {
      setComposerSending(false);
      setComposerConfirm(false);
    }
  };

  const canSend = subject.trim() && title.trim() && body.trim() && (audience !== "test" || testEmail.trim());
  const isTest = audience === "test";

  const labelStyle = { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {error && <div className="alert alert--error">{error}</div>}

      {result && (
        <Card>
          <p style={{ fontSize: "0.9375rem" }}>
            <strong>{result.dryRun ? "Dry run" : "Sent"} ({result.type}):</strong>{" "}
            {result.dryRun ? `Would send to ${result.sent} of ${result.totalUsers} users` : `${result.sent} sent, ${result.errors} errors`}
          </p>
        </Card>
      )}

      <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", margin: "0.25rem 0 -0.25rem" }}>
        Ready-made campaigns
      </h3>

      {campaigns.map((c) => (
        <Card key={c.id} title={c.title}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>{c.desc}</p>
          {c.id === "re-engagement" && (
            <label style={{ ...labelStyle, marginBottom: "1rem" }}>
              <input type="checkbox" checked={onlyInactive} onChange={(e) => setOnlyInactive(e.target.checked)} />
              Only users with 0 trips
            </label>
          )}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {!c.cohort && (
              <Button variant="ghost" size="sm" onClick={() => previewTemplate(c.id, c.title)} disabled={previewLoading === c.id}>
                {previewLoading === c.id ? "..." : "Preview"}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => sendEmail(c.id, true)} disabled={sending === c.id}>
              {sending === c.id ? "..." : "Dry Run"}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowConfirm(c.id)} disabled={sending === c.id}>
              Send
            </Button>
          </div>
        </Card>
      ))}

      <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", margin: "1rem 0 -0.25rem" }}>
        Compose a custom email
      </h3>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "1.5rem", alignItems: "start" }} className="email-composer-grid">
          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Input label="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What lands in their inbox" />
            <Input label="Eyebrow (small pill above the title)" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="e.g. PRODUCT UPDATE" />
            <Input label="Headline" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The big bold title" />
            <div className="form-group">
              <label className="form-label">Body</label>
              <textarea
                className="form-input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                placeholder={"Write your message here.\n\nBlank line = new paragraph.\n- start a line with a dash for bullets\n> a line starting with > is an amber callout\n**bold** and [links](https://mileclear.com) work too."}
                style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Formatting: blank line = paragraph · <code>- </code> = bullet · <code>&gt; </code> = callout · <code>**bold**</code> · <code>[label](url)</code>
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <Input label="Button label (optional)" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Open MileClear" />
              <Input label="Button link (optional)" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://mileclear.com/..." />
            </div>
            <Input label="Preview text (optional inbox preview line)" value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Defaults to the headline" />

            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "0.25rem" }}>
              <label style={labelStyle}>
                <input type="checkbox" checked={includeGreeting} onChange={(e) => setIncludeGreeting(e.target.checked)} />
                Include &quot;Hi {"{name}"},&quot;
              </label>
              <label style={labelStyle}>
                <input type="checkbox" checked={includeSignoff} onChange={(e) => setIncludeSignoff(e.target.checked)} />
                Include &quot;Cheers, Gair&quot;
              </label>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />

            <Select label="Send to" value={audience} onChange={(e) => setAudience(e.target.value)} options={EMAIL_AUDIENCES} />
            {isTest ? (
              <Input label="Test address" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
            ) : (
              <label style={{ ...labelStyle, marginTop: "-0.25rem" }}>
                <input type="checkbox" checked={gated} onChange={(e) => setGated(e.target.checked)} />
                Respect unsubscribes (recommended for marketing)
              </label>
            )}

            {composerError && <div className="alert alert--error">{composerError}</div>}
            {composerResult && (
              <div style={{ fontSize: "0.875rem", color: "var(--emerald-400, #34d399)", fontWeight: 600 }}>{composerResult}</div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem" }}>
              <Button variant="secondary" size="sm" onClick={() => sendCustom(true)} disabled={composerSending || !canSend}>
                {composerSending ? "..." : "Dry Run"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => (isTest ? sendCustom(false) : setComposerConfirm(true))}
                disabled={composerSending || !canSend}
              >
                {composerSending ? "Sending..." : isTest ? "Send Test" : "Send"}
              </Button>
            </div>
          </div>

          {/* Live preview */}
          <div style={{ position: "sticky", top: "1rem" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0 0 0.5rem", fontWeight: 600 }}>Live preview</p>
            <iframe
              title="Email preview"
              srcDoc={composerPreview}
              sandbox=""
              style={{ width: "100%", height: 620, border: "1px solid var(--border)", borderRadius: 12, background: "#030712" }}
            />
          </div>
        </div>
      </Card>

      {/* Campaign preview modal */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `Preview — ${preview.title}` : ""} large>
        <iframe
          title="Campaign preview"
          srcDoc={preview?.html ?? ""}
          sandbox=""
          style={{ width: "100%", height: 640, border: "none", borderRadius: 8, background: "#030712" }}
        />
      </Modal>

      <ConfirmModal
        open={!!showConfirm}
        onClose={() => setShowConfirm(null)}
        onConfirm={() => showConfirm && sendEmail(showConfirm, false)}
        title="Send Email Campaign"
        message="This will send emails to users. Brevo's free tier has a 300/day limit. Are you sure?"
        confirmLabel="Send Now"
        loading={!!sending}
      />

      <ConfirmModal
        open={composerConfirm}
        onClose={() => setComposerConfirm(false)}
        onConfirm={() => sendCustom(false)}
        title="Send custom email"
        message={`This will send your email to "${EMAIL_AUDIENCES.find((a) => a.value === audience)?.label}". Brevo's free tier has a 300/day limit. Run a dry run first if you're unsure. Continue?`}
        confirmLabel="Send Now"
        loading={composerSending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback Tab
// ---------------------------------------------------------------------------

const FB_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
];

const FB_CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "feature_request", label: "Feature Request" },
  { value: "bug_report", label: "Bug Report" },
  { value: "improvement", label: "Improvement" },
  { value: "other", label: "Other" },
];

const FB_STATUSES = [
  { value: "new", label: "New", color: "#8494a7" },
  { value: "planned", label: "Planned", color: "#3b82f6" },
  { value: "in_progress", label: "In Progress", color: "#f5a623" },
  { value: "done", label: "Done", color: "#34c759" },
  { value: "declined", label: "Declined", color: "#ef4444" },
];

const KI_STATUSES = [
  { value: "investigating", label: "Investigating", color: "#f59e0b" },
  { value: "fix_in_progress", label: "Fix in Progress", color: "#3b82f6" },
  { value: "fixed", label: "Fixed", color: "#10b981" },
];

interface FbItem {
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

function FeedbackTab() {
  const [items, setItems] = useState<FbItem[]>([]);
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", sort: "newest" });
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      const [listRes, statsRes] = await Promise.all([
        api.get<{ data: FbItem[]; totalPages: number }>(`/feedback/?${params}`),
        api.get<{ data: { total: number; byStatus: Record<string, number> } }>("/feedback/stats"),
      ]);
      setItems(listRes.data);
      setTotalPages(listRes.totalPages);
      setStats(statsRes.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, categoryFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await api.patch(`/feedback/${id}/status`, { status: newStatus });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));
    } catch {} finally { setUpdatingId(null); }
  };

  const handleToggleKnownIssue = async (id: string, currentlyKnown: boolean) => {
    const newVal = !currentlyKnown;
    try {
      await api.patch(`/feedback/${id}/known-issue`, { isKnownIssue: newVal, knownIssueStatus: newVal ? "investigating" : null });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isKnownIssue: newVal, knownIssueStatus: newVal ? "investigating" : null } : i)));
    } catch {}
  };

  const handleKnownIssueStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/feedback/${id}/known-issue`, { isKnownIssue: true, knownIssueStatus: status });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isKnownIssue: true, knownIssueStatus: status } : i)));
    } catch {}
  };

  const handleSendReply = async (feedbackId: string) => {
    const body = replyText.trim();
    if (!body) return;
    setSendingReply(true);
    try {
      const res = await api.post<{ data: { id: string; body: string; adminName: string; createdAt: string } }>(`/feedback/${feedbackId}/reply`, { body });
      setItems((prev) => prev.map((i) => (i.id === feedbackId ? { ...i, replyCount: i.replyCount + 1, replies: [...i.replies, res.data] } : i)));
      setReplyText("");
    } catch {} finally { setSendingReply(false); }
  };

  const handleDeleteReply = async (feedbackId: string, replyId: string) => {
    try {
      await api.delete(`/feedback/reply/${replyId}`);
      setItems((prev) => prev.map((i) => (i.id === feedbackId ? { ...i, replyCount: Math.max(0, i.replyCount - 1), replies: i.replies.filter((r) => r.id !== replyId) } : i)));
    } catch {}
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/feedback/${deleteId}`);
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
      if (expandedId === deleteId) setExpandedId(null);
    } catch {} finally { setDeleteId(null); }
  };

  if (loading && items.length === 0) return <LoadingSkeleton variant="card" count={3} style={{ height: 90 }} />;
  if (error) return <div className="alert alert--error">{error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Stats row */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <p className="stat-card__label">Total</p>
            <p className="stat-card__value">{stats.total}</p>
          </div>
          {FB_STATUSES.map((st) => (
            <div className="stat-card" key={st.value}>
              <p className="stat-card__label">{st.label}</p>
              <p className="stat-card__value" style={{ color: st.color }}>{stats.byStatus[st.value] || 0}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 160 }}>
          <Select id="fbStatus" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} options={FB_STATUS_OPTIONS} />
        </div>
        <div style={{ minWidth: 160 }}>
          <Select id="fbCategory" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} options={FB_CATEGORY_OPTIONS} />
        </div>
      </div>

      {/* Feedback list */}
      {items.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem 0" }}>No feedback found</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const statusMeta = FB_STATUSES.find((s) => s.value === item.status);
            return (
              <div key={item.id}>
                <div
                  onClick={() => { setExpandedId(expanded ? null : item.id); if (!expanded) setReplyText(""); }}
                  style={{
                    display: "flex", gap: "1rem", padding: "1rem 1.25rem",
                    background: "var(--dash-card-bg)", border: "1px solid var(--dash-card-border)",
                    borderRadius: expanded ? "var(--r-md) var(--r-md) 0 0" : "var(--r-md)",
                    cursor: "pointer", transition: "background 0.15s",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text-primary)" }}>{item.title}</span>
                      {item.isKnownIssue && (
                        <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#ef4444", background: "rgba(239,68,68,0.12)", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>Known Issue</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap", fontSize: "0.75rem" }}>
                      <Badge variant="source">{FB_CATEGORY_OPTIONS.find((c) => c.value === item.category)?.label || item.category}</Badge>
                      {statusMeta && <Badge variant={item.status === "done" ? "success" : item.status === "declined" ? "danger" : item.status === "planned" ? "business" : "source"}>{statusMeta.label}</Badge>}
                      <span style={{ color: "var(--text-faint)" }}>by {item.displayName || "Anonymous"}</span>
                      <span style={{ color: "var(--text-faint)" }}>{timeAgo(item.createdAt)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexShrink: 0, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    <span title="Votes" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
                      {item.upvoteCount}
                    </span>
                    {item.replyCount > 0 && (
                      <span title="Replies" style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--emerald-400)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        {item.replyCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{
                    padding: "1.25rem", background: "var(--dash-card-bg)",
                    border: "1px solid var(--dash-card-border)", borderTop: "none",
                    borderRadius: "0 0 var(--r-md) var(--r-md)",
                  }}>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 1.25rem" }}>{item.body}</p>

                    {/* Status */}
                    <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Status</p>
                    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                      {FB_STATUSES.map((st) => (
                        <button key={st.value} onClick={() => handleStatusChange(item.id, st.value)} disabled={updatingId === item.id}
                          style={{
                            padding: "0.25rem 0.625rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                            border: `1px solid ${item.status === st.value ? st.color : "var(--border-default)"}`,
                            background: item.status === st.value ? st.color + "18" : "transparent",
                            color: item.status === st.value ? st.color : "var(--text-secondary)",
                            opacity: updatingId === item.id ? 0.5 : 1, transition: "all 0.15s",
                          }}
                        >{st.label}</button>
                      ))}
                    </div>

                    {/* Known Issue */}
                    <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Known Issue</p>
                    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: item.isKnownIssue ? "0.5rem" : "1rem" }}>
                      <button onClick={() => handleToggleKnownIssue(item.id, item.isKnownIssue)}
                        style={{
                          padding: "0.25rem 0.625rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                          border: `1px solid ${item.isKnownIssue ? "rgba(239,68,68,0.3)" : "var(--border-default)"}`,
                          background: item.isKnownIssue ? "rgba(239,68,68,0.08)" : "transparent",
                          color: item.isKnownIssue ? "#ef4444" : "var(--text-secondary)", transition: "all 0.15s",
                        }}
                      >{item.isKnownIssue ? "Remove Known Issue" : "Mark as Known Issue"}</button>
                    </div>
                    {item.isKnownIssue && (
                      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                        {KI_STATUSES.map((st) => (
                          <button key={st.value} onClick={() => handleKnownIssueStatus(item.id, st.value)}
                            style={{
                              padding: "0.25rem 0.625rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                              border: `1px solid ${item.knownIssueStatus === st.value ? st.color : "var(--border-default)"}`,
                              background: item.knownIssueStatus === st.value ? st.color + "18" : "transparent",
                              color: item.knownIssueStatus === st.value ? st.color : "var(--text-secondary)", transition: "all 0.15s",
                            }}
                          >{st.label}</button>
                        ))}
                      </div>
                    )}

                    {/* Replies */}
                    {item.replies.length > 0 && (
                      <div style={{ marginBottom: "1rem" }}>
                        <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Replies</p>
                        {item.replies.map((r) => (
                          <div key={r.id} style={{ borderLeft: "2px solid var(--amber-400, #f5a623)", background: "rgba(245,166,35,0.05)", borderRadius: "0 6px 6px 0", padding: "0.625rem 0.875rem", marginBottom: "0.375rem", position: "relative" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                              <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--amber-400, #f5a623)" }}>{r.adminName}</span>
                              <span style={{ fontSize: "0.625rem", color: "var(--text-faint)" }}>{timeAgo(r.createdAt)}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5, paddingRight: "1.5rem" }}>{r.body}</p>
                            <button onClick={() => handleDeleteReply(item.id, r.id)} title="Delete reply"
                              style={{ position: "absolute", bottom: 8, right: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: "0.75rem" }}
                            >&times;</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply input */}
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Input id={`reply-${item.id}`} placeholder="Write a reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                      </div>
                      <Button variant="primary" size="sm" onClick={() => handleSendReply(item.id)} disabled={sendingReply || !replyText.trim()}>
                        {sendingReply ? "Sending..." : "Reply"}
                      </Button>
                    </div>

                    {/* Delete */}
                    <Button variant="danger" size="sm" onClick={() => setDeleteId(item.id)}>Delete Feedback</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Feedback"
        message="This will permanently delete this feedback and all its votes. This can't be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Tab
// ---------------------------------------------------------------------------

function ActivityTab() {
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);
  const [premiumUsers, setPremiumUsers] = useState<AdminUser[]>([]);
  const [recentFeedback, setRecentFeedback] = useState<FbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ data: AdminUser[] }>("/admin/users?page=1&pageSize=15"),
      api.get<{ data: FbItem[] }>("/feedback/?page=1&pageSize=10&sort=newest"),
    ])
      .then(([usersRes, fbRes]) => {
        const allUsers = usersRes.data;
        setRecentUsers(allUsers.slice(0, 10));
        setPremiumUsers(allUsers.filter((u) => u.isPremium).slice(0, 10));
        setRecentFeedback(fbRes.data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="card" count={3} style={{ height: 120 }} />;
  if (error) return <div className="alert alert--error">{error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Recent Signups */}
      <Card title={`Recent Signups (${recentUsers.length})`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => (
                <tr key={u.id} onClick={() => setDetailUserId(u.id)} style={{ cursor: "pointer" }}>
                  <td style={{ fontSize: "0.8125rem" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      {u.email}
                      {u.diagnosticDump && u.diagnosticDump.verdict !== "healthy" && (
                        <span
                          title={`Detection: ${u.diagnosticDump.verdict}`}
                          style={{
                            display: "inline-block",
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            flexShrink: 0,
                            background: u.diagnosticDump.verdict === "error" ? "var(--dash-red)"
                              : u.diagnosticDump.verdict === "warning" ? "var(--amber-500)"
                              : "var(--dash-blue, #3b82f6)",
                          }}
                        />
                      )}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.8125rem" }}>{u.displayName || "-"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {u.isPremium && <Badge variant="pro">PRO</Badge>}
                      {u.isAdmin && <Badge variant="primary">Admin</Badge>}
                      {u.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge variant="danger">Unverified</Badge>}
                    </div>
                  </td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    {timeAgo(u.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Premium Users */}
      {premiumUsers.length > 0 && (
        <Card title={`Premium Users (${premiumUsers.length})`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Trips</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {premiumUsers.map((u) => (
                  <tr key={u.id} onClick={() => setDetailUserId(u.id)} style={{ cursor: "pointer" }}>
                    <td style={{ fontSize: "0.8125rem" }}>{u.email}</td>
                    <td style={{ fontSize: "0.8125rem" }}>{u.displayName || "-"}</td>
                    <td style={{ fontSize: "0.8125rem" }}>{u._count.trips}</td>
                    <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{timeAgo(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recent Feedback */}
      <Card title={`Recent Feedback (${recentFeedback.length})`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Votes</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {recentFeedback.map((fb) => {
                const statusMeta = FB_STATUSES.find((s) => s.value === fb.status);
                return (
                  <tr key={fb.id}>
                    <td style={{ fontSize: "0.8125rem", fontWeight: 500, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fb.title}</td>
                    <td><Badge variant="source">{FB_CATEGORY_OPTIONS.find((c) => c.value === fb.category)?.label || fb.category}</Badge></td>
                    <td>{statusMeta && <Badge variant={fb.status === "done" ? "success" : fb.status === "declined" ? "danger" : "source"}>{statusMeta.label}</Badge>}</td>
                    <td style={{ fontSize: "0.8125rem", textAlign: "center" }}>{fb.upvoteCount}</td>
                    <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{timeAgo(fb.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <UserDetailModal userId={detailUserId} open={!!detailUserId} onClose={() => setDetailUserId(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Ops Tab — Apple IAP webhook log + Job run log
// ---------------------------------------------------------------------------

interface AppleWebhookLog {
  id: string;
  notificationType: string | null;
  subtype: string | null;
  originalTransactionId: string | null;
  userId: string | null;
  status: string;
  errorMessage: string | null;
  receivedAt: string;
  isGhost?: boolean;
}

interface JobRunLog {
  id: string;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  errorMessage: string | null;
  metadata: string | null;
}

interface AppleWebhookResponse {
  data: AppleWebhookLog[];
  total: number;
  totalPages: number;
  last24h: Record<string, number>;
  ghostCount?: number;
}

interface JobRunResponse {
  data: JobRunLog[];
  total: number;
  totalPages: number;
  latestPerJob: Array<{
    jobName: string;
    startedAt: string;
    finishedAt: string | null;
    status: string;
  }>;
}

interface OrphanReprocessResult {
  txn: string;
  receivedAt: string;
  outcome: "linked" | "still_no_user" | "no_appAccountToken" | "fetch_failed" | "conflict" | "no_txn_id";
  userId?: string;
  userEmail?: string;
  detail?: string;
}

function OpsTab() {
  const [webhooks, setWebhooks] = useState<AppleWebhookResponse | null>(null);
  const [webhookStatus, setWebhookStatus] = useState("");
  const [includeGhosts, setIncludeGhosts] = useState(false);
  const [jobs, setJobs] = useState<JobRunResponse | null>(null);
  const [jobFilter, setJobFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  // null = idle, "all" = bulk reprocess in flight, "<txnId>" = single in flight
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [reprocessNotice, setReprocessNotice] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  // Manual-link modal: holds the txn id we're linking, the email input, and submission state
  const [linkModalTxn, setLinkModalTxn] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  // Per-row ghost mark/unmark in flight
  const [ghostMarking, setGhostMarking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const webhookParams = new URLSearchParams({ page: "1", pageSize: "50" });
      if (webhookStatus) webhookParams.set("status", webhookStatus);
      if (includeGhosts) webhookParams.set("includeGhosts", "1");
      const jobParams = new URLSearchParams({ page: "1", pageSize: "50" });
      if (jobFilter) jobParams.set("jobName", jobFilter);
      const [wh, jr] = await Promise.all([
        api.get<AppleWebhookResponse>(`/admin/apple-webhooks?${webhookParams}`),
        api.get<JobRunResponse>(`/admin/job-runs?${jobParams}`),
      ]);
      setWebhooks(wh);
      setJobs(jr);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [webhookStatus, jobFilter, includeGhosts]);

  const respondPendingConsumption = useCallback(async () => {
    setReprocessing("consumption");
    setReprocessNotice(null);
    try {
      const res = await api.post<{
        data: {
          processed: number;
          results: Array<{ txn: string; ok: boolean; reason?: string; orphan: boolean }>;
        };
      }>("/admin/apple/respond-consumption-pending", {});
      const ok = res.data.results.filter((r) => r.ok).length;
      const fail = res.data.results.length - ok;
      setReprocessNotice({
        kind: ok > 0 ? "ok" : fail === 0 ? "warn" : "err",
        text:
          res.data.processed === 0
            ? "No CONSUMPTION_REQUEST webhooks pending."
            : `Consumption responses: ${ok} submitted, ${fail} failed.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Consumption response failed" });
    } finally {
      setReprocessing(null);
    }
  }, [load]);

  const markGhost = useCallback(async (txnId: string) => {
    setGhostMarking(txnId);
    setReprocessNotice(null);
    try {
      await api.post(`/admin/apple/ghosts/${encodeURIComponent(txnId)}`, {});
      setReprocessNotice({
        kind: "ok",
        text: `${txnId.slice(0, 12)}…  Marked as ghost — silenced from chip + default view.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Mark ghost failed" });
    } finally {
      setGhostMarking(null);
    }
  }, [load]);

  const unmarkGhost = useCallback(async (txnId: string) => {
    setGhostMarking(txnId);
    setReprocessNotice(null);
    try {
      await api.delete(`/admin/apple/ghosts/${encodeURIComponent(txnId)}`);
      setReprocessNotice({
        kind: "ok",
        text: `${txnId.slice(0, 12)}…  Unmarked — back in the default view.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Unmark failed" });
    } finally {
      setGhostMarking(null);
    }
  }, [load]);

  const autoMarkGhosts = useCallback(async () => {
    setReprocessing("auto-mark");
    setReprocessNotice(null);
    try {
      const res = await api.post<{
        data: { marked: number; skipped: number; threshold: number; candidates: string[] };
      }>("/admin/apple/ghosts/auto-mark", { threshold: 3 });
      setReprocessNotice({
        kind: res.data.marked > 0 ? "ok" : "warn",
        text:
          res.data.marked === 0 && res.data.skipped === 0
            ? `No transactions with ≥${res.data.threshold} orphan events yet.`
            : `Auto-marked ${res.data.marked} ghost(s) (≥${res.data.threshold} orphans). ${res.data.skipped} already flagged.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Auto-mark failed" });
    } finally {
      setReprocessing(null);
    }
  }, [load]);

  const reprocessAll = useCallback(async () => {
    setReprocessing("all");
    setReprocessNotice(null);
    try {
      const res = await api.post<{ data: { processed: number; results: OrphanReprocessResult[] } }>(
        "/admin/apple/reprocess-orphans",
        {}
      );
      const linked = res.data.results.filter((r) => r.outcome === "linked").length;
      const stillUnlinked = res.data.results.length - linked;
      setReprocessNotice({
        kind: linked > 0 ? "ok" : "warn",
        text: `Processed ${res.data.processed}: ${linked} linked, ${stillUnlinked} still unlinked.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Reprocess failed" });
    } finally {
      setReprocessing(null);
    }
  }, [load]);

  const submitManualLink = useCallback(async () => {
    if (!linkModalTxn || !linkEmail) return;
    setLinkSubmitting(true);
    setLinkError(null);
    try {
      const res = await api.post<{ data: { userId: string; userEmail: string; displayName: string | null; originalTransactionId: string } }>(
        "/admin/apple/link-orphan",
        { originalTransactionId: linkModalTxn, email: linkEmail.trim() }
      );
      const r = res.data;
      setReprocessNotice({
        kind: "ok",
        text: `${linkModalTxn.slice(0, 12)}…  Linked → ${r.displayName ?? r.userEmail}`,
      });
      setLinkModalTxn(null);
      setLinkEmail("");
      await load();
    } catch (err: any) {
      setLinkError(err?.message ?? "Link failed");
    } finally {
      setLinkSubmitting(false);
    }
  }, [linkModalTxn, linkEmail, load]);

  const reprocessOne = useCallback(async (txnId: string) => {
    setReprocessing(txnId);
    setReprocessNotice(null);
    try {
      const res = await api.post<{ data: OrphanReprocessResult }>(
        `/admin/apple/reprocess-orphan/${encodeURIComponent(txnId)}`,
        {}
      );
      const r = res.data;
      const kind: "ok" | "warn" = r.outcome === "linked" ? "ok" : "warn";
      const friendly =
        r.outcome === "linked" ? `Linked → ${r.userEmail ?? r.userId ?? "user"}`
        : r.outcome === "no_appAccountToken" ? "No appAccountToken on canonical transaction"
        : r.outcome === "still_no_user" ? "Apple's appAccountToken matched no user"
        : r.outcome === "conflict" ? "User already linked to a different transaction"
        : r.outcome === "fetch_failed" ? "Apple API fetch failed"
        : r.outcome;
      setReprocessNotice({ kind, text: `${txnId.slice(0, 12)}…  ${friendly}` });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Reprocess failed" });
    } finally {
      setReprocessing(null);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !webhooks && !jobs) {
    return <LoadingSkeleton variant="card" count={3} style={{ height: 120 }} />;
  }
  if (error) {
    return <div className="alert alert--error" role="alert">{error}</div>;
  }

  const statusColor = (status: string) => {
    if (status === "success") return "var(--emerald-400)";
    if (status === "running") return "var(--dash-blue, #3b82f6)";
    if (status === "unhandled") return "var(--amber-500)";
    return "var(--dash-red)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Apple IAP Webhooks */}
      <Card title="Apple IAP Webhooks">
        {webhooks && (
          <>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem", fontSize: "0.8125rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Last 24h:</span>
              {Object.keys(webhooks.last24h).length === 0 ? (
                <span style={{ color: "var(--text-tertiary)" }}>no events</span>
              ) : (
                Object.entries(webhooks.last24h).map(([status, count]) => (
                  <span
                    key={status}
                    style={{
                      padding: "0.1rem 0.5rem",
                      borderRadius: 4,
                      background: `color-mix(in srgb, ${statusColor(status)} 18%, transparent)`,
                      color: statusColor(status),
                      fontWeight: 600,
                    }}
                  >
                    {status}: {count}
                  </span>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Filter:</span>
              <div style={{ minWidth: 180 }}>
                <Select
                  id="webhook-status-filter"
                  value={webhookStatus}
                  onChange={(e) => setWebhookStatus(e.target.value)}
                  aria-label="Filter by status"
                  options={[
                    { value: "", label: "All statuses" },
                    { value: "success", label: "success" },
                    { value: "verification_failed", label: "verification_failed" },
                    { value: "no_user", label: "no_user" },
                    { value: "handler_error", label: "handler_error" },
                    { value: "unhandled", label: "unhandled" },
                    { value: "no_transaction_id", label: "no_transaction_id" },
                    { value: "invalid_json", label: "invalid_json" },
                    { value: "missing_payload", label: "missing_payload" },
                    { value: "not_configured", label: "not_configured" },
                  ]}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
              {((webhooks.last24h["no_user"] ?? 0) > 0 || webhookStatus === "no_user") && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={reprocessAll}
                  disabled={reprocessing !== null}
                >
                  {reprocessing === "all" ? "Reprocessing…" : "Reprocess all orphans"}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={respondPendingConsumption}
                disabled={reprocessing !== null}
                title="Submit consumption-data responses for any CONSUMPTION_REQUEST webhooks awaiting a response (last 14 days)"
              >
                {reprocessing === "consumption" ? "Submitting…" : "Respond to pending CONSUMPTION_REQUESTs"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={autoMarkGhosts}
                disabled={reprocessing !== null}
                title="Flag any transaction with 3+ no_user events as a ghost. Silences them from the Last 24h chip + default panel view."
              >
                {reprocessing === "auto-mark" ? "Marking…" : "Auto-mark ghosts"}
              </Button>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.8125rem",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  marginLeft: "0.5rem",
                }}
                title="Include rows for transactions you've marked as ghosts"
              >
                <input
                  type="checkbox"
                  checked={includeGhosts}
                  onChange={(e) => setIncludeGhosts(e.target.checked)}
                />
                Show ghosts
                {webhooks.ghostCount && webhooks.ghostCount > 0 ? (
                  <span style={{ color: "var(--text-secondary)" }}>
                    ({webhooks.ghostCount})
                  </span>
                ) : null}
              </label>
            </div>
            {reprocessNotice && (
              <div
                role="status"
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: 6,
                  marginBottom: "0.75rem",
                  fontSize: "0.8125rem",
                  background:
                    reprocessNotice.kind === "ok"
                      ? "color-mix(in srgb, var(--emerald-400) 14%, transparent)"
                      : reprocessNotice.kind === "warn"
                      ? "color-mix(in srgb, var(--amber-500) 14%, transparent)"
                      : "color-mix(in srgb, var(--dash-red) 14%, transparent)",
                  color:
                    reprocessNotice.kind === "ok"
                      ? "var(--emerald-400)"
                      : reprocessNotice.kind === "warn"
                      ? "var(--amber-500)"
                      : "var(--dash-red)",
                }}
              >
                {reprocessNotice.text}
              </div>
            )}
            {webhooks.data.length === 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                No webhook entries yet.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th>Type</th>
                      <th>Subtype</th>
                      <th>Status</th>
                      <th>Txn ID</th>
                      <th>User</th>
                      <th>Error</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhooks.data.map((w) => (
                      <tr
                        key={w.id}
                        style={w.isGhost ? { opacity: 0.55 } : undefined}
                      >
                        <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                          {new Date(w.receivedAt).toLocaleString()}
                        </td>
                        <td style={{ fontSize: "0.75rem" }}>{w.notificationType || "-"}</td>
                        <td style={{ fontSize: "0.75rem" }}>{w.subtype || "-"}</td>
                        <td style={{ fontSize: "0.75rem" }}>
                          <span style={{ color: statusColor(w.status), fontWeight: 600 }}>{w.status}</span>
                          {w.isGhost && (
                            <span
                              title="Marked as ghost — excluded from chip + default view"
                              style={{
                                marginLeft: "0.4rem",
                                padding: "0 0.35rem",
                                borderRadius: 4,
                                background: "color-mix(in srgb, var(--text-tertiary) 18%, transparent)",
                                color: "var(--text-tertiary)",
                                fontSize: "0.6875rem",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}
                            >
                              ghost
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.6875rem", fontFamily: "monospace", color: "var(--text-tertiary)" }}>
                          {w.originalTransactionId ? w.originalTransactionId.slice(0, 12) + "..." : "-"}
                        </td>
                        <td style={{ fontSize: "0.6875rem", fontFamily: "monospace", color: "var(--text-tertiary)" }}>
                          {w.userId ? w.userId.slice(0, 8) + "..." : "-"}
                        </td>
                        <td style={{ fontSize: "0.75rem", maxWidth: 280 }}>
                          {w.errorMessage ? (
                            <button
                              onClick={() => setExpandedError(expandedError === w.id ? null : w.id)}
                              style={{ background: "none", border: "none", color: "var(--dash-red)", cursor: "pointer", textAlign: "left", padding: 0, font: "inherit", whiteSpace: expandedError === w.id ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: 280 }}
                              title="Click to toggle full error"
                            >
                              {w.errorMessage}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={{ fontSize: "0.75rem" }}>
                          {w.status === "no_user" && w.originalTransactionId ? (
                            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                              {!w.isGhost && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => reprocessOne(w.originalTransactionId!)}
                                  disabled={reprocessing !== null || ghostMarking !== null}
                                >
                                  {reprocessing === w.originalTransactionId ? "…" : "Reprocess"}
                                </Button>
                              )}
                              {!w.isGhost && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setLinkModalTxn(w.originalTransactionId);
                                    setLinkEmail("");
                                    setLinkError(null);
                                  }}
                                  disabled={reprocessing !== null || ghostMarking !== null}
                                >
                                  Link…
                                </Button>
                              )}
                              {w.isGhost ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => unmarkGhost(w.originalTransactionId!)}
                                  disabled={ghostMarking !== null}
                                  title="Bring this transaction back into the default view"
                                >
                                  {ghostMarking === w.originalTransactionId ? "…" : "Unmark"}
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => markGhost(w.originalTransactionId!)}
                                  disabled={ghostMarking !== null || reprocessing !== null}
                                  title="Mark this transaction as a known ghost — silence it from the chip + default view"
                                >
                                  {ghostMarking === w.originalTransactionId ? "…" : "Ghost"}
                                </Button>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Job Runs */}
      <Card title="Background Jobs">
        {jobs && (
          <>
            {jobs.latestPerJob.length > 0 && (
              <div style={{ marginBottom: "0.75rem" }}>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0 0 0.5rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Latest run per job
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0.5rem" }}>
                  {jobs.latestPerJob.map((l) => (
                    <div
                      key={l.jobName}
                      style={{
                        padding: "0.5rem 0.75rem",
                        background: "var(--bg-elevated, rgba(255,255,255,0.03))",
                        border: `1px solid color-mix(in srgb, ${statusColor(l.status)} 30%, transparent)`,
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                        {l.jobName}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: statusColor(l.status), fontWeight: 600 }}>
                        {l.status}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                        {timeAgo(l.startedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Filter:</span>
              <div style={{ minWidth: 200 }}>
                <Input
                  id="job-filter"
                  placeholder="Job name (e.g. streak_at_risk)"
                  value={jobFilter}
                  onChange={(e) => setJobFilter(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
            </div>

            {jobs.data.length === 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                No job runs yet.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.data.map((r) => {
                      const dur = r.finishedAt
                        ? Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 10) / 100
                        : null;
                      return (
                        <tr key={r.id}>
                          <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                            {new Date(r.startedAt).toLocaleString()}
                          </td>
                          <td style={{ fontSize: "0.75rem", fontFamily: "monospace" }}>{r.jobName}</td>
                          <td style={{ fontSize: "0.75rem" }}>
                            <span style={{ color: statusColor(r.status), fontWeight: 600 }}>{r.status}</span>
                          </td>
                          <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                            {dur !== null ? `${dur.toFixed(2)}s` : "-"}
                          </td>
                          <td style={{ fontSize: "0.75rem", maxWidth: 320 }}>
                            {r.errorMessage ? (
                              <button
                                onClick={() => setExpandedError(expandedError === r.id ? null : r.id)}
                                style={{ background: "none", border: "none", color: "var(--dash-red)", cursor: "pointer", textAlign: "left", padding: 0, font: "inherit", whiteSpace: expandedError === r.id ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: 320 }}
                                title="Click to toggle full error"
                              >
                                {r.errorMessage}
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Manual-link modal — used when an Apple IAP orphan has no
          appAccountToken on the canonical transaction (pre-1.1.0
          purchase) and a user has reached out to support to claim it. */}
      <Modal
        open={linkModalTxn !== null}
        onClose={() => {
          if (!linkSubmitting) setLinkModalTxn(null);
        }}
        title="Link Apple IAP transaction to a user"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
            Use this when a user has confirmed they paid for Pro but the app shows them as Free
            (typically a pre-1.1.0 purchase whose <code>appAccountToken</code> was never recorded).
          </p>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "monospace" }}>
            Transaction: {linkModalTxn ?? ""}
          </div>
          <Input
            id="link-orphan-email"
            label="MileClear account email"
            type="email"
            value={linkEmail}
            onChange={(e) => setLinkEmail(e.target.value)}
            placeholder="user@example.com"
            autoFocus
          />
          {linkError && (
            <div className="alert alert--error" role="alert">{linkError}</div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLinkModalTxn(null)}
              disabled={linkSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={submitManualLink}
              disabled={linkSubmitting || !linkEmail.trim()}
            >
              {linkSubmitting ? "Linking…" : "Link & grant Pro"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts Tab - diagnostic alerts sent to users
// ---------------------------------------------------------------------------

interface AlertEvent {
  id: string;
  type: string;
  userId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user?: { email: string; displayName: string | null } | null;
}

function AlertsTab() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: AlertEvent[] }>("/admin/diagnostic-alerts")
      .then((res) => setAlerts(res.data))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="row" count={6} />;

  const alertLabel = (type: string) => {
    // Heartbeat-driven (10 May 2026)
    if (type === "alert.heartbeat_bg_location_lost") return "Background Location Lost";
    if (type === "alert.heartbeat_bg_fetch_denied") return "Background Refresh Denied";
    if (type === "alert.heartbeat_sync_perm_failed") return "Sync Queue Failed";
    if (type === "alert.heartbeat_low_disk") return "Low Disk Space";
    // Revenue-impact
    if (type.includes("subscription_orphan")) return "Subscription Orphan";
    // Diagnostic-dump-driven (legacy)
    if (type.includes("permission")) return "Permission Missing";
    if (type.includes("task_not")) return "Task Stopped";
    if (type.includes("stuck")) return "Stuck Recording";
    return type;
  };

  const alertColor = (type: string) => {
    // Red — actively breaking the user's tracking pipeline
    if (type === "alert.heartbeat_bg_location_lost") return "var(--dash-red)";
    if (type === "alert.heartbeat_bg_fetch_denied") return "var(--dash-red)";
    if (type === "alert.heartbeat_sync_perm_failed") return "var(--dash-red)";
    if (type.includes("permission")) return "var(--dash-red)";
    if (type.includes("task_not")) return "var(--dash-red)";
    // Amber — degraded but recoverable
    if (type === "alert.heartbeat_low_disk") return "var(--amber-500)";
    if (type.includes("stuck")) return "var(--amber-500)";
    if (type.includes("subscription_orphan")) return "var(--amber-500)";
    return "var(--text-secondary)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <Card title="Diagnostic Alerts">
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 1rem" }}>
          Alerts sent to users when their diagnostics show fixable issues. You receive a copy of each as a push notification.
        </p>
        {alerts.length === 0 ? (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>
            No alerts sent yet. Alerts fire when users upload diagnostics or when the periodic scan runs (every 6 hours).
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Alert</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                      {timeAgo(a.createdAt)}
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                        {new Date(a.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {a.user?.displayName || a.user?.email || a.userId || "-"}
                    </td>
                    <td>
                      <span style={{
                        color: alertColor(a.type),
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                      }}>
                        {alertLabel(a.type)}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {a.metadata ? JSON.stringify(a.metadata) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

type Tab = "overview" | "activity" | "users" | "health" | "revenue" | "engagement" | "auto-trips" | "push" | "email" | "feedback" | "ops" | "alerts";

const tabLabels: Record<Tab, string> = {
  overview: "Overview",
  activity: "Activity",
  users: "Users",
  health: "Health",
  revenue: "Revenue",
  engagement: "Engagement",
  "auto-trips": "Auto-trips",
  push: "Push",
  email: "Email",
  feedback: "Feedback",
  ops: "Ops",
  alerts: "Alerts",
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [accessDenied, setAccessDenied] = useState(false);
  const [checking, setChecking] = useState(true);

  // Gate: verify admin access before rendering anything
  useEffect(() => {
    api
      .get("/admin/analytics")
      .catch((err: Error) => {
        if (err.message.includes("403") || err.message.toLowerCase().includes("forbidden")) {
          setAccessDenied(true);
        }
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <>
        <PageHeader title="Admin" subtitle="Platform management and analytics" />
        <LoadingSkeleton variant="card" style={{ height: 120 }} />
      </>
    );
  }

  if (accessDenied) {
    return (
      <>
        <PageHeader title="Admin" subtitle="Platform management and analytics" />
        <div className="alert alert--warning" role="alert">
          You don't have permission to access admin features.
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <PageHeader
          title="Admin"
          subtitle="Platform management and analytics"
        />
        <div style={{ display: "flex", gap: 8, alignSelf: "center" }}>
          <a
            href="/dashboard/admin/build-health"
            style={{
              background: "rgba(251, 191, 36, 0.12)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              color: "#fbbf24",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Build Health →
          </a>
          <a
            href="/dashboard/admin/funnel"
            style={{
              background: "rgba(251, 191, 36, 0.12)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              color: "#fbbf24",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Funnel →
          </a>
          <a
            href="/dashboard/admin/issues-by-hour"
            style={{
              background: "rgba(251, 191, 36, 0.12)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              color: "#fbbf24",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Issues/Hour →
          </a>
          <a
            href="/dashboard/admin/geographic-density"
            style={{
              background: "rgba(251, 191, 36, 0.12)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              color: "#fbbf24",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Density →
          </a>
          <a
            href="/dashboard/admin/insights"
            style={{
              background: "rgba(251, 191, 36, 0.12)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              color: "#fbbf24",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Insights →
          </a>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="filter-chips" style={{ marginBottom: "1.25rem", overflowX: "auto" }}>
        {(Object.keys(tabLabels) as Tab[]).map((t) => (
          <button
            key={t}
            className={`filter-chip ${tab === t ? "filter-chip--active" : ""}`}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab />}
      {tab === "health" && <HealthTab />}
      {tab === "revenue" && <RevenueTab />}
      {tab === "engagement" && <EngagementTab />}
      {tab === "auto-trips" && <AutoTripsTab />}
      {tab === "push" && <PushTab />}
      {tab === "email" && <EmailTab />}
      {tab === "feedback" && <FeedbackTab />}
      {tab === "activity" && <ActivityTab />}
      {tab === "ops" && <OpsTab />}
      {tab === "alerts" && <AlertsTab />}
    </>
  );
}
