"use client";

// Engagement: how many drivers use MileClear day to day, and how many of each
// month's sign-ups are still logging trips. Reads /admin/engagement (no date
// range: the endpoint returns fixed windows).

import { useState } from "react";
import Link from "next/link";
import { Ago } from "@/components/admin/Ago";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import type { EngagementWithActive, RecentlyActiveUser } from "@/components/admin/growth/types";
import {
  AdminIcon,
  Badge,
  BarChart,
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  formatMonth,
  formatNumber,
  formatShare,
  useAdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";

const A = "/dashboard/admin";

type RetentionRow = EngagementWithActive["retentionCurve"][number];

function retentionTone(pct: number): Tone {
  if (pct >= 50) return "good";
  if (pct >= 25) return "warn";
  return "bad";
}

const retentionColumns: TableColumn<RetentionRow>[] = [
  { key: "month", header: "Sign-up month", sortValue: (r) => r.month, render: (r) => formatMonth(r.month, { month: "long", year: "numeric" }) },
  { key: "signups", header: "Sign-ups", numeric: true, sortValue: (r) => r.signups, render: (r) => formatNumber(r.signups) },
  { key: "retained", header: "Active in last 30 days", numeric: true, sortValue: (r) => r.retainedCount, render: (r) => formatNumber(r.retainedCount) },
  {
    key: "pct",
    header: "Still active",
    numeric: true,
    title: "50% or more is healthy, under 25% needs a look",
    sortValue: (r) => r.retentionPercent,
    render: (r) => <Badge tone={retentionTone(r.retentionPercent)}>{r.retentionPercent}%</Badge>,
  },
];

const activeColumns: TableColumn<RecentlyActiveUser>[] = [
  {
    key: "user",
    header: "Driver",
    sortValue: (u) => u.displayName || u.email,
    render: (u) => (
      <>
        <span style={{ color: "var(--adm-text-strong)" }}>{u.displayName || u.email}</span>
        {u.displayName && <span className="adm-cell-sub">{u.email}</span>}
      </>
    ),
  },
  { key: "trips", header: "Trips", numeric: true, sortValue: (u) => u.tripCount, render: (u) => formatNumber(u.tripCount) },
  {
    key: "last",
    header: "Last trip",
    sortValue: (u) => u.lastTripAt,
    render: (u) => (
      <span style={{ whiteSpace: "nowrap" }}>
        {new Date(u.lastTripAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        <span className="adm-cell-sub"><Ago iso={u.lastTripAt} /></span>
      </span>
    ),
  },
];

export default function AdminEngagementPage() {
  const { data, error, loading, reload } = useAdminData<EngagementWithActive>("/admin/engagement");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const kpiLoading = loading && !data;

  return (
    <>
      <PageHeader
        title="Engagement"
        subtitle="How many drivers are logging trips, and how many of each month's sign-ups are still logging trips now."
        actions={
          <>
            <Link href={`${A}/funnel`} className="adm-btn adm-btn--sm">Funnel</Link>
            <Link href={`${A}/geographic-density`} className="adm-btn adm-btn--sm">Density map</Link>
            <Link href={`${A}/insights`} className="adm-btn adm-btn--sm">Insights</Link>
          </>
        }
      />

      <Grid min={160}>
        <KpiCard label="Active, last 24 hours" value={data?.dau ?? 0} tone="good" loading={kpiLoading} error={error} hint="Started a trip in the last 24 hours" title="Daily active users" />
        <KpiCard label="Active, last 7 days" value={data?.wau ?? 0} loading={kpiLoading} error={error} hint="Started a trip in the last 7 days" title="Weekly active users" />
        <KpiCard label="Active, last 30 days" value={data?.mau ?? 0} tone="accent" loading={kpiLoading} error={error} hint="Started a trip in the last 30 days" title="Monthly active users" />
        <KpiCard
          label="Never logged a trip"
          value={data?.usersWithZeroTrips ?? 0}
          tone={data && data.usersWithZeroTrips > 0 ? "bad" : "neutral"}
          loading={kpiLoading}
          error={error}
          hint={data ? `${formatShare(data.usersWithZeroTrips, data.totalUsers)} of ${formatNumber(data.totalUsers)} users` : undefined}
        />
      </Grid>

      <div className="adm-split">
        <Panel
          highlight
          title="Still active, by sign-up month"
          subtitle="Share of each month's sign-ups who logged a trip in the last 30 days."
        >
          <LoadState
            data={data}
            loading={loading}
            error={error}
            onRetry={reload}
            errorTitle="Couldn't load retention by month."
            skeleton={<LoadingSkeleton variant="chart" height={220} />}
          >
            {(d) =>
              d.retentionCurve.length === 0 ? (
                <p className="adm-text">No sign-up months to show yet.</p>
              ) : (
                <BarChart
                  label="Percentage of each month's sign-ups active in the last 30 days"
                  formatValue={(n) => `${n}%`}
                  data={d.retentionCurve.map((r) => ({
                    label: formatMonth(r.month, { month: "short" }),
                    fullLabel: formatMonth(r.month, { month: "long", year: "numeric" }),
                    value: r.retentionPercent,
                  }))}
                />
              )
            }
          </LoadState>
        </Panel>

        <Panel title="Retention by sign-up month" flush footer="Last 6 months of sign-ups. Active means at least one trip (GPS or manual) started in the last 30 days.">
          <LoadState
            data={data}
            loading={loading}
            error={error}
            onRetry={reload}
            errorTitle="Couldn't load retention by month."
            skeleton={<LoadingSkeleton variant="table" rows={6} />}
          >
            {(d) => (
              <DataTable
                dense
                caption="Retention by sign-up month"
                columns={retentionColumns}
                rows={d.retentionCurve}
                rowKey={(r) => r.month}
                emptyTitle="No sign-up months yet"
              />
            )}
          </LoadState>
        </Panel>
      </div>

      <Panel
        title="Recently active drivers"
        subtitle="Most recent trip first. Click a driver to open their account."
        href={`${A}/users`}
        hrefLabel="All users"
        flush
      >
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load recently active drivers."
          skeleton={<LoadingSkeleton variant="table" rows={8} />}
        >
          {(d) => (
            <DataTable
              caption="Recently active drivers"
              columns={activeColumns}
              rows={d.recentlyActive ?? []}
              rowKey={(u) => u.userId}
              onRowClick={(u) => setDetailUserId(u.userId)}
              maxHeight={520}
              emptyTitle="Nobody has logged a trip recently"
            />
          )}
        </LoadState>
      </Panel>

      <p className="adm-note">
        <Link href={`${A}/activation`} className="adm-link-arrow">
          Who is running the app but recording nothing? Open Activation health <AdminIcon name="arrowRight" size={14} />
        </Link>
      </p>

      <UserDetailModal userId={detailUserId} open={!!detailUserId} onClose={() => setDetailUserId(null)} />
    </>
  );
}
