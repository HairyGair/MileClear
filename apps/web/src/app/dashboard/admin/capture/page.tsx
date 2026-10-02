"use client";

// Capture health (Oct 2026 rebuild): is the fleet recording drives? Captured
// versus manual trips, how the detection engines are doing, who has gone
// quiet, and the trip-quality and Live Activity checks.

import Link from "next/link";
import { LiveActivityTab, TripQualityTab } from "@/components/admin/drivers/CaptureTabs";
import {
  AdminIcon,
  Badge,
  BarChart,
  DataTable,
  EmptyState,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  ProgressBar,
  StatLine,
  Tabs,
  formatDay,
  formatNumber,
  useAdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";
import "@/components/admin/drivers/drivers.css";

const A = "/dashboard/admin";

interface AutoTripData {
  autoTripsTotal: number;
  autoTripsClassified: number;
  autoTripsUnclassified: number;
  manualTripsTotal: number;
  classificationRatePercent: number;
  usersWithAutoTrips7d: number;
  usersWithPushToken: number;
  detectionAdoptionPercent: number;
  avgTripDurationMinutes: number;
  avgAutoTripDistanceMiles: number;
  dailyAutoTrips: Array<{ date: string; autoCount: number; manualCount: number }>;
}

interface DetectionFleetData {
  engineSplit: {
    nativeOn: number;
    jsEngine: number;
    nativeFresh: number;
    nativeStale: number;
    nativeNever: number;
    dumpsTotal: number;
    dumpWindowDays?: number;
    staleDumpsExcluded?: number;
  };
  quietDrivers: Array<{
    email: string;
    displayName: string | null;
    lastTripAt: string;
    priorTrips: number;
    daysSinceLastTrip: number;
  }>;
  kpis: {
    activeDrivers7d: number;
    autoTrips7d: number;
    manualTrips7d: number;
    autoSharePercent: number;
    shortAutoTrips7d: number;
    shortManualTrips7d: number;
    shortAutoSharePercent: number;
  };
}

type DayRow = AutoTripData["dailyAutoTrips"][number];
type QuietRow = DetectionFleetData["quietDrivers"][number];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayLabel = (d: string, opts?: Intl.DateTimeFormatOptions) => (ISO_DAY.test(d) ? formatDay(d, opts) : d);

function band(v: number, good: number, ok: number): Tone {
  if (v >= good) return "good";
  if (v >= ok) return "warn";
  return "bad";
}

// ---------------------------------------------------------------------------
// Daily captured trips
// ---------------------------------------------------------------------------

function DailyPanel({ auto }: { auto: ReturnType<typeof useAutoTrips> }) {
  const columns: TableColumn<DayRow>[] = [
    { key: "date", header: "Day", sortValue: (r) => r.date, render: (r) => dayLabel(r.date) },
    { key: "auto", header: "Captured", numeric: true, sortValue: (r) => r.autoCount, render: (r) => formatNumber(r.autoCount) },
    { key: "manual", header: "Manual", numeric: true, sortValue: (r) => r.manualCount, render: (r) => formatNumber(r.manualCount) },
    { key: "total", header: "Total", numeric: true, sortValue: (r) => r.autoCount + r.manualCount, render: (r) => formatNumber(r.autoCount + r.manualCount) },
    {
      key: "share",
      header: "Captured share",
      numeric: true,
      hideOnMobile: true,
      sortValue: (r) => (r.autoCount + r.manualCount ? r.autoCount / (r.autoCount + r.manualCount) : null),
      render: (r) => (r.autoCount + r.manualCount ? `${Math.round((r.autoCount / (r.autoCount + r.manualCount)) * 100)}%` : "-"),
    },
  ];
  return (
    <Panel
      highlight
      title="Trips captured each day"
      subtitle="Trips the phone recorded on its own, last 7 days. The table underneath adds the ones drivers typed in."
    >
      <LoadState
        data={auto.data}
        loading={auto.loading}
        error={auto.error}
        onRetry={auto.reload}
        errorTitle="Couldn't load the daily trip counts."
        skeleton={<LoadingSkeleton variant="chart" height={200} />}
      >
        {(d) =>
          d.dailyAutoTrips.length === 0 ? (
            <EmptyState compact title="No trips in the last 7 days" />
          ) : (
            <div className="adm-drv-stack">
              <BarChart
                label="Captured trips per day, last 7 days"
                unit="captured trips"
                height={200}
                data={d.dailyAutoTrips.map((r) => ({ label: dayLabel(r.date, { weekday: "short", day: "numeric" }), fullLabel: dayLabel(r.date), value: r.autoCount }))}
              />
              <DataTable caption="Captured and manual trips per day, last 7 days" columns={columns} rows={d.dailyAutoTrips} rowKey={(r) => r.date} dense />
            </div>
          )
        }
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

function EnginePanel({ fleet }: { fleet: ReturnType<typeof useFleet> }) {
  return (
    <Panel
      title="Detection engines"
      subtitle="Which engine phones run, from their diagnostics, and how much of last week's driving was caught without a tap."
      href={`${A}/cleartrack`}
      hrefLabel="Per device"
    >
      <LoadState
        data={fleet.data}
        loading={fleet.loading}
        error={fleet.error}
        onRetry={fleet.reload}
        errorTitle="Couldn't load the engine figures."
        skeleton={<LoadingSkeleton rows={6} />}
      >
        {(f) => {
          const e = f.engineSplit;
          const k = f.kpis;
          return (
            <div className="adm-drv-stack">
              <ProgressBar
                label="Trips captured automatically, 7 days"
                value={k.autoSharePercent}
                tone={k.autoSharePercent >= 60 ? "good" : "warn"}
                valueLabel={`${k.autoSharePercent}%`}
              />
              <p className="adm-note" style={{ marginTop: "calc(-1 * var(--adm-s2))" }}>
                {formatNumber(k.autoTrips7d)} captured, {formatNumber(k.manualTrips7d)} typed in. Healthy is 60% or more.
              </p>
              <ProgressBar
                label="Short trips (under 2 miles) captured"
                value={k.shortAutoSharePercent}
                tone={band(k.shortAutoSharePercent, 70, 50)}
                valueLabel={`${k.shortAutoSharePercent}%`}
              />
              <p className="adm-note" style={{ marginTop: "calc(-1 * var(--adm-s2))" }}>
                {formatNumber(k.shortAutoTrips7d)} captured, {formatNumber(k.shortManualTrips7d)} typed in. Healthy is 70% or more.
              </p>
              <div>
                <StatLine label="Active drivers, 7 days" value={formatNumber(k.activeDrivers7d)} />
                <StatLine label="On the ClearTrack engine" value={formatNumber(e.nativeOn)} hint={`against ${formatNumber(e.jsEngine)} on the older JS engine`} />
                <StatLine
                  label="ClearTrack with a recent fix"
                  value={
                    <Badge tone={e.nativeStale + e.nativeNever === 0 ? "good" : "warn"} dot>
                      {formatNumber(e.nativeFresh)}
                    </Badge>
                  }
                  hint={`${formatNumber(e.nativeStale)} stale, ${formatNumber(e.nativeNever)} never had a fix`}
                />
              </div>
              <p className="adm-note">
                From {formatNumber(e.dumpsTotal)} diagnostics in the last {e.dumpWindowDays ?? 14} days
                {e.staleDumpsExcluded ? ` (${formatNumber(e.staleDumpsExcluded)} older ones left out)` : ""}.
              </p>
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Quiet drivers
// ---------------------------------------------------------------------------

function QuietPanel({ fleet }: { fleet: ReturnType<typeof useFleet> }) {
  const columns: TableColumn<QuietRow>[] = [
    {
      key: "who",
      header: "Driver",
      sortValue: (r) => (r.displayName || r.email).toLowerCase(),
      render: (r) => (
        <span className="adm-drv-nowrap">
          <Link className="adm-drv-link" href={`${A}/users?q=${encodeURIComponent(r.email)}`}>{r.displayName || r.email}</Link>
          {r.displayName && <span className="adm-cell-sub">{r.email}</span>}
        </span>
      ),
    },
    { key: "prior", header: "Trips before", title: "Captured trips in the 30 to 7 days before today", numeric: true, sortValue: (r) => r.priorTrips, render: (r) => formatNumber(r.priorTrips) },
    {
      key: "last",
      header: "Last trip",
      hideOnMobile: true,
      sortValue: (r) => new Date(r.lastTripAt).getTime(),
      render: (r) => new Date(r.lastTripAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    },
    {
      key: "quiet",
      header: "Quiet for",
      numeric: true,
      sortValue: (r) => r.daysSinceLastTrip,
      render: (r) => (
        <Badge tone={r.daysSinceLastTrip >= 10 ? "bad" : "warn"} dot>
          {r.daysSinceLastTrip} days
        </Badge>
      ),
    },
  ];
  return (
    <Panel
      flush
      title={`Drivers gone quiet${fleet.data ? ` (${fleet.data.quietDrivers.length})` : ""}`}
      subtitle="Were capturing (3 or more captured trips between 30 and 7 days ago) but have recorded nothing in the last 7 days. Either the phone stopped capturing or they stopped driving."
      footer={
        <>
          Capture counts and silent-device flags for every ClearTrack phone are on the ClearTrack page.{" "}
          <Link href={`${A}/cleartrack`} className="adm-link-arrow">
            Open ClearTrack <AdminIcon name="arrowRight" size={14} />
          </Link>
        </>
      }
    >
      <LoadState
        data={fleet.data}
        loading={fleet.loading}
        error={fleet.error}
        onRetry={fleet.reload}
        errorTitle="Couldn't load the quiet drivers."
        skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={4} /></div>}
      >
        {(f) =>
          f.quietDrivers.length === 0 ? (
            <EmptyState compact title="Nobody has gone quiet">Every recently active driver is still capturing.</EmptyState>
          ) : (
            <DataTable
              caption="Drivers who were capturing and have gone quiet"
              columns={columns}
              rows={f.quietDrivers}
              rowKey={(r) => r.email}
              initialSort={{ key: "quiet", dir: "desc" }}
              maxHeight={480}
            />
          )
        }
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function useAutoTrips() {
  return useAdminData<AutoTripData>("/admin/auto-trip-health");
}
function useFleet() {
  return useAdminData<DetectionFleetData>("/admin/detection-fleet");
}

export default function AdminCapturePage() {
  const auto = useAutoTrips();
  const fleet = useFleet();
  const d = auto.data;
  const aLoading = auto.loading && !d;

  return (
    <>
      <PageHeader
        title="Capture health"
        subtitle="Is the fleet recording drives on its own? Captured against typed-in trips, the detection engines, and drivers who have gone quiet."
        actions={
          <>
            <Link href={`${A}/activation`} className="adm-btn">Activation</Link>
            <Link href={`${A}/cleartrack`} className="adm-btn">
              ClearTrack <AdminIcon name="arrowRight" size={14} />
            </Link>
          </>
        }
      />

      <Grid min={160}>
        <KpiCard label="Captured trips, 30 days" value={d?.autoTripsTotal ?? 0} tone="accent" loading={aLoading} error={auto.error} />
        <KpiCard label="Manual trips, 30 days" value={d?.manualTripsTotal ?? 0} loading={aLoading} error={auto.error} />
        <KpiCard
          label="Captured trips classified"
          value={d ? `${d.classificationRatePercent}%` : ""}
          tone={d ? band(d.classificationRatePercent, 70, 40) : "neutral"}
          loading={aLoading}
          error={auto.error}
          hint={d ? `${formatNumber(d.autoTripsClassified)} classified, ${formatNumber(d.autoTripsUnclassified)} waiting` : undefined}
        />
        <KpiCard
          label="Drivers capturing"
          value={d ? `${d.detectionAdoptionPercent}%` : ""}
          loading={aLoading}
          error={auto.error}
          hint={d ? `${formatNumber(d.usersWithAutoTrips7d)} of ${formatNumber(d.usersWithPushToken)} with the app had a captured trip in 7 days` : undefined}
        />
        <KpiCard label="Average trip time" value={d ? `${d.avgTripDurationMinutes} min` : ""} loading={aLoading} error={auto.error} />
        <KpiCard label="Average captured trip" value={d ? `${d.avgAutoTripDistanceMiles} mi` : ""} loading={aLoading} error={auto.error} />
      </Grid>

      <div className="adm-split">
        <DailyPanel auto={auto} />
        <EnginePanel fleet={fleet} />
      </div>

      <QuietPanel fleet={fleet} />

      <Panel title="Trip quality and Live Activities" subtitle="Last 7 days. Each tab loads when you open it.">
        <Tabs
          label="Capture checks"
          tabs={[
            { id: "quality", label: "Trip quality", content: <TripQualityTab /> },
            { id: "live", label: "Live Activities", content: <LiveActivityTab /> },
          ]}
        />
      </Panel>
    </>
  );
}
