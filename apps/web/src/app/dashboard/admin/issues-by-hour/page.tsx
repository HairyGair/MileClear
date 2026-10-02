"use client";

// Issues by hour (Oct 2026 rebuild on the admin kit). Diagnostic events
// bucketed by hour of day (UTC), slow requests by endpoint, and the iOS
// Background App Refresh snapshot. Three endpoints, each in its own panel, so
// one failing never blanks the others.

import { useState } from "react";
import {
  Badge,
  BarChart,
  BarList,
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  Notice,
  PageHeader,
  Panel,
  SelectInput,
  formatNumber,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";

interface HourlyData {
  windowDays: number;
  series: Record<string, number[]>; // type -> 24 numbers
  totalsByHour: number[]; // 24 numbers
  totalsByType: Record<string, number>;
  generatedAt: string;
}

interface SlowRow {
  key: string;
  method: string;
  path: string;
  count: number;
  avgDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  topStatus: number;
}

interface SlowData {
  windowDays: number;
  thresholdMs: number;
  totalEvents: number;
  rows: SlowRow[];
  distinctEndpoints: number;
  generatedAt: string;
}

interface BgFetchData {
  activeWindowDays: number;
  all: Record<string, number>;
  active: Record<string, number>;
  generatedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  "watchdog.silent_push_sent": "Stuck-recording wake",
  "watchdog.drain_sync_push_sent": "Sync-queue wake",
  "alert.stuck_recording": "Stuck recording (phone)",
  "alert.permission_missing": "Permission revoked",
  "alert.task_not_running": "Background task off",
  "perf.slow_request": "Slow request",
  "auth.login_failed": "Login failed",
  "reconciliation.drift": "Reconciliation drift",
};

const hh = (h: number) => String(h).padStart(2, "0");
const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

// ---------------------------------------------------------------------------
// Events by hour
// ---------------------------------------------------------------------------

function HourlyPanel() {
  const { data, error, loading, reload } = useAdminData<HourlyData>("/admin/issues-by-hour");
  const [type, setType] = useState("");

  return (
    <Panel
      highlight
      title="Diagnostic events by hour of day"
      subtitle={`Last ${data?.windowDays ?? 14} days. Look for rush-hour reliability dips, 2am timezone bugs and login storms.`}
      footer={`${data ? `Generated ${new Date(data.generatedAt).toLocaleString("en-GB")}. ` : ""}Hours are UTC, not UK time: add an hour during British Summer Time.`}
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the events by hour."
        skeleton={<LoadingSkeleton variant="chart" height={240} />}
      >
        {(d) => {
          const types = Object.entries(d.totalsByType)
            .filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1]);
          if (types.length === 0) {
            return <p className="adm-text">No tracked diagnostic events in the last {d.windowDays} days.</p>;
          }
          const current = type && d.series[type] ? type : "";
          const values = current ? d.series[current] : d.totalsByHour;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s5)" }}>
              <div style={{ maxWidth: 320 }}>
                <SelectInput
                  label="Show"
                  value={current}
                  onChange={(e) => setType(e.target.value)}
                  options={[
                    { value: "", label: `All event types (${formatNumber(types.reduce((s, [, n]) => s + n, 0))})` },
                    ...types.map(([t, n]) => ({ value: t, label: `${TYPE_LABELS[t] ?? t} (${formatNumber(n)})` })),
                  ]}
                />
              </div>
              <BarChart
                label={`${current ? TYPE_LABELS[current] ?? current : "All diagnostic events"} by hour of day, UTC`}
                unit="events"
                height={240}
                data={Array.from({ length: 24 }, (_, h) => ({
                  label: hh(h),
                  fullLabel: `${hh(h)}:00 to ${hh(h)}:59 UTC`,
                  value: values[h] ?? 0,
                }))}
              />
              <div>
                <p className="adm-field__label" style={{ margin: "0 0 var(--adm-s2)" }}>Events by type, whole window</p>
                <BarList
                  label="Diagnostic events by type"
                  items={types.map(([t, n]) => ({ key: t, label: TYPE_LABELS[t] ?? t, value: n }))}
                />
              </div>
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Slow requests by endpoint
// ---------------------------------------------------------------------------

function statusTone(s: number): "bad" | "warn" | "neutral" {
  return s >= 500 ? "bad" : s >= 400 ? "warn" : "neutral";
}

function SlowPanel() {
  const { data, error, loading, reload } = useAdminData<SlowData>("/admin/slow-requests-by-endpoint");
  const total = data ? data.rows.reduce((acc, r) => acc + r.count, 0) : 0;

  const cols: TableColumn<SlowRow>[] = [
    {
      key: "endpoint",
      header: "Endpoint",
      render: (r) => (
        <span className="adm-mono">
          <span style={{ color: "var(--adm-text-3)", marginRight: 6 }}>{r.method}</span>
          {r.path}
        </span>
      ),
      sortValue: (r) => r.path,
    },
    {
      key: "count",
      header: "Count",
      numeric: true,
      sortValue: (r) => r.count,
      render: (r) => (
        <>
          <strong style={{ color: "var(--adm-accent-strong)" }}>{formatNumber(r.count)}</strong>
          <span className="adm-cell-sub">{total === 0 ? "0" : ((r.count / total) * 100).toFixed(1)}%</span>
        </>
      ),
    },
    {
      key: "avg",
      header: "Average",
      numeric: true,
      sortValue: (r) => r.avgDurationMs,
      render: (r) =>
        r.avgDurationMs > 8000 ? (
          <Badge tone="bad">{secs(r.avgDurationMs)}</Badge>
        ) : r.avgDurationMs > 4000 ? (
          <Badge tone="warn">{secs(r.avgDurationMs)}</Badge>
        ) : (
          secs(r.avgDurationMs)
        ),
      title: "Amber over 4 seconds, red over 8",
    },
    { key: "p95", header: "p95", numeric: true, hideOnMobile: true, sortValue: (r) => r.p95DurationMs, render: (r) => secs(r.p95DurationMs) },
    { key: "max", header: "Slowest", numeric: true, hideOnMobile: true, sortValue: (r) => r.maxDurationMs, render: (r) => secs(r.maxDurationMs) },
    {
      key: "status",
      header: "Usual status",
      numeric: true,
      hideOnMobile: true,
      title: "The most common HTTP status for these slow requests",
      sortValue: (r) => r.topStatus,
      render: (r) => (r.topStatus ? <Badge tone={statusTone(r.topStatus)}>{r.topStatus}</Badge> : "?"),
    },
  ];

  return (
    <Panel
      title="Slow requests by endpoint"
      subtitle={
        data
          ? `${formatNumber(data.totalEvents)} slow requests over ${formatNumber(data.distinctEndpoints)} endpoints (at least ${formatNumber(data.thresholdMs)}ms, last ${data.windowDays} days).`
          : "Which API calls are slow, and how slow."
      }
      flush
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the slow requests."
        skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={6} /></div>}
      >
        {(d) => (
          <DataTable
            caption="Slow requests by endpoint"
            columns={cols}
            rows={d.rows}
            rowKey={(r) => r.key}
            initialSort={{ key: "count", dir: "desc" }}
            maxHeight={520}
            emptyTitle="No slow requests in the window"
          />
        )}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// iOS Background App Refresh
// ---------------------------------------------------------------------------

const BG_STATES = [
  { key: "available", label: "Available", tone: "good" },
  { key: "denied", label: "Denied", tone: "bad" },
  { key: "restricted", label: "Restricted", tone: "warn" },
  { key: "unknown", label: "Unknown", tone: "neutral" },
  { key: "not_reported", label: "Not reported", tone: "neutral" },
] as const;

function BgFetchPanel() {
  const { data, error, loading, reload } = useAdminData<BgFetchData>("/admin/background-fetch-status");
  return (
    <Panel
      title="iOS Background App Refresh"
      subtitle={`A snapshot of each iPhone's last report. Active means a heartbeat or a drive in the last ${data?.activeWindowDays ?? 7} days.`}
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the Background App Refresh snapshot."
        skeleton={<LoadingSkeleton variant="lines" rows={4} />}
      >
        {(d) => {
          const off = (d.active.denied ?? 0) + (d.active.restricted ?? 0);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
              <Grid min={140} gap="sm">
                {BG_STATES.map((s) => (
                  <KpiCard
                    key={s.key}
                    label={s.label}
                    value={d.active[s.key] ?? 0}
                    tone={s.tone === "neutral" ? "neutral" : s.tone}
                    hint={`active, ${formatNumber(d.all[s.key] ?? 0)} in total`}
                  />
                ))}
              </Grid>
              {off > 0 && (
                <Notice tone="warn" title={`${formatNumber(off)} active driver${off === 1 ? " has" : "s have"} Background App Refresh turned off`}>
                  Trip recording will be unreliable for them until they turn it back on in Settings, General, Background App Refresh.
                </Notice>
              )}
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}

export default function IssuesByHourPage() {
  return (
    <>
      <PageHeader
        title="Issues by hour"
        subtitle="When in the day do things go wrong? Diagnostic events by hour (UTC), the slowest API calls, and iPhones that cannot refresh in the background."
      />
      <HourlyPanel />
      <div className="adm-split">
        <SlowPanel />
        <BgFetchPanel />
      </div>
    </>
  );
}
