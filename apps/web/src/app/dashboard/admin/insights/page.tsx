"use client";

// Insights: the all-time funnel and retention, live recordings, quality
// signals, top drivers and admin activity. Each tab loads its own data only
// when it is opened. The panels live in components/admin/growth/.

import { ActiveRecordingsTab } from "@/components/admin/growth/ActiveRecordingsPanel";
import { AdminActivityTab } from "@/components/admin/growth/AdminActivityPanels";
import { FunnelTab } from "@/components/admin/growth/FunnelPanels";
import { QualityTab } from "@/components/admin/growth/QualityPanels";
import { TopUsersTab } from "@/components/admin/growth/TopUsersPanel";
import { PageHeader, Tabs } from "@/components/admin/ui";

export default function AdminInsightsPage() {
  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="The all-time funnel and retention, what is recording right now, quality signals, the top drivers, and admin activity."
      />
      <Tabs
        label="Insights sections"
        tabs={[
          { id: "funnel", label: "Funnel and retention", content: <FunnelTab /> },
          { id: "live", label: "Live now", content: <ActiveRecordingsTab /> },
          { id: "quality", label: "Quality signals", content: <QualityTab /> },
          { id: "top", label: "Top drivers", content: <TopUsersTab /> },
          { id: "admin", label: "Admin activity", content: <AdminActivityTab /> },
        ]}
      />
    </>
  );
}
