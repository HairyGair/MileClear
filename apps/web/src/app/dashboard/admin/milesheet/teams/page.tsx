"use client";

// Milesheet teams (4 Oct 2026). One row per team, searchable and sortable;
// a row opens the team page with its members, history and admin actions.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ago } from "@/components/admin/Ago";
import {
  DataTable,
  FilterBar,
  FilterChip,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  SearchField,
  formatNumber,
  formatPence,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import { BillingBadge, FlagBadges, MILESHEET_ROOT, SOURCE_LABEL, formatMiles, shortDate } from "@/components/admin/milesheet/labels";
import type { MilesheetTeams, TeamListRow } from "@/components/admin/milesheet/types";

type Filter = "all" | "flagged" | "pilot" | "paying" | "none";

export default function MilesheetTeamsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAdminData<MilesheetTeams>("/admin/milesheet/teams");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (filter === "flagged" && r.flags.length === 0) return false;
      if ((filter === "pilot" || filter === "paying" || filter === "none") && r.billing.status !== filter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.orgId.startsWith(q) ||
        r.managers.some((m) => m.email.toLowerCase().includes(q))
      );
    });
  }, [data, search, filter]);

  const cols: TableColumn<TeamListRow>[] = [
    {
      key: "name",
      header: "Team",
      render: (r) => (
        <>
          {r.name}
          <span className="adm-cell-sub">
            {SOURCE_LABEL[r.source]}, {shortDate(r.createdAt)}
          </span>
        </>
      ),
      sortValue: (r) => r.name.toLowerCase(),
    },
    {
      key: "managers",
      header: "Manager",
      render: (r) =>
        r.managers.length === 0 ? (
          <span style={{ color: "var(--adm-text-3)" }}>None</span>
        ) : (
          r.managers.map((m) => (
            <span key={m.email} style={{ display: "block" }}>
              {m.email}
              {m.status !== "active" && <span className="adm-cell-sub">invited, not accepted</span>}
            </span>
          ))
        ),
      sortValue: (r) => r.managers[0]?.email ?? "",
      hideOnMobile: true,
    },
    {
      key: "people",
      header: "Active / invited / off",
      title: "Active members, open invites, switched off",
      render: (r) => `${r.counts.active} / ${r.counts.invited} / ${r.counts.disabled}`,
      sortValue: (r) => r.counts.active,
      numeric: true,
    },
    { key: "lastTrip", header: "Last trip", render: (r) => <Ago iso={r.lastTripAt} />, sortValue: (r) => r.lastTripAt ?? "", hideOnMobile: true },
    {
      key: "month",
      header: "This month",
      title: "Drivers' business miles and the claim at each driver's rate, the same figure the manager sees",
      render: (r) => (
        <>
          {formatMiles(r.monthMiles)}
          <span className="adm-cell-sub">{formatPence(r.monthAmountPence)}</span>
        </>
      ),
      sortValue: (r) => r.monthMiles,
      numeric: true,
      hideOnMobile: true,
    },
    {
      key: "lastMonth",
      header: "Last month approved",
      render: (r) =>
        r.lastMonth.drivers === 0 ? (
          <span style={{ color: "var(--adm-text-3)" }}>No drivers</span>
        ) : (
          <>
            {r.lastMonth.approved} of {r.lastMonth.drivers}
            {r.lastMonth.queried > 0 && <span className="adm-cell-sub">{r.lastMonth.queried} queried</span>}
          </>
        ),
      sortValue: (r) => (r.lastMonth.drivers ? r.lastMonth.approved / r.lastMonth.drivers : -1),
      numeric: true,
      hideOnMobile: true,
    },
    {
      key: "billing",
      header: "Billing",
      render: (r) => (
        <>
          <BillingBadge status={r.billing.status} />
          <span className="adm-cell-sub">
            {r.billing.seatsBilled != null ? `${r.billing.seatsBilled} billed, ` : ""}
            {r.billing.occupied} of {r.billing.seatCap ?? "no limit"} places
          </span>
        </>
      ),
      sortValue: (r) => r.billing.status,
    },
    { key: "flags", header: "Flags", render: (r) => <FlagBadges flags={r.flags} />, sortValue: (r) => r.flags.length },
  ];

  return (
    <>
      <PageHeader title="Teams" subtitle="Every Milesheet team. Open one to see its people and fix things." updatedAt={data?.generatedAt} />
      <Panel
        highlight
        title={data ? `${formatNumber(rows.length)} of ${formatNumber(data.rows.length)} teams` : "Teams"}
        footer={data ? `"This month" is ${data.month} so far, drivers only (managers are not claimed for), worked out the same way as the manager's portal.` : undefined}
      >
        <div style={{ marginBottom: "var(--adm-s4)" }}>
          <FilterBar spaced={false}>
            <SearchField id="milesheet-team-search" value={search} onChange={setSearch} label="Search teams" placeholder="Team name or manager email" />
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
            <FilterChip active={filter === "flagged"} onClick={() => setFilter("flagged")} tone="warn">Flagged</FilterChip>
            <FilterChip active={filter === "pilot"} onClick={() => setFilter("pilot")}>Free pilot</FilterChip>
            <FilterChip active={filter === "paying"} onClick={() => setFilter("paying")} tone="good">Paying</FilterChip>
            <FilterChip active={filter === "none"} onClick={() => setFilter("none")}>Not paying</FilterChip>
          </FilterBar>
        </div>
        <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the teams." skeleton={<LoadingSkeleton variant="table" rows={8} />}>
          {() => (
            <DataTable
              caption="Milesheet teams"
              columns={cols}
              rows={rows}
              rowKey={(r) => r.orgId}
              onRowClick={(r) => router.push(`${MILESHEET_ROOT}/${r.orgId}`)}
              initialSort={{ key: "name", dir: "asc" }}
              rowTone={(r) => (r.flags.includes("no_active_manager") ? "bad" : r.flags.length ? "warn" : undefined)}
              maxHeight={720}
              emptyTitle={data?.rows.length ? "No team matches" : "No teams yet"}
            />
          )}
        </LoadState>
      </Panel>
    </>
  );
}
