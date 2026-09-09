"use client";

// Users section of the admin area (Sep 2026 redesign).

import { useCallback, useEffect, useState } from "react";
import { api, fetchWithAuth } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { AdminPage } from "@/components/admin";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import { AdminUser, downloadTextFile, EMPTY_USERS_FILTERS, platformLabel, timeAgo, usersFilterParams, UsersFilters, UsersResponse, UsersSortBy } from "@/components/admin/legacy";


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

  // Segment filters
  const [filters, setFilters] = useState<UsersFilters>(EMPTY_USERS_FILTERS);
  const filtersActive =
    filters.plan || filters.provider || filters.lifecycle || filters.healthBand ||
    filters.unreachable || filters.syncBroken || filters.marketingOff;

  // CSV export
  const [exporting, setExporting] = useState(false);

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

  // Reset to page 1 when search, sort or filters change
  useEffect(() => {
    setPage(1);
  }, [search, sortBy, filters]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = usersFilterParams(filters);
      params.set("page", String(page));
      params.set("pageSize", "20");
      params.set("sortBy", sortBy);
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
  }, [page, search, sortBy, filters]);

  const handleExportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const params = usersFilterParams(filters);
      if (search.trim()) params.set("q", search.trim());
      const res = await fetchWithAuth(`/admin/users/export?${params}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const csv = await res.text();
      downloadTextFile(`mileclear-users-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

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
      {/* Search + Sort + Export */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
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
        <Button
          variant="secondary"
          onClick={handleExportCsv}
          disabled={exporting}
          aria-label="Export the filtered user list as CSV"
          title="Download the current filtered list as CSV (export is audit-logged)"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      {/* Segment filters */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <Select
          id="filter-plan"
          value={filters.plan}
          onChange={(e) => setFilters((f) => ({ ...f, plan: e.target.value }))}
          aria-label="Filter by plan"
          options={[
            { value: "", label: "Plan: all" },
            { value: "free", label: "Free" },
            { value: "paying", label: "Paying (Stripe + Apple production)" },
            { value: "premium", label: "Any Pro flag" },
            { value: "comp", label: "Comp (admin-granted)" },
            { value: "trial", label: "Trial used" },
            { value: "referral", label: "Referral Pro" },
          ]}
        />
        <Select
          id="filter-provider"
          value={filters.provider}
          onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value }))}
          aria-label="Filter by sign-in provider"
          options={[
            { value: "", label: "Sign-in: all" },
            { value: "email", label: "Email" },
            { value: "apple", label: "Apple" },
            { value: "google", label: "Google" },
          ]}
        />
        <Select
          id="filter-lifecycle"
          value={filters.lifecycle}
          onChange={(e) => setFilters((f) => ({ ...f, lifecycle: e.target.value }))}
          aria-label="Filter by lifecycle"
          options={[
            { value: "", label: "Lifecycle: all" },
            { value: "active", label: "Active (trip <14d)" },
            { value: "dormant14", label: "Dormant 14d+" },
            { value: "dormant90", label: "Dormant 90d+" },
            { value: "dormant2y", label: "Dormant 2y+ (retention review)" },
            { value: "never", label: "Never tripped" },
          ]}
        />
        <Select
          id="filter-health"
          value={filters.healthBand}
          onChange={(e) => setFilters((f) => ({ ...f, healthBand: e.target.value }))}
          aria-label="Filter by health band"
          options={[
            { value: "", label: "Health: all" },
            { value: "good", label: "Good" },
            { value: "warning", label: "Warning" },
            { value: "critical", label: "Critical" },
            { value: "unknown", label: "Unknown" },
          ]}
        />
        <button
          type="button"
          className={`filter-chip ${filters.unreachable ? "filter-chip--active" : ""}`}
          onClick={() => setFilters((f) => ({ ...f, unreachable: !f.unreachable }))}
          title="Placeholder Apple Sign-In email and no push token - no channel can reach these users"
        >
          Unreachable
        </button>
        <button
          type="button"
          className={`filter-chip ${filters.syncBroken ? "filter-chip--active" : ""}`}
          onClick={() => setFilters((f) => ({ ...f, syncBroken: !f.syncBroken }))}
          title="Users whose last heartbeat reported permanently-failed sync queue items"
        >
          Sync broken
        </button>
        <button
          type="button"
          className={`filter-chip ${filters.marketingOff ? "filter-chip--active" : ""}`}
          onClick={() => setFilters((f) => ({ ...f, marketingOff: !f.marketingOff }))}
          title="Users who opted out of marketing emails"
        >
          Marketing off
        </button>
        {filtersActive && (
          <button
            type="button"
            className="filter-chip"
            onClick={() => setFilters(EMPTY_USERS_FILTERS)}
          >
            Clear filters
          </button>
        )}
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
                  <th>Platform</th>
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
                      {user.displayName || "-"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                        {user.isPremium && <Badge variant="pro">PRO</Badge>}
                        {user.proSource === "comp" && (
                          <span title="Admin-granted Pro - no subscription, not counted in revenue"><Badge variant="source">Comp</Badge></span>
                        )}
                        {user.proSource === "sandbox" && (
                          <span title="App Store sandbox subscription (TestFlight / App Review) - not revenue"><Badge variant="warning">Sandbox</Badge></span>
                        )}
                        {user.proSource === "referral" && (
                          <span title="Pro via referral credit - not a paying subscriber"><Badge variant="source">Referral Pro</Badge></span>
                        )}
                        {user.isAdmin && <Badge variant="primary">Admin</Badge>}
                        {!user.isPremium && !user.isAdmin && user.proSource !== "referral" && (
                          <Badge variant="source">Free</Badge>
                        )}
                        {user.unreachable && (
                          <span title="Placeholder Apple email + no push token - cannot be contacted by any channel">
                            <Badge variant="danger">Unreachable</Badge>
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }} title={user.signupLocation ? `Signed up on ${user.signupPlatform ?? "?"} from ${user.signupLocation}` : undefined}>
                      {platformLabel(user.platforms)}
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
                          {user.healthBand === "unknown" ? "-" : user.healthScore}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={{ fontSize: "0.875rem" }}>{user._count.trips}</td>
                    <td
                      style={{ fontSize: "0.8125rem", whiteSpace: "nowrap", color: "var(--text-secondary)" }}
                      title={user.lastTripAt ? new Date(user.lastTripAt).toLocaleString() : ""}
                    >
                      {user.lastTripAt ? timeAgo(user.lastTripAt) : "-"}
                    </td>
                    <td
                      style={{ fontSize: "0.8125rem", whiteSpace: "nowrap", color: "var(--text-secondary)" }}
                      title={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : ""}
                    >
                      {user.lastLoginAt ? timeAgo(user.lastLoginAt) : "-"}
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


export default function AdminUsersTabPage() {
  return (
    <AdminPage title="Users" intro="Every account, searchable and filterable. Open a row for the full detail modal.">
      <UsersTab />
    </AdminPage>
  );
}
