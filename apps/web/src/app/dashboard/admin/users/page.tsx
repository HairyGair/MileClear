"use client";

// Users (Oct 2026 rebuild). Every account, searchable and filterable, with
// the full detail modal one click away. The admin top bar's "find a user"
// box lands here as ?q=, and ?user=<id> opens that account's detail straight
// away (the Support and Android pages link here that way).

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fetchWithAuth } from "@/lib/api";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Ago } from "@/components/admin/Ago";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import {
  downloadTextFile,
  EMPTY_USERS_FILTERS,
  platformLabel,
  usersFilterParams,
  type AdminUser,
  type Analytics,
  type UsersFilters,
  type UsersResponse,
  type UsersSortBy,
} from "@/components/admin/legacy";
import {
  AdminIcon,
  Badge,
  DataTable,
  FilterBar,
  FilterChip,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Pager,
  Panel,
  SearchField,
  SelectField,
  formatNumber,
  formatShare,
  useAdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";
import "@/components/admin/drivers/drivers.css";

const SORT_OPTIONS = [
  { value: "createdAt", label: "Newest sign-ups first" },
  { value: "lastTripAt", label: "Most recent trip first" },
  { value: "lastLoginAt", label: "Most recent login first" },
];

const PLAN_OPTIONS = [
  { value: "", label: "Plan: all" },
  { value: "free", label: "Free" },
  { value: "paying", label: "Paying (Stripe and Apple, not test)" },
  { value: "premium", label: "Any Pro flag" },
  { value: "comp", label: "Comp (given by an admin)" },
  { value: "trial", label: "Used their trial" },
  { value: "referral", label: "Referral Pro" },
];

const PROVIDER_OPTIONS = [
  { value: "", label: "Sign-in: all" },
  { value: "email", label: "Email" },
  { value: "apple", label: "Apple" },
  { value: "google", label: "Google" },
];

const LIFECYCLE_OPTIONS = [
  { value: "", label: "Activity: all" },
  { value: "active", label: "Active (trip in 14 days)" },
  { value: "dormant14", label: "Quiet 14 days or more" },
  { value: "dormant90", label: "Quiet 90 days or more" },
  { value: "dormant2y", label: "Quiet 2 years or more (retention review)" },
  { value: "never", label: "Never recorded a trip" },
];

const HEALTH_OPTIONS = [
  { value: "", label: "Health: all" },
  { value: "good", label: "Good" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
  { value: "unknown", label: "Unknown" },
];

const HEALTH_TONE: Record<string, Tone> = { good: "good", warning: "warn", critical: "bad", unknown: "neutral" };

// ---------------------------------------------------------------------------
// Headline numbers (from the analytics endpoint the Overview also reads)
// ---------------------------------------------------------------------------

function UserKpis({ matching, matchingLoading, matchingError, filtered }: { matching: number | null; matchingLoading: boolean; matchingError: string | null; filtered: boolean }) {
  const { data: a, loading, error } = useAdminData<Analytics>("/admin/analytics");
  return (
    <Grid min={170}>
      <KpiCard
        label={filtered ? "Matching this search" : "Accounts listed"}
        value={matching ?? 0}
        tone="accent"
        loading={matchingLoading && matching === null}
        error={matchingError}
        hint={filtered ? "With the search and filters below" : "Every account, no filters"}
      />
      <KpiCard label="Total users" value={a?.totalUsers ?? 0} loading={loading && !a} error={error} />
      <KpiCard label="Joined this month" value={a?.usersThisMonth ?? 0} loading={loading && !a} error={error} />
      <KpiCard
        label="Active drivers, 30 days"
        value={a?.activeUsers30d ?? 0}
        tone="good"
        loading={loading && !a}
        error={error}
        hint={a ? `${formatShare(a.activeUsers30d, a.totalUsers)} of all users logged a trip` : undefined}
      />
    </Grid>
  );
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

function UsersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams?.get("q") ?? "";
  const urlUser = searchParams?.get("user") ?? null;

  // Search. A new ?q= replaces whatever is typed (so searching again from the
  // top bar works while already on this page).
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [search, setSearch] = useState(urlQuery);
  useEffect(() => {
    setSearchInput(urlQuery);
    setSearch(urlQuery);
  }, [urlQuery]);

  // Debounce typing.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [sortBy, setSortBy] = useState<UsersSortBy>("createdAt");
  const [filters, setFilters] = useState<UsersFilters>(EMPTY_USERS_FILTERS);
  const filtersActive = Boolean(
    filters.plan || filters.provider || filters.lifecycle || filters.healthBand || filters.unreachable || filters.syncBroken || filters.marketingOff
  );
  const [page, setPage] = useState(1);

  // Back to page 1 whenever the search, sort or filters change.
  useEffect(() => {
    setPage(1);
  }, [search, sortBy, filters]);

  const listPath = useMemo(() => {
    const params = usersFilterParams(filters);
    params.set("page", String(page));
    params.set("pageSize", "20");
    params.set("sortBy", sortBy);
    if (search.trim()) params.set("q", search.trim());
    return `/admin/users?${params}`;
  }, [filters, page, sortBy, search]);

  const list = useAdminData<UsersResponse>(listPath, { unwrap: false });

  // Detail modal. ?user=<id> opens it on arrival.
  const [viewUserId, setViewUserId] = useState<string | null>(urlUser);
  useEffect(() => {
    if (urlUser) setViewUserId(urlUser);
  }, [urlUser]);
  const closeDetail = () => {
    setViewUserId(null);
    if (urlUser) {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      next.delete("user");
      const qs = next.toString();
      router.replace(`/dashboard/admin/users${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  };

  // CSV export
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const handleExportCsv = async () => {
    setExporting(true);
    setActionError(null);
    try {
      const params = usersFilterParams(filters);
      if (search.trim()) params.set("q", search.trim());
      const res = await fetchWithAuth(`/admin/users/export?${params}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const csv = await res.text();
      downloadTextFile(`mileclear-users-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Grant / remove Pro, with a confirmation.
  const [toggleTarget, setToggleTarget] = useState<AdminUser | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const handleTogglePremium = async () => {
    if (!toggleTarget) return;
    setToggleLoading(true);
    setActionError(null);
    try {
      await api.patch(`/admin/users/${toggleTarget.id}/premium`, { isPremium: !toggleTarget.isPremium });
      setToggleTarget(null);
      list.reload();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Couldn't change Pro");
    } finally {
      setToggleLoading(false);
    }
  };

  const setFilter = <K extends keyof UsersFilters>(key: K, value: UsersFilters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  const columns: TableColumn<AdminUser>[] = [
    {
      key: "email",
      header: "Account",
      render: (u) => {
        const dump = u.diagnosticDump && u.diagnosticDump.verdict !== "healthy" ? u.diagnosticDump : null;
        return (
          <span className="adm-drv-nowrap">
            <span className="adm-drv-strong">{u.email}</span>
            <span className="adm-cell-sub">
              {u.displayName || "No name"}
              {dump && (
                <>
                  {" · "}
                  <span
                    className={dump.verdict === "error" ? "adm-drv-tone-bad" : dump.verdict === "warning" ? "adm-drv-tone-warn" : ""}
                    title={`Last diagnostic: ${dump.verdict} (${new Date(dump.capturedAt).toLocaleString("en-GB")})`}
                  >
                    Diagnostic {dump.verdict}
                  </span>
                </>
              )}
            </span>
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Plan",
      render: (u) => (
        <span className="adm-drv-row" style={{ gap: 4, flexWrap: "nowrap" }}>
          {u.isPremium && <Badge tone="accent">Pro</Badge>}
          {u.proSource === "comp" && <Badge title="Given by an admin. No subscription, not counted in revenue.">Comp</Badge>}
          {u.proSource === "sandbox" && <Badge tone="warn" title="App Store sandbox subscription (TestFlight or App Review). Not revenue.">Sandbox</Badge>}
          {u.proSource === "referral" && <Badge title="Pro from referral credit. Not a paying subscriber.">Referral Pro</Badge>}
          {u.isAdmin && <Badge tone="info">Admin</Badge>}
          {!u.isPremium && !u.isAdmin && u.proSource !== "referral" && <Badge>Free</Badge>}
          {u.unreachable && <Badge tone="bad" title="Hidden Apple email and no push token: no way to contact them">Unreachable</Badge>}
        </span>
      ),
    },
    {
      key: "platform",
      header: "Phone",
      hideOnMobile: true,
      render: (u) => (
        <span title={u.signupLocation ? `Signed up on ${u.signupPlatform ?? "?"} from ${u.signupLocation}` : undefined}>{platformLabel(u.platforms)}</span>
      ),
    },
    {
      key: "health",
      header: "Health",
      hideOnMobile: true,
      title: "Health score out of 100, from the phone's last check-in: background location, tracking, sync queue and recent driving",
      render: (u) =>
        u.healthScore !== undefined && u.healthBand && u.healthBand !== "unknown" ? (
          <Badge tone={HEALTH_TONE[u.healthBand]} dot title={`${u.healthBand} (${u.healthScore}/100)`}>
            {u.healthScore}
          </Badge>
        ) : (
          <span className="adm-drv-tone-muted">-</span>
        ),
    },
    { key: "trips", header: "Trips", numeric: true, render: (u) => formatNumber(u._count.trips) },
    { key: "lastTrip", header: "Last trip", hideOnMobile: true, render: (u) => <Ago iso={u.lastTripAt} className="adm-drv-nowrap" /> },
    { key: "lastLogin", header: "Last login", hideOnMobile: true, render: (u) => <Ago iso={u.lastLoginAt} className="adm-drv-nowrap" /> },
    {
      key: "joined",
      header: "Joined",
      hideOnMobile: true,
      render: (u) => (
        <span className="adm-drv-nowrap">{new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}</span>
      ),
    },
    {
      key: "actions",
      header: <span className="adm-sr">Actions</span>,
      align: "right",
      render: (u) => (
        // Buttons stop the click reaching the row, which opens the detail.
        <span className="adm-drv-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="adm-btn adm-btn--sm"
            onClick={() => setToggleTarget(u)}
            aria-label={u.isPremium ? `Remove Pro from ${u.email}` : `Give Pro to ${u.email}`}
          >
            {u.isPremium ? "Remove Pro" : "Give Pro"}
          </button>
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => setViewUserId(u.id)} aria-label={`View details for ${u.email}`}>
            View
          </button>
        </span>
      ),
    },
  ];

  const total = list.data?.total ?? null;
  const filtered = Boolean(search.trim()) || filtersActive;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Every account, searchable and filterable. Open a row for everything about that driver: trips, phone health, billing and support history."
        actions={
          <button
            type="button"
            className="adm-btn"
            onClick={() => void handleExportCsv()}
            disabled={exporting}
            title="Download the current filtered list as CSV. Every export is logged."
          >
            <AdminIcon name="arrowDown" size={14} />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        }
      />

      <UserKpis matching={total} matchingLoading={list.loading} matchingError={list.error} filtered={filtered} />

      <Panel
        highlight
        title="Accounts"
        subtitle="Search by email or name, then narrow it down. The export uses the same search and filters."
        footer="Sorting applies to every account, not just this page. Hover a column heading or badge for what it means."
      >
        <div className="adm-drv-stack adm-drv-stack--sm" style={{ marginBottom: "var(--adm-s4)" }}>
          <FilterBar spaced={false}>
            <SearchField id="user-search" label="Search users" placeholder="Search by email or name..." value={searchInput} onChange={setSearchInput} />
            <SelectField id="user-sort" label="Sort users by" value={sortBy} onChange={(v) => setSortBy(v as UsersSortBy)} options={SORT_OPTIONS} minWidth={190} />
          </FilterBar>
          <FilterBar spaced={false}>
            <SelectField id="filter-plan" label="Filter by plan" value={filters.plan} onChange={(v) => setFilter("plan", v)} options={PLAN_OPTIONS} />
            <SelectField id="filter-provider" label="Filter by sign-in method" value={filters.provider} onChange={(v) => setFilter("provider", v)} options={PROVIDER_OPTIONS} />
            <SelectField id="filter-lifecycle" label="Filter by activity" value={filters.lifecycle} onChange={(v) => setFilter("lifecycle", v)} options={LIFECYCLE_OPTIONS} />
            <SelectField id="filter-health" label="Filter by health" value={filters.healthBand} onChange={(v) => setFilter("healthBand", v)} options={HEALTH_OPTIONS} />
          </FilterBar>
          <FilterBar spaced={false}>
            <FilterChip
              active={filters.unreachable}
              tone="bad"
              onClick={() => setFilter("unreachable", !filters.unreachable)}
              title="Hidden Apple email and no push token: no way to contact them"
            >
              Unreachable
            </FilterChip>
            <FilterChip
              active={filters.syncBroken}
              tone="warn"
              onClick={() => setFilter("syncBroken", !filters.syncBroken)}
              title="The phone's last check-in reported items that failed to sync for good"
            >
              Sync broken
            </FilterChip>
            <FilterChip active={filters.marketingOff} onClick={() => setFilter("marketingOff", !filters.marketingOff)} title="Opted out of marketing emails">
              Marketing off
            </FilterChip>
            {filtersActive && (
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => setFilters(EMPTY_USERS_FILTERS)}>
                Clear filters
              </button>
            )}
          </FilterBar>
        </div>

        {actionError && <p className="adm-drv-alert" role="alert">{actionError}</p>}

        <LoadState
          data={list.data}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          errorTitle="Couldn't load the user list."
          skeleton={<LoadingSkeleton variant="table" rows={8} />}
        >
          {(d) => (
            <div className={list.loading ? "adm-drv-dim" : undefined} aria-busy={list.loading || undefined}>
              {list.error && <p className="adm-drv-alert" role="alert">Couldn&apos;t refresh the list: {list.error}</p>}
              <DataTable
                caption="User accounts"
                columns={columns}
                rows={d.data}
                rowKey={(u) => u.id}
                onRowClick={(u) => setViewUserId(u.id)}
                emptyTitle={search.trim() ? `No users found for "${search.trim()}"` : "No users match these filters"}
                empty={filtersActive ? "Try clearing the filters." : undefined}
              />
              <Pager
                page={page}
                totalPages={d.totalPages}
                onChange={setPage}
                info={`${formatNumber(d.total)} account${d.total === 1 ? "" : "s"}${search.trim() ? ` matching "${search.trim()}"` : ""}`}
              />
            </div>
          )}
        </LoadState>
      </Panel>

      <UserDetailModal userId={viewUserId} open={!!viewUserId} onClose={closeDetail} />

      <ConfirmModal
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleTogglePremium}
        title={toggleTarget?.isPremium ? "Remove Pro" : "Give Pro"}
        message={
          toggleTarget?.isPremium
            ? `Remove Pro from ${toggleTarget?.email}? Their subscription data stays, but Pro features will be turned off.`
            : `Give Pro to ${toggleTarget?.email}? This turns on every Pro feature without a subscription.`
        }
        confirmLabel={toggleTarget?.isPremium ? "Remove Pro" : "Give Pro"}
        loading={toggleLoading}
      />
    </>
  );
}

export default function AdminUsersPage() {
  return (
    // useSearchParams needs a Suspense boundary for the static build.
    <Suspense fallback={<LoadingSkeleton variant="table" rows={8} />}>
      <UsersView />
    </Suspense>
  );
}
