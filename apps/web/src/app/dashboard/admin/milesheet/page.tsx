"use client";

// Milesheet overview (4 Oct 2026). The company side of MileClear at a glance:
// how many teams, who is in them, whether invites are landing, and what it
// earns. Teams list, journey and attention each have their own page.

import Link from "next/link";
import {
  BarList,
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
import { MILESHEET_ROOT, formatRate, shortDate } from "@/components/admin/milesheet/labels";
import type { MilesheetOverview, PriceAnswers } from "@/components/admin/milesheet/types";
import { PRICE_QUESTION } from "@/components/milesheet/PriceQuestion";

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

      <PricePanel data={d?.priceAnswers} error={error} />

      <AttentionPanel limit={6} />
    </>
  );
}

const PRICE_LABELS: Record<string, string> = {
  gbp_2: "£2",
  gbp_4: "£4",
  gbp_6_plus: "£6 or more",
  would_not_pay: "Wouldn't pay",
};

// What managers said they'd pay, asked once per team after they approve a
// month (services/teamPriceQuestion.ts). The first answer from a team stands.
function PricePanel({ data, error }: { data?: PriceAnswers; error: unknown }) {
  const total = data?.answers.length ?? 0;
  return (
    <Panel
      title="What managers would pay"
      subtitle={`"${PRICE_QUESTION}"`}
      footer={data ? `${total} ${total === 1 ? "team has" : "teams have"} answered. Skipped ${data.skips} ${data.skips === 1 ? "time" : "times"}; a skip asks again the next month.` : undefined}
    >
      {error ? (
        <p className="adm-note">Couldn&apos;t load the price answers.</p>
      ) : !data ? (
        <p className="adm-note">Loading…</p>
      ) : total === 0 ? (
        <p className="adm-note">No answers yet. Managers are asked after they approve a month, so the first ones come after 1 November.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
          <BarList
            label="Price answers"
            items={Object.entries(PRICE_LABELS).map(([key, label]) => ({ key, label, value: data.counts[key] ?? 0 }))}
          />
          <ul aria-label="Answers by team" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--adm-s2)" }}>
            {data.answers.map((a) => (
              <li key={a.orgId}>
                <Link href={`${MILESHEET_ROOT}/${a.orgId}`}>{a.orgName ?? "Removed team"}</Link>
                {": "}
                <strong>{PRICE_LABELS[a.answer] ?? a.answer}</strong>
                <span className="adm-note">{` · ${shortDate(a.at)}${a.via === "email_link" ? " · from the email" : a.via === "portal" ? " · in the portal" : ""}`}</span>
                {a.comment ? <p className="adm-note" style={{ margin: "2px 0 0" }}>&ldquo;{a.comment}&rdquo;</p> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
