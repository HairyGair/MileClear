"use client";

// Sign-ups & geography (Oct 2026 admin rebuild): where new drivers are
// signing up, and where they drive from. One endpoint, GET /admin/geography,
// feeds every panel; each panel still shows its own loading, error and empty
// state. Filters live in the URL so a view can be shared as a link.

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type {
  AdminGeoAreaRow,
  AdminGeoDistrictRow,
  AdminGeoMetrics,
  AdminGeoNewestSignup,
  AdminGeoRegionRow,
  AdminGeography,
} from "@mileclear/shared";
import {
  AdminIcon,
  Badge,
  DataTable,
  EmptyState,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  ProgressBar,
  STACK_COLOURS,
  STACK_NONE,
  STACK_OTHER,
  StackedBarChart,
  TabBar,
  formatDay,
  formatNumber,
  type AdminData,
  type StackedSeries,
  type TableColumn,
  useAdminData,
} from "@/components/admin/ui";
import { GeoMap, GeoMapLegend, type MapColour, type MapLevel, type MapMeasure } from "@/components/admin/geo/GeoMap";
import { Seg } from "@/components/admin/geo/Seg";
import {
  CONFIDENCE,
  CONFIDENCE_ORDER,
  PLATFORM_OPTIONS,
  WINDOW_OPTIONS,
  activationLabel,
  hoursAgoLabel,
  platformLabel,
  previousPhrase,
  shareOf,
  sumMetrics,
  windowPhrase,
  type GeoPlatformKey,
  type GeoWindowKey,
} from "@/components/admin/geo/labels";
import "@/components/admin/geo/geo.css";

type Geo = AdminData<AdminGeography>;

// ---------------------------------------------------------------------------
// URL-backed filters
// ---------------------------------------------------------------------------

interface Filters {
  win: GeoWindowKey;
  platform: GeoPlatformKey;
  source: string;
  includeIp: boolean;
  region: string | null;
}

const DEFAULTS: Record<string, string> = { window: "30", platform: "all", source: "all", ip: "1" };

function useFilters(): [Filters, (patch: Record<string, string | null>) => void] {
  const sp = useSearchParams() ?? new URLSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard/admin/geography";
  const w = sp.get("window");
  const p = sp.get("platform");
  const filters: Filters = {
    win: (WINDOW_OPTIONS.some((o) => o.value === w) ? w : "30") as GeoWindowKey,
    platform: (PLATFORM_OPTIONS.some((o) => o.value === p) ? p : "all") as GeoPlatformKey,
    source: sp.get("source") || "all",
    includeIp: sp.get("ip") !== "0",
    region: sp.get("region"),
  };
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === DEFAULTS[k]) next.delete(k);
      else next.set(k, v);
    }
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return [filters, set];
}

function FilterBar({ f, set, geo }: { f: Filters; set: (p: Record<string, string | null>) => void; geo: Geo }) {
  const sources = geo.data?.sources ?? [];
  return (
    <div className="adm-geo-filters">
      {geo.loading && geo.data && (
        <span className="adm-geo-updating" role="status">
          <AdminIcon name="refresh" size={12} /> Updating
        </span>
      )}
      <Seg
        label="Sign-up window"
        value={f.win}
        onChange={(v) => set({ window: v })}
        options={WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.short, title: o.long }))}
      />
      <Seg
        label="Phone"
        value={f.platform}
        onChange={(v) => set({ platform: v })}
        options={PLATFORM_OPTIONS.map((o) => ({ value: o.value, label: o.value === "all" ? "All" : o.label }))}
      />
      <select
        className="adm-geo-select"
        aria-label="How they heard about MileClear"
        value={f.source}
        onChange={(e) => set({ source: e.target.value })}
      >
        <option value="all">Every source</option>
        {sources.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
        {/* Keep a shared link's value selectable before the list loads. */}
        {f.source !== "all" && !sources.some((s) => s.value === f.source) && <option value={f.source}>{f.source}</option>}
      </select>
      <button
        type="button"
        role="switch"
        aria-checked={f.includeIp}
        className="adm-geo-switch"
        title="Signup IP is the internet address someone signed up from. It is often a mobile network hub miles away, so it is the least reliable way to place a driver."
        onClick={() => set({ ip: f.includeIp ? "0" : "1" })}
      >
        <span className="adm-geo-switch__track" aria-hidden="true" />
        Include IP-only locations
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Growth({ m, isNew }: { m: AdminGeoMetrics; isNew?: boolean }) {
  if (isNew) return <Badge tone="info">New</Badge>;
  if (m.prevSignups == null) return <span className="adm-geo-growth adm-geo-growth--flat">-</span>;
  if (m.growthPct == null) {
    return m.signups > 0 ? (
      <span className="adm-geo-growth adm-geo-growth--up" title="None in the window before">Up from 0</span>
    ) : (
      <span className="adm-geo-growth adm-geo-growth--flat">-</span>
    );
  }
  const g = Math.round(m.growthPct);
  const cls = g > 0 ? "up" : g < 0 ? "down" : "flat";
  return (
    <span className={`adm-geo-growth adm-geo-growth--${cls}`} title={`${formatNumber(m.prevSignups)} in the window before`}>
      {g > 0 ? "+" : ""}
      {g}%
    </span>
  );
}

function PhoneSplit({ m }: { m: AdminGeoMetrics }) {
  const ios = m.platform.ios + m.platform.both;
  const android = m.platform.android + m.platform.both;
  return (
    <span
      className="adm-geo-split"
      title={`${m.platform.ios} iPhone, ${m.platform.android} Android, ${m.platform.both} on both, ${m.platform.other} not known`}
    >
      {formatNumber(ios)} / {formatNumber(android)}
    </span>
  );
}

function Tick({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="adm-geo-tick" title="Has had at least one automatic trip">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Driving
    </span>
  ) : (
    <span className="adm-geo-tick adm-geo-tick--no" title="No automatic trip yet">No trip yet</span>
  );
}

/** Columns shared by the region, area and district tables. */
function metricColumns<T extends AdminGeoMetrics>(opts: { growthNew?: (r: T) => boolean } = {}): TableColumn<T>[] {
  return [
    { key: "signups", header: "Sign-ups", numeric: true, sortValue: (r) => r.signups, render: (r) => formatNumber(r.signups), title: "Sign-ups in the window" },
    {
      key: "growth",
      header: "Change",
      numeric: true,
      sortValue: (r) => (opts.growthNew?.(r) ? 10_000 : r.growthPct ?? (r.signups > 0 && r.prevSignups === 0 ? 5_000 : null)),
      render: (r) => <Growth m={r} isNew={opts.growthNew?.(r)} />,
      title: "Against the same length of time just before",
    },
    { key: "all", header: "All-time", numeric: true, sortValue: (r) => r.allTimeUsers, render: (r) => formatNumber(r.allTimeUsers), title: "Every user placed here, ever" },
    {
      key: "active",
      header: "Driving now",
      numeric: true,
      sortValue: (r) => r.activeDrivers,
      render: (r) => formatNumber(r.activeDrivers),
      title: "All-time users with an automatic trip in the last 7 days",
      hideOnMobile: true,
    },
    {
      key: "activation",
      header: "Activated",
      numeric: true,
      sortValue: (r) => r.activationRatePct,
      render: (r) => activationLabel(r),
      title: "Share of the window's sign-ups who have had an automatic trip",
      hideOnMobile: true,
    },
    { key: "paying", header: "Paying", numeric: true, sortValue: (r) => r.paying, render: (r) => formatNumber(r.paying), title: "All-time users paying today", hideOnMobile: true },
    {
      key: "phones",
      header: "iPhone / Android",
      numeric: true,
      sortValue: (r) => r.platform.ios + r.platform.both,
      render: (r) => <PhoneSplit m={r} />,
      title: "The window's sign-ups by phone (drivers seen on both count in each)",
      hideOnMobile: true,
    },
  ];
}

// ---------------------------------------------------------------------------
// 1. KPI row
// ---------------------------------------------------------------------------

function KpiRow({ geo, f }: { geo: Geo; f: Filters }) {
  const d = geo.data;
  const loading = geo.loading && !d;
  const s = d?.summary;
  const t = d ? sumMetrics(d.byNation) : null;
  const hasPrev = f.win !== "all";
  const phones = t ? t.ios + t.android + t.both : 0;
  const iosPct = t ? shareOf(t.ios + t.both, phones) : null;
  const conf = s?.byConfidence;

  return (
    <Grid min={170}>
      <KpiCard
        label={f.win === "all" ? "Sign-ups, all time" : `Sign-ups, ${WINDOW_OPTIONS.find((o) => o.value === f.win)?.long.toLowerCase()}`}
        value={s?.signups ?? 0}
        tone="accent"
        loading={loading}
        error={geo.error}
        delta={s && hasPrev && s.prevSignups != null ? { current: s.signups, previous: s.prevSignups, label: previousPhrase(f.win) } : undefined}
      />
      <KpiCard
        label="Placed in a postcode area"
        value={s?.withAreaPct != null ? `${Math.round(s.withAreaPct)}%` : "-"}
        loading={loading}
        error={geo.error}
        title={
          conf
            ? CONFIDENCE_ORDER.map((c) => `${CONFIDENCE[c].label}: ${formatNumber(conf[c])}`).join("\n")
            : undefined
        }
        hint={
          s && conf ? (
            <>
              {formatNumber(conf.trip_postcode)} by trip postcode, {formatNumber(conf.saved_home + conf.trip_location)} by saved home or trip
              location, {formatNumber(conf.signup_ip)} by signup IP only, {formatNumber(conf.unknown)} not placed
              <span className="adm-geo-confbar" aria-hidden="true">
                {CONFIDENCE_ORDER.map((c) =>
                  conf[c] > 0 ? (
                    <span
                      key={c}
                      style={{
                        flex: conf[c],
                        background:
                          c === "trip_postcode" ? "var(--adm-good)" : c === "signup_ip" ? "var(--adm-warn)" : c === "unknown" ? "rgba(148,163,184,0.3)" : "var(--adm-info)",
                      }}
                    />
                  ) : null
                )}
              </span>
            </>
          ) : undefined
        }
      />
      <KpiCard
        label="Postcode areas with drivers"
        value={s?.areasReached ?? 0}
        loading={loading}
        error={geo.error}
        hint={s ? `In ${s.regionsReached} regions, counting every user ever` : undefined}
      />
      <KpiCard
        label="New areas"
        value={hasPrev ? (s?.newAreas.length ?? 0) : "-"}
        loading={loading}
        error={geo.error}
        hint={hasPrev ? "Places where the first ever driver signed up in this window" : "Pick a shorter window to see first-time areas"}
      />
      <KpiCard
        label="Activated"
        value={t && t.signups ? `${Math.round((t.activated / t.signups) * 100)}%` : "-"}
        tone={t && t.signups ? "good" : "neutral"}
        loading={loading}
        error={geo.error}
        hint={t ? `${formatNumber(t.activated)} of ${formatNumber(t.signups)} sign-ups have had an automatic trip` : undefined}
      />
      <KpiCard
        label="iPhone and Android"
        value={iosPct != null ? `${Math.round(iosPct)}% iPhone` : "-"}
        loading={loading}
        error={geo.error}
        hint={t ? `${formatNumber(t.ios)} iPhone, ${formatNumber(t.android)} Android, ${formatNumber(t.both)} on both${t.other ? `, ${formatNumber(t.other)} not known` : ""}` : undefined}
      />
    </Grid>
  );
}

// ---------------------------------------------------------------------------
// 2. Map
// ---------------------------------------------------------------------------

function MapPanel({ geo, f }: { geo: Geo; f: Filters }) {
  const [level, setLevel] = useState<MapLevel>("area");
  const [measure, setMeasure] = useState<MapMeasure>("window");
  const [colour, setColour] = useState<MapColour>("growth");
  const hasPrev = f.win !== "all";
  const winText = f.win === "all" ? "(all time)" : `(${WINDOW_OPTIONS.find((o) => o.value === f.win)?.long.toLowerCase()})`;

  return (
    <Panel
      highlight
      title="Where they drive from"
      subtitle={`Each circle is a postcode ${level === "area" ? "area" : "district"}. Bigger means more ${measure === "window" ? `sign-ups in ${windowPhrase(f.win)}` : "users in total"}. Tap or hover for the figures.`}
      actions={
        <>
          <TabBar
            label="Map detail"
            size="sm"
            value={level}
            onChange={(v) => setLevel(v as MapLevel)}
            tabs={[
              { id: "area", label: "Areas" },
              { id: "district", label: "Districts" },
            ]}
          />
          <TabBar
            label="Circle size"
            size="sm"
            value={measure}
            onChange={(v) => setMeasure(v as MapMeasure)}
            tabs={[
              { id: "window", label: "Sign-ups in window" },
              { id: "alltime", label: "All-time users" },
            ]}
          />
        </>
      }
      footer={
        <>
          Districts appear once {geo.data?.privacyFloor ?? 3} or more drivers live there, and sit at the average of their homes; areas sit at a fixed
          centre point. No circle is ever one driver.{" "}
          <Link href="/dashboard/admin/geographic-density" className="adm-link-arrow">
            Trip density map <AdminIcon name="arrowRight" size={14} />
          </Link>
        </>
      }
    >
      <LoadState
        data={geo.data}
        loading={geo.loading}
        error={geo.error}
        onRetry={geo.reload}
        errorTitle="Couldn't load the map figures."
        skeleton={<LoadingSkeleton variant="block" height={560} />}
      >
        {(d) =>
          d.mapPoints.length === 0 ? (
            <EmptyState title="No drivers to map yet" icon="geography">
              Nobody matching these filters has been placed in a postcode area. Try a longer window or include IP-only locations.
            </EmptyState>
          ) : (
            <>
              <GeoMap
                points={d.mapPoints}
                areas={d.byArea}
                districts={d.topDistricts}
                level={level}
                measure={measure}
                colour={colour}
                windowText={winText}
                hasPrevious={hasPrev}
              />
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--adm-s3)", marginTop: "var(--adm-s3)" }}>
                <Seg
                  label="Colour circles by"
                  value={colour}
                  onChange={setColour}
                  options={[
                    { value: "growth", label: "Growth" },
                    { value: "active", label: "Still driving" },
                  ]}
                />
                {level === "district" && colour === "growth" && (
                  <span className="adm-note">Growth is shown for the 50 busiest districts; the rest are grey.</span>
                )}
              </div>
              <GeoMapLegend colour={colour} measure={measure} hasPrevious={hasPrev} />
            </>
          )
        }
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 8. Latest sign-ups
// ---------------------------------------------------------------------------

function placeLine(s: AdminGeoNewestSignup): string | null {
  if (!s.area) return s.region ?? null;
  const name = s.areaName ?? s.area;
  return s.district ? `${s.district}, ${name}` : `${name} (${s.area})`;
}

function LatestPanel({ geo }: { geo: Geo }) {
  return (
    <Panel title="Latest sign-ups" subtitle="The 20 newest accounts and where we think they drive from.">
      <LoadState
        data={geo.data}
        loading={geo.loading}
        error={geo.error}
        onRetry={geo.reload}
        errorTitle="Couldn't load the latest sign-ups."
        skeleton={<LoadingSkeleton variant="lines" rows={10} />}
      >
        {(d) => {
          const labels = new Map(d.sources.map((s) => [s.value, s.label]));
          if (d.newestSignups.length === 0) return <EmptyState compact title="No sign-ups match these filters" />;
          return (
            <ul className="adm-geo-feed">
              {d.newestSignups.map((s, i) => {
                const place = placeLine(s);
                const c = CONFIDENCE[s.confidence];
                return (
                  <li key={i}>
                    <p className={`adm-geo-feed__place${place ? "" : " adm-geo-feed__place--none"}`}>{place ?? "Not placed yet"}</p>
                    <p className="adm-geo-feed__time">{hoursAgoLabel(s.hoursAgo)}</p>
                    <p className="adm-geo-feed__meta">
                      {[s.area && s.region, platformLabel(s.platform), s.source ? (labels.get(s.source) ?? s.source) : "Didn't say how they heard"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="adm-geo-feed__badges">
                      <Badge tone={c.tone} title={c.hint}>
                        {c.label}
                      </Badge>
                      <Tick yes={s.hasAutoTrip} />
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 3. Regions + nations
// ---------------------------------------------------------------------------

function RegionsPanel({ geo, f, onPickRegion, onExcludeIp }: { geo: Geo; f: Filters; onPickRegion: (r: string) => void; onExcludeIp: () => void }) {
  return (
    <Panel
      flush
      title="Regions"
      subtitle="Every UK region, ranked by sign-ups. Pick a region to list its postcode areas below."
      footer="Active means an automatic trip in the last 7 days. Paying counts users paying today, wherever they signed up."
    >
      <LoadState
        data={geo.data}
        loading={geo.loading}
        error={geo.error}
        onRetry={geo.reload}
        errorTitle="Couldn't load the regions."
        skeleton={<div style={{ padding: "0 var(--adm-s5) var(--adm-s5)" }}><LoadingSkeleton variant="table" rows={8} /></div>}
      >
        {(d) => {
          const rows = d.byRegion.filter((r) => r.region !== "Unknown");
          const unknown = d.byRegion.find((r) => r.region === "Unknown");
          const placed = rows.reduce((n, r) => n + r.signups, 0);
          const nations = d.byNation.filter((n) => n.nation !== "Unknown" && (n.signups > 0 || n.allTimeUsers > 0));
          const cols: TableColumn<AdminGeoRegionRow>[] = [
            {
              key: "region",
              header: "Region",
              sortValue: (r) => r.region,
              render: (r) => (
                <>
                  {r.region}
                  <span className="adm-cell-sub">{r.nation}</span>
                </>
              ),
            },
            {
              key: "share",
              header: "Share",
              numeric: true,
              sortValue: (r) => r.signups,
              render: (r) => (placed ? `${Math.round((r.signups / placed) * 100)}%` : "-"),
              title: "Share of the window's placed sign-ups",
              hideOnMobile: true,
            },
            ...metricColumns<AdminGeoRegionRow>(),
            {
              key: "source",
              header: "Top source",
              sortValue: (r) => r.topSources[0]?.label ?? null,
              render: (r) => (r.topSources[0] ? <span title={r.topSources.map((s) => `${s.label}: ${s.count}`).join("\n")}>{r.topSources[0].label}</span> : <span className="adm-geo-growth--flat">-</span>),
              title: "Most common answer to How did you hear, among the window's sign-ups",
              hideOnMobile: true,
            },
          ];
          return (
            <>
              <div style={{ padding: "0 var(--adm-s5)" }}>
                <div className="adm-geo-nations" role="list" aria-label="Sign-ups by nation">
                  {nations.map((n) => {
                    const pct = placed ? (n.signups / placed) * 100 : 0;
                    return (
                      <div key={n.nation} className="adm-geo-nation" role="listitem">
                        <p className="adm-geo-nation__name">{n.nation}</p>
                        <p className="adm-geo-nation__value">{formatNumber(n.signups)}</p>
                        <p className="adm-geo-nation__sub">
                          {placed ? `${Math.round(pct)}% of placed` : "No sign-ups"} · {formatNumber(n.allTimeUsers)} all-time
                        </p>
                        <div className="adm-geo-nation__bar" aria-hidden="true">
                          <span style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <DataTable
                caption="Sign-ups by UK region"
                columns={cols}
                rows={rows}
                rowKey={(r) => r.region}
                initialSort={{ key: "signups", dir: "desc" }}
                onRowClick={(r) => onPickRegion(r.region)}
                rowTone={(r) => (f.region === r.region ? "good" : undefined)}
                emptyTitle="No regions to show"
              />
              {unknown && (
                <div className="adm-geo-callout">
                  <div className="adm-geo-callout__figs">
                    <div className="adm-geo-callout__fig">
                      <strong>{formatNumber(unknown.signups)}</strong>
                      <span>sign-ups not placed</span>
                    </div>
                    <div className="adm-geo-callout__fig">
                      <strong>{activationLabel(unknown)}</strong>
                      <span>of them activated</span>
                    </div>
                    <div className="adm-geo-callout__fig">
                      <strong>{formatNumber(unknown.allTimeUsers)}</strong>
                      <span>not placed, all time</span>
                    </div>
                  </div>
                  <p className="adm-geo-callout__text">
                    Read the region activation rates with care. Most drivers are placed by where their trips start, so someone who has never driven
                    with us can only be placed by their signup IP, or not at all. That makes named regions look better than they are; this group shows
                    the other side.{" "}
                    {f.includeIp ? (
                      <>
                        Drivers placed only by signup IP are inside the regions above.{" "}
                        <button type="button" className="adm-geo-linkbtn" onClick={onExcludeIp}>
                          Count them here instead
                        </button>
                        .
                      </>
                    ) : (
                      "Drivers placed only by signup IP are counted here, not in the regions."
                    )}
                  </p>
                </div>
              )}
              <div style={{ height: "var(--adm-s4)" }} />
            </>
          );
        }}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 4. Timeline
// ---------------------------------------------------------------------------

const NATION_ORDER = ["England", "Scotland", "Wales", "Northern Ireland", "Crown Dependencies", "Outside UK"];

function TimelinePanel({ geo }: { geo: Geo }) {
  const [by, setBy] = useState<"region" | "nation">("region");
  return (
    <Panel
      title="Sign-ups over time"
      subtitle={by === "region" ? "The six busiest regions, with everywhere else grouped." : "By nation."}
      actions={
        <TabBar
          label="Split sign-ups by"
          size="sm"
          value={by}
          onChange={(v) => setBy(v as "region" | "nation")}
          tabs={[
            { id: "region", label: "Regions" },
            { id: "nation", label: "Nations" },
          ]}
        />
      }
    >
      <LoadState
        data={geo.data}
        loading={geo.loading}
        error={geo.error}
        onRetry={geo.reload}
        errorTitle="Couldn't load the sign-up timeline."
        skeleton={<LoadingSkeleton variant="chart" height={260} />}
      >
        {(d) => <Timeline d={d} by={by} />}
      </LoadState>
    </Panel>
  );
}

function Timeline({ d, by }: { d: AdminGeography; by: "region" | "nation" }) {
  const { series, data } = useMemo(() => {
    const buckets = d.timeline.series;
    const pick = (b: (typeof buckets)[number]) => (by === "region" ? b.byRegion : b.byNation);
    const totals = new Map<string, number>();
    for (const b of buckets) for (const [k, v] of Object.entries(pick(b))) totals.set(k, (totals.get(k) ?? 0) + v);

    let named: string[];
    if (by === "region") {
      // Top six by sign-ups, then drawn in the fixed region order so a colour
      // stays with its region while the ranking shuffles.
      const top = [...totals.entries()]
        .filter(([k, v]) => k !== "Unknown" && v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k]) => k);
      named = d.timeline.regions.filter((r) => top.includes(r));
    } else {
      // Nations have a fixed colour each.
      named = NATION_ORDER.filter((n) => (totals.get(n) ?? 0) > 0);
    }
    const colourFor = (k: string, i: number) => (by === "nation" ? STACK_COLOURS[NATION_ORDER.indexOf(k)] : STACK_COLOURS[i]);
    const s: StackedSeries[] = named.map((k, i) => ({ key: k, label: k, color: colourFor(k, i) }));
    const otherTotal = [...totals.entries()].filter(([k]) => k !== "Unknown" && !named.includes(k)).reduce((n, [, v]) => n + v, 0);
    if (otherTotal > 0) s.push({ key: "__other", label: by === "region" ? "Other regions" : "Elsewhere", color: STACK_OTHER });
    if ((totals.get("Unknown") ?? 0) > 0) s.push({ key: "Unknown", label: "Not placed", color: STACK_NONE });

    const weekly = d.timeline.bucket === "week";
    const rows = buckets.map((b) => {
      const vals = pick(b);
      return {
        label: formatDay(b.date, { day: "numeric", month: "short" }),
        fullLabel: weekly ? `Week starting ${formatDay(b.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}` : formatDay(b.date),
        values: s.map((x) =>
          x.key === "__other"
            ? Object.entries(vals)
                .filter(([k]) => k !== "Unknown" && !named.includes(k))
                .reduce((n, [, v]) => n + v, 0)
            : (vals[x.key] ?? 0)
        ),
      };
    });
    return { series: s, data: rows };
  }, [d, by]);

  const total = d.timeline.series.reduce((n, b) => n + b.total, 0);
  if (total === 0) return <EmptyState compact title="No sign-ups in this window" />;
  return (
    <>
      <StackedBarChart
        label={`Sign-ups per ${d.timeline.bucket === "week" ? "week" : "day"} by ${by}`}
        unit="sign-ups"
        height={260}
        data={data}
        series={series}
        partialIndex={data.length - 1}
      />
      <p className="adm-note" style={{ marginTop: "var(--adm-s2)" }}>
        {d.timeline.bucket === "week" ? "One bar per week, starting Monday." : "One bar per day."} The last bar is still filling in.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// 7. New areas
// ---------------------------------------------------------------------------

function NewAreasPanel({ geo, f }: { geo: Geo; f: Filters }) {
  return (
    <Panel title="New areas" subtitle={`Postcode areas where MileClear got its first ever driver in ${windowPhrase(f.win)}.`}>
      <LoadState
        data={geo.data}
        loading={geo.loading}
        error={geo.error}
        onRetry={geo.reload}
        errorTitle="Couldn't load the new areas."
        skeleton={<LoadingSkeleton variant="lines" rows={6} />}
      >
        {(d) =>
          f.win === "all" ? (
            <EmptyState compact title="Pick a window">Every area is new over all time. Choose 7, 30 or 90 days, or 12 months.</EmptyState>
          ) : d.summary.newAreas.length === 0 ? (
            <EmptyState compact title="No new areas in this window">Every sign-up came from somewhere MileClear already had a driver.</EmptyState>
          ) : (
            <ul className="adm-geo-newareas" style={{ maxHeight: 320, overflowY: "auto" }}>
              {[...d.summary.newAreas]
                .sort((a, b) => b.signups - a.signups || a.name.localeCompare(b.name))
                .map((a) => (
                  <li key={a.area}>
                    <span className="adm-geo-code">{a.area}</span>
                    <span className="adm-geo-newareas__name">
                      {a.name}
                      <small>{a.region}</small>
                    </span>
                    <span className="adm-geo-newareas__n">
                      {formatNumber(a.signups)} sign-up{a.signups === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
            </ul>
          )
        }
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 5. Postcode areas
// ---------------------------------------------------------------------------

function AreasPanel({ geo, f, setRegion }: { geo: Geo; f: Filters; setRegion: (r: string | null) => void }) {
  const [q, setQ] = useState("");
  return (
    <Panel
      id="geo-areas"
      flush
      title="Postcode areas"
      subtitle="Every area with at least one driver. Search by code or town."
      footer="Change compares the window with the same length of time just before. New means the area's first ever driver signed up in this window."
    >
      <LoadState
        data={geo.data}
        loading={geo.loading}
        error={geo.error}
        onRetry={geo.reload}
        errorTitle="Couldn't load the postcode areas."
        skeleton={<div style={{ padding: "0 var(--adm-s5) var(--adm-s5)" }}><LoadingSkeleton variant="table" rows={10} /></div>}
      >
        {(d) => {
          const needle = q.trim().toLowerCase();
          const rows = d.byArea.filter(
            (a) =>
              (!f.region || a.region === f.region) &&
              (!needle || a.area.toLowerCase().startsWith(needle) || a.name.toLowerCase().includes(needle))
          );
          const cols: TableColumn<AdminGeoAreaRow>[] = [
            {
              key: "area",
              header: "Area",
              sortValue: (r) => r.area,
              render: (r) => (
                <span style={{ whiteSpace: "nowrap" }}>
                  <span className="adm-geo-code">{r.area}</span>
                  {r.name}
                </span>
              ),
            },
            { key: "region", header: "Region", sortValue: (r) => r.region, render: (r) => r.region, hideOnMobile: true },
            ...metricColumns<AdminGeoAreaRow>({ growthNew: (r) => r.newInWindow }),
          ];
          return (
            <>
              <div className="adm-geo-toolbar">
                <input
                  type="search"
                  className="adm-geo-search"
                  placeholder="Search areas, e.g. LN or Lincoln"
                  aria-label="Search postcode areas"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {f.region && (
                  <button type="button" className="adm-geo-chip" onClick={() => setRegion(null)} aria-label={`Showing ${f.region} only. Show every region`}>
                    {f.region}
                    <AdminIcon name="close" size={12} />
                  </button>
                )}
                <span className="adm-note">
                  {formatNumber(rows.length)} of {formatNumber(d.byArea.length)} areas
                </span>
              </div>
              <DataTable
                caption="Sign-ups by postcode area"
                columns={cols}
                rows={rows}
                rowKey={(r) => r.area}
                initialSort={{ key: "signups", dir: "desc" }}
                maxHeight={560}
                dense
                emptyTitle={needle || f.region ? "No areas match" : "No areas yet"}
              />
            </>
          );
        }}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 6. Districts
// ---------------------------------------------------------------------------

function DistrictsPanel({ geo }: { geo: Geo }) {
  return (
    <Panel
      flush
      title="Busiest districts"
      subtitle="The 50 postcode districts with the most sign-ups, e.g. LN1 or DN21."
      footer={
        geo.data && geo.data.suppressedDistricts.districts > 0
          ? `${formatNumber(geo.data.suppressedDistricts.districts)} small districts with fewer than ${geo.data.privacyFloor} drivers (${formatNumber(
              geo.data.suppressedDistricts.users
            )} drivers between them) are hidden for privacy. Those drivers still count in the area and region figures.`
          : `Districts with fewer than ${geo.data?.privacyFloor ?? 3} drivers are hidden for privacy.`
      }
    >
      <LoadState
        data={geo.data}
        loading={geo.loading}
        error={geo.error}
        onRetry={geo.reload}
        errorTitle="Couldn't load the districts."
        skeleton={<div style={{ padding: "0 var(--adm-s5) var(--adm-s5)" }}><LoadingSkeleton variant="table" rows={8} /></div>}
      >
        {(d) => {
          const cols: TableColumn<AdminGeoDistrictRow>[] = [
            {
              key: "district",
              header: "District",
              sortValue: (r) => r.district,
              render: (r) => (
                <span style={{ whiteSpace: "nowrap" }}>
                  <span className="adm-geo-code">{r.district}</span>
                  {r.areaName}
                  <span className="adm-cell-sub">{r.region}</span>
                </span>
              ),
            },
            ...metricColumns<AdminGeoDistrictRow>().filter((c) => ["signups", "growth", "all", "active"].includes(c.key)),
          ];
          return (
            <DataTable
              caption="Busiest postcode districts"
              columns={cols}
              rows={d.topDistricts}
              rowKey={(r) => r.district}
              initialSort={{ key: "signups", dir: "desc" }}
              maxHeight={480}
              dense
              emptyTitle="No district has enough drivers to show yet"
            />
          );
        }}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 9. How accurate is signup IP?
// ---------------------------------------------------------------------------

function IpAccuracyPanel({ geo }: { geo: Geo }) {
  return (
    <Panel
      title="How accurate is signup IP?"
      subtitle="For drivers we can place both ways, how often the internet address they signed up from agrees with where their trips start."
    >
      <LoadState
        data={geo.data}
        loading={geo.loading}
        error={geo.error}
        onRetry={geo.reload}
        errorTitle="Couldn't load the signup IP check."
        skeleton={<LoadingSkeleton variant="lines" rows={6} />}
      >
        {(d) => {
          const ip = d.signupIpVsTrip;
          if (ip.compared === 0) return <EmptyState compact title="Nobody to compare yet">This needs drivers with both a trip postcode and a usable signup IP.</EmptyState>;
          return (
            <div className="adm-geo-stack">
              <div className="adm-geo-ipfigs">
                <div className="adm-figure">
                  <span className="adm-figure__value">{ip.sameAreaPct != null ? `${Math.round(ip.sameAreaPct)}%` : "-"}</span>
                  <span className="adm-figure__label">same postcode area</span>
                </div>
                <div className="adm-figure">
                  <span className="adm-figure__value">{ip.sameRegionOrBetterPct != null ? `${Math.round(ip.sameRegionOrBetterPct)}%` : "-"}</span>
                  <span className="adm-figure__label">same region or closer</span>
                </div>
              </div>
              <div className="adm-geo-stack" style={{ gap: "var(--adm-s3)" }}>
                <ProgressBar label="Same postcode area" value={ip.sameArea} max={ip.compared} valueLabel={formatNumber(ip.sameArea)} tone="good" size="sm" />
                <ProgressBar label="Same region, different area" value={ip.sameRegion} max={ip.compared} valueLabel={formatNumber(ip.sameRegion)} tone="info" size="sm" />
                <ProgressBar label="Same nation, different region" value={ip.sameNation} max={ip.compared} valueLabel={formatNumber(ip.sameNation)} tone="neutral" size="sm" />
                <ProgressBar label="Different nation" value={ip.differentNation} max={ip.compared} valueLabel={formatNumber(ip.differentNation)} tone="warn" size="sm" />
              </div>
              <p className="adm-text">
                Mobile networks often route people through a hub city, so a driver in Lincolnshire can show up as London or Manchester. That is why
                this page places drivers by where their trips start first, and only falls back to signup IP when there is nothing better.
              </p>
              {ip.topMismatches.length > 0 && (
                <DataTable
                  caption="Most common places where signup IP and trips disagree"
                  dense
                  columns={[
                    { key: "ip", header: "Signup IP said", sortValue: (r) => r.ipCity, render: (r) => r.ipCity },
                    {
                      key: "trip",
                      header: "Trips start in",
                      sortValue: (r) => r.tripArea,
                      render: (r) => (
                        <span style={{ whiteSpace: "nowrap" }}>
                          <span className="adm-geo-code">{r.tripArea}</span>
                          {r.tripAreaName}
                        </span>
                      ),
                    },
                    { key: "n", header: "Drivers", numeric: true, sortValue: (r) => r.count, render: (r) => formatNumber(r.count) },
                  ]}
                  rows={ip.topMismatches}
                  rowKey={(r) => `${r.ipCity}-${r.tripArea}`}
                  initialSort={{ key: "n", dir: "desc" }}
                  maxHeight={300}
                />
              )}
              <p className="adm-note">
                Compared {formatNumber(ip.compared)} drivers across all time. Another {formatNumber(ip.ipUnknown)} had a trip postcode but a signup IP
                that said nothing usable.
              </p>
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function GeographyPage() {
  const [f, set] = useFilters();
  const geo = useAdminData<AdminGeography>(
    `/admin/geography?window=${f.win}&platform=${f.platform}&source=${encodeURIComponent(f.source)}&includeIp=${f.includeIp}`
  );

  const pickRegion = (r: string) => {
    set({ region: f.region === r ? null : r });
    document.getElementById("geo-areas")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <PageHeader
        title="Sign-ups & geography"
        subtitle="Where new drivers are signing up, and where they drive from."
        updatedAt={geo.data?.generatedAt}
        actions={<FilterBar f={f} set={set} geo={geo} />}
      />

      <KpiRow geo={geo} f={f} />

      <div className="adm-split">
        <MapPanel geo={geo} f={f} />
        <LatestPanel geo={geo} />
      </div>

      <RegionsPanel geo={geo} f={f} onPickRegion={pickRegion} onExcludeIp={() => set({ ip: "0" })} />

      <div className="adm-split">
        <TimelinePanel geo={geo} />
        <NewAreasPanel geo={geo} f={f} />
      </div>

      <AreasPanel geo={geo} f={f} setRegion={(r) => set({ region: r })} />

      <div className="adm-split">
        <DistrictsPanel geo={geo} />
        <IpAccuracyPanel geo={geo} />
      </div>
    </>
  );
}

export default function AdminGeographyPage() {
  return (
    // useSearchParams needs a Suspense boundary for the static build.
    <Suspense fallback={<LoadingSkeleton variant="block" height={400} />}>
      <GeographyPage />
    </Suspense>
  );
}
