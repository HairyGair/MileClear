"use client";

// Acquisition: how new drivers hear about MileClear. The in-app "How did you
// hear about us?" answers, the billboard QR scans and the referral programme.

import type { Analytics } from "@/components/admin/legacy";
import { AcquisitionPanel } from "@/components/admin/panels/AcquisitionPanel";
import { QrScansPanel } from "@/components/admin/panels/QrScansPanel";
import { Grid, KpiCard, LoadState, PageHeader, Panel, ProgressBar, useAdminData } from "@/components/admin/ui";

function ReferralPanel() {
  const { data, error, loading, reload } = useAdminData<Analytics>("/admin/analytics");
  return (
    <Panel title="Referral programme" subtitle="Drivers who joined with a friend's code. Both sides get a free month once the friend records a GPS trip.">
      <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the referral figures.">
        {(a) =>
          a.referrals ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
              <Grid min={170} gap="sm">
                <KpiCard label="Friends signed up" value={a.referrals.attached} />
                <KpiCard label="Free months granted" value={a.referrals.qualified} tone="good" />
                <KpiCard label="On referral Pro now" value={a.referrals.activeCreditUsers} tone="accent" />
              </Grid>
              <ProgressBar
                label="Friends who went on to record a trip"
                value={a.referrals.qualified}
                max={Math.max(1, a.referrals.attached)}
              />
            </div>
          ) : (
            <p className="adm-text">No referral figures in the analytics response.</p>
          )
        }
      </LoadState>
    </Panel>
  );
}

export default function AdminAcquisitionPage() {
  return (
    <>
      <PageHeader
        title="Acquisition"
        subtitle="How new drivers hear about MileClear: what they tell us in the app, the billboard QR code, and referrals."
      />
      <div className="adm-split">
        <AcquisitionPanel variant="full" />
        <ReferralPanel />
      </div>
      <QrScansPanel variant="full" />
    </>
  );
}
