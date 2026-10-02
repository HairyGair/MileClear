"use client";

import { Ago } from "../Ago";
import { BarChart, DataTable, Grid, KpiCard, LoadState, LoadingSkeleton, Panel, StatLine, formatDay, formatNumber, useAdminData } from "../ui";
import type { QrScans } from "./types";

const NOTE =
  "Clicks on mileclear.com/app: the Tyne Tunnel billboard QR (from 1 Oct 2026, 17:04) and every ?from= link since 2 Oct. Link previews are not counted.";

/** Billboard QR scans. `summary` is the Overview tile; `full` is the
 *  Acquisition page section with a daily chart. */
export function QrScansPanel({ variant = "summary" }: { variant?: "summary" | "full" }) {
  const { data, error, loading, reload } = useAdminData<QrScans>("/admin/qr-scans");

  if (variant === "summary") {
    return (
      <Panel title="Billboard QR scans" href="/dashboard/admin/acquisition" hrefLabel="Details">
        <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the scan count.">
          {(d) => {
            const week = [...d.byDay.slice(0, 7)].reverse();
            const max = Math.max(1, ...week.map((w) => w.total));
            return (
              <div className="adm-hub">
                <div className="adm-hub__row">
                  <div className="adm-figure">
                    <span className="adm-figure__value">{formatNumber(d.total)}</span>
                    <span className="adm-figure__label">scans, {formatNumber(d.last24h)} in the last 24 hours</span>
                  </div>
                </div>
                {week.length > 0 && (
                  <div>
                    <div className="adm-minibars" role="img" aria-label={`Scans per day, last 7 days: ${week.map((w) => `${formatDay(w.date)} ${w.total}`).join(", ")}`}>
                      {week.map((w) => (
                        <span
                          key={w.date}
                          className={`adm-minibars__bar${w.total === 0 ? " adm-minibars__bar--zero" : ""}`}
                          style={{ height: `${Math.max(4, (w.total / max) * 100)}%` }}
                          title={`${formatDay(w.date)}: ${w.total}`}
                        />
                      ))}
                    </div>
                    <div className="adm-minibars-labels" aria-hidden="true">
                      {week.map((w) => (
                        <span key={w.date}>{formatDay(w.date, { weekday: "narrow" })}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <StatLine label="App Store (iPhone)" value={formatNumber(d.byStore.ios)} />
                  <StatLine label="Google Play (Android)" value={formatNumber(d.byStore.android)} />
                  <StatLine label="Website (other)" value={formatNumber(d.byStore.other)} />
                </div>
                <p className="adm-note">
                  {d.lastAt ? <>Last scan <Ago iso={d.lastAt} />.</> : "No scans yet."} Counted from 1 Oct 2026, 17:04.
                </p>
              </div>
            );
          }}
        </LoadState>
      </Panel>
    );
  }

  return (
    <Panel title="Billboard QR scans" subtitle={NOTE}>
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the scan count."
        skeleton={<LoadingSkeleton variant="chart" height={200} />}
      >
        {(d) => {
          const days = [...d.byDay].reverse().slice(-30);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
              <Grid min={150} gap="sm">
                <KpiCard label="Total scans" value={d.total} tone="accent" hint={d.lastAt ? <>Last scan <Ago iso={d.lastAt} /></> : "No scans yet"} />
                <KpiCard label="Last 24 hours" value={d.last24h} tone="good" />
                <KpiCard label="App Store (iPhone)" value={d.byStore.ios} />
                <KpiCard label="Google Play (Android)" value={d.byStore.android} />
                <KpiCard label="Website (other)" value={d.byStore.other} />
              </Grid>
              {(d.bySource?.length ?? 0) > 0 && (
                <div>
                  <p style={{ margin: "0 0 var(--adm-s2)", color: "var(--adm-text-2)", fontSize: "0.8125rem" }}>
                    Clicks by channel. Share mileclear.com/app?from=NAME (letters, digits, dashes) in each place you post it; the billboard QR has no name and shows as billboard.
                  </p>
                  <DataTable
                    caption="Clicks on mileclear.com/app by channel"
                    rows={d.bySource ?? []}
                    rowKey={(r) => r.source}
                    columns={[
                      { key: "source", header: "Channel", sortValue: (r) => r.source },
                      { key: "total", header: "Clicks", numeric: true, sortValue: (r) => r.total },
                      { key: "last7d", header: "Last 7 days", numeric: true, sortValue: (r) => r.last7d },
                      { key: "ios", header: "iPhone", numeric: true, sortValue: (r) => r.ios },
                      { key: "android", header: "Android", numeric: true, sortValue: (r) => r.android },
                      { key: "other", header: "Website", numeric: true, sortValue: (r) => r.other, hideOnMobile: true },
                    ]}
                  />
                </div>
              )}
              {days.length > 1 && (
                <BarChart
                  label="QR scans per day"
                  unit="scans"
                  height={200}
                  partialIndex={days.length - 1}
                  data={days.map((x) => ({ label: formatDay(x.date, { day: "numeric", month: "short" }), fullLabel: formatDay(x.date), value: x.total }))}
                />
              )}
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}
