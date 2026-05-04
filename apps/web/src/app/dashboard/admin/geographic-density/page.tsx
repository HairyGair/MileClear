"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

// Geographic density heatmap. Audit follow-up #4 of 5 (aggregate
// health-dashboard upgrades). Where are users actually starting trips?
// Helps with rollout decisions, regional targeting, and spotting
// concentration risk (eg "85% of activity is from Greater London").
//
// Trip starts are bucketed onto a 0.1° grid (~11km cells in the UK).
// A privacy floor of 5 distinct users per cell prevents individuals
// from being identifiable by a single home/work pin.

interface Cell {
  lat: number;
  lng: number;
  tripCount: number;
  userCount: number;
}

interface Data {
  windowDays: number;
  gridSizeDegrees: number;
  minUsersPerCell: number;
  cells: Cell[];
  totalTrips: number;
  maxTripsInCell: number;
  generatedAt: string;
}

// UK bounding box (rough, generous):
// lat 49.5 (Channel) — 61.0 (Shetland)
// lng -8.5 (Western Ireland-adjacent waters / outer Hebrides) — 2.0 (Lowestoft)
const LAT_MIN = 49.5;
const LAT_MAX = 61.0;
const LNG_MIN = -8.5;
const LNG_MAX = 2.0;

// SVG canvas size. Aspect ratio is rough but readable.
const SVG_WIDTH = 720;
const SVG_HEIGHT = 900;

function project(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * SVG_WIDTH;
  // SVG y grows downward, latitude grows upward.
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_HEIGHT;
  return { x, y };
}

// Hand-traced simplified UK outlines. Points are [lat, lng]. Order
// goes around the coast clockwise from the north for Great Britain,
// and similarly for Northern Ireland. Detail is intentionally coarse
// — admin diagnostic tool, not a navigation map.
const GB_OUTLINE: Array<[number, number]> = [
  [58.65, -3.05], // John o'Groats
  [58.45, -2.95], // Wick coast
  [57.70, -2.05], // Banff / Moray
  [57.15, -2.10], // Aberdeen
  [56.55, -2.50], // Arbroath / Dundee
  [56.05, -2.55], // Berwickshire
  [55.50, -1.60], // Northumberland
  [54.95, -1.45], // Newcastle / Tynemouth
  [54.55, -0.65], // Whitby
  [54.10, -0.10], // Bridlington
  [53.55, 0.10],  // Spurn / Humber
  [53.10, 0.35],  // Skegness
  [52.95, 1.35],  // Cromer
  [52.50, 1.75],  // Lowestoft (easternmost)
  [52.05, 1.35],  // Felixstowe
  [51.50, 0.80],  // Southend / Thames mouth
  [51.40, 1.40],  // Margate / North Foreland
  [51.10, 1.30],  // Dover
  [50.85, 0.55],  // Hastings
  [50.75, -0.10], // Brighton
  [50.75, -1.10], // Portsmouth / Selsey
  [50.60, -1.95], // Bournemouth / Poole
  [50.55, -2.45], // Weymouth
  [50.20, -3.55], // Start Point
  [50.35, -4.15], // Plymouth
  [50.05, -5.20], // Lizard
  [50.10, -5.70], // Land's End
  [51.00, -4.25], // Bideford / N. Devon
  [51.20, -4.20], // Ilfracombe
  [51.40, -3.20], // Cardiff
  [51.70, -3.05], // Newport / Severn
  [51.65, -4.20], // Tenby
  [51.70, -5.30], // Pembrokeshire
  [52.35, -4.10], // Aberystwyth
  [52.90, -4.60], // Llyn peninsula
  [53.30, -4.55], // Anglesey
  [53.30, -3.10], // North Wales coast
  [53.40, -3.05], // Liverpool / Wirral
  [53.85, -3.05], // Blackpool / Fylde
  [54.05, -2.85], // Morecambe Bay
  [54.50, -3.55], // Whitehaven / Cumbria
  [54.95, -3.55], // Solway Firth
  [54.65, -4.95], // Galloway / Mull of Galloway
  [55.10, -4.65], // Ayrshire
  [55.45, -4.85], // Ayr
  [55.30, -5.65], // Mull of Kintyre
  [56.05, -5.65], // Knapdale / Lorne
  [56.45, -5.50], // Oban
  [56.85, -5.95], // Ardnamurchan
  [57.30, -5.85], // Kyle of Lochalsh
  [57.85, -5.50], // Wester Ross
  [58.30, -5.10], // Ullapool / Assynt
  [58.60, -5.00], // Cape Wrath
  [58.55, -4.40], // Tongue / Bettyhill
  [58.65, -3.05], // John o'Groats (close)
];

const NI_OUTLINE: Array<[number, number]> = [
  [55.10, -7.45], // Inishowen / Lough Foyle west
  [55.15, -6.75], // Coleraine / Antrim coast
  [55.20, -6.30], // Giant's Causeway
  [54.85, -5.80], // Larne
  [54.60, -5.55], // Belfast Lough mouth
  [54.40, -5.45], // Ards peninsula
  [54.20, -5.85], // Strangford / Newcastle
  [54.05, -6.30], // Newry / Carlingford
  [54.30, -7.65], // Fermanagh
  [54.55, -7.85], // Donegal border
  [55.05, -7.45], // back to NI northwest
];

function polygonPath(coords: Array<[number, number]>): string {
  return (
    coords
      .map(([lat, lng], i) => {
        const { x, y } = project(lat, lng);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

const UK_PATHS = [polygonPath(GB_OUTLINE), polygonPath(NI_OUTLINE)];

function colorForIntensity(t: number): string {
  // 0..1 → cool (low) to hot (high). Uses amber accent at the top.
  if (t <= 0) return "#1e293b";
  if (t < 0.15) return "#334155";
  if (t < 0.3) return "#475569";
  if (t < 0.5) return "#a16207";
  if (t < 0.7) return "#ca8a04";
  if (t < 0.85) return "#eab308";
  return "#fcd34d";
}

export default function GeographicDensityPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ data: Data }>("/admin/geographic-density")
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
  }, []);

  const topCells = useMemo(() => {
    if (!data) return [];
    return [...data.cells]
      .sort((a, b) => b.tripCount - a.tripCount)
      .slice(0, 10);
  }, [data]);

  const cellPixelSize = useMemo(() => {
    if (!data) return 0;
    const w = (data.gridSizeDegrees / (LNG_MAX - LNG_MIN)) * SVG_WIDTH;
    const h = (data.gridSizeDegrees / (LAT_MAX - LAT_MIN)) * SVG_HEIGHT;
    return { w, h };
  }, [data]);

  return (
    <div style={{ padding: "1.5rem 0", maxWidth: 1200 }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/admin" style={{ color: "#94a3b8", fontSize: "0.875rem", textDecoration: "none" }}>
          ← Admin
        </Link>
      </div>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb", marginBottom: "0.5rem" }}>
        Geographic Density
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem", lineHeight: 1.6 }}>
        Trip starts from the last {data?.windowDays ?? 30} days, bucketed onto a{" "}
        {data?.gridSizeDegrees ?? 0.1}° grid (~11km cells). Cells are only shown when
        at least {data?.minUsersPerCell ?? 5} distinct users have started a trip
        there, so individual users can't be identified from their corner of the map.
      </p>

      {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
      {error && <p style={{ color: "#ef4444" }}>Error: {error}</p>}

      {data && cellPixelSize && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "1.5rem" }}>
            {/* Map */}
            <div
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12,
                padding: "0.5rem",
              }}
            >
              <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                style={{ width: "100%", height: "auto", display: "block" }}
                role="img"
                aria-label="UK trip-start density heatmap"
              >
                {/* Sea (background) */}
                <rect
                  x={0}
                  y={0}
                  width={SVG_WIDTH}
                  height={SVG_HEIGHT}
                  fill="#0f172a"
                />

                {/* UK landmass (rough hand-traced outline) */}
                {UK_PATHS.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="#1e293b"
                    stroke="rgba(148,163,184,0.35)"
                    strokeWidth={1}
                    strokeLinejoin="round"
                  />
                ))}

                {/* Cells */}
                {data.cells.map((c) => {
                  const { x, y } = project(c.lat, c.lng);
                  const intensity = c.tripCount / Math.max(data.maxTripsInCell, 1);
                  return (
                    <rect
                      key={`${c.lat}_${c.lng}`}
                      x={x - cellPixelSize.w / 2}
                      y={y - cellPixelSize.h / 2}
                      width={cellPixelSize.w}
                      height={cellPixelSize.h}
                      fill={colorForIntensity(intensity)}
                      opacity={0.85}
                    >
                      <title>
                        {c.lat.toFixed(2)}, {c.lng.toFixed(2)} — {c.tripCount} trip
                        {c.tripCount !== 1 ? "s" : ""} from {c.userCount} user
                        {c.userCount !== 1 ? "s" : ""}
                      </title>
                    </rect>
                  );
                })}

                {/* Latitude reference lines (every 2°) */}
                {Array.from({ length: 7 }, (_, i) => {
                  const lat = Math.floor(LAT_MIN) + 1 + i * 2;
                  const { y } = project(lat, 0);
                  return (
                    <g key={`lat${lat}`}>
                      <line
                        x1={0}
                        x2={SVG_WIDTH}
                        y1={y}
                        y2={y}
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth={1}
                      />
                      <text
                        x={6}
                        y={y - 2}
                        fill="rgba(148,163,184,0.6)"
                        fontSize={10}
                        fontFamily="monospace"
                      >
                        {lat}°
                      </text>
                    </g>
                  );
                })}
                {/* Longitude reference lines (every 2°) */}
                {Array.from({ length: 6 }, (_, i) => {
                  const lng = Math.floor(LNG_MIN) + 1 + i * 2;
                  const { x } = project(0, lng);
                  return (
                    <g key={`lng${lng}`}>
                      <line
                        x1={x}
                        x2={x}
                        y1={0}
                        y2={SVG_HEIGHT}
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth={1}
                      />
                      <text
                        x={x + 2}
                        y={SVG_HEIGHT - 6}
                        fill="rgba(148,163,184,0.6)"
                        fontSize={10}
                        fontFamily="monospace"
                      >
                        {lng}°
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Legend */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 0.5rem 0.25rem", fontSize: "0.75rem", color: "#94a3b8" }}>
                <span>Less</span>
                {[0.05, 0.2, 0.4, 0.6, 0.78, 0.95].map((t) => (
                  <span
                    key={t}
                    style={{
                      width: 24,
                      height: 12,
                      background: colorForIntensity(t),
                      borderRadius: 2,
                    }}
                  />
                ))}
                <span>More</span>
              </div>
            </div>

            {/* Top cells panel */}
            <aside>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "0.75rem",
                  marginBottom: "1.5rem",
                }}
              >
                <Stat label="Cells visible" value={data.cells.length.toLocaleString("en-GB")} />
                <Stat label="Trips covered" value={data.totalTrips.toLocaleString("en-GB")} />
                <Stat label="Hottest cell" value={`${data.maxTripsInCell.toLocaleString("en-GB")} trips`} />
                <Stat label="Window" value={`${data.windowDays} days`} />
              </div>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "#f9fafb", marginBottom: "0.75rem" }}>
                Top 10 cells
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {topCells.map((c, idx) => (
                  <div
                    key={`${c.lat}_${c.lng}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr auto",
                      gap: 8,
                      alignItems: "center",
                      padding: "0.5rem 0.75rem",
                      background: "rgba(15,23,42,0.6)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8,
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span style={{ color: "#64748b", fontFamily: "monospace" }}>{idx + 1}.</span>
                    <span style={{ color: "#cbd5e1", fontFamily: "monospace" }}>
                      {c.lat.toFixed(2)}, {c.lng.toFixed(2)}
                    </span>
                    <span style={{ color: "#fcd34d", fontWeight: 600 }}>
                      {c.tripCount.toLocaleString("en-GB")}
                    </span>
                  </div>
                ))}
                {topCells.length === 0 && (
                  <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
                    No cells passed the privacy floor in this window.
                  </p>
                )}
              </div>
            </aside>
          </div>

          <p style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "1.5rem" }}>
            Generated {new Date(data.generatedAt).toLocaleString("en-GB")}. Cells are
            anonymised — coordinates are bucket centres rounded to 0.1°, never the
            original GPS coordinate. Cells with fewer than {data.minUsersPerCell} distinct
            users are suppressed.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.6)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        padding: "0.75rem",
      }}
    >
      <div style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: "#f9fafb", fontSize: "1.125rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}
