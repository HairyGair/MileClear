"use client";

// Density map: where trips start and end, on an anonymised grid, with reach,
// growth, Pro and platform signals. Real OSM basemap (Leaflet, loaded on the
// client only), configurable window / grid / privacy floor, and a metric
// selector that recolours cells. Where NEW drivers sign up from is a separate
// page: admin/geography.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { addDarkBasemap } from "@/lib/basemap";
import {
  FLOORS,
  GRIDS,
  METRICS,
  WINDOWS,
  aggregateByTown,
  cellPopupHtml,
  cellsToCsv,
  divColor,
  seqColor,
  type Cell,
  type DensityData,
  type MetricKey,
} from "@/components/admin/growth/density";
import {
  AdminIcon,
  Badge,
  BarList,
  EmptyState,
  ErrorState,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  Segmented,
  StatLine,
  formatNumber,
  useAdminData,
} from "@/components/admin/ui";

const SIDE_STACK = { display: "flex", flexDirection: "column", gap: "var(--adm-s4)", minWidth: 0 } as const;

export default function GeographicDensityPage() {
  // Server params (trigger a refetch)
  const [days, setDays] = useState(90);
  const [grid, setGrid] = useState(0.1);
  const [floor, setFloor] = useState(1);
  // Client-only view state
  const [metric, setMetric] = useState<MetricKey>("trips");
  const [mode, setMode] = useState<"starts" | "ends">("starts");

  const { data, error, loading, reload } = useAdminData<DensityData>(`/admin/geographic-density?days=${days}&grid=${grid}&minUsers=${floor}`);

  const mapRef = useRef<LeafletMap | null>(null);
  const cellLayerRef = useRef<LayerGroup | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(0);

  const metricDef = useMemo(() => METRICS.find((m) => m.key === metric)!, [metric]);
  const cells = useMemo(() => (data ? (mode === "starts" ? data.startCells : data.endCells) : []), [data, mode]);

  // ── Init the Leaflet map once (client only) ──
  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !mapElRef.current || mapRef.current) return;
      const map = L.map(mapElRef.current, { attributionControl: true, minZoom: 4, maxZoom: 12 }).setView([54.5, -3.2], 6);
      addDarkBasemap(L, map);
      cellLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      // Trigger the cell draw now that the map exists.
      setMapReady((n) => n + 1);
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      cellLayerRef.current = null;
    };
  }, []);

  // ── Draw cells whenever data / metric / mode / map change ──
  useEffect(() => {
    (async () => {
      const L = (await import("leaflet")).default;
      const layer = cellLayerRef.current;
      if (!layer || !data) return;
      layer.clearLayers();

      const half = data.gridSizeDegrees / 2;
      const values = cells.map((c) => metricDef.get(c)).filter((v): v is number => v != null);
      const maxV = values.length ? Math.max(...values) : 1;

      for (const c of cells) {
        const v = metricDef.get(c);
        const color = metricDef.diverging ? divColor(v) : seqColor((v ?? 0) / Math.max(maxV, 1));
        const rect = L.rectangle(
          [
            [c.lat - half, c.lng - half],
            [c.lat + half, c.lng + half],
          ],
          { color, weight: 0.5, fillColor: color, fillOpacity: 0.7, opacity: 0.9 }
        );
        rect.bindPopup(cellPopupHtml(c));
        rect.addTo(layer);
      }
    })();
  }, [data, cells, metricDef, mapReady]);

  // Ranked lists merge cells by town so one place shows once. The map keeps
  // per-cell `cells`.
  const townCells = useMemo(
    () => aggregateByTown(cells, data ? (mode === "starts" ? data.startTownUserCounts : data.endTownUserCounts) : {}),
    [cells, data, mode]
  );
  const rankedCells = useMemo(
    () =>
      [...townCells]
        .map((c) => ({ c, v: metricDef.get(c) }))
        .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
        .slice(0, 10),
    [townCells, metricDef]
  );

  // Momentum, town-aggregated (start cells only: growth is start-based).
  const momentum = useMemo(() => {
    if (!data) return { fastestGrowing: [] as Cell[], newAreas: [] as Cell[] };
    const towns = aggregateByTown(data.startCells, data.startTownUserCounts);
    const fastestGrowing = towns
      .filter((c) => c.growthPct != null && c.prevTrips >= 3)
      .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
      .slice(0, 5);
    const newAreas = towns
      .filter((c) => c.prevTrips === 0 && c.trips >= 3)
      .sort((a, b) => b.trips - a.trips)
      .slice(0, 5);
    return { fastestGrowing, newAreas };
  }, [data]);

  const exportCsv = useCallback(() => {
    if (!data) return;
    const blob = new Blob([cellsToCsv(cells)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geographic-density-${mode}-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, cells, mode, days]);

  const shownFloor = data?.minUsersPerCell ?? floor;
  const kpiLoading = loading && !data;
  const verb = mode === "starts" ? "start" : "end";

  return (
    <>
      <PageHeader
        title="Density map"
        subtitle="Where trips happen: trip start and end points on an anonymised grid, coloured by trips, drivers, sign-ups, Pro, business share or growth."
        updatedAt={data?.generatedAt}
        actions={
          <>
            <Segmented
              label="Time window"
              value={days}
              onChange={setDays}
              options={WINDOWS.map((w) => ({ value: w.days, label: w.label, title: w.title }))}
            />
            <button type="button" className="adm-btn adm-btn--sm" onClick={exportCsv} disabled={!data}>
              Export CSV
            </button>
          </>
        }
      />

      <p className="adm-note" style={{ margin: 0 }}>
        This page shows where trips happen. For where new drivers sign up from, see{" "}
        <Link href="/dashboard/admin/geography" className="adm-link-arrow">
          Sign-ups &amp; geography <AdminIcon name="arrowRight" size={14} />
        </Link>
      </p>

      <Panel title="Map settings">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--adm-s4) var(--adm-s5)", alignItems: "flex-end" }}>
          <Segmented showLabel label="Cell size" value={grid} onChange={setGrid} options={GRIDS.map((g) => ({ value: g.grid, label: g.label }))} />
          <Segmented
            showLabel
            label="Privacy floor"
            value={floor}
            onChange={setFloor}
            options={FLOORS.map((f) => ({ value: f, label: `${f}+`, title: `Hide cells with fewer than ${f} driver${f === 1 ? "" : "s"}` }))}
          />
          <Segmented
            showLabel
            label="Points"
            value={mode}
            onChange={setMode}
            options={[
              { value: "starts", label: "Starts" },
              { value: "ends", label: "Ends" },
            ]}
          />
          <Segmented showLabel label="Colour by" value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.key, label: m.label }))} />
        </div>
      </Panel>

      {error && <ErrorState compact title="Couldn't load the density map." message={error} onRetry={reload} />}

      <Grid min={150}>
        <KpiCard label="Cells shown" value={cells.length} loading={kpiLoading} error={error} />
        <KpiCard label="Trips covered" value={data?.totalTrips ?? 0} tone="accent" loading={kpiLoading} error={error} />
        <KpiCard label="Drivers" value={data?.totalUsers ?? 0} loading={kpiLoading} error={error} hint="Distinct drivers" />
        <KpiCard label="Busiest cell" value={data?.maxTripsInCell ?? 0} loading={kpiLoading} error={error} hint="Trips in one cell" />
      </Grid>

      <div className="adm-split">
        <Panel
          highlight
          flush
          title={`Where trips ${verb}`}
          subtitle={`On a ${data?.gridSizeDegrees ?? grid}° grid. A cell shows only when at least ${shownFloor} distinct driver${shownFloor === 1 ? "" : "s"} appear in it. Click a cell for its figures.`}
          footer={
            <>
              {data && data.suppressedCells > 0 && (
                <>
                  <Badge tone="warn">
                    {formatNumber(data.suppressedCells)} cell{data.suppressedCells === 1 ? "" : "s"} hidden
                  </Badge>{" "}
                  {formatNumber(data.suppressedTrips)} trips are in cells under the {data.minUsersPerCell}-driver floor. Lower the floor to show them.{" "}
                </>
              )}
              Coordinates are grid centres rounded to {data?.gridSizeDegrees ?? grid}°, never raw GPS. Basemap © OpenStreetMap contributors.
            </>
          }
        >
          <div style={{ position: "relative", overflow: "hidden" }}>
            <div ref={mapElRef} style={{ height: "clamp(360px, 65vh, 640px)", width: "100%", background: "#0f172a" }} />
            {loading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(15,23,42,0.5)",
                  color: "var(--adm-text-2)",
                  pointerEvents: "none",
                }}
                role="status"
              >
                Loading the map...
              </div>
            )}
            <MapLegend label={metricDef.label} diverging={!!metricDef.diverging} />
          </div>
        </Panel>

        <div style={SIDE_STACK}>
          <Panel title={`Top areas by ${metricDef.label.toLowerCase()}`} subtitle="Cells that share a town are merged into one row.">
            <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the areas." skeleton={<LoadingSkeleton rows={6} />}>
              {() =>
                rankedCells.length === 0 ? (
                  <EmptyState compact title="No cells in this view">Try a longer window or a lower privacy floor.</EmptyState>
                ) : (
                  <ol className="adm-list" aria-label={`Top areas by ${metricDef.label}`}>
                    {rankedCells.map(({ c, v }, i) => (
                      <li key={c.town} style={{ display: "flex", gap: "var(--adm-s2)", alignItems: "baseline", minWidth: 0 }}>
                        <span style={{ color: "var(--adm-text-3)", width: 18, flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.town}>
                          {c.town}
                        </span>
                        <span style={{ color: "var(--adm-accent)", fontWeight: 600, whiteSpace: "nowrap" }}>{metricDef.fmt(v)}</span>
                      </li>
                    ))}
                  </ol>
                )
              }
            </LoadState>
          </Panel>

          <Panel title="Concentration" subtitle="Share of trips in the busiest areas.">
            <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the concentration figures.">
              {(d) => (
                <div>
                  <StatLine label="Top 3 areas" value={`${d.concentration.top3Share}% of trips`} />
                  <StatLine label="Top 5 areas" value={`${d.concentration.top5Share}%`} />
                  <StatLine label="Top 10 areas" value={`${d.concentration.top10Share}%`} />
                </div>
              )}
            </LoadState>
          </Panel>

          <Panel title="By nation" subtitle={`Trips that ${verb} in each nation.`}>
            <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the nations.">
              {(d) =>
                d.nations.length === 0 ? (
                  <p className="adm-text">No trips in this view.</p>
                ) : (
                  <BarList label="Trips by nation" items={d.nations.map((n) => ({ key: n.nation, label: n.nation, value: n.trips }))} />
                )
              }
            </LoadState>
          </Panel>

          {data && mode === "starts" && (momentum.fastestGrowing.length > 0 || momentum.newAreas.length > 0) && (
            <Panel title="Momentum" subtitle="Compared with the same length of time before this window. Based on trip starts.">
              {momentum.fastestGrowing.length > 0 && (
                <div>
                  <p className="adm-note" style={{ margin: "0 0 var(--adm-s1)" }}>Fastest growing (3+ trips before)</p>
                  {momentum.fastestGrowing.map((c) => (
                    <StatLine key={`g${c.town}`} label={c.town} value={<Badge tone="good">+{c.growthPct}%</Badge>} />
                  ))}
                </div>
              )}
              {momentum.newAreas.length > 0 && (
                <div style={{ marginTop: momentum.fastestGrowing.length > 0 ? "var(--adm-s3)" : 0 }}>
                  <p className="adm-note" style={{ margin: "0 0 var(--adm-s1)" }}>New areas (no trips before)</p>
                  {momentum.newAreas.map((c) => (
                    <StatLine key={`n${c.town}`} label={c.town} value={<Badge tone="info">{formatNumber(c.trips)} trips</Badge>} />
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function MapLegend({ label, diverging }: { label: string; diverging: boolean }) {
  const swatch = (bg: string, title?: string) => (
    <span key={bg + (title ?? "")} title={title} style={{ width: 18, height: 10, background: bg, borderRadius: 2, display: "inline-block" }} />
  );
  return (
    <div
      style={{
        position: "absolute",
        bottom: 10,
        left: 10,
        zIndex: 500,
        background: "rgba(15,23,42,0.88)",
        border: "1px solid var(--adm-border-strong)",
        borderRadius: "var(--adm-radius-sm)",
        padding: "var(--adm-s2)",
        fontSize: "0.7rem",
        color: "var(--adm-text)",
      }}
    >
      <div style={{ marginBottom: 4, color: "var(--adm-text-2)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {diverging ? (
          <>
            <span>Falling</span>
            {[-60, -10, 0, 20, 60, 120].map((v) => swatch(divColor(v)))}
            {swatch(divColor(null), "New area")}
            <span>Rising / new</span>
          </>
        ) : (
          <>
            <span>Low</span>
            {[0.05, 0.2, 0.4, 0.6, 0.78, 0.95].map((t) => swatch(seqColor(t)))}
            <span>High</span>
          </>
        )}
      </div>
    </div>
  );
}
