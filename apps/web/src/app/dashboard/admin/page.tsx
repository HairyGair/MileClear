"use client";

import { useEffect, useState, useCallback } from "react";
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

interface Analytics {
  totalUsers: number;
  activeUsers30d: number;
  premiumUsers: number;
  totalTrips: number;
  totalMiles: number;
  totalEarningsPence: number;
  usersThisMonth: number;
  tripsThisMonth: number;
}

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  createdAt: string;
  _count: {
    trips: number;
    vehicles: number;
    earnings: number;
  };
  diagnosticDump?: {
    verdict: string;
    capturedAt: string;
  } | null;
}

interface AdminUserDetail extends AdminUser {
  totalMiles: number;
  totalEarningsPence: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  appleId: string | null;
  googleId: string | null;
  premiumExpiresAt: string | null;
  vehicles: { id: string; make: string; model: string; fuelType: string; vehicleType: string }[];
  trips: {
    id: string;
    distanceMiles: number;
    classification: string;
    startedAt: string;
    platformTag: string | null;
  }[];
}

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

function OverviewTab() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ data: Analytics }>("/admin/analytics"),
      api.get<{ data: { total: number; byStatus: Record<string, number> } }>("/feedback/stats"),
    ])
      .then(([analyticsRes, fbRes]) => {
        setAnalytics(analyticsRes.data);
        setFeedbackStats(fbRes.data);
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

  // Push notification to specific user
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushSending, setPushSending] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !open) return;
    setLoading(true);
    setError(null);
    setUser(null);
    setDiag(null);
    setPushTitle("");
    setPushBody("");
    setPushResult(null);
    Promise.all([
      api.get<{ data: AdminUserDetail }>(`/admin/users/${userId}`),
      api.get<{ data: DiagnosticDump | null }>(`/admin/users/${userId}/diagnostics`).catch(() => ({ data: null })),
    ])
      .then(([userRes, diagRes]) => {
        setUser(userRes.data);
        setDiag(diagRes.data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId, open]);

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
            <h4 className="settings-section__title">Drive Detection</h4>
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
                  {diag.eventsJson.length > 0 && (
                    <div>
                      <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 0.375rem" }}>
                        Recent events ({diag.eventsJson.length})
                      </p>
                      <div style={{ maxHeight: "200px", overflow: "auto", fontSize: "0.75rem", lineHeight: 1.6, color: "var(--text-tertiary)" }}>
                        {diag.eventsJson.slice(0, 20).map((ev, i) => (
                          <div key={i}>
                            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{ev.event}</span>
                            {ev.data && <span> {ev.data}</span>}
                            <span style={{ marginLeft: "0.5rem", opacity: 0.6 }}>
                              {new Date(ev.recorded_at).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                        {diag.eventsJson.length > 20 && (
                          <div style={{ opacity: 0.5 }}>+ {diag.eventsJson.length - 20} more</div>
                        )}
                      </div>
                    </div>
                  )}
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

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
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
  }, [page, search]);

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
      {/* Search */}
      <div style={{ marginBottom: "1rem", maxWidth: 400 }}>
        <Input
          id="user-search"
          placeholder="Search by email or name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search users"
        />
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
                  <th>Trips</th>
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
                    <td style={{ fontSize: "0.875rem" }}>{user._count.trips}</td>
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

function HealthTab() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: HealthData }>("/admin/health");
      setHealth(res.data);
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

function AutoTripsTab() {
  const [data, setData] = useState<AutoTripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: AutoTripData }>("/admin/auto-trip-health")
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

function PushTab() {
  const [audience, setAudience] = useState<"all" | "premium" | "inactive" | "specific">("all");
  const [userId, setUserId] = useState("");
  const [inactiveDays, setInactiveDays] = useState("14");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; totalTargeted: number; dryRun: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const send = async (dryRun: boolean) => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ data: typeof result }>("/admin/send-push", {
        audience,
        userId: audience === "specific" ? userId : undefined,
        inactiveDays: audience === "inactive" ? parseInt(inactiveDays) || 14 : undefined,
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
              {(["all", "premium", "inactive", "specific"] as const).map((a) => (
                <button
                  key={a}
                  className={`filter-chip ${audience === a ? "filter-chip--active" : ""}`}
                  onClick={() => setAudience(a)}
                >
                  {a === "all" ? "All Users" : a === "premium" ? "Premium Only" : a === "inactive" ? "Inactive" : "Specific User"}
                </button>
              ))}
            </div>
          </div>

          {audience === "specific" && (
            <Input id="push-user-id" label="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Enter user ID..." />
          )}
          {audience === "inactive" && (
            <Input id="push-inactive-days" label="Inactive for (days)" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} type="number" />
          )}

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
        message={`This will send a push notification to ${audience === "specific" ? "1 user" : audience === "all" ? "ALL users" : `${audience} users`}. Are you sure?`}
        confirmLabel="Send Now"
        loading={sending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email Campaigns Tab
// ---------------------------------------------------------------------------

function EmailTab() {
  const [sending, setSending] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: string; sent: number; errors: number; dryRun: boolean; totalUsers: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [onlyInactive, setOnlyInactive] = useState(false);

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

  const campaigns = [
    { id: "re-engagement", title: "Re-engagement", desc: "Personalised email to bring users back, with their trip stats." },
    { id: "update", title: "Product Update", desc: "Send the latest changelog/update email to all users." },
    { id: "service-status", title: "Service Status", desc: "Quick 'we're back up' or status notification to all users." },
  ];

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

      {campaigns.map((c) => (
        <Card key={c.id} title={c.title}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>{c.desc}</p>
          {c.id === "re-engagement" && (
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", marginBottom: "1rem", cursor: "pointer" }}>
              <input type="checkbox" checked={onlyInactive} onChange={(e) => setOnlyInactive(e.target.checked)} />
              Only users with 0 trips
            </label>
          )}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Button variant="secondary" size="sm" onClick={() => sendEmail(c.id, true)} disabled={sending === c.id}>
              {sending === c.id ? "..." : "Dry Run"}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowConfirm(c.id)} disabled={sending === c.id}>
              Send
            </Button>
          </div>
        </Card>
      ))}

      <ConfirmModal
        open={!!showConfirm}
        onClose={() => setShowConfirm(null)}
        onConfirm={() => showConfirm && sendEmail(showConfirm, false)}
        title="Send Email Campaign"
        message="This will send emails to users. Brevo's free tier has a 300/day limit. Are you sure?"
        confirmLabel="Send Now"
        loading={!!sending}
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

type Tab = "overview" | "activity" | "users" | "health" | "revenue" | "engagement" | "auto-trips" | "push" | "email" | "feedback";

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
      <PageHeader
        title="Admin"
        subtitle="Platform management and analytics"
      />

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
    </>
  );
}
