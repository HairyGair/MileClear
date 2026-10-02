"use client";

// Ops: diagnostic alerts sent to drivers when their phone reports something
// they can fix (background location off, refresh denied, low disk...).

import { Ago } from "@/components/admin/Ago";
import { Badge, DataTable, LoadState, LoadingSkeleton, Panel, useAdminData, type TableColumn } from "@/components/admin/ui";
import type { AlertEvent } from "./types";

function alertLabel(type: string): string {
  // Heartbeat-driven (10 May 2026)
  if (type === "alert.heartbeat_bg_location_lost") return "Background location lost";
  if (type === "alert.heartbeat_bg_fetch_denied") return "Background refresh denied";
  if (type === "alert.heartbeat_sync_perm_failed") return "Sync queue failed";
  if (type === "alert.heartbeat_low_disk") return "Low disk space";
  // Revenue impact
  if (type.includes("subscription_orphan")) return "Subscription orphan";
  // Diagnostic-dump-driven (legacy)
  if (type.includes("permission")) return "Permission missing";
  if (type.includes("task_not")) return "Task stopped";
  if (type.includes("stuck")) return "Stuck recording";
  return type;
}

/** bad: tracking is broken for the driver. warn: degraded but recoverable. */
function alertTone(type: string): "bad" | "warn" | "neutral" {
  if (
    type === "alert.heartbeat_bg_location_lost" ||
    type === "alert.heartbeat_bg_fetch_denied" ||
    type === "alert.heartbeat_sync_perm_failed" ||
    type.includes("permission") ||
    type.includes("task_not")
  )
    return "bad";
  if (type === "alert.heartbeat_low_disk" || type.includes("stuck") || type.includes("subscription_orphan")) return "warn";
  return "neutral";
}

const COLUMNS: TableColumn<AlertEvent>[] = [
  {
    key: "when",
    header: "When",
    sortValue: (a) => a.createdAt,
    render: (a) => (
      <span style={{ whiteSpace: "nowrap" }}>
        <Ago iso={a.createdAt} />
        <span className="adm-cell-sub">{new Date(a.createdAt).toLocaleString("en-GB")}</span>
      </span>
    ),
  },
  { key: "user", header: "Driver", render: (a) => a.user?.displayName || a.user?.email || a.userId || "-" },
  { key: "alert", header: "Alert", sortValue: (a) => alertLabel(a.type), render: (a) => <Badge tone={alertTone(a.type)}>{alertLabel(a.type)}</Badge> },
  {
    key: "details",
    header: "Details",
    hideOnMobile: true,
    render: (a) => (
      <span className="adm-mono" style={{ color: "var(--adm-text-3)", overflowWrap: "anywhere" }}>
        {a.metadata ? JSON.stringify(a.metadata) : "-"}
      </span>
    ),
  },
];

export function AlertsPanel() {
  const { data, error, loading, reload } = useAdminData<AlertEvent[]>("/admin/diagnostic-alerts");
  return (
    <Panel
      title="Alerts sent to drivers"
      subtitle="Sent when a driver's diagnostics show something they can fix. You get a copy of each as a push notification."
      flush
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the alerts."
        skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={6} /></div>}
      >
        {(rows) => (
          <DataTable
            caption="Diagnostic alerts sent to drivers"
            columns={COLUMNS}
            rows={rows}
            rowKey={(a) => a.id}
            maxHeight={680}
            emptyTitle="No alerts sent yet"
            empty="Alerts fire when a driver uploads diagnostics, or when the periodic scan runs (every 6 hours)."
          />
        )}
      </LoadState>
    </Panel>
  );
}
