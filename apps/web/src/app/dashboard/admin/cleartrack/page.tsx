"use client";

// ClearTrack (Oct 2026 rebuild). The web twin of the #founder
// silent-non-capture monitor: every native-engine device with its capture
// counts (recent vs baseline), latest-dump trigger signature, and a "silent"
// flag for previously-active drivers whose engine has stopped capturing while
// self-reporting healthy (the Norman Boomer class, 10 Jun 2026: RNBG never
// reports motion, no recording ever opens).

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
  TabBar,
  formatNumber,
  useAdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";
import "@/components/admin/drivers/drivers.css";

interface DeviceRow {
  userId: string;
  email: string;
  displayName: string | null;
  verdict: string;
  dumpAt: string;
  runtime: string | null;
  backgroundPermission: string;
  motionPermission: string;
  recentAutoTrips: number;
  baselineAutoTrips: number;
  lastAutoTripAt: string | null;
  motionChanges24h: number;
  recordingStarts24h: number;
  speedStarts24h: number;
  silent: boolean;
}

interface HealthData {
  recentWindowDays: number;
  baselineMinTrips: number;
  nativeDevices: number;
  silentCount: number;
  devices: DeviceRow[];
  generatedAt: string;
}

function verdictTone(v: string): Tone {
  if (v === "error") return "bad";
  if (v === "warning") return "warn";
  if (v === "healthy") return "good";
  return "neutral";
}

const motionOnly = (d: DeviceRow) => d.motionChanges24h > 0 && d.recordingStarts24h === 0 && d.speedStarts24h === 0;
const missingPermission = (d: DeviceRow) => d.backgroundPermission !== "granted" || d.motionPermission !== "granted";

type View = "all" | "silent" | "motion" | "permission";

export default function ClearTrackHealthPage() {
  const { data, error, loading, reload } = useAdminData<HealthData>("/admin/cleartrack-health");
  const [view, setView] = useState<View>("all");

  const derived = useMemo(() => {
    const devices = data?.devices ?? [];
    const verdicts = new Map<string, number>();
    for (const d of devices) verdicts.set(d.verdict, (verdicts.get(d.verdict) ?? 0) + 1);
    return {
      motion: devices.filter(motionOnly).length,
      permission: devices.filter(missingPermission).length,
      verdicts: [...verdicts.entries()].map(([k, v]) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), value: v })),
    };
  }, [data]);

  const rows = useMemo(() => {
    const devices = data?.devices ?? [];
    if (view === "silent") return devices.filter((d) => d.silent);
    if (view === "motion") return devices.filter(motionOnly);
    if (view === "permission") return devices.filter(missingPermission);
    return devices;
  }, [data, view]);

  const recent = data?.recentWindowDays ?? 4;
  const baseline = data?.baselineMinTrips ?? 4;
  const kLoading = loading && !data;

  const columns: TableColumn<DeviceRow>[] = [
    {
      key: "who",
      header: "Driver",
      sortValue: (d) => (d.displayName || d.email).toLowerCase(),
      render: (d) => (
        <span className="adm-drv-nowrap">
          <Link className="adm-drv-link" href={`/dashboard/admin/users?user=${d.userId}`}>{d.displayName || d.email}</Link>
          {d.displayName && <span className="adm-cell-sub">{d.email}</span>}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (d) => (d.silent ? 0 : d.verdict === "error" ? 1 : d.verdict === "warning" ? 2 : 3),
      render: (d) =>
        d.silent ? (
          <Badge tone="bad" dot title="Was capturing, now nothing, while the phone says it is fine">Silent</Badge>
        ) : (
          <Badge tone={verdictTone(d.verdict)} dot title="The phone's own verdict from its last diagnostic">
            {d.verdict.charAt(0).toUpperCase() + d.verdict.slice(1)}
          </Badge>
        ),
    },
    {
      key: "trips",
      header: `Captured trips (${recent} days / prior 14)`,
      numeric: true,
      sortValue: (d) => d.recentAutoTrips,
      render: (d) => (
        <span className={d.recentAutoTrips === 0 && d.baselineAutoTrips > 0 ? "adm-drv-tone-bad" : undefined}>
          {formatNumber(d.recentAutoTrips)} / {formatNumber(d.baselineAutoTrips)}
        </span>
      ),
    },
    {
      key: "last",
      header: "Last captured trip",
      sortValue: (d) => (d.lastAutoTripAt ? new Date(d.lastAutoTripAt).getTime() : 0),
      render: (d) => <Ago iso={d.lastAutoTripAt} className="adm-drv-nowrap" />,
    },
    {
      key: "signature",
      header: "Motion → recording → speed (24h)",
      title:
        "native_motionchange → native_recording_started → native_force_start_from_speed in the last 24 hours of the diagnostic. Motion without recordings means the engine wakes but never opens a trip.",
      numeric: true,
      hideOnMobile: true,
      sortValue: (d) => d.motionChanges24h,
      render: (d) => (
        <span className={motionOnly(d) ? "adm-drv-tone-warn adm-drv-nowrap" : "adm-drv-nowrap"}>
          {d.motionChanges24h} → {d.recordingStarts24h} → {d.speedStarts24h}
        </span>
      ),
    },
    {
      key: "perms",
      header: "Permissions",
      hideOnMobile: true,
      sortValue: (d) => (missingPermission(d) ? 0 : 1),
      render: (d) => (
        <span className="adm-drv-nowrap">
          <span className={d.backgroundPermission === "granted" ? undefined : "adm-drv-tone-bad"}>Background {d.backgroundPermission}</span>
          <span className={`adm-cell-sub${d.motionPermission === "granted" ? "" : " adm-drv-tone-bad"}`}>Motion {d.motionPermission}</span>
        </span>
      ),
    },
    { key: "runtime", header: "Runtime", hideOnMobile: true, sortValue: (d) => d.runtime, render: (d) => <span className="adm-drv-mono">{d.runtime ?? "-"}</span> },
    {
      key: "dump",
      header: "Diagnostic",
      hideOnMobile: true,
      sortValue: (d) => new Date(d.dumpAt).getTime(),
      render: (d) => <Ago iso={d.dumpAt} className="adm-drv-nowrap" />,
    },
  ];

  return (
    <>
      <PageHeader
        title="ClearTrack"
        subtitle="Every phone on the ClearTrack engine, and whether it is still capturing drives. Silent phones were capturing and have stopped while saying they are fine."
        updatedAt={data?.generatedAt}
      />

      <Grid min={170}>
        <KpiCard label="ClearTrack phones" value={data?.nativeDevices ?? 0} tone="accent" loading={kLoading} error={error} hint="With a diagnostic in the last 7 days" />
        <KpiCard
          label="Silent"
          value={data?.silentCount ?? 0}
          tone={data ? (data.silentCount > 0 ? "bad" : "good") : "neutral"}
          loading={kLoading}
          error={error}
          hint={data ? (data.silentCount > 0 ? "Need the engine switched" : "Every active phone is capturing") : undefined}
        />
        <KpiCard
          label="Moving but not recording"
          value={derived.motion}
          tone={data && derived.motion > 0 ? "warn" : "neutral"}
          loading={kLoading}
          error={error}
          hint="Motion seen in 24 hours, no trip opened"
        />
        <KpiCard
          label="Missing a permission"
          value={derived.permission}
          tone={data && derived.permission > 0 ? "warn" : "neutral"}
          loading={kLoading}
          error={error}
          hint="Background location or Motion not granted"
        />
      </Grid>

      <div className="adm-split">
        <Panel title="What “silent” means" subtitle="How a phone ends up flagged, and what to do about it.">
          <div className="adm-drv-stack adm-drv-stack--sm">
            <p className="adm-text">
              A silent phone belongs to a driver who was capturing ({baseline} or more captured trips in the prior 14 days), has both permissions granted and an
              app that is still running, yet has captured nothing in the last {recent} days.
            </p>
            <p className="adm-text">
              The phone&apos;s own verdict can still say healthy. The giveaway is motion changes that never turn into recording starts: the engine never hears the
              phone moving.
            </p>
            <p className="adm-text">
              <strong className="adm-drv-strong">Fix:</strong> open the driver, then use Switch engine in their detail panel.
            </p>
          </div>
        </Panel>
        <Panel title="Phones by verdict" subtitle="What each phone said about itself in its last diagnostic.">
          <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the verdicts." skeleton={<LoadingSkeleton rows={4} />}>
            {() =>
              derived.verdicts.length === 0 ? (
                <p className="adm-text">No ClearTrack phones have sent a diagnostic in the last 7 days.</p>
              ) : (
                <BarList label="ClearTrack phones by verdict" items={derived.verdicts} />
              )
            }
          </LoadState>
        </Panel>
      </div>

      <Panel
        highlight
        flush
        title="Phones"
        subtitle="Click a driver to open their detail. Hover a column heading for what it counts."
        actions={
          <TabBar
            label="Which phones"
            size="sm"
            value={view}
            onChange={(v) => setView(v as View)}
            tabs={[
              { id: "all", label: "All", count: data?.devices.length },
              { id: "silent", label: "Silent", count: data?.silentCount },
              { id: "motion", label: "Not recording", count: data ? derived.motion : undefined },
              { id: "permission", label: "Permission", count: data ? derived.permission : undefined },
            ]}
          />
        }
      >
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load ClearTrack health."
          skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={8} /></div>}
        >
          {() => (
            <DataTable
              caption="ClearTrack phones and their capture health"
              columns={columns}
              rows={rows}
              rowKey={(d) => d.userId}
              rowTone={(d) => (d.silent ? "bad" : undefined)}
              initialSort={{ key: "status", dir: "asc" }}
              maxHeight={720}
              emptyTitle={view === "all" ? "No ClearTrack phones have sent a diagnostic in the last 7 days" : "No phones in this group"}
            />
          )}
        </LoadState>
      </Panel>
    </>
  );
}
