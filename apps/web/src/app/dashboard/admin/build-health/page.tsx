"use client";

// Build health (Oct 2026 rebuild on the admin kit). Per-build regression
// detection: the most recent active builds with incident rates per active
// user, and a flag where a build is clearly worse than the one before it.
// Reads /admin/build-health.

import {
  Badge,
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  formatNumber,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";

interface BuildRow {
  appVersion: string;
  buildNumber: string;
  activeUsers: number;
  userDays: number;
  firstSeenAt: string | null;
  daysObserved: number;
  watchdogPingsPerUserWeek: number;
  reconciliationDriftPerUserWeek: number;
  slowRequestsPerUserWeek: number;
  loginFailuresPerUserWeek: number;
  watchdogPings: number;
  reconciliationDrift: number;
  slowRequests: number;
  loginFailures: number;
  passwordChangeFailures: number;
  tripCreated: number;
  tripDeleted: number;
  tripDeletionRatePct: number;
  idempotencyReplays: number;
}

interface BuildHealthData {
  windowDays: number;
  builds: BuildRow[];
  generatedAt: string;
}

// A build is flagged when its per-user rate is at least this multiple of the
// previous build's AND the absolute count is not trivial.
const REGRESSION_MULTIPLIER = 1.5;
const MIN_INCIDENT_FLOOR = 2;

type Verdict = "ok" | "warn" | "regress";

function regressionTone(current: number, previous: number | null, absolute: number): Verdict {
  if (absolute < MIN_INCIDENT_FLOOR) return "ok";
  if (previous === null || previous === 0) {
    // Going from 0 to above the floor IS a regression.
    return absolute >= MIN_INCIDENT_FLOOR ? "regress" : "ok";
  }
  const ratio = current / previous;
  if (ratio >= REGRESSION_MULTIPLIER) return "regress";
  if (ratio >= 1.2) return "warn";
  return "ok";
}

function fmtRate(n: number): string {
  if (n === 0) return "0";
  if (n < 0.01) return n.toFixed(3);
  return n.toFixed(2);
}

/** Each row carries the build after it (the previous release) so the cells
 *  can compare without looking the neighbour up again. */
interface Row extends BuildRow {
  key: string;
  isLatest: boolean;
  prev: BuildRow | null;
}

const RATE_FIELDS = [
  { key: "watchdog", header: "Watchdog pings", rate: "watchdogPingsPerUserWeek", abs: "watchdogPings", title: "Server watchdog wake-ups per active user per week" },
  { key: "drift", header: "Reconciliation drift", rate: "reconciliationDriftPerUserWeek", abs: "reconciliationDrift", title: "Phone and server disagreeing about trips, per active user per week" },
  { key: "slow", header: "Slow requests", rate: "slowRequestsPerUserWeek", abs: "slowRequests", title: "Slow API requests per active user per week" },
  { key: "login", header: "Login failures", rate: "loginFailuresPerUserWeek", abs: "loginFailures", title: "Failed logins per active user per week" },
] as const;

function verdictsFor(r: Row): Verdict[] {
  const out: Verdict[] = RATE_FIELDS.map((f) => regressionTone(r[f.rate], r.prev ? r.prev[f.rate] : null, r[f.abs]));
  out.push(regressionTone(r.tripDeletionRatePct, r.prev?.tripDeletionRatePct ?? null, r.tripDeleted));
  return out;
}

function VerdictCell({ value, verdict, title }: { value: string; verdict: Verdict; title: string }) {
  return (
    <span title={title} style={{ display: "inline-flex", gap: "var(--adm-s2)", alignItems: "center", justifyContent: "flex-end" }}>
      {verdict === "regress" && <Badge tone="bad">Worse</Badge>}
      {verdict === "warn" && <Badge tone="warn">Up</Badge>}
      <span style={verdict === "regress" ? { fontWeight: 700, color: "var(--adm-text-strong)" } : undefined}>{value}</span>
    </span>
  );
}

function columns(windowDays: number): TableColumn<Row>[] {
  return [
    {
      key: "build",
      header: "Build",
      render: (r) => (
        <>
          <strong style={{ color: "var(--adm-text-strong)" }}>{r.appVersion}</strong>
          <span className="adm-cell-sub">
            build {r.buildNumber} {r.isLatest && <Badge tone="accent">Latest</Badge>}
          </span>
        </>
      ),
    },
    { key: "users", header: "Active users", numeric: true, render: (r) => formatNumber(r.activeUsers) },
    {
      key: "userDays",
      header: "User-days",
      numeric: true,
      title: "Exposure: distinct (user, day) pairs with events on this build in the window",
      hideOnMobile: true,
      render: (r) => (
        <span
          title={`Distinct (user, day) pairs with events on this build in the window. First seen ${
            r.firstSeenAt ? new Date(r.firstSeenAt).toLocaleString("en-GB") : "n/a"
          }; observed ${r.daysObserved} of ${windowDays} days.`}
        >
          {formatNumber(r.userDays)}
          {r.daysObserved < windowDays && <span className="adm-cell-sub">{r.daysObserved} of {windowDays} days</span>}
        </span>
      ),
    },
    ...RATE_FIELDS.map<TableColumn<Row>>((f) => ({
      key: f.key,
      header: (
        <>
          {f.header}
          <span className="adm-cell-sub">per user-week</span>
        </>
      ),
      title: f.title,
      numeric: true,
      render: (r) => {
        const prev = r.prev ? r.prev[f.rate] : null;
        return (
          <VerdictCell
            value={fmtRate(r[f.rate])}
            verdict={regressionTone(r[f.rate], prev, r[f.abs])}
            title={`Absolute: ${r[f.abs]}. Previous build per user-week: ${prev ?? "n/a"}`}
          />
        );
      },
    })),
    { key: "created", header: "Trips created", numeric: true, hideOnMobile: true, render: (r) => formatNumber(r.tripCreated) },
    { key: "deleted", header: "Trips deleted", numeric: true, hideOnMobile: true, render: (r) => formatNumber(r.tripDeleted) },
    {
      key: "delPct",
      header: "Deleted share",
      numeric: true,
      title: "Trips deleted as a share of trips created on this build",
      render: (r) => (
        <VerdictCell
          value={`${r.tripDeletionRatePct}%`}
          verdict={regressionTone(r.tripDeletionRatePct, r.prev?.tripDeletionRatePct ?? null, r.tripDeleted)}
          title={`${r.tripDeleted} deleted. Previous build: ${r.prev ? `${r.prev.tripDeletionRatePct}%` : "n/a"}`}
        />
      ),
    },
    {
      key: "replays",
      header: "Duplicate saves caught",
      numeric: true,
      hideOnMobile: true,
      title: "Idempotency replays: the phone sent the same save twice and the server returned the first result",
      render: (r) => formatNumber(r.idempotencyReplays),
    },
  ];
}

export default function BuildHealthPage() {
  const { data, error, loading, reload } = useAdminData<BuildHealthData>("/admin/build-health");

  const rows: Row[] = data
    ? data.builds.map((b, i) => ({ ...b, key: `${b.appVersion}-${b.buildNumber}`, isLatest: i === 0, prev: data.builds[i + 1] ?? null }))
    : [];
  const latest = rows[0];
  const flagged = rows.filter((r) => verdictsFor(r).includes("regress"));
  const latestFlags = latest ? verdictsFor(latest).filter((v) => v === "regress").length : 0;

  return (
    <>
      <PageHeader
        title="Build health"
        subtitle={`Did the latest app build make things worse? Builds active in the last ${data?.windowDays ?? 7} days, with problems counted per active user.`}
        updatedAt={data?.generatedAt}
        actions={
          <button type="button" className="adm-btn adm-btn--sm" onClick={reload} disabled={loading}>
            {loading ? "Refreshing" : "Refresh"}
          </button>
        }
      />

      <Grid min={170}>
        <KpiCard label="Builds in use" value={rows.length} loading={loading && !data} error={error} hint={data ? `with a heartbeat in the last ${data.windowDays} days` : undefined} />
        <KpiCard
          label="Latest build"
          value={latest ? `${latest.appVersion} (${latest.buildNumber})` : "-"}
          loading={loading && !data}
          error={error}
          hint={latest ? `${formatNumber(latest.activeUsers)} active users` : undefined}
        />
        <KpiCard
          label="Latest build: measures worse"
          value={latestFlags}
          tone={latestFlags > 0 ? "bad" : "good"}
          loading={loading && !data}
          error={error}
          hint={latest ? (latestFlags > 0 ? "worse than the build before it" : "nothing worse than the build before") : undefined}
        />
        <KpiCard
          label="Builds with a flag"
          value={flagged.length}
          tone={flagged.length > 0 ? "warn" : "neutral"}
          loading={loading && !data}
          error={error}
          hint="any measure worse than the build before"
        />
      </Grid>

      <Panel
        highlight
        title="Every active build, newest first"
        subtitle={`"Worse" means the rate is at least ${REGRESSION_MULTIPLIER} times the previous build's (and at least ${MIN_INCIDENT_FLOOR} events): the "we shipped a bug" signal. "Up" means at least 1.2 times.`}
        flush
        footer="An active build has at least one heartbeat in the window. Hover a figure for the absolute count and the previous build's rate."
      >
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load build health."
          skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={6} /></div>}
        >
          {(d) => (
            <DataTable
              caption="Incident rates per active build"
              columns={columns(d.windowDays)}
              rows={rows}
              rowKey={(r) => r.key}
              rowTone={(r) => (verdictsFor(r).includes("regress") ? "bad" : undefined)}
              emptyTitle={`No builds with a heartbeat in the last ${d.windowDays} days`}
            />
          )}
        </LoadState>
      </Panel>
    </>
  );
}
