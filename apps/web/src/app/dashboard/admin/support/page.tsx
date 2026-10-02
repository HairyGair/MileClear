"use client";

// Support (Oct 2026 rebuild): who is waiting on a reply, then every feedback
// thread with its status, known-issue flag and replies.

import Link from "next/link";
import { FeedbackPanel, FEEDBACK_STATUSES } from "@/components/admin/drivers/FeedbackPanel";
import { SupportQueuePanel, useHandledQueue, type QueueData } from "@/components/admin/drivers/SupportQueuePanel";
import {
  AdminIcon,
  BarList,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  useAdminData,
  type AdminData,
} from "@/components/admin/ui";

interface FeedbackStats {
  total: number;
  byStatus: Record<string, number>;
}

function FeedbackStatusPanel({ stats }: { stats: AdminData<FeedbackStats> }) {
  return (
    <Panel title="Feedback by status" subtitle="Every thread ever sent, by where it stands now.">
      <LoadState
        data={stats.data}
        loading={stats.loading}
        error={stats.error}
        onRetry={stats.reload}
        errorTitle="Couldn't load the feedback counts."
        skeleton={<LoadingSkeleton rows={5} />}
      >
        {(s) => (
          <>
            <div className="adm-figure" style={{ marginBottom: "var(--adm-s4)" }}>
              <span className="adm-figure__value">{s.total.toLocaleString("en-GB")}</span>
              <span className="adm-figure__label">threads in total</span>
            </div>
            <BarList
              label="Feedback threads by status"
              max={Math.max(1, s.total)}
              items={FEEDBACK_STATUSES.map((st) => ({
                key: st.value,
                label: st.label,
                value: s.byStatus[st.value] || 0,
                note: s.total ? `${Math.round(((s.byStatus[st.value] || 0) / s.total) * 100)}%` : undefined,
              }))}
            />
          </>
        )}
      </LoadState>
    </Panel>
  );
}

export default function AdminSupportPage() {
  const queue = useAdminData<QueueData>("/admin/support-queue");
  const { data: queueData, markLocal } = useHandledQueue(queue);
  const stats = useAdminData<FeedbackStats>("/feedback/stats");
  const qLoading = queue.loading && !queueData;

  const oldestHours = queueData?.items.reduce((m, i) => Math.max(m, i.ageHours), 0) ?? 0;
  const oldestText = oldestHours >= 48 ? `${Math.floor(oldestHours / 24)} days` : `${Math.round(oldestHours)} hours`;

  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Who is waiting on a reply from us, and every feedback thread drivers have sent."
        updatedAt={queueData?.generatedAt}
        actions={
          <Link href="/dashboard/admin/missing-trips" className="adm-btn">
            Missing-trip reports <AdminIcon name="arrowRight" size={14} />
          </Link>
        }
      />

      <Grid min={170}>
        <KpiCard
          label="Waiting on a reply"
          value={queueData?.counts.total ?? 0}
          tone={queueData ? (queueData.counts.total > 0 ? "warn" : "good") : "neutral"}
          loading={qLoading}
          error={queue.error}
          hint={queueData && queueData.items.length > 0 ? `Oldest has waited ${oldestText}` : queueData ? "Nobody is waiting" : undefined}
        />
        <KpiCard label="Feedback threads waiting" value={queueData?.counts.feedbackOpen ?? 0} loading={qLoading} error={queue.error} />
        <KpiCard
          label="Missing-trip reports waiting"
          value={queueData?.counts.missingTripsOpen ?? 0}
          loading={qLoading}
          error={queue.error}
          href="/dashboard/admin/missing-trips"
          title="Open the missing-trip reports"
        />
        <KpiCard
          label="New feedback, not yet triaged"
          value={stats.data?.byStatus.new ?? 0}
          loading={stats.loading && !stats.data}
          error={stats.error}
          hint="Status still New"
        />
      </Grid>

      <SupportQueuePanel queue={queue} data={queueData} onHandled={markLocal} />

      <div className="adm-split">
        <FeedbackPanel onChanged={stats.reload} />
        <FeedbackStatusPanel stats={stats} />
      </div>
    </>
  );
}
