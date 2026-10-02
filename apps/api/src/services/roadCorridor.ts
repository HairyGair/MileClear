// A driver's "usual roads" (road alerts trial, 2 Oct 2026). Pure, unit-tested.
//
// The corridor is built from the driver's OWN recent GPS breadcrumbs and is
// never shown to anyone else or sent anywhere: it only decides whether a road
// event touches a road this driver uses often.
//
//   1. Snap every breadcrumb of the last six weeks to a ~250 m grid cell.
//   2. Keep a cell only when it was driven through on at least 3 different
//      UK days (one-off journeys do not make a "usual road").
//   3. Record which way the driver travels through each cell (8 compass bins)
//      so a closure on the opposite carriageway, or on a motorway the driver
//      only crosses on a bridge, does not count.
//
// Departure times come from the same trips: the median first start (from
// 04:00) on each weekday, needing at least 3 of the last six of that weekday.

export const CORRIDOR_WINDOW_DAYS = 42;
export const CORRIDOR_MIN_DAYS = 3;

/** ~250 m north-south. */
export const CELL_LAT_DEG = 0.00225;
/** ~250 m east-west at the latitude of Manchester (1 degree of longitude is
 *  about 66 km there; 72 km on the south coast, 62 km in Edinburgh). */
export const CELL_LNG_DEG = 0.0037;

/** Breadcrumbs further apart than this are a gap in the recording, not a
 *  straight road, so the path between them is not filled in. */
const MAX_FILL_GAP_M = 2000;
/** Fill step between breadcrumbs, so a fast sparse stretch still marks every
 *  cell it passes through. */
const FILL_STEP_M = 100;
/** Ignore headings over very short hops (GPS jitter at a standstill). */
const MIN_HEADING_HOP_M = 40;

/** How far either side of the event's line we still count as "on it":
 *  breadcrumbs sit a few metres off the mapped centre line and a cell edge
 *  can fall between them. */
const MATCH_OFFSET_M = 70;
/** Sample spacing along an event's line. */
const SAMPLE_STEP_M = 100;
/** Heading tolerance: the driver's bin centre within this of the event's
 *  direction of travel. 67.5 = one bin either side, so a gently curving road
 *  still matches but a perpendicular crossing (a bridge) never does. */
const HEADING_TOLERANCE_DEG = 67.5;

const EARTH_R_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export type LatLng = [number, number];

export interface CorridorCell {
  /** Distinct UK days the driver passed through this cell. */
  days: number;
  /** Bitmask of the 8 heading bins (0 = north, 1 = north-east, ...) seen. */
  bins: number;
}

export interface Corridor {
  cells: Map<string, CorridorCell>;
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  /** Distinct UK days with any breadcrumbs in the window. */
  drivingDays: number;
}

export interface BreadcrumbTrip {
  /** UK calendar day the trip started on, e.g. "2026-10-02". */
  dayKey: string;
  /** In recorded order. */
  points: { lat: number; lng: number }[];
}

export function haversineMetres(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing a -> b, degrees clockwise from north, 0-360. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const f1 = toRad(a[0]);
  const f2 = toRad(b[0]);
  const dl = toRad(b[1] - a[1]);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export function bearingBin(deg: number): number {
  return Math.floor((((deg + 22.5) % 360) + 360) % 360 / 45) % 8;
}

export function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_LAT_DEG)}:${Math.floor(lng / CELL_LNG_DEG)}`;
}

/** Point `metres` from `p` on `bearing`. Flat-earth step, fine at this scale. */
export function offsetPoint(p: LatLng, bearing: number, metres: number): LatLng {
  const dLat = (metres * Math.cos(toRad(bearing))) / 111320;
  const dLng = (metres * Math.sin(toRad(bearing))) / (111320 * Math.cos(toRad(p[0])));
  return [p[0] + dLat, p[1] + dLng];
}

function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Build the corridor. Trips may be in any order. */
export function buildCorridor(trips: BreadcrumbTrip[], minDays: number = CORRIDOR_MIN_DAYS): Corridor {
  const daysByCell = new Map<string, Set<string>>();
  const binsByCell = new Map<string, number>();
  const drivingDays = new Set<string>();

  const markCell = (p: LatLng, day: string, bin: number | null) => {
    const key = cellKey(p[0], p[1]);
    let s = daysByCell.get(key);
    if (!s) daysByCell.set(key, (s = new Set()));
    s.add(day);
    if (bin != null) binsByCell.set(key, (binsByCell.get(key) ?? 0) | (1 << bin));
  };

  for (const trip of trips) {
    const pts = trip.points.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)
    );
    if (pts.length === 0) continue;
    drivingDays.add(trip.dayKey);
    let prev: LatLng = [pts[0].lat, pts[0].lng];
    markCell(prev, trip.dayKey, null);
    for (let i = 1; i < pts.length; i++) {
      const cur: LatLng = [pts[i].lat, pts[i].lng];
      const d = haversineMetres(prev, cur);
      if (d < MIN_HEADING_HOP_M) {
        // Too close to tell a heading; keep the anchor where it is.
        continue;
      }
      if (d > MAX_FILL_GAP_M) {
        // A gap in the recording: mark the far point, no heading, no fill.
        markCell(cur, trip.dayKey, null);
        prev = cur;
        continue;
      }
      const bin = bearingBin(bearingDeg(prev, cur));
      const steps = Math.max(1, Math.ceil(d / FILL_STEP_M));
      for (let s = 0; s <= steps; s++) markCell(interpolate(prev, cur, s / steps), trip.dayKey, bin);
      prev = cur;
    }
  }

  const cells = new Map<string, CorridorCell>();
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [key, days] of daysByCell) {
    if (days.size < minDays) continue;
    cells.set(key, { days: days.size, bins: binsByCell.get(key) ?? 0 });
    const [i, j] = key.split(":").map(Number);
    minLat = Math.min(minLat, i * CELL_LAT_DEG);
    maxLat = Math.max(maxLat, (i + 1) * CELL_LAT_DEG);
    minLng = Math.min(minLng, j * CELL_LNG_DEG);
    maxLng = Math.max(maxLng, (j + 1) * CELL_LNG_DEG);
  }
  return {
    cells,
    bbox: cells.size > 0 ? { minLat, maxLat, minLng, maxLng } : null,
    drivingDays: drivingDays.size,
  };
}

/** How the event's direction is known. "along": its line runs in the direction
 *  of traffic (one carriageway). "axis": it affects both directions along the
 *  line. "none": a point, or no direction information. */
export type DirectionMode = "along" | "axis" | "none";

export interface EventGeometry {
  lines: LatLng[][];
  points: LatLng[];
  directionMode: DirectionMode;
}

export interface CorridorMatch {
  matched: boolean;
  /** Most days the driver used any matched cell (for the push copy). */
  days: number;
  /** Length of the event's line found on the corridor, metres (0 for points). */
  matchedMetres: number;
}

function headingOk(cell: CorridorCell, bearing: number | null, mode: DirectionMode): boolean {
  if (mode === "none" || bearing == null) return true;
  if (cell.bins === 0) return true; // no heading data for this cell: cannot tell
  for (let b = 0; b < 8; b++) {
    if (!(cell.bins & (1 << b))) continue;
    const centre = b * 45;
    if (angleDiff(centre, bearing) <= HEADING_TOLERANCE_DEG) return true;
    if (mode === "axis" && angleDiff(centre, (bearing + 180) % 360) <= HEADING_TOLERANCE_DEG) return true;
  }
  return false;
}

function lookup(corridor: Corridor, p: LatLng, bearing: number | null, mode: DirectionMode): CorridorCell | null {
  const probes: LatLng[] = [p];
  for (const b of [0, 90, 180, 270]) probes.push(offsetPoint(p, b, MATCH_OFFSET_M));
  let best: CorridorCell | null = null;
  const seen = new Set<string>();
  for (const q of probes) {
    const key = cellKey(q[0], q[1]);
    if (seen.has(key)) continue;
    seen.add(key);
    const cell = corridor.cells.get(key);
    if (cell && headingOk(cell, bearing, mode) && (!best || cell.days > best.days)) best = cell;
  }
  return best;
}

function bboxTouches(corridor: Corridor, geom: EventGeometry): boolean {
  const bb = corridor.bbox;
  if (!bb) return false;
  const padLat = 0.01, padLng = 0.015;
  const all = [...geom.points, ...geom.lines.flat()];
  if (all.length === 0) return false;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of all) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  return !(maxLat < bb.minLat - padLat || minLat > bb.maxLat + padLat || maxLng < bb.minLng - padLng || minLng > bb.maxLng + padLng);
}

/** Does an event touch the driver's usual roads, in their direction? Lines
 *  are sampled every 100 m; each sample's heading is the heading of its own
 *  segment, so a closure on the far carriageway (opposite heading) or a road
 *  the driver only crosses (perpendicular) does not match. */
export function matchEventToCorridor(corridor: Corridor, geom: EventGeometry): CorridorMatch {
  const none: CorridorMatch = { matched: false, days: 0, matchedMetres: 0 };
  if (!bboxTouches(corridor, geom)) return none;
  let days = 0;
  let samples = 0;
  let pointHit = false;

  for (const line of geom.lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const len = haversineMetres(a, b);
      if (len === 0) continue;
      const bearing = bearingDeg(a, b);
      const steps = Math.max(1, Math.ceil(len / SAMPLE_STEP_M));
      for (let s = 0; s < steps; s++) {
        const cell = lookup(corridor, interpolate(a, b, s / steps), bearing, geom.directionMode);
        if (cell) { samples++; days = Math.max(days, cell.days); }
      }
    }
    // A one-point "line" behaves as a point.
    if (line.length === 1) {
      const cell = lookup(corridor, line[0], null, "none");
      if (cell) { pointHit = true; days = Math.max(days, cell.days); }
    }
  }
  for (const p of geom.points) {
    const cell = lookup(corridor, p, null, "none");
    if (cell) { pointHit = true; days = Math.max(days, cell.days); }
  }
  const matched = samples > 0 || pointHit;
  return { matched, days: matched ? days : 0, matchedMetres: samples * SAMPLE_STEP_M };
}

// ── Departure times ────────────────────────────────────────────────

export const UK_TZ = "Europe/London";
/** Starts before this (local) are late-night work, not "setting off". */
export const FIRST_START_EARLIEST_MIN = 4 * 60;
export const DEPARTURE_MIN_SAMPLES = 3;
/** At least DEPARTURE_MIN_SAMPLES starts must sit within this of the median,
 *  or the weekday has no usual time. */
const DEPARTURE_SPREAD_MIN = 60;

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface LocalParts {
  dayKey: string;
  weekday: number; // 0 = Sunday
  minutes: number; // since local midnight
}

export function ukLocalParts(d: Date, tz: string = UK_TZ): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    weekday: "short", timeZone: tz,
  });
  const parts = fmt.formatToParts(d);
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(pick("hour"), 10) % 24;
  return {
    dayKey: `${pick("year")}-${pick("month")}-${pick("day")}`,
    weekday: WEEKDAYS[pick("weekday")] ?? 0,
    minutes: hour * 60 + parseInt(pick("minute"), 10),
  };
}

export interface DepartureProfile {
  /** Usual first start per weekday (0 = Sunday), minutes after local midnight,
   *  or null when there is no reliable pattern for that day. */
  byWeekday: (number | null)[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Usual first departure per weekday from trip start times. */
export function estimateDepartures(starts: Date[]): DepartureProfile {
  const firstByDay = new Map<string, { weekday: number; minutes: number }>();
  for (const d of starts) {
    const p = ukLocalParts(d);
    if (p.minutes < FIRST_START_EARLIEST_MIN) continue;
    const cur = firstByDay.get(p.dayKey);
    if (!cur || p.minutes < cur.minutes) firstByDay.set(p.dayKey, { weekday: p.weekday, minutes: p.minutes });
  }
  const byWeekday: (number | null)[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const samples = [...firstByDay.values()].filter((v) => v.weekday === wd).map((v) => v.minutes);
    if (samples.length < DEPARTURE_MIN_SAMPLES) { byWeekday.push(null); continue; }
    const m = median(samples);
    const close = samples.filter((x) => Math.abs(x - m) <= DEPARTURE_SPREAD_MIN).length;
    byWeekday.push(close >= DEPARTURE_MIN_SAMPLES ? m : null);
  }
  return { byWeekday };
}

/** Send window before the usual departure: 45 to 25 minutes before, so the
 *  10-minute job lands in it twice and the per-day check keeps it to one. */
export const SEND_WINDOW_START_BEFORE_MIN = 45;
export const SEND_WINDOW_END_BEFORE_MIN = 25;
/** Warm the incident cache in the quarter-hour before the send window. */
export const PREFETCH_BEFORE_MIN = 60;

export type DeparturePhase = "prefetch" | "send" | "outside";

export function departurePhase(nowMinutes: number, departureMinutes: number | null): DeparturePhase {
  if (departureMinutes == null) return "outside";
  const lead = departureMinutes - nowMinutes;
  if (lead <= SEND_WINDOW_START_BEFORE_MIN && lead >= SEND_WINDOW_END_BEFORE_MIN) return "send";
  if (lead <= PREFETCH_BEFORE_MIN && lead > SEND_WINDOW_START_BEFORE_MIN) return "prefetch";
  return "outside";
}
