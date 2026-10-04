"use client";

// Milesheet overview (4 Oct 2026). The company side of MileClear at a glance:
// how many teams, who is in them, whether invites are landing, and what it
// earns. Teams list, journey and attention each have their own page.

import Link from "next/link";
import {
  Grid,
  KpiCard,
  PageHeader,
  Panel,
  StatLine,
  formatNumber,
  formatPence,
  useAdminData,
} from "@/components/admin/ui";
import { AttentionPanel, JourneyPanel } from "@/components/admin/milesheet/panels";
import { MILESHEET_ROOT, formatRate } from "@/components/admin/milesheet/labels";
import type { MilesheetOverview } from "@/components/admin/milesheet/types";

export default function MilesheetOverviewPage() {
  const { data: d, error, loading } = useAdminData<MilesheetOverview>("/admin/milesheet/overview");
  const waiting = loading && !d;

  return (
    <>
      <PageHeader
        title="Milesheet"
        subtitle="Companies using MileClear for their drivers' mileage claims: teams, invites, approvals and billing."
        updatedAt={d?.generatedAt}
        actions={
          <>
            <Link className="adm-btn adm-btn--sm" href={`${MILESHEET_ROOT}/teams`}>
              All teams
            </Link>
            <Link className="adm-btn adm-btn--sm" href="/dashboard/admin" title="On the admin Overview, under Latest activity">
              Teams interest register
            </Link>
          </>
        }
      />

      <Grid min={180}>
        <KpiCard
          label="Teams"
          value={d?.teams.total ?? 0}
          tone="accent"
          href={`${MILESHEET_ROOT}/teams`}
          hint={d ? `${formatNumber(d.teams.pilot)} free pilot, ${formatNumber(d.teams.paying)} paying, ${formatNumber(d.teams.neither)} neither` : undefined}
          loading={waiting}
          error={error}
        />
        <KpiCard label="Active drivers in teams" value={d?.activeDrivers ?? 0} hint="Accepted, not switched off" loading={waiting} error={error} />
        <KpiCard label="Active managers" value={d?.activeManagers ?? 0} loading={waiting} error={error} />
        <KpiCard
          label="Seats billed"
          value={d?.seatsBilled ?? 0}
          hint={d ? (d.pricePerSeatPence == null ? "Seat price not set in Stripe" : `${formatPence(d.pricePerSeatPence)} a seat a month`) : undefined}
          loading={waiting}
          error={error}
        />
        <KpiCard
          label="Team revenue a month (estimate)"
          value={d ? (d.monthlyRevenuePence == null ? "Not set" : formatPence(d.monthlyRevenuePence)) : "-"}
          tone={d && (d.monthlyRevenuePence ?? 0) > 0 ? "good" : "neutral"}
          hint="Seats billed × the Stripe seat price. Not what Stripe actually collected."
          loading={waiting}
          error={error}
        />
        <KpiCard
          label="Pro through teams"
          value={d?.proThroughTeams ?? 0}
          hint={d ? `${formatNumber(d.proThroughTeamsOnly)} have no other Pro (no subscription or referral)` : undefined}
          loading={waiting}
          error={error}
        />
      </Grid>

      <div className="adm-split">
        <Panel
          title="Invites"
          subtitle="Are people getting in?"
          footer="Until 4 Oct 2026 every invite link pointed at the API and failed, so no invite before then could be accepted. Sent counts come from the invite events (manager invites, nominations, our set-ups and resends)."
        >
          {error ? (
            <p className="adm-note">Couldn&apos;t load the invite numbers.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s2)" }}>
              <StatLine label="Sent, last 30 days" value={d ? formatNumber(d.invites.last30d.sent) : "-"} />
              <StatLine
                label="Accepted, last 30 days"
                value={d ? formatNumber(d.invites.last30d.accepted) : "-"}
                hint={d ? `${formatRate(d.invites.last30d.acceptanceRate)} accepted` : undefined}
              />
              <StatLine label="Sent, all time" value={d ? formatNumber(d.invites.allTime.sent) : "-"} />
              <StatLine
                label="Accepted, all time"
                value={d ? formatNumber(d.invites.allTime.accepted) : "-"}
                hint={d ? `${formatRate(d.invites.allTime.acceptanceRate)} accepted` : undefined}
              />
              <StatLine label="Open now" value={d ? formatNumber(d.invites.pending) : "-"} hint="Link still works" />
              <StatLine label="Expired, not accepted" value={d ? formatNumber(d.invites.expired) : "-"} hint="Resend or extend from the team page" />
              <StatLine label="Drivers waiting on their manager" value={d ? formatNumber(d.invites.waitingOnManager) : "-"} hint="They nominated a manager who has not accepted yet" />
            </div>
          )}
        </Panel>
        <JourneyPanel compact />
      </div>

      <AttentionPanel limit={6} />
    </>
  );
}
