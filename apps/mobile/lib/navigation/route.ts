// A route from GET /navigation/route, prepared for guidance: cumulative
// distance along the line, where each step's manoeuvre sits on it, and
// snapping a GPS fix onto it.
//
// Snapping searches FORWARD from where the car last was, inside a window that
// grows with the time since that fix. Searching the whole line instead would
// jump between the two sides of a road the route uses twice (out and back,
// a loop round a roundabout, a U-turn), because both are equally close.

import type { NavigationRoute, NavigationStep } from "@mileclear/shared";
import { bearingDeg, bearingDiff, distanceMeters, projectOnSegment, type LatLng } from "./geo";

export interface PreparedRoute {
  route: NavigationRoute;
  points: LatLng[];
  /** Metres from the start to each point. cum[0] = 0. */
  cum: number[];
  /** Bearing of each segment i (points[i] -> points[i+1]). */
  segBearing: number[];
  /** Metres from the start to each step's manoeuvre. */
  stepAlong: number[];
  total: number;
}

export function prepareRoute(route: NavigationRoute): PreparedRoute {
  const points: LatLng[] = route.geometry.map(([lat, lng]) => ({ lat, lng }));
  const cum: number[] = [0];
  const segBearing: number[] = [];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + distanceMeters(points[i - 1], points[i]));
    segBearing.push(bearingDeg(points[i - 1], points[i]));
  }
  const last = Math.max(0, points.length - 1);
  const stepAlong = route.steps.map((s) => cum[Math.max(0, Math.min(last, s.startIndex))] ?? 0);
  return { route, points, cum, segBearing, stepAlong, total: cum[last] ?? 0 };
}

export interface SnapInput {
  lat: number;
  lng: number;
  /** Direction of travel, degrees, when known (from the fix or from the last
   *  two fixes). */
  courseDeg?: number | null;
  speedMps?: number | null;
  atMs: number;
}

/** Where the car was last matched to the route. */
export interface SnapAnchor {
  along: number;
  atMs: number;
}

export interface Snap {
  /** Segment index (points[segIndex] -> points[segIndex + 1]). */
  segIndex: number;
  t: number;
  /** Metres from the start of the route. */
  along: number;
  /** Metres from the fix to the route. */
  distance: number;
  point: LatLng;
  bearing: number;
}

/** Fastest believable progress between fixes, m/s (about 110 mph). */
const MAX_SPEED_MPS = 50;
/** Always search at least this far ahead of the last match. */
const MIN_FORWARD_M = 250;
/** GPS can put the car a little behind where it was last matched. */
const BACK_M = 40;

/**
 * Match a fix to the route. With no anchor (first fix, or after a reroute)
 * the whole route is searched, earlier points winning ties. With an anchor,
 * only from BACK_M behind it to as far as the car could have driven since.
 */
export function snapToRoute(r: PreparedRoute, fix: SnapInput, anchor: SnapAnchor | null): Snap | null {
  const n = r.points.length;
  if (n === 0) return null;
  if (n === 1) {
    const d = distanceMeters(fix, r.points[0]);
    return { segIndex: 0, t: 0, along: 0, distance: d, point: r.points[0], bearing: 0 };
  }

  let minAlong = 0;
  let maxAlong = Infinity;
  if (anchor) {
    const elapsedS = Math.max(0, (fix.atMs - anchor.atMs) / 1000);
    minAlong = anchor.along - BACK_M;
    maxAlong = anchor.along + Math.max(MIN_FORWARD_M, elapsedS * MAX_SPEED_MPS + 100);
  }

  const moving = (fix.speedMps ?? 0) > 3;
  const course = fix.courseDeg;
  let best: (Snap & { score: number }) | null = null;

  for (let i = 0; i < n - 1; i++) {
    const segStart = r.cum[i];
    const segEnd = r.cum[i + 1];
    if (segEnd < minAlong) continue;
    if (segStart > maxAlong) break;
    const p = projectOnSegment(fix, r.points[i], r.points[i + 1]);
    const along = segStart + (segEnd - segStart) * p.t;
    let score = p.distance;
    // A segment pointing the other way is the far side of the road we use
    // twice, or the road we have not reached yet.
    if (moving && course != null && segEnd - segStart > 1) {
      const diff = bearingDiff(course, r.segBearing[i]);
      if (diff > 110) score += 40;
      else if (diff > 60) score += 12;
    }
    if (anchor) {
      // Prefer the nearest progress: jumping ahead to a later pass of the same
      // spot costs a little, going backwards costs more.
      const ahead = along - anchor.along;
      score += ahead >= 0 ? ahead * 0.02 : -ahead * 0.3;
    } else {
      score += along * 0.001;
    }
    if (!best || score < best.score) {
      best = { segIndex: i, t: p.t, along, distance: p.distance, point: p.point, bearing: r.segBearing[i], score };
    }
  }
  if (!best) return null;
  const { score: _score, ...snap } = best;
  return snap;
}

/** The step the car is on: the last one whose manoeuvre is behind it. */
export function stepIndexAt(r: PreparedRoute, along: number): number {
  let idx = 0;
  for (let i = 0; i < r.stepAlong.length; i++) {
    if (r.stepAlong[i] <= along + 0.5) idx = i;
    else break;
  }
  return idx;
}

export function stepAt(r: PreparedRoute, i: number): NavigationStep | null {
  return r.route.steps[i] ?? null;
}

/** Metres from `along` to the manoeuvre of step `next`. */
export function distanceToStep(r: PreparedRoute, next: number, along: number): number {
  const a = r.stepAlong[next];
  if (a == null) return Math.max(0, r.total - along);
  return Math.max(0, a - along);
}

/**
 * Seconds left: the unfinished part of the current step at its own pace, plus
 * every later step. Step durations are free-flow (no live traffic).
 */
export function remainingSeconds(r: PreparedRoute, stepIndex: number, along: number): number {
  const steps = r.route.steps;
  if (steps.length === 0) {
    return r.total > 0 ? r.route.durationSeconds * Math.max(0, r.total - along) / r.total : 0;
  }
  let secs = 0;
  const start = r.stepAlong[stepIndex] ?? 0;
  const end = r.stepAlong[stepIndex + 1] ?? r.total;
  const len = end - start;
  const cur = steps[stepIndex];
  if (cur && len > 0) secs += cur.durationSeconds * Math.max(0, Math.min(1, (end - along) / len));
  for (let i = stepIndex + 1; i < steps.length; i++) secs += steps[i].durationSeconds;
  return secs;
}

/** The speed limit on segment `segIndex`, when OpenStreetMap has one. */
export function speedLimitAt(r: PreparedRoute, segIndex: number): number | null {
  for (const s of r.route.speedLimitsMph) {
    if (segIndex >= s.startIndex && segIndex < Math.max(s.endIndex, s.startIndex + 1)) return s.mph;
  }
  return null;
}
