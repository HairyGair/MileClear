"use client";

// Insights > Live now: trips and shifts still recording. Refreshes every 30
// seconds while the tab is open, so a stuck recording shows up in real time.

import { useEffect } from "react";
import {
  AdminIcon,
  Badge,
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  Panel,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import { STACK, formatMinutes } from "./format";
import type { ActiveRecordings, ActiveShift, ActiveTrip } from "./types";

const TRIP_STUCK_MINUTES = 240;
const SHIFT_STUCK_MINUTES = 720;

const tripColumns: TableColumn<ActiveTrip>[] = [
  {
    key: "user",
    header: "Driver",
    sortValue: (t) => t.userLabel,
    render: (t) => (
      <>
        <span style={{ color: "var(--adm-text-strong)" }}>{t.userLabel}</span>
        {t.startAddress && <span className="adm-cell-sub">from {t.startAddress}</span>}
      </>
    ),
  },
  {
    key: "elapsed",
    header: "Recording for",
    sortValue: (t) => t.minutesElapsed,
    render: (t) => (
      <span style={{ display: "inline-flex", gap: "var(--adm-s2)", alignItems: "center", flexWrap: "wrap" }}>
        {formatMinutes(t.minutesElapsed)}
        {t.minutesElapsed > TRIP_STUCK_MINUTES && <Badge tone="warn" dot>Over 4 hours, possibly stuck</Badge>}
      </span>
    ),
  },
  { key: "miles", header: "Miles", numeric: true, sortValue: (t) => t.distanceMiles, render: (t) => t.distanceMiles.toFixed(1) },
  { key: "platform", header: "Platform", sortValue: (t) => t.platformTag, render: (t) => t.platformTag ?? <span style={{ color: "var(--adm-text-3)" }}>-</span>, hideOnMobile: true },
];

const shiftColumns: TableColumn<ActiveShift>[] = [
  { key: "user", header: "Driver", sortValue: (s) => s.userLabel, render: (s) => <span style={{ color: "var(--adm-text-strong)" }}>{s.userLabel}</span> },
  {
    key: "elapsed",
    header: "Open for",
    sortValue: (s) => s.minutesElapsed,
    render: (s) => (
      <span style={{ display: "inline-flex", gap: "var(--adm-s2)", alignItems: "center", flexWrap: "wrap" }}>
        {formatMinutes(s.minutesElapsed)}
        {s.minutesElapsed > SHIFT_STUCK_MINUTES && <Badge tone="warn" dot>Over 12 hours, possibly stuck</Badge>}
      </span>
    ),
  },
];

export function ActiveRecordingsTab() {
  const { data, error, loading, reload } = useAdminData<ActiveRecordings>("/admin/active-recordings");

  useEffect(() => {
    const i = setInterval(reload, 30000);
    return () => clearInterval(i);
  }, [reload]);

  const stuckTrips = data ? data.activeTrips.filter((t) => t.minutesElapsed > TRIP_STUCK_MINUTES).length : 0;
  const stuckShifts = data ? data.activeShifts.filter((s) => s.minutesElapsed > SHIFT_STUCK_MINUTES).length : 0;
  const kpiLoading = loading && !data;

  const refresh = (
    <button type="button" className="adm-btn adm-btn--sm" onClick={reload} disabled={loading}>
      <AdminIcon name="refresh" size={14} /> {loading && data ? "Refreshing" : "Refresh"}
    </button>
  );

  return (
    <div style={STACK}>
      <Grid min={160}>
        <KpiCard label="Trips recording" value={data?.activeTrips.length ?? 0} tone="good" loading={kpiLoading} error={error} />
        <KpiCard label="Shifts open" value={data?.activeShifts.length ?? 0} loading={kpiLoading} error={error} />
        <KpiCard
          label="Possibly stuck"
          value={stuckTrips + stuckShifts}
          tone={stuckTrips + stuckShifts > 0 ? "warn" : "neutral"}
          loading={kpiLoading}
          error={error}
          hint="Trips over 4 hours, shifts over 12 hours"
        />
      </Grid>

      <Panel
        highlight
        title="Trips in progress"
        subtitle="Trips started in the last 24 hours that have not ended yet. Refreshes every 30 seconds while this tab is open."
        actions={refresh}
        flush
      >
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load the live recordings."
          skeleton={<LoadingSkeleton variant="table" rows={4} />}
        >
          {(d) => (
            <DataTable
              caption="Trips in progress"
              columns={tripColumns}
              rows={d.activeTrips}
              rowKey={(t) => t.id}
              rowTone={(t) => (t.minutesElapsed > TRIP_STUCK_MINUTES ? "warn" : undefined)}
              initialSort={{ key: "elapsed", dir: "desc" }}
              emptyTitle="No trips recording right now"
            />
          )}
        </LoadState>
      </Panel>

      <Panel title="Shifts in progress" subtitle="Shifts started in the last 24 hours that are still open." flush>
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load the live recordings."
          skeleton={<LoadingSkeleton variant="table" rows={3} />}
        >
          {(d) => (
            <DataTable
              caption="Shifts in progress"
              columns={shiftColumns}
              rows={d.activeShifts}
              rowKey={(s) => s.id}
              rowTone={(s) => (s.minutesElapsed > SHIFT_STUCK_MINUTES ? "warn" : undefined)}
              initialSort={{ key: "elapsed", dir: "desc" }}
              emptyTitle="No shifts open right now"
            />
          )}
        </LoadState>
      </Panel>
    </div>
  );
}
