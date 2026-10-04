"use client";

// Teams interest register + Milesheet waiting list (4 Oct 2026). The
// register rows come from the /teams and /employee-mileage-tracker forms.
// Waiting-list rows are requests to start a team that were parked while
// MILESHEET_NEW_TEAMS is "waitlist" (from the website, from a driver naming
// their manager in the app, or added here by hand). "Create team" lets a
// request in: it creates the team and sends the manager the normal invite.

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Badge,
  ChoiceChips,
  DataTable,
  Dialog,
  Grid,
  KpiCard,
  LoadState,
  Notice,
  ProgressBar,
  Segmented,
  Spinner,
  TextInput,
  formatNumber,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";

export interface TeamInterestRow {
  id: string;
  email: string;
  company: string | null;
  contactName: string | null;
  drivers: string | null;
  approval: string | null;
  destination: string | null;
  destinationDetail: string | null;
  notes: string | null;
  source: string | null;
  waitlistSource: "self_serve" | "driver_nomination" | "admin_form" | null;
  waitlisted: boolean;
  nominatedBy: { userId: string; email: string; displayName: string | null } | null;
  admittedOrgId: string | null;
  admittedAt: string | null;
  createdAt: string;
}
interface TeamInterestResponse {
  data: TeamInterestRow[];
  newTeams: "open" | "waitlist";
  totals: {
    submissions: number;
    companies: number;
    estimatedDrivers: number;
    tenPlusCompanies: number;
    waitlisted: number;
    admitted: number;
  };
}

const APPROVAL_LABEL: Record<string, string> = {
  monthly_signoff: "Monthly sign-off",
  line_by_line: "Line by line",
  view_only: "View only",
};

const SOURCE_LABEL: Record<string, string> = {
  self_serve: "Website",
  driver_nomination: "Driver named them",
  admin_form: "Added by admin",
};

type View = "all" | "waitlist" | "interest";
type Plan = "pilot" | "trial" | "paid";

function CreateTeamDialog({ row, onClose, onDone }: { row: TeamInterestRow | null; onClose: () => void; onDone: (m: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<Plan>("pilot");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!row) return;
    setName(row.company ?? "");
    setEmail(row.email);
    setPlan("pilot");
    setError(null);
  }, [row]);

  const go = async () => {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ data: { orgId: string; name: string; adminEmail: string; emailSent: boolean; broughtNominator: boolean } }>(
        `/admin/milesheet/waitlist/${row.id}/create-team`,
        { name: name.trim(), adminEmail: email.trim(), plan }
      );
      const d = r.data;
      onDone(
        `${d.name} created. ${d.emailSent ? `Invite sent to ${d.adminEmail}.` : `The invite email failed: resend it from the team page.`}` +
          (d.broughtNominator ? " The driver who named them joins when the manager accepts." : "")
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!row}
      onClose={onClose}
      busy={busy}
      title="Create team from this request?"
      footer={
        <>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="adm-btn adm-btn--primary" onClick={go} disabled={busy || name.trim().length < 2}>
            {busy ? <><Spinner /> Working</> : "Create team and invite"}
          </button>
        </>
      }
    >
      {row && (
        <>
          <p className="adm-text">
            Creates the team and emails the manager the normal invite link (valid 7 days).
            {row.nominatedBy
              ? ` ${row.nominatedBy.displayName || row.nominatedBy.email} named this manager in the app: they get the "has asked you to handle their mileage claims" email, and the driver joins when the manager accepts.`
              : ""}
          </p>
          <TextInput label="Team name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          <TextInput label="Manager's email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
          <ChoiceChips<Plan>
            label="Plan"
            value={plan}
            onChange={setPlan}
            options={[
              { value: "pilot", label: "Free pilot" },
              { value: "trial", label: "30-day free trial" },
              { value: "paid", label: "Paid from the start" },
            ]}
          />
          <p className="adm-note">
            {plan === "pilot" && "Free with no end date, up to 20 people. Every member gets Pro."}
            {plan === "trial" && "Members get Pro for 30 days, up to 20 people. After that they need to subscribe; nothing is deleted."}
            {plan === "paid" && "No Pro for members until the manager starts billing in the portal."}
          </p>
          {error && <Notice tone="bad" title="That didn't work">{error}</Notice>}
        </>
      )}
    </Dialog>
  );
}

export function TeamInterestTab() {
  const [view, setView] = useState<View>("all");
  const path = view === "all" ? "/admin/team-interest" : `/admin/team-interest?view=${view}`;
  const { data, error, loading, reload } = useAdminData<TeamInterestResponse>(path, { unwrap: false });
  const [creating, setCreating] = useState<TeamInterestRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const cols: TableColumn<TeamInterestRow>[] = [
    {
      key: "who",
      header: "Who",
      render: (r) => (
        <>
          {r.company || r.email.split("@")[1]}
          <span className="adm-cell-sub">
            {r.contactName ? `${r.contactName}, ` : ""}
            {r.email}
            {r.source ? `, via /${r.source}` : ""}
          </span>
          {r.nominatedBy && (
            <span className="adm-cell-sub">Named by {r.nominatedBy.displayName || r.nominatedBy.email}</span>
          )}
        </>
      ),
      sortValue: (r) => r.company ?? r.email,
    },
    {
      key: "source",
      header: "Source",
      render: (r) =>
        r.waitlistSource ? (
          <Badge tone="info">{SOURCE_LABEL[r.waitlistSource] ?? r.waitlistSource}</Badge>
        ) : (
          <span style={{ color: "var(--adm-text-2)" }}>Interest form</span>
        ),
      sortValue: (r) => r.waitlistSource ?? "",
    },
    {
      key: "status",
      header: "Status",
      render: (r) =>
        r.admittedOrgId ? (
          <Link href={`/dashboard/admin/milesheet/${r.admittedOrgId}`}>
            <Badge tone="good">Let in</Badge>
          </Link>
        ) : r.waitlisted ? (
          <Badge tone="warn">Waiting</Badge>
        ) : (
          <span style={{ color: "var(--adm-text-2)" }}>-</span>
        ),
      sortValue: (r) => (r.admittedAt ? 2 : r.waitlisted ? 1 : 0),
    },
    { key: "drivers", header: "Drivers", render: (r) => r.drivers ?? "-", numeric: true },
    { key: "approval", header: "Approval", render: (r) => (r.approval ? APPROVAL_LABEL[r.approval] ?? r.approval : "-"), hideOnMobile: true },
    {
      key: "destination",
      header: "Figures go to",
      render: (r) => (r.destination ? `${r.destination.replace("_", " ")}${r.destinationDetail ? ` (${r.destinationDetail})` : ""}` : "-"),
      hideOnMobile: true,
    },
    { key: "notes", header: "Notes", render: (r) => <span style={{ color: "var(--adm-text-2)" }}>{r.notes || "-"}</span>, hideOnMobile: true },
    {
      key: "createdAt",
      header: "When",
      render: (r) => new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      sortValue: (r) => r.createdAt,
      align: "right",
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (r) =>
        r.admittedOrgId ? null : (
          <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => setCreating(r)}>
            Create team
          </button>
        ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
      <Segmented<View>
        label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: "all", label: "Everything" },
          { value: "waitlist", label: "Waiting list" },
          { value: "interest", label: "Interest form" },
        ]}
      />
      {message && <Notice tone="good">{message}</Notice>}
      <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load Teams interest.">
        {(d) => (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
            <Notice tone={d.newTeams === "open" ? "good" : "neutral"}>
              {d.newTeams === "open"
                ? "New teams are open (MILESHEET_NEW_TEAMS=open): companies can start a team themselves, with a 30-day free trial."
                : "New teams are on the waiting list (MILESHEET_NEW_TEAMS is not \"open\"). Requests land here; use Create team to let one in."}
            </Notice>
            <Grid min={200} gap="sm">
              <KpiCard label="Waiting" value={d.totals.waitlisted} hint={`${formatNumber(d.totals.admitted)} let in so far`} />
              <KpiCard label="Companies" value={d.totals.companies} hint={`${formatNumber(d.totals.submissions)} submissions`} />
              <KpiCard label="Drivers (estimate)" value={d.totals.estimatedDrivers} hint="Band midpoints 3 / 13 / 35 / 75. Indicative, not a count." />
              <div className="adm-kpi">
                <p className="adm-kpi__label">Companies with 10+ drivers</p>
                <div style={{ marginTop: "var(--adm-s3)" }}>
                  <ProgressBar
                    value={d.totals.tenPlusCompanies}
                    max={5}
                    valueLabel={`${d.totals.tenPlusCompanies} of 5`}
                    tone={d.totals.tenPlusCompanies >= 5 ? "good" : "accent"}
                    label="Target set 21 Aug 2026"
                  />
                </div>
              </div>
            </Grid>
            <DataTable
              caption={view === "waitlist" ? "Milesheet waiting list" : "Teams interest register"}
              columns={cols}
              rows={d.data.slice(0, 50)}
              rowKey={(r) => r.id}
              maxHeight={480}
              emptyTitle={view === "waitlist" ? "Nobody is waiting" : "Nobody has registered yet"}
              empty={view === "waitlist" ? "Requests to start a team appear here while new teams are paused." : "The form is on /teams and /employee-mileage-tracker."}
            />
          </div>
        )}
      </LoadState>
      <CreateTeamDialog
        row={creating}
        onClose={() => setCreating(null)}
        onDone={(m) => {
          setMessage(m);
          reload();
        }}
      />
    </div>
  );
}
