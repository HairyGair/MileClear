// Data helpers for the density map page (admin/geographic-density): response
// types, the colour-by metrics, town merging and the map colour scales.

export interface Cell {
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

export interface TownUserCount {
  users: number;
  newUsers: number;
  premiumUsers: number;
}

export interface DensityData {
  windowDays: number;
  gridSizeDegrees: number;
  minUsersPerCell: number;
  startCells: Cell[];
  endCells: Cell[];
  startTownUserCounts: Record<string, TownUserCount>;
  endTownUserCounts: Record<string, TownUserCount>;
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

export type MetricKey = "trips" | "users" | "newUsers" | "premiumUsers" | "avgTripsPerUser" | "businessShare" | "growthPct";

export interface MetricDef {
  key: MetricKey;
  label: string;
  diverging?: boolean;
  get: (c: Cell) => number | null;
  fmt: (v: number | null) => string;
}

export const METRICS: MetricDef[] = [
  { key: "trips", label: "Trips", get: (c) => c.trips, fmt: (v) => (v ?? 0).toLocaleString("en-GB") },
  { key: "users", label: "Drivers", get: (c) => c.users, fmt: (v) => (v ?? 0).toLocaleString("en-GB") },
  { key: "newUsers", label: "New sign-ups", get: (c) => c.newUsers, fmt: (v) => (v ?? 0).toLocaleString("en-GB") },
  { key: "premiumUsers", label: "Pro drivers", get: (c) => c.premiumUsers, fmt: (v) => (v ?? 0).toLocaleString("en-GB") },
  { key: "avgTripsPerUser", label: "Trips per driver", get: (c) => c.avgTripsPerUser, fmt: (v) => (v ?? 0).toFixed(1) },
  { key: "businessShare", label: "Business share", get: (c) => (c.trips > 0 ? Math.round((c.businessTrips / c.trips) * 100) : 0), fmt: (v) => `${v ?? 0}%` },
  { key: "growthPct", label: "Growth vs before", diverging: true, get: (c) => c.growthPct, fmt: (v) => (v == null ? "new" : `${v > 0 ? "+" : ""}${v}%`) },
];

export const WINDOWS = [
  { label: "7d", title: "7 days", days: 7 },
  { label: "30d", title: "30 days", days: 30 },
  { label: "90d", title: "90 days", days: 90 },
  { label: "1y", title: "1 year", days: 365 },
  { label: "All", title: "All time", days: 3650 },
];

export const GRIDS = [
  { label: "~5km", grid: 0.05 },
  { label: "~11km", grid: 0.1 },
  { label: "~28km", grid: 0.25 },
];

export const FLOORS = [1, 3, 5];

// Grid cells are ~5-28km squares, so one town can span several cells that all
// carry the same nearest place-name. For the ranked lists we merge cells that
// share a town into a single row (the map + CSV deliberately stay per-cell).
// Trip counts are exact; distinct-user counts come from the per-town counts
// the API sends, falling back to a sum across cells (which can count a driver
// who crosses a cell boundary more than once).
export function aggregateByTown(cells: Cell[], townUserCounts: Record<string, TownUserCount>): Cell[] {
  const groups = new Map<string, Cell & { _sumDist: number; _anchorTrips: number }>();
  for (const c of cells) {
    const g = groups.get(c.town);
    if (!g) {
      groups.set(c.town, { ...c, _sumDist: c.avgDistanceMiles * c.trips, _anchorTrips: c.trips });
      continue;
    }
    g.trips += c.trips;
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
    // Distinct users deduped across the town's cells. Summing the per-cell
    // counts double-counts a driver who spans several cells (that's how a
    // town could show more "premium users" than exist on the whole platform).
    const tc = townUserCounts[g.town];
    const users = tc ? tc.users : g.users;
    return {
      ...rest,
      users,
      newUsers: tc ? tc.newUsers : g.newUsers,
      premiumUsers: tc ? tc.premiumUsers : g.premiumUsers,
      avgDistanceMiles: g.trips > 0 ? Math.round((_sumDist / g.trips) * 10) / 10 : 0,
      avgTripsPerUser: users > 0 ? Math.round((g.trips / users) * 10) / 10 : 0,
      growthPct: g.prevTrips > 0 ? Math.round(((g.trips - g.prevTrips) / g.prevTrips) * 100) : null,
    } as Cell;
  });
}

// Map colour scales. Leaflet layers need concrete colours, so these are hex
// values rather than the admin CSS tokens.
export function seqColor(t: number): string {
  if (t <= 0) return "#1e293b";
  if (t < 0.15) return "#334155";
  if (t < 0.3) return "#475569";
  if (t < 0.5) return "#a16207";
  if (t < 0.7) return "#ca8a04";
  if (t < 0.85) return "#eab308";
  return "#fcd34d";
}

export function divColor(v: number | null): string {
  if (v == null) return "#3b82f6"; // brand-new area (no prior activity)
  if (v <= -50) return "#b91c1c";
  if (v < 0) return "#ef4444";
  if (v === 0) return "#64748b";
  if (v < 25) return "#4d7c0f";
  if (v < 75) return "#16a34a";
  return "#22c55e";
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** The click popup for one cell (Leaflet renders it on a white card). */
export function cellPopupHtml(c: Cell): string {
  return `<div style="font-family:system-ui;font-size:13px;line-height:1.5;min-width:180px">
    <div style="font-weight:700;color:#0f172a;margin-bottom:4px">${escapeHtml(c.town)}</div>
    <div style="color:#475569;font-size:11px;margin-bottom:6px">${escapeHtml(c.nation)} · ${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}</div>
    <table style="border-collapse:collapse;color:#334155">
      <tr><td style="padding:1px 8px 1px 0">Trips</td><td style="text-align:right;font-weight:600">${c.trips.toLocaleString("en-GB")}</td></tr>
      <tr><td style="padding:1px 8px 1px 0">Drivers</td><td style="text-align:right;font-weight:600">${c.users}</td></tr>
      <tr><td style="padding:1px 8px 1px 0">New sign-ups</td><td style="text-align:right;font-weight:600">${c.newUsers}</td></tr>
      <tr><td style="padding:1px 8px 1px 0">Pro</td><td style="text-align:right;font-weight:600">${c.premiumUsers}</td></tr>
      <tr><td style="padding:1px 8px 1px 0">Business</td><td style="text-align:right;font-weight:600">${c.trips > 0 ? Math.round((c.businessTrips / c.trips) * 100) : 0}%</td></tr>
      <tr><td style="padding:1px 8px 1px 0">Trips per driver</td><td style="text-align:right;font-weight:600">${c.avgTripsPerUser.toFixed(1)}</td></tr>
      <tr><td style="padding:1px 8px 1px 0">Avg distance</td><td style="text-align:right;font-weight:600">${c.avgDistanceMiles.toFixed(1)} mi</td></tr>
      <tr><td style="padding:1px 8px 1px 0">Growth</td><td style="text-align:right;font-weight:600">${c.growthPct == null ? "new" : (c.growthPct > 0 ? "+" : "") + c.growthPct + "%"}</td></tr>
      ${c.topPlatform ? `<tr><td style="padding:1px 8px 1px 0">Top platform</td><td style="text-align:right;font-weight:600">${escapeHtml(c.topPlatform)}</td></tr>` : ""}
    </table>
  </div>`;
}

/** CSV of the cells currently shown (per cell, not merged by town). */
export function cellsToCsv(cells: Cell[]): string {
  const header =
    "town,nation,lat,lng,trips,users,newUsers,premiumUsers,businessTrips,personalTrips,topPlatform,avgTripsPerUser,avgDistanceMiles,prevTrips,growthPct";
  const rows = cells.map((c) =>
    [c.town, c.nation, c.lat, c.lng, c.trips, c.users, c.newUsers, c.premiumUsers, c.businessTrips, c.personalTrips, c.topPlatform ?? "", c.avgTripsPerUser, c.avgDistanceMiles, c.prevTrips, c.growthPct ?? ""]
      .map((x) => (typeof x === "string" && x.includes(",") ? `"${x}"` : x))
      .join(",")
  );
  return [header, ...rows].join("\n");
}
