"use client";

// Missing trips (Oct 2026 rebuild). Triage for "Missing a trip?" reports from
// the Trips screen (live since 9 Jun 2026). Each report arrives pre-diagnosed
// using the support-playbook rules, so most answer themselves before being
// opened:
//   landed_after_report → Class 11: the trip arrived after the report.
//   open_recording      → Class 15: signal_start with no trip.created since;
//                         the route is on the phone until their next drive.
//   no_addresses        → Class 14: the trip is there with no addresses, so
//                         the list shows no route line.
//   head_gap            → Class 16: first coordinate well after startedAt;
//                         the leading miles are absent.
//   permission_gap      → user lacks Always-location / Motion; engine can't
//                         run backgrounded. Fix = the permission nudge.
//   silent_non_capture  → native engine never opens recordings on this
//                         device (the Norman Boomer class). Fix = engine
//                         switch on the user detail panel.
//   needs_look          → no rule matched; read the dump.

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatReportedDate } from "@/lib/reportedDate";
import { Ago } from "@/components/admin/Ago";
import {
  AdminIcon,
  Badge,
  BarChart,
  BarList,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  SelectField,
  dayKey,
  formatDay,
  useAdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";
import "@/components/admin/drivers/drivers.css";

type Diagnosis =
  | "landed_after_report"
  | "open_recording"
  | "no_addresses"
  | "head_gap"
  | "permission_gap"
  | "silent_non_capture"
  | "needs_look";

interface Report {
  id: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  note: string | null;
  /** The day the user said they drove, "YYYY-MM-DD" local to them. Null for
   *  reports filed before the date picker (16 Sep 2026). */
  reportedDate: string | null;
  reportedAt: string;
  dumpVerdict: string | null;
  dumpAt: string | null;
  backgroundPermission: string | null;
  motionPermission: string | null;
  nativeEngine: boolean;
  recentAutoTrips: number;
  diagnosis: Diagnosis;
  evidence: string | null;
  tripId: string | null;
  selfAdded: boolean;
  /** The phone's own tracking log, sent with the report since 10 Oct 2026.
   *  Null for reports from older builds. */
  phoneLog: PhoneLogSummary | null;
}

interface PhoneLogSummary {
  rows: number;
  covered: boolean;
  dropped: number;
  line: string;
  from: string;
  to: string;
  state: Record<string, unknown> | null;
}

interface PhoneLogDetail {
  phoneLog: { from: string; to: string; oldestHeld: string | null; truncated: boolean; rows: Array<[string, string, string | null]> } | null;
  drops: Array<{ at: string; reason: string; detail: string | null; distanceMiles: number | null; coords: number | null; receivedAt: string }>;
}

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** The phone log a report carried, opened on demand: it can be a few hundred rows. */
function PhoneLogDialog({ report, onClose }: { report: Report; onClose: () => void }) {
  const { data, error, loading } = useAdminData<PhoneLogDetail>(`/admin/missing-trip-reports/${report.id}/phone-log`);
  return (
    <Dialog open onClose={onClose} wide title={`Phone log: ${report.displayName || report.email || "driver"}`}>
      {loading && <LoadingSkeleton rows={8} />}
      {error && <p className="adm-text adm-drv-tone-bad">{error}</p>}
      {data && (
        <div className="adm-drv-wrap" style={{ gap: "0.75rem" }}>
          {report.phoneLog && <p className="adm-text">{report.phoneLog.line}</p>}
          {report.phoneLog?.state && (
            <pre className="adm-drv-mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {JSON.stringify(report.phoneLog.state, null, 1)}
            </pre>
          )}
          <p className="adm-text">
            <strong>Recordings the phone dropped in this window: {data.drops.length}</strong>
          </p>
          {data.drops.map((d, i) => (
            <span key={i} className="adm-drv-mono">
              {clock(d.at)} {d.reason}
              {d.distanceMiles != null ? ` ${d.distanceMiles.toFixed(2)} mi` : ""}
              {d.coords != null ? `, ${d.coords} fixes` : ""}
              {d.detail ? ` (${d.detail})` : ""}
            </span>
          ))}
          {data.phoneLog ? (
            <>
              <p className="adm-text">
                <strong>
                  {data.phoneLog.rows.length} events, {clock(data.phoneLog.from)} to {clock(data.phoneLog.to)}
                </strong>
                {data.phoneLog.truncated ? " (busy window: the middle was left out)" : ""}
                {data.phoneLog.oldestHeld ? `. Oldest event the phone still held: ${clock(data.phoneLog.oldestHeld)}` : ""}
              </p>
              <div style={{ maxHeight: 420, overflow: "auto" }}>
                {data.phoneLog.rows.map(([at, event, payload], i) => (
                  <div key={i} className="adm-drv-mono" style={{ whiteSpace: "pre-wrap" }}>
                    {clock(at)} <strong>{event}</strong> {payload ?? ""}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="adm-text adm-drv-tone-muted">This report came from an app version that did not send a phone log.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}

const DIAGNOSIS: Record<Diagnosis, { label: string; tone: Tone; hint: string }> = {
  landed_after_report: {
    label: "Not missing, arrived after the report",
    tone: "good",
    hint: "The trip was created shortly after the report (finishing or syncing late). Nothing to recover; a push pointing at Trips closes it.",
  },
  open_recording: {
    label: "Recording still open on the phone",
    tone: "bad",
    hint: "The engine opened a recording and never closed it. The route is on the phone (detection_coordinates) and their next drive overwrites it. Ask them to open the app now; if the heartbeat is frozen at the signal, no push will arrive.",
  },
  no_addresses: {
    label: "Trip there, no addresses",
    tone: "warn",
    hint: "Both addresses are empty, so the trips list draws no route line and the drive reads as missing. Point them at the trip; consider a reverse-geocode backfill.",
  },
  head_gap: {
    label: "Trip there, start missing",
    tone: "bad",
    hint: "Start Trip path: the start time is from the tap but the trail begins later, so the first part's miles are absent. Route the gap and add it (f7ecbb4 does this for new trips).",
  },
  permission_gap: {
    label: "Permission missing",
    tone: "warn",
    hint: "Background location or Motion not granted, so the engine can't run with the app closed. Advise Always location plus Motion & Fitness, and manual entry for the missed trip.",
  },
  silent_non_capture: {
    label: "Engine never records",
    tone: "bad",
    hint: "Native engine on, permissions fine, but no recording ever opens (RNBG never reports motion). Switch the device to the JS engine from the user detail panel.",
  },
  needs_look: {
    label: "Needs a look",
    tone: "neutral",
    hint: "No playbook rule matched. Open the user's diagnostics and read the event timeline.",
  },
};

const ORDER: Diagnosis[] = ["open_recording", "head_gap", "silent_non_capture", "permission_gap", "no_addresses", "needs_look", "landed_after_report"];
const NEEDS_FIX: Diagnosis[] = ["open_recording", "head_gap", "silent_non_capture"];

function ago(iso: string | null): string {
  if (!iso) return "-";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function last30Days(reports: Report[]) {
  const counts = new Map<string, number>();
  for (const r of reports) {
    const k = dayKey(new Date(r.reportedAt));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: Array<{ date: string; count: number }> = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const k = dayKey(d);
    out.push({ date: k, count: counts.get(k) ?? 0 });
  }
  return out;
}

export default function MissingTripReportsPage() {
  const { data, error, loading, reload } = useAdminData<{ reports: Report[] }>("/admin/missing-trip-reports");
  const [filter, setFilter] = useState<string>("");
  const [logFor, setLogFor] = useState<Report | null>(null);

  const reports = data?.reports ?? null;
  const counts = useMemo(() => {
    const c = Object.fromEntries(ORDER.map((d) => [d, 0])) as Record<Diagnosis, number>;
    for (const r of reports ?? []) c[r.diagnosis] = (c[r.diagnosis] ?? 0) + 1;
    return c;
  }, [reports]);
  const needFix = NEEDS_FIX.reduce((n, d) => n + counts[d], 0);
  const selfAdded = reports?.filter((r) => r.selfAdded).length ?? 0;
  const shown = useMemo(() => (reports ?? []).filter((r) => !filter || r.diagnosis === filter), [reports, filter]);
  const kLoading = loading && !data;

  const columns: TableColumn<Report>[] = [
    {
      key: "who",
      header: "Driver",
      sortValue: (r) => (r.displayName || r.email || r.userId || "").toLowerCase(),
      render: (r) => (
        <span className="adm-drv-nowrap">
          {r.userId ? (
            <Link className="adm-drv-link" href={`/dashboard/admin/users?user=${r.userId}`}>
              {r.displayName || r.email || r.userId}
            </Link>
          ) : (
            <span className="adm-drv-strong">{r.displayName || r.email || "(deleted account)"}</span>
          )}
          {r.displayName && r.email && <span className="adm-cell-sub">{r.email}</span>}
          {r.selfAdded && (
            <span className="adm-cell-sub adm-drv-tone-warn" title="They entered a manual trip after reporting. Un-hiding or re-adding the captured one would duplicate it.">
              Added a manual trip themselves afterwards
            </span>
          )}
        </span>
      ),
    },
    {
      key: "diagnosis",
      header: "Diagnosis",
      sortValue: (r) => ORDER.indexOf(r.diagnosis),
      render: (r) => {
        const meta = DIAGNOSIS[r.diagnosis];
        return (
          <div className="adm-drv-wrap">
            <Badge tone={meta.tone} dot title={meta.hint}>{meta.label}</Badge>
            {r.evidence && (
              <span className="adm-cell-sub" style={{ whiteSpace: "normal" }}>
                {r.evidence}
                {r.tripId && <> · trip <code className="adm-drv-mono">{r.tripId.slice(0, 8)}</code></>}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "drove",
      header: "Drove",
      title: "The day they said they drove. Picked in the app since 16 Sep 2026; older reports have no date.",
      sortValue: (r) => r.reportedDate,
      render: (r) => (
        <span className={`adm-drv-nowrap${r.reportedDate ? "" : " adm-drv-tone-muted"}`}>{formatReportedDate(r.reportedDate)}</span>
      ),
    },
    {
      key: "note",
      header: "Their note",
      hideOnMobile: true,
      render: (r) => (r.note ? <div className="adm-drv-wrap adm-drv-quote">&ldquo;{r.note}&rdquo;</div> : <span className="adm-drv-tone-muted">-</span>),
    },
    {
      key: "reported",
      header: "Reported",
      sortValue: (r) => new Date(r.reportedAt).getTime(),
      render: (r) => <Ago iso={r.reportedAt} className="adm-drv-nowrap" />,
    },
    {
      key: "phone",
      header: "Phone",
      hideOnMobile: true,
      title: "From the phone's latest diagnostic and the last 4 days of trips",
      render: (r) => (
        <span className="adm-drv-nowrap" style={{ fontSize: "0.78rem" }}>
          Diagnostic {r.dumpVerdict ?? "none"} ({ago(r.dumpAt)})
          <span className="adm-cell-sub">
            Background{" "}
            <span className={r.backgroundPermission && r.backgroundPermission !== "granted" ? "adm-drv-tone-bad" : undefined}>
              {r.backgroundPermission ?? "?"}
            </span>
            {" · "}Motion{" "}
            <span className={r.motionPermission && r.motionPermission !== "granted" ? "adm-drv-tone-bad" : undefined}>{r.motionPermission ?? "?"}</span>
          </span>
          <span className="adm-cell-sub">
            {r.nativeEngine ? "ClearTrack engine" : "JS engine"} · {r.recentAutoTrips} auto trip{r.recentAutoTrips === 1 ? "" : "s"} in 4 days
          </span>
        </span>
      ),
    },
    {
      key: "phoneLog",
      header: "Phone log",
      title: "What the phone itself logged around the departure time, sent with the report (app versions from 10 Oct 2026)",
      sortValue: (r) => r.phoneLog?.rows ?? -1,
      render: (r) =>
        r.phoneLog ? (
          <div className="adm-drv-wrap">
            <span className={`adm-cell-sub${r.phoneLog.dropped > 0 || !r.phoneLog.covered ? " adm-drv-tone-warn" : ""}`} style={{ whiteSpace: "normal" }}>
              {r.phoneLog.line}
            </span>
            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setLogFor(r)}>
              Open phone log
            </button>
          </div>
        ) : (
          <span className="adm-drv-tone-muted">-</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Missing trips"
        subtitle="Drivers who tapped “Missing a trip?” in the last 30 days, each checked against their phone's latest diagnostic so the likely cause is already named."
        actions={
          <Link href="/dashboard/admin/support" className="adm-btn">
            <AdminIcon name="arrowLeft" size={14} /> Support queue
          </Link>
        }
      />

      <Grid min={170}>
        <KpiCard label="Reports, last 30 days" value={reports?.length ?? 0} tone="accent" loading={kLoading} error={error} />
        <KpiCard
          label="Need a fix from us"
          value={needFix}
          tone={reports ? (needFix > 0 ? "bad" : "good") : "neutral"}
          loading={kLoading}
          error={error}
          hint="Open recording, start missing or engine never records"
        />
        <KpiCard
          label="Not actually missing"
          value={counts.landed_after_report}
          tone="good"
          loading={kLoading}
          error={error}
          hint="The trip arrived after they reported it"
        />
        <KpiCard label="Added it themselves" value={selfAdded} loading={kLoading} error={error} hint="Entered a manual trip after reporting" />
      </Grid>

      <div className="adm-split">
        <Panel title="Reports per day" subtitle="When drivers tapped “Missing a trip?”, last 30 days.">
          <LoadState data={reports} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the reports." skeleton={<LoadingSkeleton variant="chart" height={200} />}>
            {(rs) => (
              <BarChart
                label="Missing-trip reports per day, last 30 days"
                unit="reports"
                height={200}
                partialIndex={29}
                data={last30Days(rs).map((d) => ({
                  label: formatDay(d.date, { day: "numeric", month: "short" }),
                  fullLabel: formatDay(d.date),
                  value: d.count,
                }))}
              />
            )}
          </LoadState>
        </Panel>
        <Panel title="By diagnosis" subtitle="Last 30 days. Use the filter on the reports list to see one kind.">
          <LoadState data={reports} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the reports." skeleton={<LoadingSkeleton rows={6} />}>
            {(rs) =>
              rs.length === 0 ? (
                <EmptyState compact title="No reports">Nobody has reported a missing trip in 30 days.</EmptyState>
              ) : (
                <BarList
                  label="Reports by diagnosis"
                  items={ORDER.filter((d) => counts[d] > 0).map((d) => ({ key: d, label: DIAGNOSIS[d].label, value: counts[d] }))}
                />
              )
            }
          </LoadState>
        </Panel>
      </div>

      <Panel
        highlight
        title="Reports"
        subtitle="Newest first. Hover a diagnosis for the recommended fix, or read the guide at the bottom. Click a name to open that driver."
      >
        <FilterBar>
          <SelectField
            id="mt-diagnosis"
            label="Show diagnosis"
            value={filter}
            onChange={setFilter}
            minWidth={240}
            options={[
              { value: "", label: `Every diagnosis${reports ? ` (${reports.length})` : ""}` },
              ...ORDER.map((d) => ({ value: d, label: `${DIAGNOSIS[d].label}${reports ? ` (${counts[d]})` : ""}` })),
            ]}
          />
        </FilterBar>
        <LoadState data={reports} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the reports." skeleton={<LoadingSkeleton variant="table" rows={6} />}>
          {() => (
            <DataTable
              caption="Missing-trip reports, newest first"
              columns={columns}
              rows={shown}
              rowKey={(r) => r.id}
              rowTone={(r) => (NEEDS_FIX.includes(r.diagnosis) ? "bad" : undefined)}
              maxHeight={720}
              emptyTitle={filter ? "No reports with this diagnosis" : "No reports in the last 30 days"}
              empty={filter ? undefined : "A quiet inbox means drivers are finding their trips."}
            />
          )}
        </LoadState>
      </Panel>

      {logFor && <PhoneLogDialog report={logFor} onClose={() => setLogFor(null)} />}

      <Panel title="What each diagnosis means" subtitle="The playbook rule behind each label, and what to do about it.">
        <ul className="adm-drv-guide">
          {ORDER.map((d) => (
            <li key={d}>
              <span><Badge tone={DIAGNOSIS[d].tone} dot>{DIAGNOSIS[d].label}</Badge></span>
              <p className="adm-text">{DIAGNOSIS[d].hint}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
