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
//     the same way as the works line (within 45 degrees, either direction;
//     any heading for works mapped as a point), so a parallel street 50 m
//     away or a road the trip only crossed does not count;
//   - and at least one actual recorded fix sits within 30 m (two fixes are
//     enough on their own), so the match never rests on a straight line
//     drawn between two far-apart fixes.
//
// The geometry helpers are the diversion rule's (diversionRule.ts). The road
// alerts corridor matcher (roadCorridor.matchEventToCorridor) works on a
// 250 m grid, which is right for "your usual roads" but cannot tell a street
// from the one 50 m beside it, so it is not used here.

import { angleDiff, bearingDeg, haversineMetres, type LatLng } from "./roadCorridor.js";
import { closureActiveDuring, pointToSegmentMetres } from "./diversionRule.js";
import { disruptionTier, pushWorthy, shortPromoter, shortStreetName, worksPhrase } from "./roadWeekAheadRule.js";

export const TRIP_ROADWORKS_NEAR_M = 30;
export const TRIP_ROADWORKS_MIN_ALONG_M = 30;
export const TRIP_ROADWORKS_MAX_ITEMS = 5;
/** Trips with fewer breadcrumbs than this have too thin a line to say. */
export const TRIP_ROADWORKS_MIN_POINTS = 10;
/** Trip segments longer than this are a gap in the recording, not a road. */
const MAX_TRIP_SEGMENT_M = 250;
/** Sample spacing along the trip's line. */
const TRIP_STEP_M = 10;
/** The trip runs along the works when its heading is within this of the
 *  works line's axis. */
const AXIS_TOLERANCE_DEG = 45;

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
  /** Metres of the trip's line found along the works. */
  alongMetres: number;
  /** Recorded fixes within reach. */
  fixes: number;
  /** Index of the first trip fix of the first matching stretch (route order). */
  firstIndex: number;
}

interface Seg { a: LatLng; b: LatLng; bearing: number }

function worksShape(w: Pick<TripWorksInput, "lines" | "points">): { segs: Seg[]; pts: LatLng[] } {
  const segs: Seg[] = [];
  const pts: LatLng[] = [];
  const ok = (p: unknown): p is LatLng =>
    Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  for (const p of w.points ?? []) if (ok(p)) pts.push(p);
  for (const line of w.lines ?? []) {
    const l = (Array.isArray(line) ? line : []).filter(ok);
    if (l.length === 1) pts.push(l[0]);
    for (let i = 0; i < l.length - 1; i++) {
      if (haversineMetres(l[i], l[i + 1]) < 0.5) continue;
      segs.push({ a: l[i], b: l[i + 1], bearing: bearingDeg(l[i], l[i + 1]) });
    }
  }
  return { segs, pts };
}

function axisDiff(a: number, b: number): number {
  const d = angleDiff(a, b);
  return Math.min(d, 180 - d);
}

/** Is p within reach of the works, heading `bearing` (null = unknown)? */
function near(p: LatLng, bearing: number | null, shape: { segs: Seg[]; pts: LatLng[] }): boolean {
  for (const q of shape.pts) if (haversineMetres(p, q) <= TRIP_ROADWORKS_NEAR_M) return true;
  for (const s of shape.segs) {
    if (pointToSegmentMetres(p, s.a, s.b) > TRIP_ROADWORKS_NEAR_M) continue;
    if (bearing == null || axisDiff(bearing, s.bearing) <= AXIS_TOLERANCE_DEG) return true;
  }
  return false;
}

/** Did the trip's line drive through the works? `trip` is in recorded order. */
export function tripPassedWorks(trip: LatLng[], works: Pick<TripWorksInput, "lines" | "points">): WorksPassMatch {
  const none: WorksPassMatch = { matched: false, alongMetres: 0, fixes: 0, firstIndex: -1 };
  const shape = worksShape(works);
  const all = [...shape.pts, ...shape.segs.flatMap((s) => [s.a, s.b])];
  if (all.length === 0 || trip.length < 2) return none;

  // Works bbox padded by the reach, to skip most of the trip cheaply.
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of all) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  const padLat = (TRIP_ROADWORKS_NEAR_M + 5) / 111320;
  const padLng = (TRIP_ROADWORKS_NEAR_M + 5) / (111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  const inBox = (p: LatLng) =>
    p[0] >= minLat - padLat && p[0] <= maxLat + padLat && p[1] >= minLng - padLng && p[1] <= maxLng + padLng;
  const segPad = MAX_TRIP_SEGMENT_M / 111320;
  const segPadLng = MAX_TRIP_SEGMENT_M / (111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  const segMayTouch = (a: LatLng, b: LatLng) =>
    !(
      Math.max(a[0], b[0]) < minLat - padLat - segPad ||
      Math.min(a[0], b[0]) > maxLat + padLat + segPad ||
      Math.max(a[1], b[1]) < minLng - padLng - segPadLng ||
      Math.min(a[1], b[1]) > maxLng + padLng + segPadLng
    );

  let along = 0;
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
      if (!inBox(p) || !near(p, bearing, shape)) continue;
      // s == 0 and s == steps are the recorded fixes themselves.
      if (s === 0) fixHit.add(i);
      if (s === steps) fixHit.add(i + 1);
      if (s < steps) along += len / steps;
      if (firstIndex < 0) firstIndex = i;
    }
  }
  const fixes = fixHit.size;
  const matched = fixes >= 2 || (fixes >= 1 && along >= TRIP_ROADWORKS_MIN_ALONG_M);
  return matched ? { matched, alongMetres: Math.round(along), fixes, firstIndex } : { ...none, alongMetres: Math.round(along), fixes };
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

/** "Durham Road was closed (Emergency works)", "Temporary lights on Derby
 *  Street (South Staffordshire Water)". */
export function tripWorksPhrase(w: Pick<TripWorksInput, "trafficManagement" | "streetName" | "town" | "promoter" | "workCategory">): string {
  const street = shortStreetName(w.streetName);
  const place = street ?? (w.town ? `a road in ${w.town}` : "a road on this trip");
  const what =
    w.trafficManagement === "road_closure" ? `${place} was closed` : worksPhrase(w.trafficManagement, place);
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
    if (m.matched) matched.push({ w, firstIndex: m.firstIndex });
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
