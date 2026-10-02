"use client";

// Insights > Top drivers: three ranked lists for outreach, testimonials and
// case studies. Click a driver to open their account.

import { useState } from "react";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import {
  DataTable,
  LoadState,
  LoadingSkeleton,
  Panel,
  TabBar,
  formatNumber,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import type { TopUsersData } from "./types";

type View = "miles" | "tenure" | "engagement";

interface RankRow {
  id: string;
  rank: number;
  label: string;
  value: number;
  valueText: string;
  sub?: string;
}

const SUBTITLES: Record<View, string> = {
  miles: "Most miles logged, all time.",
  tenure: "Drivers on Pro now, oldest account first.",
  engagement: "Most trips started in the last 30 days.",
};

const VALUE_HEADERS: Record<View, string> = { miles: "Miles", tenure: "Account age", engagement: "Trips, 30 days" };

function rows(d: TopUsersData, view: View): RankRow[] {
  if (view === "miles")
    return d.byMiles.map((u, i) => ({
      id: u.id,
      rank: i + 1,
      label: u.label,
      value: u.totalMiles,
      valueText: `${formatNumber(u.totalMiles)} mi`,
      sub: `${formatNumber(u.tripCount)} trips`,
    }));
  if (view === "tenure")
    return d.byProTenure.map((u, i) => ({
      id: u.id,
      rank: i + 1,
      label: u.label,
      value: u.accountAgeDays,
      valueText: `${formatNumber(u.accountAgeDays)} days`,
      sub: u.premiumExpiresAt
        ? `Pro until ${new Date(u.premiumExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
        : "No Pro end date",
    }));
  return d.byEngagement.map((u, i) => ({
    id: u.id,
    rank: i + 1,
    label: u.label,
    value: u.tripsLast30d,
    valueText: `${formatNumber(u.tripsLast30d)} trips`,
  }));
}

export function TopUsersTab() {
  const { data, error, loading, reload } = useAdminData<TopUsersData>("/admin/top-users");
  const [view, setView] = useState<View>("miles");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const columns: TableColumn<RankRow>[] = [
    { key: "rank", header: "#", width: 40, render: (r) => <span style={{ color: "var(--adm-text-3)" }}>{r.rank}</span> },
    { key: "label", header: "Driver", render: (r) => <span style={{ color: "var(--adm-text-strong)" }}>{r.label}</span> },
    {
      key: "value",
      header: VALUE_HEADERS[view],
      numeric: true,
      render: (r) => (
        <>
          <span style={{ color: "var(--adm-accent)", fontWeight: 600 }}>{r.valueText}</span>
          {r.sub && <span className="adm-cell-sub">{r.sub}</span>}
        </>
      ),
    },
  ];

  return (
    <Panel
      highlight
      title="Top drivers"
      subtitle={`${SUBTITLES[view]} For outreach, testimonials and case studies. Click a driver to open their account.`}
      footer={
        view === "tenure"
          ? "There is no Pro start date on the account, so this list uses account age as a stand-in for how long someone has been on Pro. It includes every Pro account (paid, comp, referral and test)."
          : "Top 20 in each list."
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s3)", minWidth: 0 }}>
        <TabBar
          label="Rank drivers by"
          size="sm"
          value={view}
          onChange={(v) => setView(v as View)}
          tabs={[
            { id: "miles", label: "By miles" },
            { id: "tenure", label: "By account age (Pro)" },
            { id: "engagement", label: "By trips, 30 days" },
          ]}
        />
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load the top drivers."
          skeleton={<LoadingSkeleton variant="table" rows={10} />}
        >
          {(d) => (
            <DataTable
              dense
              caption={`Top drivers, ${SUBTITLES[view]}`}
              columns={columns}
              rows={rows(d, view)}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDetailUserId(r.id)}
              emptyTitle="Nobody in this list yet"
            />
          )}
        </LoadState>
      </div>
      <UserDetailModal userId={detailUserId} open={!!detailUserId} onClose={() => setDetailUserId(null)} />
    </Panel>
  );
}
