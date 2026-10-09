// Speed and stops for the trip summary, worked out from the stored breadcrumbs.
import { metresBetween } from "./placeLabel";

export interface Crumb {
  lat: number;
  lng: number;
  speed: number | null;
  recordedAt: string;
}

export interface Stop {
  startedAt: string;
  durationSec: number;
  lat: number;
  lng: number;
}

export interface SpeedPoint {
  /** Seconds since the first fix. */
  t: number;
  mph: number;
}

const MS_TO_MPH = 2.236936;
/** A phone that is parked often emits no fixes, so judge the gap between fixes, not the stored speed. */
const STOPPED_MS = 1.5;
export const MIN_STOP_SECONDS = 120;
export const MIN_POINTS_FOR_SPEED = 10;

/** Stops of two minutes or more. */
export function findStops(crumbs: Crumb[]): Stop[] {
  const stops: Stop[] = [];
  let runStart = -1;
  let runSec = 0;
  const flush = (endIndex: number) => {
    if (runStart >= 0 && runSec >= MIN_STOP_SECONDS) {
      const c = crumbs[runStart];
      stops.push({ startedAt: c.recordedAt, durationSec: Math.round(runSec), lat: c.lat, lng: c.lng });
    }
    void endIndex;
    runStart = -1;
    runSec = 0;
  };
  for (let i = 0; i < crumbs.length - 1; i++) {
    const a = crumbs[i];
    const b = crumbs[i + 1];
    const dt = (new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()) / 1000;
    if (!(dt > 0)) continue;
    const d = metresBetween(a.lat, a.lng, b.lat, b.lng);
    if (d / dt < STOPPED_MS) {
      if (runStart < 0) runStart = i;
      runSec += dt;
    } else {
      flush(i);
    }
  }
  flush(crumbs.length);
  return stops;
}

/** Speed over time, at most `max` points, using the stored speed when there is one. */
export function speedSeries(crumbs: Crumb[], max = 120): SpeedPoint[] {
  if (crumbs.length < MIN_POINTS_FOR_SPEED) return [];
  const t0 = new Date(crumbs[0].recordedAt).getTime();
  const pts: SpeedPoint[] = [];
  for (let i = 0; i < crumbs.length; i++) {
    const c = crumbs[i];
    let mph: number | null = null;
    if (typeof c.speed === "number" && c.speed >= 0) mph = c.speed * MS_TO_MPH;
    else if (i > 0) {
      const p = crumbs[i - 1];
      const dt = (new Date(c.recordedAt).getTime() - new Date(p.recordedAt).getTime()) / 1000;
      if (dt > 0) mph = (metresBetween(p.lat, p.lng, c.lat, c.lng) / dt) * MS_TO_MPH;
    }
    if (mph == null || !Number.isFinite(mph)) continue;
    pts.push({ t: (new Date(c.recordedAt).getTime() - t0) / 1000, mph: Math.min(mph, 120) });
  }
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  const out: SpeedPoint[] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

export function formatDwell(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}
