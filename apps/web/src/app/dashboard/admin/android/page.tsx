"use client";

// Android (Oct 2026 rebuild). One row per Android account with a one-word
// verdict, so "is Android useful yet" has a number.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ago } from "@/components/admin/Ago";
import {
  Badge,
  BarList,
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  ProgressBar,
  TabBar,
  formatNumber,
  useAdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";
import "@/components/admin/drivers/drivers.css";

type Verdict = "capturing" | "stub_fixes" | "silent" | "new" | "no_permission" | "gone";

interface Tester {
  userId: string;
  email: string;
  displayName: string | null;
  isPremium: boolean;
  createdAt: string;
  buildNumber: string | null;
  appVersion: string | null;
  osVersion: string | null;
  device: string | null;
  manufacturer: string | null;
  lastHeartbeatAt: string | null;
  lastTripAt: string | null;
  lastAutoTripAt: string | null;
  autoTrips7d: number;
  manualTrips7d: number;
  stubTrips7d: number;
  hasPushToken: boolean;
  bgLocationPermission: string | null;
  batteryIgnoring: boolean | null;
  headlessRearms: number | null;
  headlessSpeedWakes: number | null;
  dumpAt: string | null;
  verdict: Verdict;
}

interface AndroidData {
  testers: Tester[];
  totals: {
    count: number;
    withPushToken: number;
    bgGranted: number;
    batteryOptimised: number;
    capturing: number;
    stubFixes: number;
    silent: number;
    gone: number;
  };
  generatedAt: string;
}

const VERDICT: Record<Verdict, { label: string; tone: Tone; help: string }> = {
  capturing: { label: "Capturing", tone: "good", help: "Captured trips in the last 7 days with real tracks." },
  stub_fixes: {
    label: "Stub fixes",
    tone: "bad",
    help: "Captured trips exist but most have 3 points or fewer: the engine woke for a fix and never tracked (Class 34).",
  },
  silent: { label: "Silent", tone: "warn", help: "Installed over 2 days ago, permission granted, no captured trip in 7 days." },
  new: { label: "New", tone: "info", help: "Installed in the last 2 days." },
  no_permission: { label: "No permission", tone: "bad", help: "Background location is not granted." },
  gone: { label: "Gone", tone: "neutral", help: "No heartbeat for 14 days." },
};

const VERDICT_ORDER: Verdict[] = ["capturing", "stub_fixes", "silent", "no_permission", "new", "gone"];

function YesNo({ v, good }: { v: boolean | null; good: boolean }) {
  if (v === null) return <Badge>?</Badge>;
  return <Badge tone={v === good ? "good" : "bad"}>{v ? "Yes" : "No"}</Badge>;
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

export default function AdminAndroidPage() {
  const { data, error, loading, reload } = useAdminData<AndroidData>("/admin/android-testers");
  const [view, setView] = useState<"all" | Verdict>("all");

  const verdictCounts = useMemo(() => {
    const c = Object.fromEntries(VERDICT_ORDER.map((v) => [v, 0])) as Record<Verdict, number>;
    for (const t of data?.testers ?? []) c[t.verdict] = (c[t.verdict] ?? 0) + 1;
    return c;
  }, [data]);

  const rows = useMemo(() => (data?.testers ?? []).filter((t) => view === "all" || t.verdict === view), [data, view]);
  const t = data?.totals;
  const kLoading = loading && !data;

  const columns: TableColumn<Tester>[] = [
    {
      key: "who",
      header: "Tester",
      sortValue: (r) => (r.displayName ?? r.email).toLowerCase(),
      render: (r) => (
        <span className="adm-drv-nowrap">
          <Link className="adm-drv-link" href={`/dashboard/admin/users?user=${r.userId}`}>{r.displayName ?? r.email}</Link>
          {r.isPremium && (
            <>
              {" "}
              <Badge tone="accent">Pro</Badge>
            </>
          )}
          <span className="adm-cell-sub">{r.email}</span>
        </span>
      ),
    },
    {
      key: "verdict",
      header: "Verdict",
      sortValue: (r) => VERDICT_ORDER.indexOf(r.verdict),
      render: (r) => (
        <Badge tone={VERDICT[r.verdict].tone} dot title={VERDICT[r.verdict].help}>
          {VERDICT[r.verdict].label}
        </Badge>
      ),
    },
    {
      key: "device",
      header: "Phone",
      hideOnMobile: true,
      sortValue: (r) => r.device,
      render: (r) => (
        <span className="adm-drv-nowrap">
          {r.device ?? "?"}
          {r.osVersion && <span className="adm-cell-sub">Android {r.osVersion}</span>}
        </span>
      ),
    },
    {
      key: "build",
      header: "Build",
      hideOnMobile: true,
      sortValue: (r) => Number(r.buildNumber) || 0,
      render: (r) => <span className="adm-drv-nowrap">{`${r.appVersion ?? "?"} (${r.buildNumber ?? "?"})`}</span>,
    },
    {
      key: "trips",
      header: "Captured / stub / manual (7 days)",
      numeric: true,
      sortValue: (r) => r.autoTrips7d,
      render: (r) => <span className="adm-drv-nowrap">{`${r.autoTrips7d} / ${r.stubTrips7d} / ${r.manualTrips7d}`}</span>,
    },
    {
      key: "bg",
      header: "Background",
      hideOnMobile: true,
      sortValue: (r) => r.bgLocationPermission,
      render: (r) => (
        <Badge tone={r.bgLocationPermission === "granted" ? "good" : r.bgLocationPermission ? "bad" : "neutral"}>{r.bgLocationPermission ?? "?"}</Badge>
      ),
    },
    {
      key: "battery",
      header: "Battery exempt",
      hideOnMobile: true,
      title: "Whether the app is exempt from battery optimisation, from the last diagnostic.",
      sortValue: (r) => (r.batteryIgnoring === null ? null : r.batteryIgnoring ? 1 : 0),
      render: (r) => <YesNo v={r.batteryIgnoring} good={true} />,
    },
    {
      key: "push",
      header: "Push",
      hideOnMobile: true,
      sortValue: (r) => (r.hasPushToken ? 1 : 0),
      render: (r) => <YesNo v={r.hasPushToken} good={true} />,
    },
    {
      key: "headless",
      header: "Re-arms / speed wakes",
      title:
        "From the diagnostic's activity summary: how often the background task re-armed the stationary region, and how often it woke the engine on a driving-speed fix.",
      numeric: true,
      hideOnMobile: true,
      sortValue: (r) => r.headlessRearms,
      render: (r) => `${r.headlessRearms ?? "-"} / ${r.headlessSpeedWakes ?? "-"}`,
    },
    { key: "hb", header: "Last heartbeat", sortValue: (r) => time(r.lastHeartbeatAt), render: (r) => <Ago iso={r.lastHeartbeatAt} className="adm-drv-nowrap" /> },
    {
      key: "auto",
      header: "Last captured trip",
      hideOnMobile: true,
      sortValue: (r) => time(r.lastAutoTripAt),
      render: (r) => <Ago iso={r.lastAutoTripAt} className="adm-drv-nowrap" />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Android"
        subtitle="Every account that has signed in from Android, with a one-word verdict from the last 7 days of trips, the permission reading and the latest diagnostic."
        updatedAt={data?.generatedAt}
      />

      <Grid min={150}>
        <KpiCard label="Android accounts" value={t?.count ?? 0} tone="accent" loading={kLoading} error={error} />
        <KpiCard label="Capturing" value={t?.capturing ?? 0} tone="good" loading={kLoading} error={error} hint={VERDICT.capturing.help} />
        <KpiCard label="Stub fixes" value={t?.stubFixes ?? 0} tone={t?.stubFixes ? "bad" : "neutral"} loading={kLoading} error={error} hint="Woke for a fix, never tracked" />
        <KpiCard label="Silent" value={t?.silent ?? 0} tone={t?.silent ? "warn" : "neutral"} loading={kLoading} error={error} hint="No captured trip in 7 days" />
        <KpiCard label="Gone" value={t?.gone ?? 0} loading={kLoading} error={error} hint="No heartbeat for 14 days" />
      </Grid>

      <div className="adm-split">
        <Panel title="Verdicts" subtitle="Where every Android account stands. Hover a verdict in the table for what it means.">
          <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the Android verdicts." skeleton={<LoadingSkeleton rows={6} />}>
            {(d) =>
              d.testers.length === 0 ? (
                <p className="adm-text">No Android accounts yet.</p>
              ) : (
                <BarList
                  label="Android accounts by verdict"
                  max={Math.max(1, d.testers.length)}
                  items={VERDICT_ORDER.map((v) => ({
                    key: v,
                    label: VERDICT[v].label,
                    value: verdictCounts[v],
                    note: `${Math.round((verdictCounts[v] / d.testers.length) * 100)}%`,
                  }))}
                />
              )
            }
          </LoadState>
        </Panel>
        <Panel title="Set up to capture" subtitle="What the phones report about the settings capture depends on.">
          <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the Android settings." skeleton={<LoadingSkeleton rows={6} />}>
            {(d) => {
              const n = Math.max(1, d.totals.count);
              return (
                <div className="adm-drv-stack">
                  <ProgressBar
                    label="Background location granted"
                    value={d.totals.bgGranted}
                    max={n}
                    tone="good"
                    valueLabel={`${formatNumber(d.totals.bgGranted)} of ${formatNumber(d.totals.count)}`}
                  />
                  <ProgressBar
                    label="Have a push token"
                    value={d.totals.withPushToken}
                    max={n}
                    tone="info"
                    valueLabel={`${formatNumber(d.totals.withPushToken)} of ${formatNumber(d.totals.count)}`}
                  />
                  <ProgressBar
                    label="Still battery-optimised"
                    value={d.totals.batteryOptimised}
                    max={n}
                    tone={d.totals.batteryOptimised ? "warn" : "good"}
                    valueLabel={`${formatNumber(d.totals.batteryOptimised)} of ${formatNumber(d.totals.count)}`}
                  />
                  <p className="adm-note">Battery and the background-task counts come from the phone&apos;s last diagnostic, so they can lag.</p>
                </div>
              );
            }}
          </LoadState>
        </Panel>
      </div>

      <Panel
        highlight
        flush
        title="Testers"
        subtitle="Sorted by last heartbeat. Click a name to open the driver. Click a column heading to re-sort."
        actions={
          <TabBar
            label="Filter by verdict"
            size="sm"
            value={view}
            onChange={(v) => setView(v as "all" | Verdict)}
            tabs={[
              { id: "all", label: "All", count: data?.testers.length },
              ...VERDICT_ORDER.filter((v) => !data || verdictCounts[v] > 0).map((v) => ({ id: v, label: VERDICT[v].label, count: data ? verdictCounts[v] : undefined })),
            ]}
          />
        }
      >
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load the Android testers."
          skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={8} /></div>}
        >
          {() => (
            <DataTable
              caption="Android accounts and their capture verdict"
              columns={columns}
              rows={rows}
              rowKey={(r) => r.userId}
              rowTone={(r) => (r.verdict === "stub_fixes" || r.verdict === "no_permission" ? "bad" : undefined)}
              maxHeight={720}
              emptyTitle={view === "all" ? "No Android accounts yet" : "Nobody with this verdict"}
            />
          )}
        </LoadState>
      </Panel>
    </>
  );
}
