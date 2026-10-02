"use client";

// Ops: system health. The KPI row (API, database, latency, uptime, memory,
// Node) and the record counts read /admin/health; the routing panel reads
// /admin/routing-health on its own so a routing failure never hides the rest.

import { formatUptime } from "@/components/admin/legacy";
import {
  Badge,
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  Panel,
  formatNumber,
  type AdminData,
  type TableColumn,
} from "@/components/admin/ui";
import type { HealthData, RoutingHealthData } from "./types";

export function HealthKpis({ health }: { health: AdminData<HealthData> }) {
  const h = health.data;
  const loading = health.loading && !h;
  const status = (s: string | undefined) => (s === "ok" ? "Operational" : "Degraded");
  return (
    <Grid min={150}>
      <KpiCard label="API" value={h ? status(h.api) : ""} tone={h?.api === "ok" ? "good" : "bad"} loading={loading} error={health.error} />
      <KpiCard label="Database" value={h ? status(h.database) : ""} tone={h?.database === "ok" ? "good" : "bad"} loading={loading} error={health.error} />
      <KpiCard
        label="Database response"
        value={h ? `${formatNumber(h.databaseLatencyMs)} ms` : ""}
        loading={loading}
        error={health.error}
        hint="time for one query from the API"
      />
      <KpiCard label="API uptime" value={h ? formatUptime(h.uptime) : ""} loading={loading} error={health.error} hint="since the last restart" />
      <KpiCard label="Memory" value={h ? `${h.memoryUsageMb.toFixed(0)} MB` : ""} loading={loading} error={health.error} />
      <KpiCard label="Node.js" value={h?.nodeVersion ?? ""} loading={loading} error={health.error} />
    </Grid>
  );
}

type CountRow = { label: string; count: number };

const COUNT_COLUMNS: TableColumn<CountRow>[] = [
  { key: "label", header: "Record", sortValue: (r) => r.label },
  { key: "count", header: "Count", numeric: true, render: (r) => formatNumber(r.count), sortValue: (r) => r.count },
];

export function RecordCountsPanel({ health }: { health: AdminData<HealthData> }) {
  return (
    <Panel title="Database records" subtitle="How many rows of each kind are stored." flush>
      <LoadState
        data={health.data}
        loading={health.loading}
        error={health.error}
        onRetry={health.reload}
        errorTitle="Couldn't load the record counts."
        skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={7} /></div>}
      >
        {(h) => (
          <DataTable
            caption="Database record counts"
            columns={COUNT_COLUMNS}
            rowKey={(r) => r.label}
            rows={[
              { label: "Users", count: h.recordCounts.users },
              { label: "Trips", count: h.recordCounts.trips },
              { label: "Shifts", count: h.recordCounts.shifts },
              { label: "Vehicles", count: h.recordCounts.vehicles },
              { label: "Fuel logs", count: h.recordCounts.fuelLogs },
              { label: "Earnings", count: h.recordCounts.earnings },
              { label: "Achievements", count: h.recordCounts.achievements },
            ]}
          />
        )}
      </LoadState>
    </Panel>
  );
}

export function RoutingPanel({ routing }: { routing: AdminData<RoutingHealthData> }) {
  return (
    <Panel title="Road routing" subtitle="The service that turns a start and an end into road miles: GraphHopper first, Google as the fallback.">
      <LoadState
        data={routing.data}
        loading={routing.loading}
        error={routing.error}
        onRetry={routing.reload}
        errorTitle="Couldn't load the routing health."
        skeleton={<LoadingSkeleton variant="lines" rows={4} />}
      >
        {(r) => {
          const fallbackTone = r.last24h.fallbackRate > 50 ? "bad" : r.last24h.fallbackRate > 10 ? "warn" : "good";
          const bySource = Object.entries(r.cache.bySource)
            .map(([k, v]) => `${k} ${formatNumber(v)}`)
            .join(", ");
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
              <div style={{ display: "flex", gap: "var(--adm-s2)", flexWrap: "wrap" }}>
                {r.graphhopper.reachable ? (
                  <Badge tone="good" dot size="md">
                    GraphHopper up, {r.graphhopper.latencyMs ?? "?"} ms
                  </Badge>
                ) : r.config.graphhopperUrl === "missing" ? (
                  <Badge tone="bad" dot size="md">GraphHopper not configured</Badge>
                ) : (
                  <Badge tone="bad" dot size="md" title={r.graphhopper.error ?? undefined}>
                    GraphHopper down{r.graphhopper.error ? `: ${r.graphhopper.error}` : ""}
                  </Badge>
                )}
                <Badge tone={r.config.googleConfigured ? "good" : "neutral"} dot size="md">
                  {r.config.googleConfigured ? "Google fallback ready" : "Google fallback not configured"}
                </Badge>
              </div>
              <Grid min={140} gap="sm">
                <KpiCard label="Cached routes" value={r.cache.rowCount} hint={`${formatNumber(r.cache.totalHits)} times reused`} />
                <KpiCard label="Routes, last 24 hours" value={r.last24h.routesComputed} hint={`${formatNumber(r.last24h.routesUnavailable)} failed`} />
                <KpiCard label="Google fallback rate" value={`${r.last24h.fallbackRate}%`} tone={fallbackTone} hint="of routes used Google, not GraphHopper" />
              </Grid>
              <p className="adm-note">Cache by source: {bySource || "-"}</p>
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}
