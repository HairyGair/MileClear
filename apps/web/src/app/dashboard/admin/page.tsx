"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
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
}

interface AdminUserDetail extends AdminUser {
  totalMiles: number;
  totalEarningsPence: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  appleId: string | null;
  googleId: string | null;
  vehicles: { id: string; make: string; model: string; year: number }[];
  recentTrips: {
    id: string;
    startAddress: string | null;
    endAddress: string | null;
    distanceMiles: number;
    classification: string;
    startedAt: string;
  }[];
}

interface UsersResponse {
  data: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: Analytics }>("/admin/analytics")
      .then((res) => setAnalytics(res.data))
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

  useEffect(() => {
    if (!userId || !open) return;
    setLoading(true);
    setError(null);
    setUser(null);
    api
      .get<{ data: AdminUserDetail }>(`/admin/users/${userId}`)
      .then((res) => setUser(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId, open]);

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
                      background: "var(--surface-2)",
                      borderRadius: 6,
                    }}
                  >
                    {v.year} {v.make} {v.model}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Trips */}
          {user.recentTrips.length > 0 && (
            <div className="settings-section">
              <h4 className="settings-section__title">Recent Trips</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Route</th>
                      <th>Distance</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.recentTrips.map((trip) => (
                      <tr key={trip.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                          {new Date(trip.startedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                          })}
                        </td>
                        <td
                          style={{
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "0.8125rem",
                          }}
                        >
                          {trip.startAddress || "Unknown"} → {trip.endAddress || "Unknown"}
                        </td>
                        <td style={{ fontSize: "0.8125rem" }}>
                          {trip.distanceMiles.toFixed(1)} mi
                        </td>
                        <td>
                          <Badge
                            variant={trip.classification === "business" ? "business" : "personal"}
                          >
                            {trip.classification}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                    <td style={{ fontSize: "0.875rem" }}>{user.email}</td>
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
                  background: "var(--border)",
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
// Main Page
// ---------------------------------------------------------------------------

type Tab = "overview" | "users" | "health";

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
      <div className="filter-chips" style={{ marginBottom: "1.25rem" }}>
        {(["overview", "users", "health"] as const).map((t) => (
          <button
            key={t}
            className={`filter-chip ${tab === t ? "filter-chip--active" : ""}`}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab />}
      {tab === "health" && <HealthTab />}
    </>
  );
}
