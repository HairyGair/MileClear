"use client";

// One Milesheet team (4 Oct 2026): its people and invites, monthly
// approvals, everything that has happened to it, and the admin actions to
// fix it. Every action asks first and is logged as admin.milesheet.<action>.

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ago } from "@/components/admin/Ago";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import {
  Badge,
  DataTable,
  ExpandableText,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  Notice,
  PageHeader,
  Panel,
  StatLine,
  formatNumber,
  formatPence,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import {
  BillingBadge,
  FlagBadges,
  MILESHEET_ROOT,
  MemberStatusBadge,
  SOURCE_LABEL,
  eventLabel,
  formatMiles,
  roleLabel,
  shortDate,
} from "@/components/admin/milesheet/labels";
import { InviteActionDialog, MergeDialog, MoveDialog, PilotDialog, SeatCapDialog, type InviteAction } from "@/components/admin/milesheet/TeamActions";
import "@/components/admin/milesheet/milesheet.css";
import type { JourneyStep, TeamApprovalMonth, TeamDetail, TeamEvent, TeamMember } from "@/components/admin/milesheet/types";

const STEPS: Array<{ step: JourneyStep; label: string }> = [
  { step: "started", label: "Nominated or created" },
  { step: "managerAccepted", label: "Manager accepted" },
  { step: "firstDriverActive", label: "First driver active" },
  { step: "firstApproval", label: "First month approved" },
  { step: "firstExport", label: "First export" },
  { step: "paying", label: "Paying" },
];

const STRIPE_STATUS: Record<TeamDetail["billing"]["status"], string> = {
  pilot: "Free pilot",
  none: "No subscription",
  active: "Subscription active",
  past_due: "Payment overdue",
  canceled: "Subscription cancelled",
};

function eventDetail(e: TeamEvent): string {
  const m = e.metadata ?? {};
  const bits: string[] = [];
  if (typeof m.count === "number") bits.push(`${m.count} sent`);
  if (typeof m.email === "string") bits.push(m.email);
  if (typeof m.month === "string") bits.push(m.month);
  if (typeof m.format === "string") bits.push(m.format.toUpperCase());
  if (typeof m.to === "string") bits.push(`to ${m.to}`);
  if (typeof m.days === "number") bits.push(`+${m.days} days`);
  if (typeof m.sourceName === "string") bits.push(`from "${m.sourceName}"`);
  if (typeof m.companyName === "string") bits.push(`"${m.companyName}"`);
  if (typeof m.status === "string") bits.push(m.status);
  if (m.emailSent === false) bits.push("email failed");
  const before = m.before as Record<string, unknown> | undefined;
  const after = m.after as Record<string, unknown> | undefined;
  if (before && after && ("seatCap" in after || "pilotFree" in after)) {
    const k = "seatCap" in after ? "seatCap" : "pilotFree";
    bits.push(`${String(before[k] ?? "none")} to ${String(after[k] ?? "none")}`);
  }
  return bits.join(", ");
}

export default function MilesheetTeamPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params?.orgId ?? "";
  const { data, error, loading, reload } = useAdminData<TeamDetail>(orgId ? `/admin/milesheet/teams/${orgId}` : null);

  const [inviteAction, setInviteAction] = useState<InviteAction | null>(null);
  const [dialog, setDialog] = useState<"move" | "merge" | "seatCap" | "pilot" | null>(null);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const done = (m: string) => {
    setMessage(m);
    reload();
  };

  if (!data) {
    return (
      <>
        <PageHeader title="Team" subtitle="Loading the team." />
        <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load this team." skeleton={<LoadingSkeleton variant="block" />}>
          {() => null}
        </LoadState>
      </>
    );
  }

  const d = data;
  const org = d.org;
  const nominated = org.source === "nomination";
  const occupied = d.members.filter((m) => m.status !== "disabled").length;

  const memberCols: TableColumn<TeamMember>[] = [
    {
      key: "who",
      header: "Person",
      render: (m) => (
        <>
          {m.userId ? (
            <button type="button" className="adm-ms-linkbtn" onClick={() => setUserId(m.userId)} title="Open their account">
              {m.email}
            </button>
          ) : (
            m.email
          )}
          <span className="adm-cell-sub">
            {m.displayName ? `${m.displayName}, ` : ""}
            {roleLabel(m.role)}
            {m.email !== m.invitedEmail ? `, invited as ${m.invitedEmail}` : ""}
          </span>
        </>
      ),
      sortValue: (m) => m.email,
    },
    { key: "status", header: "Status", render: (m) => <MemberStatusBadge status={m.status} inviteState={m.inviteState} />, sortValue: (m) => m.status },
    {
      key: "dates",
      header: "Invited / joined",
      render: (m) => (
        <>
          {shortDate(m.invitedAt)}
          <span className="adm-cell-sub">
            {m.acceptedAt ? `joined ${shortDate(m.acceptedAt)}` : m.inviteExpiresAt ? `link until ${shortDate(m.inviteExpiresAt)}` : m.disabledAt ? `off ${shortDate(m.disabledAt)}` : ""}
          </span>
        </>
      ),
      sortValue: (m) => m.invitedAt,
      hideOnMobile: true,
    },
    { key: "trip", header: "Last trip", render: (m) => (m.userId ? <Ago iso={m.lastTripAt} /> : "-"), sortValue: (m) => m.lastTripAt ?? "", hideOnMobile: true },
    {
      key: "actions",
      header: <span className="adm-sr">Actions</span>,
      render: (m) => {
        if (m.status !== "invited") return null;
        if (m.inviteState === "waiting_on_manager") return <span className="adm-note">Joins when the manager accepts</span>;
        return (
          <span className="adm-actions">
            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setInviteAction({ kind: "resend", member: m })}>
              Resend
            </button>
            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setInviteAction({ kind: "extend7", member: m })}>
              +7 days
            </button>
            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setInviteAction({ kind: "extend14", member: m })}>
              +14 days
            </button>
            <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" onClick={() => setInviteAction({ kind: "cancel", member: m })}>
              Cancel
            </button>
          </span>
        );
      },
    },
  ];

  const approvalCols: TableColumn<TeamApprovalMonth>[] = [
    { key: "month", header: "Month", render: (a) => a.month, sortValue: (a) => a.month },
    { key: "approved", header: "Approved", render: (a) => formatNumber(a.approved), numeric: true },
    { key: "queried", header: "Queried", render: (a) => formatNumber(a.queried), numeric: true },
    { key: "pending", header: "Pending", render: (a) => formatNumber(a.pending), numeric: true, hideOnMobile: true },
    { key: "miles", header: "Approved miles", render: (a) => formatMiles(a.miles), numeric: true, hideOnMobile: true },
    { key: "amount", header: "Approved claim", render: (a) => formatPence(a.amountPence), numeric: true },
  ];

  const eventCols: TableColumn<TeamEvent>[] = [
    { key: "at", header: "When", render: (e) => new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }), sortValue: (e) => e.at },
    {
      key: "what",
      header: "What",
      render: (e) => (
        <>
          {e.type.startsWith("admin.") ? <Badge tone="info">{eventLabel(e.type)}</Badge> : eventLabel(e.type)}
          {eventDetail(e) && <span className="adm-cell-sub">{eventDetail(e)}</span>}
        </>
      ),
    },
    { key: "who", header: "By", render: (e) => e.actorEmail ?? <span style={{ color: "var(--adm-text-3)" }}>System</span>, hideOnMobile: true },
  ];

  return (
    <>
      <PageHeader
        title={org.name}
        subtitle={
          <>
            {SOURCE_LABEL[org.source]}, set up {shortDate(org.createdAt)}. <span className="adm-mono">{org.id}</span>
          </>
        }
        updatedAt={d.generatedAt}
        actions={
          <>
            <Link className="adm-btn adm-btn--sm" href={`${MILESHEET_ROOT}/teams`}>
              All teams
            </Link>
            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setDialog("move")}>
              Move someone in
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--sm"
              onClick={() => {
                setMergeSource(null);
                setDialog("merge");
              }}
            >
              Merge a team in
            </button>
          </>
        }
      />

      {message && (
        <Notice tone="good" title="Done">
          {message}
        </Notice>
      )}
      {error && <Notice tone="bad" title="Couldn't refresh this team">{error}</Notice>}
      {d.duplicates.map((dup) => (
        <Notice key={dup.orgIds.join("|")} tone="warn" title="This may be the same company as another team">
          {dup.detail}.{" "}
          {dup.others.map((o) => (
            <span key={o.id}>
              <Link href={`${MILESHEET_ROOT}/${o.id}`}>Open {o.name}</Link>{" "}
              <button
                type="button"
                className="adm-btn adm-btn--sm"
                onClick={() => {
                  setMergeSource(o.id);
                  setDialog("merge");
                }}
              >
                Merge it into this team
              </button>{" "}
            </span>
          ))}
        </Notice>
      ))}

      <Grid min={180}>
        <KpiCard label="Active members" value={d.members.filter((m) => m.status === "active").length} hint={`${d.members.filter((m) => m.status === "active" && m.role === "admin").length} manager(s)`} tone="accent" />
        <KpiCard label="Open invites" value={d.members.filter((m) => m.status === "invited").length} hint={`${d.members.filter((m) => m.inviteState === "expired").length} expired`} />
        <KpiCard
          label={`This month (${d.month?.month ?? "-"})`}
          value={d.month ? formatMiles(d.month.totalMiles) : "-"}
          hint={d.month ? `${formatPence(d.month.totalAmountPence)} claim, drivers only` : "Couldn't work it out"}
        />
        <KpiCard label="Places used" value={`${occupied} of ${org.seatCap ?? "no limit"}`} hint="Active members and open invites" />
      </Grid>

      <div className="adm-split">
        <Panel title="People and invites" subtitle="Click an email to open the account." flush>
          <DataTable
            caption={`Members and invites of ${org.name}`}
            columns={memberCols}
            rows={d.members}
            rowKey={(m) => m.id}
            rowTone={(m) => (m.inviteState === "expired" ? "warn" : undefined)}
            emptyTitle="Nobody in this team"
          />
        </Panel>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s5)", minWidth: 0 }}>
          <Panel title="Billing" actions={<BillingBadge status={org.pilotFree ? "pilot" : org.stripeSubscriptionId ? "paying" : "none"} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s2)" }}>
              <StatLine label="Stripe" value={STRIPE_STATUS[d.billing.status]} hint={d.billing.currentPeriodEnd ? `Renews ${shortDate(d.billing.currentPeriodEnd)}` : undefined} />
              <StatLine label="Seats billed" value={org.seatsBilled ?? "-"} hint={`${d.billing.activeSeats} active driver seat(s)`} />
              <StatLine label="Seat price" value={d.billing.pricePerSeatPence == null ? "Not set" : formatPence(d.billing.pricePerSeatPence)} />
              <StatLine label="Member limit" value={org.seatCap ?? "None"} />
              <StatLine label="Billing email" value={org.billingEmail ?? "-"} />
              <StatLine label="Flags" value={<FlagBadges flags={d.flags} />} />
            </div>
            <div className="adm-actions" style={{ marginTop: "var(--adm-s4)" }}>
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => setDialog("seatCap")}>
                Change member limit
              </button>
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => setDialog("pilot")}>
                {org.pilotFree ? "End free pilot" : "Make free pilot"}
              </button>
            </div>
            {org.stripeSubscriptionId && <p className="adm-note" style={{ marginTop: "var(--adm-s3)" }}>Has a Stripe subscription: changing the pilot needs care.</p>}
          </Panel>
          <Panel title="Journey">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s2)" }}>
              {STEPS.map((s) => (
                <StatLine
                  key={s.step}
                  label={s.label}
                  value={d.journey.reached[s.step] ? (d.journey.dates[s.step] ? shortDate(d.journey.dates[s.step]) : "Yes") : <span style={{ color: "var(--adm-text-3)" }}>Not yet</span>}
                />
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Monthly approvals" subtitle="What the manager signed off, month by month. Miles and claim are the figures at the time of approval." flush>
        <DataTable caption={`Monthly approvals for ${org.name}`} columns={approvalCols} rows={d.approvals} rowKey={(a) => a.month} emptyTitle="No month approved or queried yet" />
        {d.approvals.some((a) => a.rows.some((r) => r.note)) && (
          <div style={{ padding: "var(--adm-s4)" }}>
            {d.approvals.flatMap((a) =>
              a.rows
                .filter((r) => r.note)
                .map((r) => (
                  <p key={`${a.month}-${r.userId}`} className="adm-text">
                    <strong>{a.month}</strong>, {r.email ?? r.userId} ({r.status}): <ExpandableText text={r.note!} max={200} />
                  </p>
                ))
            )}
          </div>
        )}
      </Panel>

      <Panel title="Timeline" subtitle="Everything recorded for this team, newest first (up to 200)." flush>
        <DataTable caption={`Timeline for ${org.name}`} columns={eventCols} rows={d.events} rowKey={(e, i) => `${e.at}-${i}`} maxHeight={520} emptyTitle="Nothing recorded yet" />
      </Panel>

      <InviteActionDialog action={inviteAction} orgName={org.name} nominated={nominated} onClose={() => setInviteAction(null)} onDone={done} />
      <MoveDialog open={dialog === "move"} org={org} onClose={() => setDialog(null)} onDone={done} />
      <MergeDialog open={dialog === "merge"} org={org} suggestedSourceId={mergeSource} onClose={() => setDialog(null)} onDone={done} />
      <SeatCapDialog open={dialog === "seatCap"} org={org} occupied={occupied} onClose={() => setDialog(null)} onDone={done} />
      <PilotDialog open={dialog === "pilot"} org={org} onClose={() => setDialog(null)} onDone={done} />
      <UserDetailModal userId={userId} open={!!userId} onClose={() => setUserId(null)} />
    </>
  );
}
