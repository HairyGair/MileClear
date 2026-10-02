"use client";

// Activation health. The question this page answers is the one the topline
// hides: who is running MileClear and getting nothing from it, and why.
// Reads /admin/activation-health (fixed window, no date range). Permission is
// the heartbeat's value unless the diagnostic dump is newer, in which case
// the dump wins.

import { useState } from "react";
import { Ago } from "@/components/admin/Ago";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import {
  Badge,
  BarChart,
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  StatLine,
  TabBar,
  formatDay,
  formatNumber,
  formatShare,
  useAdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";

interface Row {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastHeartbeatAt: string | null;
  heartbeatPermission: string | null;
  effectivePermission: string;
  permissionSource: "heartbeat" | "dump";
  lastTripAt: string | null;
  trips14d: number;
  autoTrips14d: number;
  tripsLifetime: number;
  hasPushToken: boolean;
  build: string | null;
  lastNudgedAt: string | null;
}

interface GaveUpRow {
  userId: string;
  email: string;
  displayName: string | null;
  gaveUpAt: string;
  lastHeartbeatAt: string | null;
  hasPushToken: boolean;
  build: string | null;
}

interface OtaRow {
  runtime: string;
  devices: number;
  embedded: number;
  updates: Array<{ updateId: string; devices: number; publishedAt: string | null }>;
}

interface Data {
  windowDays: number;
  fleet: number;
  permission: Record<string, number>;
  cannotCapture: number;
  cannotCapturePct: number;
  capturingAnyway: number;
  capturingAnywayRows: Row[];
  dumpOverrides: number;
  silent: { total: number; never: number; lapsed: number; neverRows: Row[]; lapsedRows: Row[] };
  needsPermission: Row[];
  dailyPermissionMissing: Array<{ date: string; users: number }>;
  gaveUp24h: { total: number; recovered: number; asleep: number; aliveAndSilentCount: number; aliveAndSilent: GaveUpRow[] };
  ota: OtaRow[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function UserCell({ name, email }: { name: string | null; email: string }) {
  return (
    <>
      <span style={{ color: "var(--adm-text-strong)" }}>{name || email}</span>
      {name && <span className="adm-cell-sub">{email}</span>}
    </>
  );
}

function permissionTone(p: string): Tone {
  if (p === "granted") return "good";
  if (p === "denied") return "bad";
  return "warn";
}

function PermissionBadge({ row }: { row: Row }) {
  const p = row.effectivePermission;
  return (
    <Badge
      tone={permissionTone(p)}
      title={
        row.permissionSource === "dump"
          ? `From a diagnostic dump newer than the heartbeat (heartbeat said ${row.heartbeatPermission ?? "unknown"})`
          : "From the latest heartbeat"
      }
    >
      {p}
      {row.permissionSource === "dump" ? " (dump)" : ""}
    </Badge>
  );
}

function Reachable({ push }: { push: boolean }) {
  return push ? (
    <Badge tone="good">Push</Badge>
  ) : (
    <Badge tone="bad" title="No push token: email is the only channel">
      No push
    </Badge>
  );
}

function userColumns(showTrips: boolean): TableColumn<Row>[] {
  const cols: TableColumn<Row>[] = [
    { key: "user", header: "Driver", sortValue: (r) => r.displayName || r.email, render: (r) => <UserCell name={r.displayName} email={r.email} /> },
    { key: "created", header: "Signed up", sortValue: (r) => r.createdAt, render: (r) => <Ago iso={r.createdAt} />, hideOnMobile: true },
    { key: "heartbeat", header: "Heartbeat", sortValue: (r) => r.lastHeartbeatAt, render: (r) => <Ago iso={r.lastHeartbeatAt} />, hideOnMobile: true },
    { key: "perm", header: "Background location", sortValue: (r) => r.effectivePermission, render: (r) => <PermissionBadge row={r} /> },
  ];
  if (showTrips) {
    cols.push(
      { key: "lifetime", header: "Trips (lifetime)", numeric: true, sortValue: (r) => r.tripsLifetime, render: (r) => formatNumber(r.tripsLifetime) },
      {
        key: "auto14",
        header: "Auto trips (14d)",
        numeric: true,
        title: "Auto-captured, non-phantom trips started in the window",
        sortValue: (r) => r.autoTrips14d,
        render: (r) => (r.autoTrips14d > 0 ? <Badge tone="good">{formatNumber(r.autoTrips14d)}</Badge> : <span style={{ color: "var(--adm-text-3)" }}>0</span>),
      }
    );
  }
  cols.push(
    { key: "lastTrip", header: "Last trip", sortValue: (r) => r.lastTripAt, render: (r) => <Ago iso={r.lastTripAt} /> },
    { key: "build", header: "Build", sortValue: (r) => r.build, render: (r) => r.build ?? "-", hideOnMobile: true },
    { key: "push", header: "Reachable", sortValue: (r) => (r.hasPushToken ? 1 : 0), render: (r) => <Reachable push={r.hasPushToken} />, hideOnMobile: true },
    {
      key: "nudged",
      header: "Last nudged",
      sortValue: (r) => r.lastNudgedAt,
      render: (r) => (r.lastNudgedAt ? <Ago iso={r.lastNudgedAt} /> : <span style={{ color: "var(--adm-text-3)" }}>never</span>),
      hideOnMobile: true,
    }
  );
  return cols;
}

const gaveUpColumns: TableColumn<GaveUpRow>[] = [
  { key: "user", header: "Driver", sortValue: (r) => r.displayName || r.email, render: (r) => <UserCell name={r.displayName} email={r.email} /> },
  { key: "gaveUp", header: "Gave up", sortValue: (r) => r.gaveUpAt, render: (r) => <Ago iso={r.gaveUpAt} /> },
  { key: "heartbeat", header: "Heartbeat", sortValue: (r) => r.lastHeartbeatAt, render: (r) => <Ago iso={r.lastHeartbeatAt} /> },
  { key: "build", header: "Build", sortValue: (r) => r.build, render: (r) => r.build ?? "-", hideOnMobile: true },
  { key: "push", header: "Reachable", sortValue: (r) => (r.hasPushToken ? 1 : 0), render: (r) => <Reachable push={r.hasPushToken} /> },
];

const otaColumns: TableColumn<OtaRow>[] = [
  { key: "runtime", header: "Runtime", sortValue: (r) => r.runtime, render: (r) => <strong style={{ color: "var(--adm-text-strong)" }}>{r.runtime}</strong> },
  { key: "devices", header: "Devices", numeric: true, sortValue: (r) => r.devices, render: (r) => formatNumber(r.devices) },
  { key: "embedded", header: "Embedded", numeric: true, title: "Running the bundle the store shipped", sortValue: (r) => r.embedded, render: (r) => formatNumber(r.embedded) },
  {
    key: "onOta",
    header: "On an OTA",
    numeric: true,
    sortValue: (r) => r.devices - r.embedded,
    render: (r) => (
      <>
        {formatNumber(r.devices - r.embedded)}
        {r.devices > 0 && <span className="adm-cell-sub">{formatShare(r.devices - r.embedded, r.devices)}</span>}
      </>
    ),
  },
  {
    key: "updates",
    header: "Updates",
    render: (r) =>
      r.updates.length === 0 ? (
        <span style={{ color: "var(--adm-text-3)" }}>none</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {r.updates.map((u) => (
            <span key={u.updateId} title={u.updateId} style={{ whiteSpace: "nowrap" }}>
              <code style={{ fontSize: "0.75rem" }}>{u.updateId.slice(0, 8)}</code>, {formatNumber(u.devices)} device{u.devices === 1 ? "" : "s"}
              {u.publishedAt && (
                <span style={{ color: "var(--adm-text-3)" }}>
                  , published <Ago iso={u.publishedAt} />
                </span>
              )}
            </span>
          ))}
        </div>
      ),
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ListKey = "lapsed" | "never" | "needs" | "anyway" | "gaveup";

export default function ActivationPage() {
  const { data, error, loading, reload } = useAdminData<Data>("/admin/activation-health");
  const [list, setList] = useState<ListKey>("needs");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const kpiLoading = loading && !data;
  const windowDays = data?.windowDays ?? 14;

  const LIST_INFO: Record<ListKey, { title: string; text: string }> = {
    needs: {
      title: "Needs the permission fixed",
      text: "Active fleet with background location not granted and no auto-captured trip in the window, most valuable first. \"Last nudged\" is the most recent capture_lapsed or activation_d7 push in 60 days; never means no automated nudge has reached them.",
    },
    lapsed: {
      title: "Used to record, then stopped",
      text: "Heartbeat in the window, zero trips of any kind in it, but they have recorded before. Listed by how much they used to record.",
    },
    never: {
      title: "Never recorded a trip",
      text: "Heartbeat in the window and no trip ever.",
    },
    anyway: {
      title: "Reads not granted, capturing anyway",
      text: "The reading and the outcome disagree, and the outcome wins: these phones captured auto trips in the window. Do not nudge them to flip a switch. The capture_lapsed job skips anyone who has captured under their current reading before.",
    },
    gaveup: {
      title: "Watchdog gave up, phone alive, no trip",
      text: "The phone has reported since the watchdog gave up in the last 24 hours, and no trip has been saved.",
    },
  };

  return (
    <>
      <PageHeader
        title="Activation health"
        subtitle="Who is running MileClear and getting nothing from it, and why. Fleet trip volume can rise while every number here gets worse, which is why this page exists."
        updatedAt={data?.generatedAt}
      />

      <Grid min={150}>
        <KpiCard label="Active fleet" value={data?.fleet ?? 0} loading={kpiLoading} error={error} hint={`Heartbeat in the last ${windowDays} days`} />
        <KpiCard
          label="Cannot capture"
          value={data ? `${formatNumber(data.cannotCapture)} (${data.cannotCapturePct}%)` : 0}
          tone={data && data.cannotCapturePct >= 20 ? "bad" : "warn"}
          loading={kpiLoading}
          error={error}
          hint="Not granted, no auto trip in the window"
        />
        <KpiCard label="Capturing anyway" value={data?.capturingAnyway ?? 0} tone="good" loading={kpiLoading} error={error} hint="Not granted, but auto trips in the window" />
        <KpiCard label="Granted" value={data?.permission.granted ?? 0} tone="good" loading={kpiLoading} error={error} />
        <KpiCard label="Undetermined" value={data?.permission.undetermined ?? 0} tone="warn" loading={kpiLoading} error={error} hint="Never asked, dismissed, or While Using" />
        <KpiCard label="Denied" value={data?.permission.denied ?? 0} tone="bad" loading={kpiLoading} error={error} />
        <KpiCard label="Dump overrode heartbeat" value={data?.dumpOverrides ?? 0} loading={kpiLoading} error={error} hint="A newer dump disagreed" />
      </Grid>

      <div className="adm-split">
        <Panel
          title="Drivers told background location is missing, per day"
          subtitle="Distinct drivers whose phone fired alert.permission_missing each day."
          footer={`"Cannot capture" is judged by outcome: not granted AND no auto-captured trip in the last ${windowDays} days. On iPhone the reading says "undetermined" for While Using as well as never asked, and While Using drivers who open the app before setting off capture fine, so a not-granted reading with captures behind it is counted under "Capturing anyway" instead. Background location comes from the heartbeat unless the diagnostic dump is newer.`}
        >
          <LoadState
            data={data}
            loading={loading}
            error={error}
            onRetry={reload}
            errorTitle="Couldn't load activation health."
            skeleton={<LoadingSkeleton variant="chart" height={200} />}
          >
            {(d) =>
              d.dailyPermissionMissing.length === 0 ? (
                <p className="adm-text">No permission alerts in the window.</p>
              ) : (
                <BarChart
                  label="Drivers firing alert.permission_missing per day"
                  unit="drivers"
                  height={200}
                  data={d.dailyPermissionMissing.map((x) => ({
                    label: formatDay(x.date, { day: "numeric", month: "short" }),
                    fullLabel: formatDay(x.date),
                    value: x.users,
                  }))}
                />
              )
            }
          </LoadState>
        </Panel>

        <Panel
          title="Watchdog gave up, last 24 hours"
          subtitle="The raw count is mostly sleeping phones. Alive and silent is the group that matters."
        >
          <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the watchdog figures.">
            {(d) => (
              <div className="adm-hub">
                <div className="adm-hub__row">
                  <div className="adm-figure">
                    <span className="adm-figure__value">{formatNumber(d.gaveUp24h.aliveAndSilent.length)}</span>
                    <span className="adm-figure__label">alive and silent</span>
                  </div>
                  <Badge tone={d.gaveUp24h.aliveAndSilent.length > 0 ? "bad" : "good"} dot size="md">
                    {d.gaveUp24h.aliveAndSilent.length > 0 ? "Needs a look" : "None"}
                  </Badge>
                </div>
                <div>
                  <StatLine label="Gave up" value={formatNumber(d.gaveUp24h.total)} />
                  <StatLine label="Recovered" hint="A trip landed afterwards" value={formatNumber(d.gaveUp24h.recovered)} />
                  <StatLine label="Asleep" hint="No heartbeat since" value={formatNumber(d.gaveUp24h.asleep)} />
                </div>
              </div>
            )}
          </LoadState>
        </Panel>
      </div>

      <Panel
        highlight
        title={LIST_INFO[list].title}
        subtitle={LIST_INFO[list].text}
        footer={
          data ? (
            <>
              Running the app, recording nothing: {formatNumber(data.silent.total)} ({formatNumber(data.silent.lapsed)} used to record and stopped, {formatNumber(data.silent.never)} never have). Click a driver to open their account.
            </>
          ) : undefined
        }
      >
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load the driver lists."
          skeleton={<LoadingSkeleton variant="table" rows={8} />}
        >
          {(d) => (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s3)", minWidth: 0 }}>
              <TabBar
                label="Which drivers"
                size="sm"
                value={list}
                onChange={(v) => setList(v as ListKey)}
                tabs={[
                  { id: "needs", label: "Needs permission", count: d.needsPermission.length },
                  { id: "lapsed", label: "Stopped recording", count: d.silent.lapsed },
                  { id: "never", label: "Never recorded", count: d.silent.never },
                  { id: "anyway", label: "Capturing anyway", count: d.capturingAnyway },
                  { id: "gaveup", label: "Alive and silent", count: d.gaveUp24h.aliveAndSilent.length },
                ]}
              />
              {list === "gaveup" ? (
                <DataTable
                  caption="Watchdog gave up, phone alive, no trip since"
                  columns={gaveUpColumns}
                  rows={d.gaveUp24h.aliveAndSilent}
                  rowKey={(r) => r.userId}
                  onRowClick={(r) => setDetailUserId(r.userId)}
                  maxHeight={560}
                  emptyTitle="Nobody in this group right now"
                />
              ) : (
                <DataTable
                  caption={LIST_INFO[list].title}
                  columns={userColumns(list !== "never")}
                  rows={
                    list === "needs"
                      ? d.needsPermission
                      : list === "lapsed"
                        ? d.silent.lapsedRows
                        : list === "never"
                          ? d.silent.neverRows
                          : d.capturingAnywayRows
                  }
                  rowKey={(r) => r.userId}
                  onRowClick={(r) => setDetailUserId(r.userId)}
                  maxHeight={560}
                  emptyTitle="Nobody in this group right now"
                />
              )}
            </div>
          )}
        </LoadState>
      </Panel>

      <Panel
        title="What each app version is actually running"
        subtitle={`From diagnostic dumps in the last ${windowDays} days. Embedded is the bundle the store shipped; an update id is an over-the-air update group.`}
        flush
      >
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load the OTA breakdown."
          skeleton={<LoadingSkeleton variant="table" rows={4} />}
        >
          {(d) => (
            <DataTable
              caption="Devices per runtime, embedded bundle against OTA updates"
              columns={otaColumns}
              rows={d.ota}
              rowKey={(r) => r.runtime}
              initialSort={{ key: "devices", dir: "desc" }}
              emptyTitle="No diagnostic dumps in the window"
            />
          )}
        </LoadState>
      </Panel>

      <UserDetailModal userId={detailUserId} open={!!detailUserId} onClose={() => setDetailUserId(null)} />
    </>
  );
}
