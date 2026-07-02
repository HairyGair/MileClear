"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../../../../lib/api";

// Geographic density — admin map of where trips start and end, enriched
// with reach, growth, premium and platform signals. Real OSM basemap
// (Leaflet), configurable window / grid / privacy floor, and a metric
// selector that recolours cells by trips, users, new signups, premium
// density, engagement, business share, or growth vs the prior window.

interface Cell {
  lat: number;
  lng: number;
  town: string;
  nation: string;
  trips: number;
  users: number;
  newUsers: number;
  premiumUsers: number;
  businessTrips: number;
  personalTrips: number;
  topPlatform: string | null;
  avgTripsPerUser: number;
  avgDistanceMiles: number;
  prevTrips: number;
  growthPct: number | null;
}

interface Data {
  windowDays: number;
  gridSizeDegrees: number;
  minUsersPerCell: number;
  startCells: Cell[];
  endCells: Cell[];
  totalTrips: number;
  totalUsers: number;
  maxTripsInCell: number;
  suppressedCells: number;
  suppressedTrips: number;
  concentration: { top3Share: number; top5Share: number; top10Share: number };
  nations: Array<{ nation: string; trips: number }>;
  fastestGrowing: Cell[];
  newAreas: Cell[];
  generatedAt: string;
}

type MetricKey =
  | "trips"
  | "users"
  | "newUsers"
  | "premiumUsers"
  | "avgTripsPerUser"
  | "businessShare"
  | "growthPct";

const METRICS: Array<{ key: MetricKey; label: string; diverging?: boolean; get: (c: Cell) => number | null; fmt: (v: number | null) => string }> = [
  { key: "trips", label: "Trips", get: (c) => c.trips, fmt: (v) => (v ?? 0).toLocaleString("en-GB") },
  { key: "users", label: "Distinct users", get: (c) => c.users, fmt: (v) => (v ?? 0).toLocaleString("en-GB") },
  { key: "newUsers", label: "New signups", get: (c) => c.newUsers, fmt: (v) => (v ?? 0).toLocaleString("en-GB") },
  { key: "premiumUsers", label: "Premium users", get: (c) => c.premiumUsers, fmt: (v) => (v ?? 0).toLocaleString("en-GB") },
  { key: "avgTripsPerUser", label: "Trips / user", get: (c) => c.avgTripsPerUser, fmt: (v) => (v ?? 0).toFixed(1) },
  { key: "businessShare", label: "Business share", get: (c) => (c.trips > 0 ? Math.round((c.businessTrips / c.trips) * 100) : 0), fmt: (v) => `${v ?? 0}%` },
  { key: "growthPct", label: "Growth vs prev", diverging: true, get: (c) => c.growthPct, fmt: (v) => (v == null ? "new" : `${v > 0 ? "+" : ""}${v}%`) },
];

// Grid cells are ~5-28km squares, so one town can span several cells that all
// carry the same nearest place-name. For the ranked lists we merge cells that
// share a town into a single row (the map + CSV deliberately stay per-cell).
// Trip counts are exact; distinct-user counts are summed across a town's cells,
// so a driver who crosses a cell boundary can be counted in more than one.
function aggregateByTown(cells: Cell[]): Cell[] {
  const groups = new Map<string, Cell & { _sumDist: number; _anchorTrips: number }>();
  for (const c of cells) {
    const g = groups.get(c.town);
    if (!g) {
      groups.set(c.town, { ...c, _sumDist: c.avgDistanceMiles * c.trips, _anchorTrips: c.trips });
      continue;
    }
    g.trips += c.trips;
    g.users += c.users;
    g.newUsers += c.newUsers;
    g.premiumUsers += c.premiumUsers;
    g.businessTrips += c.businessTrips;
    g.personalTrips += c.personalTrips;
    g.prevTrips += c.prevTrips;
    g._sumDist += c.avgDistanceMiles * c.trips;
    // Anchor the town's coordinates + top platform to its busiest cell.
    if (c.trips > g._anchorTrips) {
      g._anchorTrips = c.trips;
      g.lat = c.lat;
      g.lng = c.lng;
      g.topPlatform = c.topPlatform;
    }
  }
  return [...groups.values()].map((g) => {
    const { _sumDist, _anchorTrips, ...rest } = g;
    void _anchorTrips;
    return {
      ...rest,
      avgDistanceMiles: g.trips > 0 ? Math.round((_sumDist / g.trips) * 10) / 10 : 0,
      avgTripsPerUser: g.users > 0 ? Math.round((g.trips / g.users) * 10) / 10 : 0,
      growthPct: g.prevTrips > 0 ? Math.round(((g.trips - g.prevTrips) / g.prevTrips) * 100) : null,
    } as Cell;
  });
}

const WINDOWS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: 3650 },
];
const GRIDS = [
  { label: "~5km", grid: 0.05 },
  { label: "~11km", grid: 0.1 },
  { label: "~28km", grid: 0.25 },
];
const FLOORS = [1, 3, 5];

function seqColor(t: number): string {
  if (t <= 0) return "#1e293b";
  if (t < 0.15) return "#334155";
  if (t < 0.3) return "#475569";
  if (t < 0.5) return "#a16207";
  if (t < 0.7) return "#ca8a04";
  if (t < 0.85) return "#eab308";
  return "#fcd34d";
}
function divColor(v: number | null): string {
  if (v == null) return "#3b82f6"; // brand-new area (no prior activity)
  if (v <= -50) return "#b91c1c";
  if (v < 0) return "#ef4444";
  if (v === 0) return "#64748b";
  if (v < 25) return "#4d7c0f";
  if (v < 75) return "#16a34a";
  return "#22c55e";
}

const NATION_COLORS: Record<string, string> = {
  England: "#fcd34d",
  Scotland: "#60a5fa",
  Wales: "#34d399",
  "Northern Ireland": "#f472b6",
};

export default function GeographicDensityPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server params (trigger refetch)
  const [days, setDays] = useState(90);
  const [grid, setGrid] = useState(0.1);
  const [floor, setFloor] = useState(1);
  // Client-only view state
  const [metric, setMetric] = useState<MetricKey>("trips");
  const [mode, setMode] = useState<"starts" | "ends">("starts");

  const mapRef = useRef<LeafletMap | null>(null);
  const cellLayerRef = useRef<LayerGroup | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(0);

  const metricDef = useMemo(() => METRICS.find((m) => m.key === metric)!, [metric]);
  const cells = useMemo(() => (data ? (mode === "starts" ? data.startCells : data.endCells) : []), [data, mode]);

  // ── Fetch ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<{ data: Data }>(`/admin/geographic-density?days=${days}&grid=${grid}&minUsers=${floor}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, grid, floor]);

  // ── Init Leaflet map once ──
  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !mapElRef.current || mapRef.current) return;
      const map = L.map(mapElRef.current, { attributionControl: true, minZoom: 4, maxZoom: 12 }).setView([54.5, -3.2], 6);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: "abcd",
      }).addTo(map);
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
        rect.bindPopup(
          `<div style="font-family:system-ui;font-size:13px;line-height:1.5;min-width:180px">
            <div style="font-weight:700;color:#0f172a;margin-bottom:4px">${escapeHtml(c.town)}</div>
            <div style="color:#475569;font-size:11px;margin-bottom:6px">${c.nation} · ${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}</div>
            <table style="border-collapse:collapse;color:#334155">
              <tr><td style="padding:1px 8px 1px 0">Trips</td><td style="text-align:right;font-weight:600">${c.trips.toLocaleString("en-GB")}</td></tr>
              <tr><td style="padding:1px 8px 1px 0">Users</td><td style="text-align:right;font-weight:600">${c.users}</td></tr>
              <tr><td style="padding:1px 8px 1px 0">New signups</td><td style="text-align:right;font-weight:600">${c.newUsers}</td></tr>
              <tr><td style="padding:1px 8px 1px 0">Premium</td><td style="text-align:right;font-weight:600">${c.premiumUsers}</td></tr>
              <tr><td style="padding:1px 8px 1px 0">Business</td><td style="text-align:right;font-weight:600">${c.trips > 0 ? Math.round((c.businessTrips / c.trips) * 100) : 0}%</td></tr>
              <tr><td style="padding:1px 8px 1px 0">Trips/user</td><td style="text-align:right;font-weight:600">${c.avgTripsPerUser.toFixed(1)}</td></tr>
              <tr><td style="padding:1px 8px 1px 0">Avg distance</td><td style="text-align:right;font-weight:600">${c.avgDistanceMiles.toFixed(1)} mi</td></tr>
              <tr><td style="padding:1px 8px 1px 0">Growth</td><td style="text-align:right;font-weight:600">${c.growthPct == null ? "new" : (c.growthPct > 0 ? "+" : "") + c.growthPct + "%"}</td></tr>
              ${c.topPlatform ? `<tr><td style="padding:1px 8px 1px 0">Top platform</td><td style="text-align:right;font-weight:600">${escapeHtml(c.topPlatform)}</td></tr>` : ""}
            </table>
          </div>`
        );
        rect.addTo(layer);
      }
    })();
  }, [data, cells, metricDef, mapReady]);

  // Ranked lists merge cells by town so one place shows once. The map keeps
  // per-cell `cells`.
  const townCells = useMemo(() => aggregateByTown(cells), [cells]);
  const rankedCells = useMemo(() => {
    return [...townCells]
      .map((c) => ({ c, v: metricDef.get(c) }))
      .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
      .slice(0, 10);
  }, [townCells, metricDef]);

  // Momentum, town-aggregated (start cells only — growth is start-based).
  const momentum = useMemo(() => {
    if (!data) return { fastestGrowing: [] as Cell[], newAreas: [] as Cell[] };
    const towns = aggregateByTown(data.startCells);
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
    const header = "town,nation,lat,lng,trips,users,newUsers,premiumUsers,businessTrips,personalTrips,topPlatform,avgTripsPerUser,avgDistanceMiles,prevTrips,growthPct";
    const rows = cells.map((c) =>
      [c.town, c.nation, c.lat, c.lng, c.trips, c.users, c.newUsers, c.premiumUsers, c.businessTrips, c.personalTrips, c.topPlatform ?? "", c.avgTripsPerUser, c.avgDistanceMiles, c.prevTrips, c.growthPct ?? ""]
        .map((x) => (typeof x === "string" && x.includes(",") ? `"${x}"` : x))
        .join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geographic-density-${mode}-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, cells, mode, days]);

  const maxNationTrips = data ? Math.max(1, ...data.nations.map((n) => n.trips)) : 1;

  return (
    <div style={{ padding: "1.5rem 0", maxWidth: 1280 }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/admin" style={{ color: "#94a3b8", fontSize: "0.875rem", textDecoration: "none" }}>
          ← Admin
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "0.5rem" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb" }}>Geographic Density</h1>
        <button onClick={exportCsv} disabled={!data} style={btnStyle}>
          Export CSV
        </button>
      </div>
      <p style={{ color: "#94a3b8", marginBottom: "1.25rem", lineHeight: 1.6, maxWidth: 820 }}>
        Where trips {mode === "starts" ? "start" : "end"}, on a {data?.gridSizeDegrees ?? grid}° grid. Cells are anonymised to
        their grid-centre and shown when at least {data?.minUsersPerCell ?? floor} distinct user
        {(data?.minUsersPerCell ?? floor) === 1 ? "" : "s"} appear. Recolour by any signal below.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", marginBottom: "1.25rem", alignItems: "center" }}>
        <ControlGroup label="Window">
          {WINDOWS.map((w) => (
            <Chip key={w.days} active={days === w.days} onClick={() => setDays(w.days)}>{w.label}</Chip>
          ))}
        </ControlGroup>
        <ControlGroup label="Cell size">
          {GRIDS.map((g) => (
            <Chip key={g.grid} active={grid === g.grid} onClick={() => setGrid(g.grid)}>{g.label}</Chip>
          ))}
        </ControlGroup>
        <ControlGroup label="Privacy floor">
          {FLOORS.map((f) => (
            <Chip key={f} active={floor === f} onClick={() => setFloor(f)}>≥{f}</Chip>
          ))}
        </ControlGroup>
        <ControlGroup label="Points">
          <Chip active={mode === "starts"} onClick={() => setMode("starts")}>Starts</Chip>
          <Chip active={mode === "ends"} onClick={() => setMode("ends")}>Ends</Chip>
        </ControlGroup>
        <ControlGroup label="Colour by">
          {METRICS.map((m) => (
            <Chip key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</Chip>
          ))}
        </ControlGroup>
      </div>

      {error && <p style={{ color: "#ef4444" }}>Error: {error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: "1.5rem", alignItems: "start" }}>
        {/* Map */}
        <div style={{ position: "relative", background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
          <div ref={mapElRef} style={{ height: 640, width: "100%", background: "#0f172a" }} />
          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.5)", color: "#94a3b8", pointerEvents: "none" }}>
              Loading…
            </div>
          )}
          {/* Legend */}
          <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 500, background: "rgba(15,23,42,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "0.5rem 0.6rem", fontSize: "0.7rem", color: "#cbd5e1" }}>
            <div style={{ marginBottom: 4, color: "#94a3b8" }}>{metricDef.label}</div>
            {metricDef.diverging ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>-</span>
                {[-60, -10, 0, 20, 60, 120].map((v) => (
                  <span key={v} style={{ width: 18, height: 10, background: divColor(v), borderRadius: 2 }} />
                ))}
                <span style={{ width: 18, height: 10, background: divColor(null), borderRadius: 2 }} title="new area" />
                <span>+/new</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>Low</span>
                {[0.05, 0.2, 0.4, 0.6, 0.78, 0.95].map((t) => (
                  <span key={t} style={{ width: 18, height: 10, background: seqColor(t), borderRadius: 2 }} />
                ))}
                <span>High</span>
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        <aside style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Headline stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
            <Stat label="Cells shown" value={(cells.length).toLocaleString("en-GB")} />
            <Stat label="Trips covered" value={(data?.totalTrips ?? 0).toLocaleString("en-GB")} />
            <Stat label="Distinct users" value={(data?.totalUsers ?? 0).toLocaleString("en-GB")} />
            <Stat label="Hottest cell" value={`${(data?.maxTripsInCell ?? 0).toLocaleString("en-GB")}`} />
          </div>

          {data && data.suppressedCells > 0 && (
            <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: 8, padding: "0.6rem 0.75rem", fontSize: "0.75rem", color: "#d4b87a" }}>
              {data.suppressedCells.toLocaleString("en-GB")} cell{data.suppressedCells === 1 ? "" : "s"} ({data.suppressedTrips.toLocaleString("en-GB")} trips) hidden by the ≥{data.minUsersPerCell}-user floor. Lower it to reveal them.
            </div>
          )}

          {/* Concentration */}
          {data && (
            <Panel title="Concentration">
              <Row label="Top 3 areas" value={`${data.concentration.top3Share}% of trips`} />
              <Row label="Top 5 areas" value={`${data.concentration.top5Share}%`} />
              <Row label="Top 10 areas" value={`${data.concentration.top10Share}%`} />
            </Panel>
          )}

          {/* Nations */}
          {data && data.nations.length > 0 && (
            <Panel title="By nation">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.nations.map((n) => (
                  <div key={n.nation}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#cbd5e1", marginBottom: 2 }}>
                      <span>{n.nation}</span>
                      <span>{n.trips.toLocaleString("en-GB")}</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${(n.trips / maxNationTrips) * 100}%`, height: "100%", background: NATION_COLORS[n.nation] ?? "#94a3b8" }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Top areas by current metric */}
          <Panel title={`Top areas · ${metricDef.label}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {rankedCells.map(({ c, v }, i) => (
                <div key={c.town} style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 8, alignItems: "center", fontSize: "0.8rem", padding: "0.35rem 0" }}>
                  <span style={{ color: "#64748b", fontFamily: "monospace" }}>{i + 1}</span>
                  <span style={{ color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.town}</span>
                  <span style={{ color: "#fcd34d", fontWeight: 600 }}>{metricDef.fmt(v)}</span>
                </div>
              ))}
              {rankedCells.length === 0 && <p style={{ color: "#64748b", fontSize: "0.8rem" }}>No cells in this view.</p>}
            </div>
          </Panel>

          {/* Growth */}
          {data && mode === "starts" && (momentum.fastestGrowing.length > 0 || momentum.newAreas.length > 0) && (
            <Panel title="Momentum">
              {momentum.fastestGrowing.length > 0 && (
                <>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Fastest growing</div>
                  {momentum.fastestGrowing.map((c) => (
                    <Row key={`g${c.town}`} label={c.town} value={<span style={{ color: "#22c55e" }}>+{c.growthPct}%</span>} />
                  ))}
                </>
              )}
              {momentum.newAreas.length > 0 && (
                <>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: "8px 0 4px" }}>New areas</div>
                  {momentum.newAreas.map((c) => (
                    <Row key={`n${c.town}`} label={c.town} value={<span style={{ color: "#60a5fa" }}>{c.trips} trips</span>} />
                  ))}
                </>
              )}
            </Panel>
          )}
        </aside>
      </div>

      {data && (
        <p style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "1.25rem" }}>
          Generated {new Date(data.generatedAt).toLocaleString("en-GB")}. Coordinates are grid-centres rounded to {data.gridSizeDegrees}°, never raw GPS. Basemap © OpenStreetMap, © CARTO.
        </p>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

const btnStyle: React.CSSProperties = {
  background: "rgba(252,211,77,0.12)",
  border: "1px solid rgba(252,211,77,0.3)",
  color: "#fcd34d",
  borderRadius: 8,
  padding: "0.5rem 0.9rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
};

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "0.65rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(252,211,77,0.15)" : "rgba(15,23,42,0.6)",
        border: `1px solid ${active ? "rgba(252,211,77,0.4)" : "rgba(255,255,255,0.08)"}`,
        color: active ? "#fcd34d" : "#94a3b8",
        borderRadius: 7,
        padding: "0.3rem 0.65rem",
        fontSize: "0.78rem",
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "0.65rem 0.75rem" }}>
      <div style={{ color: "#64748b", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#f9fafb", fontSize: "1.1rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "0.85rem 1rem" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem", fontWeight: 600, color: "#f9fafb", marginBottom: "0.6rem" }}>{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", padding: "0.25rem 0", gap: 8 }}>
      <span style={{ color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ color: "#e2e8f0", fontWeight: 600, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
