// Diversion labels (5 Oct 2026). Pure, unit-tested.
//
// A GPS trip is labelled a diversion when it ran noticeably longer than the
// driver's usual route between the same two places, a planned road closure
// (DfT Street Manager) active at the time sat on that usual route, and the
// trip itself went round the closed stretch. The label explains why the trip
// is longer than usual. It never changes the trip's stored distance or route:
// the miles were driven, so they count as they are.
//
// What "the usual route" means here: the driver's own past GPS trips that
// started and ended within ~400 m of this trip's start and end, over the 90
// days before it. Their breadcrumbs, and nothing else, decide whether the
// closure was on the usual way. One-off and shared routes never come into it.
//
// The services/diversions.ts runner does the lookups and the write.

import { haversineMetres, type LatLng } from "./roadCorridor.js";

/** Start and end each within this of the trip's own start and end count as
 *  "between the same places". Wide enough for a different parking spot on
 *  the same street, narrow enough that a different street is not the same
 *  journey. */
export const DIVERSION_SAME_PLACE_M = 400;
/** How far back the driver's usual route is looked for. */
export const DIVERSION_HISTORY_DAYS = 90;
/** At least this many past trips between the same places, or there is no
 *  usual route to compare with. */
export const DIVERSION_MIN_HISTORY = 3;
/** At most this many of the most recent past trips are used (keeps the
 *  breadcrumb load bounded for a commute driven twice a day). */
export const DIVERSION_MAX_HISTORY = 20;
/** Trips with fewer breadcrumbs than this have too thin a line to say which
 *  roads they used: neither judged nor used as history. */
export const DIVERSION_MIN_POINTS = 15;
/** The trip must be at least this much longer than the median usual trip... */
export const DIVERSION_MIN_EXTRA_RATIO = 0.15;
/** ...and at least this many miles longer, so a short hop that is 0.2 mi
 *  longer than usual (a different car park) is not a "diversion". */
export const DIVERSION_MIN_EXTRA_MILES = 0.5;
/** More than this times the usual distance is a different journey (a stop
 *  on the way, a detour for a pickup), not a way round a closure. */
export const DIVERSION_MAX_RATIO = 3;
/** Only full road closures force a driver round. Lane closures, signals and
 *  contra-flows slow traffic but the road stays open, so a longer trip on
 *  those days is the driver's choice, not a diversion. */
export const DIVERSION_CLOSURE_TYPES = new Set(["road_closure"]);
/** A closure is "on the usual route" when its line comes within this of a
 *  past trip's breadcrumb line. Breadcrumbs sit a few metres off the mapped
 *  centre line; 40 m keeps a parallel street (usually 60 m+ away) out. */
export const DIVERSION_ON_ROUTE_M = 40;
/** At least this share of the past trips must have used the closed stretch,
 *  so one past trip that happened to go that way does not make it usual. */
export const DIVERSION_ON_ROUTE_SHARE = 0.5;
/** The trip "went round" only when every one of its breadcrumbs, and the line
 *  between them, stays further than this from the closure. Wider than the
 *  on-route test on purpose: if in doubt, no label. */
export const DIVERSION_AVOID_M = 60;
/** Spacing of the samples taken along a closure's line. */
const CLOSURE_SAMPLE_STEP_M = 20;
/** Past-trip segments longer than this are a gap in the recording, not a
 *  road, so they never put a closure "on the usual route". (For the trip's
 *  own avoided test gaps are kept: a gap passing the closure means we cannot
 *  tell, and then no label.) */
const MAX_HISTORY_SEGMENT_M = 2000;

export interface DiversionTripInput {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  distanceMiles: number;
  startedAt: Date;
  endedAt: Date | null;
  /** Breadcrumbs in recorded order. */
  points: LatLng[];
  /** Already labelled a diversion (past trips only: such trips are skipped). */
  isDiversion?: boolean;
}

export interface ClosureInput {
  reference: string;
  trafficManagement: string;
  streetName: string | null;
  town: string | null;
  promoter: string | null;
  startAt: Date | null;
  endAt: Date | null;
  lines: LatLng[][];
  points: LatLng[];
}

export interface DiversionResult {
  streetName: string | null;
  town: string | null;
  promoter: string | null;
  closureRef: string;
  trafficManagement: string;
  usualMiles: number;
  extraMiles: number;
}

export type DiversionReason =
  | "too_few_points"
  | "no_end"
  | "not_enough_history"
  | "not_longer"
  | "much_longer"
  | "no_active_closure"
  | "closure_not_on_usual_route"
  | "drove_through_closure";

export type DiversionDecision =
  | { ok: true; diversion: DiversionResult; historyCount: number }
  | { ok: false; reason: DiversionReason; historyCount: number };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Past trips between the same two places, most recent first. `checkPoints`
 *  false lets the runner pick candidates before reading any breadcrumbs. */
export function similarPastTrips<T extends Omit<DiversionTripInput, "points"> & { points?: LatLng[] }>(
  trip: Omit<DiversionTripInput, "points">,
  past: T[],
  checkPoints = true
): T[] {
  if (trip.endLat == null || trip.endLng == null) return [];
  const start: LatLng = [trip.startLat, trip.startLng];
  const end: LatLng = [trip.endLat, trip.endLng];
  const earliest = trip.startedAt.getTime() - DIVERSION_HISTORY_DAYS * 86400000;
  return past
    .filter((p) => {
      if (p.id === trip.id || p.isDiversion) return false;
      if (p.endLat == null || p.endLng == null) return false;
      const t = p.startedAt.getTime();
      if (t >= trip.startedAt.getTime() || t < earliest) return false;
      if (checkPoints && (p.points?.length ?? 0) < DIVERSION_MIN_POINTS) return false;
      if (!(p.distanceMiles > 0)) return false;
      return (
        haversineMetres(start, [p.startLat, p.startLng]) <= DIVERSION_SAME_PLACE_M &&
        haversineMetres(end, [p.endLat, p.endLng]) <= DIVERSION_SAME_PLACE_M
      );
    })
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, DIVERSION_MAX_HISTORY);
}

/** Active at any moment of the trip. A closure with no known start is not
 *  counted: if in doubt, no label. */
export function closureActiveDuring(c: ClosureInput, from: Date, to: Date): boolean {
  if (!c.startAt) return false;
  if (c.startAt.getTime() > to.getTime()) return false;
  if (c.endAt && c.endAt.getTime() < from.getTime()) return false;
  return true;
}

// ── Geometry ───────────────────────────────────────────────────────

/** Metres from p to segment a-b, on a local flat projection around p. */
export function pointToSegmentMetres(p: LatLng, a: LatLng, b: LatLng): number {
  const kLat = 111320;
  const kLng = 111320 * Math.cos((p[0] * Math.PI) / 180);
  const ax = (a[1] - p[1]) * kLng, ay = (a[0] - p[0]) * kLat;
  const bx = (b[1] - p[1]) * kLng, by = (b[0] - p[0]) * kLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}

interface Bbox { minLat: number; maxLat: number; minLng: number; maxLng: number }

function bboxOf(pts: LatLng[]): Bbox | null {
  if (pts.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of pts) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** Pad a bbox by roughly `m` metres. */
function padBbox(b: Bbox, m: number): Bbox {
  const dLat = m / 111320;
  const dLng = m / (111320 * Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180));
  return { minLat: b.minLat - dLat, maxLat: b.maxLat + dLat, minLng: b.minLng - dLng, maxLng: b.maxLng + dLng };
}

const inBbox = (p: LatLng, b: Bbox) => p[0] >= b.minLat && p[0] <= b.maxLat && p[1] >= b.minLng && p[1] <= b.maxLng;

/** Points along the closure: every vertex, plus samples every 20 m along
 *  each line, plus its standalone points. */
export function sampleClosure(c: ClosureInput): LatLng[] {
  const out: LatLng[] = [...c.points];
  for (const line of c.lines) {
    if (line.length === 1) out.push(line[0]);
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const steps = Math.max(1, Math.ceil(haversineMetres(a, b) / CLOSURE_SAMPLE_STEP_M));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      if (i === line.length - 2) out.push(b);
    }
  }
  return out.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

/** Is any sample within `limitM` of the polyline? Segments longer than
 *  maxSegM are not drawn (their end points still count). */
function polylineNear(samples: LatLng[], line: LatLng[], limitM: number, maxSegM: number): boolean {
  if (line.length === 0 || samples.length === 0) return false;
  const box = bboxOf(line);
  if (!box) return false;
  const padded = padBbox(box, limitM + 5);
  const near = samples.filter((s) => inBbox(s, padded));
  if (near.length === 0) return false;
  for (const s of near) {
    if (line.length === 1) {
      if (haversineMetres(s, line[0]) <= limitM) return true;
      continue;
    }
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      if (haversineMetres(a, b) > maxSegM) {
        if (haversineMetres(s, a) <= limitM || haversineMetres(s, b) <= limitM) return true;
        continue;
      }
      if (pointToSegmentMetres(s, a, b) <= limitM) return true;
    }
  }
  return false;
}

// ── The rule ───────────────────────────────────────────────────────

export function judgeDiversion(
  trip: DiversionTripInput,
  past: DiversionTripInput[],
  closures: ClosureInput[]
): DiversionDecision {
  if (trip.endLat == null || trip.endLng == null) return { ok: false, reason: "no_end", historyCount: 0 };
  if (trip.points.length < DIVERSION_MIN_POINTS) return { ok: false, reason: "too_few_points", historyCount: 0 };

  const similar = similarPastTrips(trip, past);
  const historyCount = similar.length;
  if (historyCount < DIVERSION_MIN_HISTORY) return { ok: false, reason: "not_enough_history", historyCount };

  // (a) noticeably longer than usual
  const usualMiles = median(similar.map((p) => p.distanceMiles));
  const extraMiles = trip.distanceMiles - usualMiles;
  if (extraMiles < DIVERSION_MIN_EXTRA_MILES || extraMiles < usualMiles * DIVERSION_MIN_EXTRA_RATIO) {
    return { ok: false, reason: "not_longer", historyCount };
  }
  if (trip.distanceMiles > usualMiles * DIVERSION_MAX_RATIO) {
    return { ok: false, reason: "much_longer", historyCount };
  }

  // (b) a full closure active during the trip...
  const from = trip.startedAt;
  const to = trip.endedAt ?? trip.startedAt;
  const active = closures.filter(
    (c) => DIVERSION_CLOSURE_TYPES.has(c.trafficManagement) && closureActiveDuring(c, from, to)
  );
  if (active.length === 0) return { ok: false, reason: "no_active_closure", historyCount };

  // ...on the usual route, and (c) avoided by this trip.
  const needed = Math.max(1, Math.ceil(historyCount * DIVERSION_ON_ROUTE_SHARE));
  let best: { c: ClosureInput; hits: number } | null = null;
  let sawOnRoute = false;
  for (const c of active) {
    const samples = sampleClosure(c);
    if (samples.length === 0) continue;
    let hits = 0;
    for (const p of similar) {
      if (polylineNear(samples, p.points, DIVERSION_ON_ROUTE_M, MAX_HISTORY_SEGMENT_M)) hits++;
    }
    if (hits < needed) continue;
    sawOnRoute = true;
    if (polylineNear(samples, trip.points, DIVERSION_AVOID_M, Infinity)) continue;
    if (!best || hits > best.hits) best = { c, hits };
  }
  if (!best) {
    return { ok: false, reason: sawOnRoute ? "drove_through_closure" : "closure_not_on_usual_route", historyCount };
  }

  const c = best.c;
  return {
    ok: true,
    historyCount,
    diversion: {
      streetName: c.streetName,
      town: c.town,
      promoter: c.promoter,
      closureRef: c.reference,
      trafficManagement: c.trafficManagement,
      usualMiles: round2(usualMiles),
      extraMiles: round2(extraMiles),
    },
  };
}

/** Bounding box (padded) to look for closures in: the trip and its history. */
export function closureSearchBox(trip: DiversionTripInput, similar: DiversionTripInput[]): Bbox | null {
  const all: LatLng[] = [...trip.points];
  for (const p of similar) all.push(...p.points);
  const b = bboxOf(all);
  return b ? padBbox(b, DIVERSION_AVOID_M + 20) : null;
}
