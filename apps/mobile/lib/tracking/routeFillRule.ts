// Filling a GPS gap from the Directions route (PLAN-recording.md section 4,
// Anthony's Q5). When the phone stops sending its position mid-drive, the
// saved trip draws a straight line across the gap and undercounts the miles.
// If the driver was following a Directions route at both ends of the gap,
// the route between them is a far better account of where they went.
//
// Pure and deterministic: the same fixes and sessions always give the same
// plan. In this build the plan is only logged and noted on the trip
// (gpsQuality.directions.wouldFill); nothing is added to the recording.
//
// Consecutive real fixes A, B fill only if ALL of these hold:
//   - 60 s to 30 min apart, and at least 500 m apart as the crow flies;
//   - both good to 50 m;
//   - A was moving (>= 1.8 m/s), not parked;
//   - a Directions session that is not off and not a passenger covers the
//     whole gap (ended sessions cover up to their end, so not past arrival);
//   - both A and B lie on the route being followed at A's time, within
//     max(40 m, 1.5 x accuracy) capped at 75 m, and B is further along;
//   - the route between them averages 10 to 90 mph over the gap;
//   - the route between them is no more than 3 x the straight line.
// Then: points every 100 m along the route (at most 300 per gap), timed by
// distance strictly inside the gap and at least 1 s from either real fix.
// At most 50 filled miles per trip; more than 75% filled is low confidence.

import type { DriveRoute, DriveSession } from "../navigation/driveSessions";
import { routeActiveAt, sessionCoverEndMs } from "../navigation/driveSessions";
import { metresBetween } from "./directionsOpenRule";

const MPH = 0.44704;
const METRES_PER_MILE = 1609.344;

export const FILL_MIN_GAP_MS = 60_000;
export const FILL_MAX_GAP_MS = 30 * 60 * 1000;
export const FILL_MIN_CROW_M = 500;
export const FILL_MAX_ACCURACY_M = 50;
export const FILL_MIN_A_SPEED_MPS = 1.8;
export const FILL_ON_ROUTE_MIN_M = 40;
export const FILL_ON_ROUTE_MAX_M = 75;
export const FILL_MIN_MPH = 10;
export const FILL_MAX_MPH = 90;
export const FILL_MAX_DETOUR = 3;
export const FILL_STEP_M = 100;
export const FILL_MAX_POINTS_PER_GAP = 300;
export const FILL_EDGE_MS = 1_000;
export const FILL_MAX_MILES_PER_TRIP = 50;
export const FILL_LOW_CONFIDENCE_SHARE = 0.75;

export interface FillFix {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  atMs: number;
}

export interface FillPoint {
  lat: number;
  lng: number;
  atMs: number;
}

export interface PlannedGap {
  fromMs: number;
  toMs: number;
  miles: number;
  crowMiles: number;
  sessionId: string;
  routeId: string;
  points: FillPoint[];
}

export type FillRejection =
  | "too_long"
  | "short"
  | "accuracy"
  | "a_stopped"
  | "no_session"
  | "no_route"
  | "off_route"
  | "backwards"
  | "speed"
  | "detour"
  | "trip_cap";

export interface FillPlan {
  gaps: PlannedGap[];
  /** Filled miles in total. */
  miles: number;
  /** Straight-line miles between the real fixes outside the filled gaps. */
  realMiles: number;
  /** Gaps of a minute or more that were not filled, by reason. */
  rejected: Partial<Record<FillRejection, number>>;
  lowConfidence: boolean;
}

// ── Route geometry ────────────────────────────────────────────────────────

interface PreparedRoute {
  pts: Array<[number, number]>;
  /** Metres from the start of the route to each point. */
  cum: number[];
}

const prepared = new WeakMap<DriveRoute, PreparedRoute>();

function prepare(r: DriveRoute): PreparedRoute {
  const hit = prepared.get(r);
  if (hit) return hit;
  const pts = r.geometry;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + metresBetween({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] }));
  }
  const p = { pts, cum };
  prepared.set(r, p);
  return p;
}

interface Projection {
  /** Metres off the route. */
  off: number;
  /** Metres along the route. */
  along: number;
}

/** The closest point of segment i to p, on a local flat map around p. */
function projectOnSegment(route: PreparedRoute, i: number, p: { lat: number; lng: number }): Projection {
  const k = (Math.PI / 180) * 6_371_000;
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  const [aLat, aLng] = route.pts[i];
  const [bLat, bLng] = route.pts[i + 1];
  const ax = (aLng - p.lng) * cosLat * k;
  const ay = (aLat - p.lat) * k;
  const bx = (bLng - p.lng) * cosLat * k;
  const by = (bLat - p.lat) * k;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const segLen = route.cum[i + 1] - route.cum[i];
  return { off: Math.sqrt(cx * cx + cy * cy), along: route.cum[i] + t * segLen };
}

/** Nearest point on the route with along >= minAlong (ties: earliest). */
function nearest(route: PreparedRoute, p: { lat: number; lng: number }, minAlong = -Infinity): Projection | null {
  let best: Projection | null = null;
  for (let i = 0; i < route.pts.length - 1; i++) {
    if (route.cum[i + 1] < minAlong) continue;
    const pr = projectOnSegment(route, i, p);
    if (pr.along < minAlong) continue;
    if (!best || pr.off < best.off) best = pr;
  }
  return best;
}

/** The position `along` metres into the route. */
function pointAt(route: PreparedRoute, along: number): { lat: number; lng: number } {
  const { pts, cum } = route;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= along) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (along - cum[lo]) / seg : 0;
  return { lat: pts[lo][0] + t * (pts[hi][0] - pts[lo][0]), lng: pts[lo][1] + t * (pts[hi][1] - pts[lo][1]) };
}

const tolerance = (accuracy: number) => Math.min(FILL_ON_ROUTE_MAX_M, Math.max(FILL_ON_ROUTE_MIN_M, 1.5 * accuracy));

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── The rule ──────────────────────────────────────────────────────────────

type GapVerdict = { ok: true; gap: PlannedGap } | { ok: false; reason: FillRejection };

function judgeGap(a: FillFix, b: FillFix, sessions: DriveSession[]): GapVerdict {
  const dt = b.atMs - a.atMs;
  if (dt > FILL_MAX_GAP_MS) return { ok: false, reason: "too_long" };
  const crowM = metresBetween(a, b);
  if (crowM < FILL_MIN_CROW_M) return { ok: false, reason: "short" };
  if (a.accuracy == null || b.accuracy == null || a.accuracy > FILL_MAX_ACCURACY_M || b.accuracy > FILL_MAX_ACCURACY_M) {
    return { ok: false, reason: "accuracy" };
  }
  if (a.speed == null || !(a.speed >= FILL_MIN_A_SPEED_MPS)) return { ok: false, reason: "a_stopped" };

  const covering = sessions.filter(
    (s) => s.mode !== "off" && !s.passenger && s.startedAtMs <= a.atMs && b.atMs <= sessionCoverEndMs(s)
  );
  if (covering.length === 0) return { ok: false, reason: "no_session" };

  // The latest-started covering session decides (a newer one replaced it).
  let last: FillRejection = "no_route";
  for (const s of [...covering].reverse()) {
    const r = routeActiveAt(s, a.atMs);
    if (!r || r.geometry.length < 2) continue;
    const route = prepare(r);
    const pa = nearest(route, a);
    if (!pa || pa.off > tolerance(a.accuracy)) {
      last = "off_route";
      continue;
    }
    const pb = nearest(route, b, pa.along);
    if (!pb || pb.off > tolerance(b.accuracy)) {
      // On the route, but only behind A: going the wrong way.
      const anyB = nearest(route, b);
      last = anyB && anyB.off <= tolerance(b.accuracy) ? "backwards" : "off_route";
      continue;
    }
    const routeM = pb.along - pa.along;
    if (!(routeM > 0)) {
      last = "backwards";
      continue;
    }
    const mph = routeM / (dt / 1000) / MPH;
    if (mph < FILL_MIN_MPH || mph > FILL_MAX_MPH) return { ok: false, reason: "speed" };
    if (routeM > FILL_MAX_DETOUR * crowM) return { ok: false, reason: "detour" };

    // Points every 100 m along the route, at most 300, inside the gap.
    let n = Math.floor(routeM / FILL_STEP_M);
    if (n * FILL_STEP_M >= routeM) n -= 1; // never on top of B
    let step = FILL_STEP_M;
    if (n > FILL_MAX_POINTS_PER_GAP) {
      n = FILL_MAX_POINTS_PER_GAP;
      step = routeM / (n + 1);
    }
    const points: FillPoint[] = [];
    for (let k = 1; k <= n; k++) {
      const d = k * step;
      const at = Math.round(a.atMs + (d / routeM) * dt);
      const p = pointAt(route, pa.along + d);
      points.push({ lat: p.lat, lng: p.lng, atMs: Math.min(b.atMs - FILL_EDGE_MS, Math.max(a.atMs + FILL_EDGE_MS, at)) });
    }
    return {
      ok: true,
      gap: {
        fromMs: a.atMs,
        toMs: b.atMs,
        miles: round2(routeM / METRES_PER_MILE),
        crowMiles: round2(crowM / METRES_PER_MILE),
        sessionId: s.sessionId,
        routeId: r.routeId,
        points,
      },
    };
  }
  return { ok: false, reason: last };
}

/** The gaps in a trip's fixes (time order) that the Directions route fills. */
export function planRouteFill(fixes: FillFix[], sessions: DriveSession[]): FillPlan {
  const plan: FillPlan = { gaps: [], miles: 0, realMiles: 0, rejected: {}, lowConfidence: false };
  let realM = 0;
  const usable = sessions.filter((s) => s.mode !== "off" && !s.passenger);
  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1];
    const b = fixes[i];
    const dt = b.atMs - a.atMs;
    const crow = metresBetween(a, b);
    if (!(dt >= FILL_MIN_GAP_MS) || usable.length === 0) {
      realM += crow;
      continue;
    }
    const v = judgeGap(a, b, usable);
    if (v.ok && plan.miles + v.gap.miles > FILL_MAX_MILES_PER_TRIP) {
      plan.rejected.trip_cap = (plan.rejected.trip_cap ?? 0) + 1;
      realM += crow;
    } else if (v.ok) {
      plan.gaps.push(v.gap);
      plan.miles = round2(plan.miles + v.gap.miles);
    } else {
      plan.rejected[v.reason] = (plan.rejected[v.reason] ?? 0) + 1;
      realM += crow;
    }
  }
  plan.realMiles = round2(realM / METRES_PER_MILE);
  const total = plan.realMiles + plan.miles;
  plan.lowConfidence = total > 0 && plan.miles / total > FILL_LOW_CONFIDENCE_SHARE;
  return plan;
}
