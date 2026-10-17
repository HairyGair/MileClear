// Roadworks on a recorded trip (17 Oct 2026). Pure, unit-tested.
//
// On a trip's detail we name the Street Manager works the driver actually
// drove through while they were in place: "Temporary lights on Derby Street
// (South Staffordshire Water)". It explains a slow drive. It is a label only:
// it never changes the trip's distance, times or classification, and it never
// guesses extra miles (diversion estimates were often wrong).
//
// Only works with a real traffic effect count: a road closure, or lights,
// lanes, boards, contraflow, convoy (pushWorthy in roadWeekAheadRule.ts).
//
// "Drove through" (all of these):
//   - the works were in place at some moment of the trip (a known start
//     before the trip ended, and no end before it started);
//   - along the trip's own line (breadcrumbs joined, recording gaps over
//     250 m not drawn), at least 30 m lies within 30 m of the works, running
//     the same way as the works line (within 45 degrees, either direction),
//     so a parallel street 50 m away or a road the trip only crossed does not
//     count;
//   - and at least one actual recorded fix sits within 30 m (two fixes are
//     enough on their own), so the match never rests on a straight line
//     drawn between two far-apart fixes.
//
// Shapes with no direction of their own (a point, or a polygon about as wide
// as it is long) accept any heading, so they only count for temporary lights
// and stop/go boards, which hold up crossing traffic at a junction too. A
// closure or lane closure mapped as a point on a side road next to the
// junction the trip crossed would otherwise be named wrongly. A long polygon
// counts only when the trip runs along its long side.
//
// A road closure the trip drove 100 m or more along cannot have been closed
// at that moment, so it is not named; shorter contact is worded as "Road
// closure booked on ..." because we cannot tell whether it was in force.
//
// The distance and time helpers are the diversion rule's (diversionRule.ts).
// The road alerts corridor matcher (roadCorridor.matchEventToCorridor) works
// on a 250 m grid, which is right for "your usual roads" but cannot tell a
// street from the one 50 m beside it, so it is not used here.

import { angleDiff, bearingDeg, haversineMetres, type LatLng } from "./roadCorridor.js";
import { closureActiveDuring } from "./diversionRule.js";
import { disruptionTier, pushWorthy, shortPromoter, shortStreetName, worksPhrase } from "./roadWeekAheadRule.js";

export const TRIP_ROADWORKS_NEAR_M = 30;
export const TRIP_ROADWORKS_MIN_ALONG_M = 30;
export const TRIP_ROADWORKS_MAX_ITEMS = 5;
/** Trips with fewer breadcrumbs than this have too thin a line to say. */
export const TRIP_ROADWORKS_MIN_POINTS = 10;
/** A road closure the trip drove this far along was not closed then. */
export const TRIP_ROADWORKS_CLOSURE_DROVE_ALONG_M = 100;
/** Fixes less accurate than this are left out. */
export const TRIP_ROADWORKS_MAX_ACCURACY_M = 50;
/** Trip segments longer than this are a gap in the recording, not a road. */
const MAX_TRIP_SEGMENT_M = 250;
/** Sample spacing along the trip's line. */
const TRIP_STEP_M = 10;
/** The trip runs along the works when its heading is within this of the
 *  works line's axis. */
const AXIS_TOLERANCE_DEG = 45;
/** A polygon whose long side is less than this times its short side has no
 *  useful direction and is treated like a point. */
const RING_MIN_ASPECT = 1.8;
/** First and last vertex this close: the line is a closed polygon ring. */
const RING_CLOSE_M = 2;
/** Traffic management that may match from a shape with no direction. */
const ANY_HEADING_OK = new Set(["two_way_signals", "multi_way_signals", "stop_go_boards"]);

export interface TripWorksInput {
  reference: string;
  trafficManagement: string;
  isTrafficSensitive: boolean;
  workStatus: string | null;
  streetName: string | null;
  town: string | null;
  promoter: string | null;
  startAt: Date | null;
  endAt: Date | null;
  lines: LatLng[][];
  points: LatLng[];
  /** Street Manager work category ("immediate_emergency", ...), when stored. */
  workCategory?: string | null;
}

export interface TripRoadworksItemOut {
  streetName: string | null;
  /** The whole line to show: "Temporary lights on Derby Street (South Staffordshire Water)". */
  phrase: string;
  promoter: string | null;
  emergency?: boolean;
  startAt: string | null;
  endAt: string | null;
}

export interface WorksPassMatch {
  matched: boolean;
  /** Metres of the trip's line found within reach of the works. */
  alongMetres: number;
  /** Of those, metres alongside a stretch of works line (not past its ends,
   *  not at a point): how far the trip drove along the works themselves. */
  alongLineMetres: number;
  /** Recorded fixes within reach. */
  fixes: number;
  /** Index of the first trip fix of the first matching stretch (route order). */
  firstIndex: number;
}

/** bearing null: no direction of its own, any heading matches. `line`:
 *  a stretch of works line (or a long polygon side) the trip can drive along. */
interface Seg { a: LatLng; b: LatLng; bearing: number | null; line: boolean }
interface Shape { segs: Seg[]; pts: LatLng[] }

const isLatLng = (p: unknown): p is LatLng =>
  Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Long axis of a closed ring: its bearing and how much longer than wide. */
export function ringAxis(ring: LatLng[]): { bearing: number; aspect: number } {
  const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const kLat = 111320;
  const kLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = ring.map((p) => [p[1] * kLng, p[0] * kLat] as [number, number]);
  const mx = xy.reduce((s, p) => s + p[0], 0) / xy.length;
  const my = xy.reduce((s, p) => s + p[1], 0) / xy.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of xy) {
    sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // from east, anticlockwise
  const u: [number, number] = [Math.cos(theta), Math.sin(theta)];
  const v: [number, number] = [-u[1], u[0]];
  const span = (d: [number, number]) => {
    const proj = xy.map(([x, y]) => x * d[0] + y * d[1]);
    return Math.max(...proj) - Math.min(...proj);
  };
  let long = span(u), short = span(v), dir = u;
  if (short > long) { [long, short] = [short, long]; dir = v; }
  const bearing = ((Math.atan2(dir[0], dir[1]) * 180) / Math.PI + 360) % 360;
  return { bearing, aspect: long / Math.max(short, 0.5) };
}

function worksShape(w: Pick<TripWorksInput, "lines" | "points" | "trafficManagement">): Shape {
  const anyHeadingOk = ANY_HEADING_OK.has(w.trafficManagement);
  const segs: Seg[] = [];
  const pts: LatLng[] = [];
  if (anyHeadingOk) for (const p of w.points ?? []) if (isLatLng(p)) pts.push(p);
  for (const line of w.lines ?? []) {
    const l = (Array.isArray(line) ? line : []).filter(isLatLng);
    if (l.length === 1) {
      if (anyHeadingOk) pts.push(l[0]);
      continue;
    }
    const ring = l.length >= 4 && haversineMetres(l[0], l[l.length - 1]) <= RING_CLOSE_M;
    let ringBearing: number | null = null;
    if (ring) {
      const axis = ringAxis(l.slice(0, -1));
      if (axis.aspect < RING_MIN_ASPECT) {
        // About as wide as long: like a point.
        if (!anyHeadingOk) continue;
      } else {
        ringBearing = axis.bearing;
      }
    }
    for (let i = 0; i < l.length - 1; i++) {
      if (haversineMetres(l[i], l[i + 1]) < 0.5) continue;
      if (!ring) segs.push({ a: l[i], b: l[i + 1], bearing: bearingDeg(l[i], l[i + 1]), line: true });
      else segs.push({ a: l[i], b: l[i + 1], bearing: ringBearing, line: ringBearing != null });
    }
  }
  return { segs, pts };
}

function axisDiff(a: number, b: number): number {
  const d = angleDiff(a, b);
  return Math.min(d, 180 - d);
}

/** Metres from p to segment a-b and where along it the nearest point falls
 *  (0..1, unclamped), on a local flat projection around p. */
function segProj(p: LatLng, a: LatLng, b: LatLng): { d: number; t: number } {
  const kLat = 111320;
  const kLng = 111320 * Math.cos((p[0] * Math.PI) / 180);
  const ax = (a[1] - p[1]) * kLng, ay = (a[0] - p[0]) * kLat;
  const bx = (b[1] - p[1]) * kLng, by = (b[0] - p[0]) * kLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  const c = Math.max(0, Math.min(1, t));
  const x = ax + c * dx, y = ay + c * dy;
  return { d: Math.sqrt(x * x + y * y), t };
}

/** 0 not near, 1 near, 2 near and alongside a stretch of works line. */
function near(p: LatLng, bearing: number | null, shape: Shape): 0 | 1 | 2 {
  let hit: 0 | 1 | 2 = 0;
  for (const q of shape.pts) if (haversineMetres(p, q) <= TRIP_ROADWORKS_NEAR_M) { hit = 1; break; }
  for (const s of shape.segs) {
    const { d, t } = segProj(p, s.a, s.b);
    if (d > TRIP_ROADWORKS_NEAR_M) continue;
    if (s.bearing != null && bearing != null && axisDiff(bearing, s.bearing) > AXIS_TOLERANCE_DEG) continue;
    if (s.line && t >= 0 && t <= 1) return 2;
    hit = 1;
  }
  return hit;
}

/** Did the trip's line drive through the works? `trip` is in recorded order. */
export function tripPassedWorks(
  trip: LatLng[],
  works: Pick<TripWorksInput, "lines" | "points" | "trafficManagement">
): WorksPassMatch {
  const none: WorksPassMatch = { matched: false, alongMetres: 0, alongLineMetres: 0, fixes: 0, firstIndex: -1 };
  const shape = worksShape(works);
  const all = [...shape.pts, ...shape.segs.flatMap((s) => [s.a, s.b])];
  if (all.length === 0 || trip.length < 2) return none;

  // Works bbox padded by the reach, to skip most of the trip cheaply.
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of all) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const padLat = (TRIP_ROADWORKS_NEAR_M + 5) / 111320;
  const padLng = (TRIP_ROADWORKS_NEAR_M + 5) / (111320 * cosLat);
  const inBox = (p: LatLng) =>
    p[0] >= minLat - padLat && p[0] <= maxLat + padLat && p[1] >= minLng - padLng && p[1] <= maxLng + padLng;
  const segPad = MAX_TRIP_SEGMENT_M / 111320;
  const segPadLng = MAX_TRIP_SEGMENT_M / (111320 * cosLat);
  const segMayTouch = (a: LatLng, b: LatLng) =>
    !(
      Math.max(a[0], b[0]) < minLat - padLat - segPad ||
      Math.min(a[0], b[0]) > maxLat + padLat + segPad ||
      Math.max(a[1], b[1]) < minLng - padLng - segPadLng ||
      Math.min(a[1], b[1]) > maxLng + padLng + segPadLng
    );

  let along = 0;
  let alongLine = 0;
  const fixHit = new Set<number>();
  let firstIndex = -1;
  for (let i = 0; i < trip.length - 1; i++) {
    const a = trip[i], b = trip[i + 1];
    if (!segMayTouch(a, b)) continue;
    const len = haversineMetres(a, b);
    if (len < 1 || len > MAX_TRIP_SEGMENT_M) continue;
    const bearing = bearingDeg(a, b);
    const steps = Math.max(1, Math.ceil(len / TRIP_STEP_M));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p: LatLng = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (!inBox(p)) continue;
      const n = near(p, bearing, shape);
      if (n === 0) continue;
      // s == 0 and s == steps are the recorded fixes themselves.
      if (s === 0) fixHit.add(i);
      if (s === steps) fixHit.add(i + 1);
      if (s < steps) {
        along += len / steps;
        if (n === 2) alongLine += len / steps;
      }
      if (firstIndex < 0) firstIndex = i;
    }
  }
  const fixes = fixHit.size;
  const matched = fixes >= 2 || (fixes >= 1 && along >= TRIP_ROADWORKS_MIN_ALONG_M);
  const out = { alongMetres: Math.round(along), alongLineMetres: Math.round(alongLine), fixes };
  return matched ? { matched, ...out, firstIndex } : { ...none, ...out };
}

function normStatus(s: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Works with a traffic effect that were in place at some moment of the trip.
 *  Works still "planned" now had not started by now, so were not in place
 *  during a past trip, whatever the proposed dates said. */
export function worksEligible(w: TripWorksInput, from: Date, to: Date): boolean {
  if (!pushWorthy(w)) return false;
  if (normStatus(w.workStatus) === "planned") return false;
  return closureActiveDuring(w, from, to);
}

export function isEmergencyWorks(w: Pick<TripWorksInput, "workCategory">): boolean {
  return /emergency/i.test(w.workCategory ?? "");
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "Road closure booked on Durham Road (Emergency works)", "Temporary
 *  lights on Derby Street (South Staffordshire Water)". */
export function tripWorksPhrase(w: Pick<TripWorksInput, "trafficManagement" | "streetName" | "town" | "promoter" | "workCategory">): string {
  const street = shortStreetName(w.streetName);
  const place = street ?? (w.town ? `a road in ${w.town}` : "a road on this trip");
  const what =
    w.trafficManagement === "road_closure" ? `road closure booked on ${place}` : worksPhrase(w.trafficManagement, place);
  const promoter = shortPromoter(w.promoter);
  const who = isEmergencyWorks(w) ? " (Emergency works)" : promoter ? ` (${promoter})` : "";
  return `${capitalise(what)}${who}`;
}

interface Matched { w: TripWorksInput; firstIndex: number }

/**
 * The trip's roadworks list: eligible works the trip drove through, the same
 * street dug by the same company as one item (its most disruptive part, the
 * earliest start and latest end of its permits), the most disruptive 5, in
 * the order the trip met them.
 */
export function tripRoadworks(
  trip: { points: LatLng[]; startedAt: Date; endedAt: Date | null },
  works: TripWorksInput[],
  max: number = TRIP_ROADWORKS_MAX_ITEMS
): TripRoadworksItemOut[] {
  if (trip.points.length < TRIP_ROADWORKS_MIN_POINTS) return [];
  const from = trip.startedAt;
  const to = trip.endedAt ?? trip.startedAt;
  const matched: Matched[] = [];
  for (const w of works) {
    if (!worksEligible(w, from, to)) continue;
    const m = tripPassedWorks(trip.points, w);
    if (!m.matched) continue;
    if (w.trafficManagement === "road_closure" && m.alongLineMetres >= TRIP_ROADWORKS_CLOSURE_DROVE_ALONG_M) continue;
    matched.push({ w, firstIndex: m.firstIndex });
  }
  if (matched.length === 0) return [];

  const groups = new Map<string, Matched[]>();
  for (const m of matched) {
    const street = (shortStreetName(m.w.streetName) ?? "").toLowerCase();
    const company = (shortPromoter(m.w.promoter) ?? m.w.promoter ?? "").toLowerCase();
    const key = street ? `${street}|${(m.w.town ?? "").toLowerCase()}|${company}` : `ref:${m.w.reference}`;
    let arr = groups.get(key);
    if (!arr) groups.set(key, (arr = []));
    arr.push(m);
  }

  const tier = (w: TripWorksInput) => disruptionTier(w) ?? 3;
  const items = [...groups.values()].map((arr) => {
    const lead = [...arr].sort(
      (x, y) => tier(x.w) - tier(y.w) || Number(isEmergencyWorks(y.w)) - Number(isEmergencyWorks(x.w)) || x.firstIndex - y.firstIndex
    )[0].w;
    const starts = arr.map((m) => m.w.startAt?.getTime()).filter((t): t is number => t != null);
    const anyOpenEnd = arr.some((m) => !m.w.endAt);
    const ends = arr.map((m) => m.w.endAt?.getTime()).filter((t): t is number => t != null);
    const emergency = arr.some((m) => isEmergencyWorks(m.w));
    const item: TripRoadworksItemOut = {
      streetName: shortStreetName(lead.streetName),
      phrase: tripWorksPhrase({ ...lead, workCategory: emergency ? "immediate_emergency" : lead.workCategory }),
      promoter: shortPromoter(lead.promoter),
      startAt: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
      endAt: anyOpenEnd || ends.length === 0 ? null : new Date(Math.max(...ends)).toISOString(),
    };
    if (emergency) item.emergency = true;
    return { item, tier: tier(lead), order: Math.min(...arr.map((m) => m.firstIndex)) };
  });

  return items
    .sort((x, y) => x.tier - y.tier || x.order - y.order)
    .slice(0, max)
    .sort((x, y) => x.order - y.order)
    .map((x) => x.item);
}

// ── Which stored works are worth loading ─────────────────────────────

const GRID_LAT_DEG = 0.002;
const GRID_LNG_DEG = 0.003;
/** A works box spanning more grid cells than this is kept without looking. */
const MAX_BOX_CELLS = 10000;

export interface WorksBox { minLat: number; maxLat: number; minLng: number; maxLng: number }

/**
 * A test for "does this works bbox come near the trip": true when the box,
 * padded by the reach, overlaps a grid cell holding one of the trip's fixes
 * or drawn segments. A long trip's own bbox can hold thousands of works that
 * are nowhere near the route; this keeps only the ones that might be.
 */
export function tripNearBoxTest(trip: LatLng[]): (box: WorksBox) => boolean {
  const cells = new Set<string>();
  const key = (i: number, j: number) => `${i}:${j}`;
  const markBox = (aLat: number, bLat: number, aLng: number, bLng: number) => {
    for (let i = Math.floor(aLat / GRID_LAT_DEG); i <= Math.floor(bLat / GRID_LAT_DEG); i++) {
      for (let j = Math.floor(aLng / GRID_LNG_DEG); j <= Math.floor(bLng / GRID_LNG_DEG); j++) cells.add(key(i, j));
    }
  };
  for (let i = 0; i < trip.length; i++) {
    const a = trip[i];
    markBox(a[0], a[0], a[1], a[1]);
    const b = trip[i + 1];
    if (b && haversineMetres(a, b) <= MAX_TRIP_SEGMENT_M) {
      markBox(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]));
    }
  }
  return (box) => {
    const padLat = (TRIP_ROADWORKS_NEAR_M + 5) / 111320;
    const padLng = (TRIP_ROADWORKS_NEAR_M + 5) / (111320 * Math.cos((((box.minLat + box.maxLat) / 2) * Math.PI) / 180));
    const i0 = Math.floor((box.minLat - padLat) / GRID_LAT_DEG), i1 = Math.floor((box.maxLat + padLat) / GRID_LAT_DEG);
    const j0 = Math.floor((box.minLng - padLng) / GRID_LNG_DEG), j1 = Math.floor((box.maxLng + padLng) / GRID_LNG_DEG);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_BOX_CELLS) return true;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (cells.has(key(i, j))) return true;
    return false;
  };
}
