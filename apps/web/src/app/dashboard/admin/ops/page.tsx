"use client";

// Ops (Oct 2026 rebuild on the admin kit). Health of the API, database and
// routing up top; Apple webhooks, background jobs and driver alerts in tabs.
// Every block loads its own endpoint. The panels live in
// components/admin/ops/.

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertsPanel } from "@/components/admin/ops/AlertsPanel";
import { AppleWebhooksPanel } from "@/components/admin/ops/AppleWebhooksPanel";
import { HealthKpis, RecordCountsPanel, RoutingPanel } from "@/components/admin/ops/HealthPanels";
import { JobRunsPanel } from "@/components/admin/ops/JobRunsPanel";
import type { HealthData, RoutingHealthData } from "@/components/admin/ops/types";
import { AdminIcon, PageHeader, Tabs, useAdminData } from "@/components/admin/ui";

const A = "/dashboard/admin";

export default function AdminOpsPage() {
  const health = useAdminData<HealthData>("/admin/health");
  const routing = useAdminData<RoutingHealthData>("/admin/routing-health");
  const refreshing = health.loading || routing.loading;

  return (
    <>
      <PageHeader
        title="Ops"
        subtitle="Is everything running? The API and database, road routing, Apple purchase webhooks, scheduled jobs and the alerts sent to drivers."
        actions={
          <>
            <Link href={`${A}/build-health`} className="adm-btn adm-btn--sm">
              Build health
            </Link>
            <Link href={`${A}/issues-by-hour`} className="adm-btn adm-btn--sm">
              Issues by hour
            </Link>
            <button
              type="button"
              className="adm-btn adm-btn--sm"
              onClick={() => {
                health.reload();
                routing.reload();
              }}
              disabled={refreshing}
            >
              <AdminIcon name="refresh" size={14} /> {refreshing ? "Refreshing" : "Refresh health"}
            </button>
          </>
        }
      />

      <HealthKpis health={health} />

      <Tabs
        label="Ops sections"
        tabs={[
          {
            id: "health",
            label: "System",
            content: (
              <div className="adm-split">
                <RoutingPanel routing={routing} />
                <RecordCountsPanel health={health} />
              </div>
            ),
          },
          { id: "apple", label: "Apple webhooks", content: <Stack><AppleWebhooksPanel /></Stack> },
          { id: "jobs", label: "Background jobs", content: <Stack><JobRunsPanel /></Stack> },
          { id: "alerts", label: "Alerts to drivers", content: <AlertsPanel /> },
        ]}
      />
    </>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s5)" }}>{children}</div>;
}

