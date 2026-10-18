// Synthetic routes and drives for the navigator tests. Roads are laid out
// by bearing and length from a point in Reading, with a point every 20 m
// like a real GraphHopper line, and a drive is a fix every second or two
// along it at a given speed, with optional GPS jitter and gaps.

import type { NavigationRoute, NavigationStep } from "@mileclear/shared";
import { distanceMeters, offset, type LatLng } from "../geo";
import type { NavFix } from "../navigator";

export const READING: LatLng = { lat: 51.4543, lng: -0.9781 };

export interface Piece {
  bearing: number;
  metres: number;
}

export interface Leg {
  step: Pick<NavigationStep, "type" | "modifier" | "exit" | "streetName">;
  pieces: Piece[];
  /** Free-flow speed for the step's duration, m/s. */
  speedMps?: number;
}

/** A roundabout of radius r entered heading `inBearing`, leaving at
 *  `exitBearing` clockwise (UK). */
export function roundaboutArc(inBearing: number, exitBearing: number, r = 20): Piece[] {
  // Going clockwise round the island means bearing increases.
  let sweep = (exitBearing - inBearing + 360) % 360;
  if (sweep === 0) sweep = 360;
  const n = Math.max(3, Math.round(sweep / 30));
  const arcLen = (2 * Math.PI * r * sweep) / 360;
  return Array.from({ length: n }, (_, i) => ({
    bearing: (inBearing + ((i + 0.5) * sweep) / n) % 360,
    metres: arcLen / n,
  }));
}

export function buildRoute(start: LatLng, legs: Leg[]): NavigationRoute {
  const geometry: Array<[number, number]> = [[start.lat, start.lng]];
  const steps: NavigationStep[] = [];
  let cur = start;
  for (const leg of legs) {
    const startIndex = geometry.length - 1;
    let legMetres = 0;
    for (const p of leg.pieces) {
      const parts = Math.max(1, Math.ceil(p.metres / 20));
      for (let k = 0; k < parts; k++) {
        cur = offset(cur, p.bearing, p.metres / parts);
        geometry.push([cur.lat, cur.lng]);
      }
      legMetres += p.metres;
    }
    const speed = leg.speedMps ?? 13.4;
    steps.push({
      ...leg.step,
      text: "",
      distanceMeters: legMetres,
      durationSeconds: legMetres / speed,
      startIndex,
      endIndex: geometry.length - 1,
    });
  }
  const last = geometry.length - 1;
  steps.push({ type: "arrive", streetName: null, text: "", distanceMeters: 0, durationSeconds: 0, startIndex: last, endIndex: last });
  const distance = steps.reduce((a, s) => a + s.distanceMeters, 0);
  return {
    routeId: "test",
    distanceMeters: distance,
    durationSeconds: steps.reduce((a, s) => a + s.durationSeconds, 0),
    geometry,
    steps,
    speedLimitsMph: [],
    dataDate: "2026-10-01",
    engine: "graphhopper",
    profile: "car_nav",
  };
}

/** Seeded RNG so jittery drives are the same every run. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export interface DriveOptions {
  speedMps: number;
  intervalS?: number;
  jitterM?: number;
  accuracyM?: number;
  seed?: number;
  startMs?: number;
  /** Drop fixes between these distances along the line (a tunnel). */
  gap?: { fromM: number; toM: number };
  /** Stop after this distance along. */
  untilM?: number;
  fromM?: number;
  /** Report heading on the fixes. */
  heading?: boolean;
}

/** Points along a polyline: where you are after `s` metres. */
export function pointAt(line: LatLng[], s: number): { p: LatLng; bearing: number } {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const d = distanceMeters(line[i - 1], line[i]);
    if (acc + d >= s || i === line.length - 1) {
      const t = d === 0 ? 0 : Math.min(1, Math.max(0, (s - acc) / d));
      const a = line[i - 1];
      const b = line[i];
      const p = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
      const x =
        Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
        Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lng - a.lng) * Math.PI) / 180);
      const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      return { p, bearing };
    }
    acc += d;
  }
  return { p: line[line.length - 1], bearing: 0 };
}

export function lineLength(line: LatLng[]): number {
  let acc = 0;
  for (let i = 1; i < line.length; i++) acc += distanceMeters(line[i - 1], line[i]);
  return acc;
}

export function routeLine(route: NavigationRoute): LatLng[] {
  return route.geometry.map(([lat, lng]) => ({ lat, lng }));
}

/** Fixes for driving `line` at a steady speed. */
export function drive(line: LatLng[], o: DriveOptions): NavFix[] {
  const interval = o.intervalS ?? 1;
  const random = rng(o.seed ?? 1);
  const total = Math.min(lineLength(line), o.untilM ?? Infinity);
  const fixes: NavFix[] = [];
  let t = 0;
  for (let s = o.fromM ?? 0; s <= total + 0.001; s += o.speedMps * interval) {
    t += interval;
    if (o.gap && s > o.gap.fromM && s < o.gap.toM) continue;
    const { p, bearing } = pointAt(line, s);
    let q = p;
    if (o.jitterM) q = offset(p, random() * 360, random() * o.jitterM);
    fixes.push({
      lat: q.lat,
      lng: q.lng,
      speedMps: o.speedMps,
      accuracyM: o.accuracyM ?? 8,
      headingDeg: o.heading ? bearing : null,
      atMs: (o.startMs ?? 1_000_000) + t * 1000,
    });
  }
  return fixes;
}
