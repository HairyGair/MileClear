"use client";

// Tab bodies for the Capture page: captured-trip quality and Live Activity
// health, each loading its own endpoint when its tab is opened.

import {
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  ProgressBar,
  StatLine,
  formatNumber,
  useAdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";
import "./drivers.css";

// ---------------------------------------------------------------------------
// Trip quality
// ---------------------------------------------------------------------------

interface TripQuality {
  days: number;
  autoTrips: number;
  manualTrips: number;
  stubTrips: number;
  stubRate: number | null;
  phantomFlagged: number;
  avgCoords: number | null;
  byPlatform: Array<{ platform: string; autoTrips: number; stubTrips: number; stubRate: number | null }>;
  events: {
    mapMatchSkipped: number;
    visitAutoSplit: number;
    wakeLagExtended: number;
    edgePhantomTrimmed: number;
    orphanFinalized: number;
    missingReports: number;
  };
  generatedAt: string;
}

type PlatformRow = TripQuality["byPlatform"][number];

function stubTone(rate: number | null): Tone {
  if (rate === null) return "neutral";
  if (rate <= 5) return "good";
  if (rate <= 15) return "warn";
  return "bad";
}

const PLATFORM_WORDS: Record<string, string> = { ios: "iPhone", android: "Android", web: "Web" };

// A "stub" is a captured trip with three or fewer points: the engine woke for
// a fix and never tracked (Class 34).
export function TripQualityTab() {
  const { data, error, loading, reload } = useAdminData<TripQuality>("/admin/trip-quality");

  const columns: TableColumn<PlatformRow>[] = [
    { key: "platform", header: "Signed up on", sortValue: (r) => r.platform, render: (r) => PLATFORM_WORDS[r.platform] ?? r.platform },
    { key: "autoTrips", header: "Captured trips", numeric: true, sortValue: (r) => r.autoTrips, render: (r) => formatNumber(r.autoTrips) },
    { key: "stubTrips", header: "Stubs", title: "Captured trips with 3 points or fewer", numeric: true, sortValue: (r) => r.stubTrips, render: (r) => formatNumber(r.stubTrips) },
    {
      key: "stubRate",
      header: "Stub rate",
      numeric: true,
      sortValue: (r) => r.stubRate,
      render: (r) => (r.stubRate === null ? "-" : <span className={`adm-drv-tone-${stubTone(r.stubRate) === "neutral" ? "muted" : stubTone(r.stubRate)}`}>{r.stubRate}%</span>),
    },
  ];

  return (
    <LoadState
      data={data}
      loading={loading}
      error={error}
      onRetry={reload}
      errorTitle="Couldn't load trip quality."
      skeleton={<LoadingSkeleton variant="table" rows={4} />}
    >
      {(d) => (
        <div className="adm-drv-stack">
          <p className="adm-note">
            Last {d.days} days across the fleet. Stubs are captured trips with three or fewer points. The repairs are the server-side fixes that ran on trips.
          </p>
          <Grid min={150} gap="sm">
            <KpiCard label="Captured trips" value={d.autoTrips} />
            <KpiCard label="Manual trips" value={d.manualTrips} />
            <KpiCard
              label="Stub rate"
              value={d.stubRate === null ? "-" : `${d.stubRate}%`}
              hint={`${formatNumber(d.stubTrips)} stubs. Up to 5% is fine, over 15% is a problem.`}
              tone={stubTone(d.stubRate)}
            />
            <KpiCard label="Phantom trips flagged" value={d.phantomFlagged} />
            <KpiCard label="Average points per trip" value={d.avgCoords ?? "-"} />
            <KpiCard label="Missing-trip reports" value={d.events.missingReports} tone={d.events.missingReports ? "warn" : "good"} href="/dashboard/admin/missing-trips" />
          </Grid>
          <div className="adm-split">
            <div>
              <p className="adm-drv-group__label" style={{ marginBottom: "var(--adm-s2)" }}>By the platform they signed up on</p>
              <DataTable caption="Captured trips and stubs by sign-up platform" columns={columns} rows={d.byPlatform} rowKey={(r) => r.platform} emptyTitle="No captured trips in the window" dense />
            </div>
            <div>
              <p className="adm-drv-group__label" style={{ marginBottom: "var(--adm-s2)" }}>Repairs that ran</p>
              <StatLine label="Visit auto-splits" hint="One recording split into two trips at a stop" value={formatNumber(d.events.visitAutoSplit)} />
              <StatLine label="Wake-lag starts" hint="Start moved back to where the drive began" value={formatNumber(d.events.wakeLagExtended)} />
              <StatLine label="Edge trims" hint="Phantom points trimmed off either end" value={formatNumber(d.events.edgePhantomTrimmed)} />
              <StatLine label="Map-match skipped" value={formatNumber(d.events.mapMatchSkipped)} />
              <StatLine label="Orphan routes saved" hint="Recordings left open, finished on the server" value={formatNumber(d.events.orphanFinalized)} />
            </div>
          </div>
        </div>
      )}
    </LoadState>
  );
}

// ---------------------------------------------------------------------------
// Live Activities
// ---------------------------------------------------------------------------

interface LiveActivity {
  days: number;
  pushStarts: { ok: number; noToken: number; suppressedByPref: number; other: number };
  presence: { checks: number; present: number; rate: number | null };
  foregroundHeals: number;
  progressUpdates: { found: number; notFound: number };
  byBuild: Array<{ buildNumber: string; checks: number; present: number }>;
  generatedAt: string;
}

type BuildRow = LiveActivity["byBuild"][number];

function presenceTone(rate: number | null): Tone {
  if (rate === null) return "neutral";
  if (rate >= 60) return "good";
  if (rate >= 25) return "warn";
  return "bad";
}

// Live Activities: did the push-to-start go out, did the widget actually
// appear (presence probe), and could the app find it to update it.
export function LiveActivityTab() {
  const { data, error, loading, reload } = useAdminData<LiveActivity>("/admin/live-activity-health");

  const columns: TableColumn<BuildRow>[] = [
    { key: "buildNumber", header: "Build", sortValue: (r) => Number(r.buildNumber) || r.buildNumber },
    { key: "checks", header: "Presence checks", numeric: true, sortValue: (r) => r.checks, render: (r) => formatNumber(r.checks) },
    { key: "present", header: "On screen", numeric: true, sortValue: (r) => r.present, render: (r) => formatNumber(r.present) },
    {
      key: "rate",
      header: "Rate",
      numeric: true,
      sortValue: (r) => (r.checks > 0 ? r.present / r.checks : null),
      render: (r) => (r.checks > 0 ? `${Math.round((r.present / r.checks) * 100)}%` : "-"),
    },
  ];

  return (
    <LoadState
      data={data}
      loading={loading}
      error={error}
      onRetry={reload}
      errorTitle="Couldn't load Live Activity health."
      skeleton={<LoadingSkeleton variant="table" rows={4} />}
    >
      {(d) => {
        const pushTotal = d.pushStarts.ok + d.pushStarts.noToken + d.pushStarts.suppressedByPref + d.pushStarts.other;
        return (
          <div className="adm-drv-stack">
            <p className="adm-note">
              Last {d.days} days. Whether the push that starts the lock-screen widget went out, whether the widget was actually on screen when the app checked, and whether the app could find it to update the miles.
            </p>
            <Grid min={150} gap="sm">
              <KpiCard label="Push starts sent" value={d.pushStarts.ok} tone="good" hint={pushTotal ? `of ${formatNumber(pushTotal)} attempts` : undefined} />
              <KpiCard label="No push token" value={d.pushStarts.noToken} tone={d.pushStarts.noToken ? "warn" : "neutral"} />
              <KpiCard label="Turned off by driver" value={d.pushStarts.suppressedByPref} />
              <KpiCard label="Other failures" value={d.pushStarts.other} tone={d.pushStarts.other ? "bad" : "neutral"} />
              <KpiCard
                label="On screen when checked"
                value={d.presence.rate === null ? "-" : `${d.presence.rate}%`}
                hint={`${formatNumber(d.presence.present)} of ${formatNumber(d.presence.checks)} checks`}
                tone={presenceTone(d.presence.rate)}
              />
              <KpiCard label="Restarted on app open" value={d.foregroundHeals} title="Foreground heals: the app found no widget and started one" />
            </Grid>
            <div className="adm-split">
              <div>
                <p className="adm-drv-group__label" style={{ marginBottom: "var(--adm-s2)" }}>On-screen rate by build</p>
                <DataTable caption="Live Activity presence checks by app build" columns={columns} rows={d.byBuild} rowKey={(r) => r.buildNumber} emptyTitle="No presence checks in the window" initialSort={{ key: "buildNumber", dir: "desc" }} dense />
              </div>
              <div className="adm-drv-stack adm-drv-stack--sm">
                <p className="adm-drv-group__label">Miles updates</p>
                <ProgressBar
                  label="Updates that found the widget"
                  value={d.progressUpdates.found}
                  max={Math.max(1, d.progressUpdates.found + d.progressUpdates.notFound)}
                  valueLabel={`${formatNumber(d.progressUpdates.found)} of ${formatNumber(d.progressUpdates.found + d.progressUpdates.notFound)}`}
                  tone={d.progressUpdates.notFound > d.progressUpdates.found ? "warn" : "good"}
                />
                <p className="adm-note">{formatNumber(d.progressUpdates.notFound)} updates could not find the widget to change.</p>
              </div>
            </div>
          </div>
        );
      }}
    </LoadState>
  );
}
