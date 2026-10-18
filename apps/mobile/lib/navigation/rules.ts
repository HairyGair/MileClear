// Small pure rules for the Directions screens (docs/navigation-1.4.0/DESIGN.md).
// Each is tested in __tests__/rules.test.ts.

import { distanceMeters, offset, type LatLng } from "./geo";

// ── Where a reroute starts (voice re-test, 19 Oct 2026) ──────────────────

export const REROUTE_LEAD_MIN_M = 30;
export const REROUTE_LEAD_MAX_M = 150;
export const REROUTE_LEAD_S = 4;

/**
 * The `from` point for a reroute: ahead of the car along its course by
 * max(30 m, 4 s of driving), capped at 150 m. The route takes a second or
 * two to arrive, so one that starts where the car asked has its first
 * manoeuvre behind the car already (Gallowgate: "Turn round using
 * Strawberry Place" was missed 4 runs in 6). Stopped or no course: the car's
 * own position. The navigator keeps using the real position.
 */
export function rerouteOrigin(p: LatLng, courseDeg: number | null, speedMps: number | null): LatLng {
  const v = speedMps ?? 0;
  if (courseDeg == null || v < 1) return { lat: p.lat, lng: p.lng };
  const lead = Math.min(REROUTE_LEAD_MAX_M, Math.max(REROUTE_LEAD_MIN_M, v * REROUTE_LEAD_S));
  return offset(p, courseDeg, lead);
}

const MPH = 0.44704;

// ── Coverage (DESIGN 2.8: checked on the phone before asking) ────────────

/** Great Britain only: not Northern Ireland, the Isle of Man, the Channel
 *  Islands or abroad. A box with those cut out; generous at the coasts. */
export function inGreatBritain(p: LatLng): boolean {
  const { lat, lng } = p;
  if (lat < 49.85 || lat > 60.9 || lng < -8.7 || lng > 1.8) return false;
  // Ireland, north and south. Above 55 N the line moves west so Kintyre
  // (to -5.8) stays in; Wales reaches -5.32 at St David's Head.
  if (lat >= 51.3 && lat < 55.0 && lng < -5.35) return false;
  if (lat >= 55.0 && lat < 55.45 && lng < -6.0) return false;
  // The Isles of Scilly, west of Land's End (-5.72).
  if (lat < 51.3 && lng < -5.75) return false;
  // Isle of Man.
  if (lat > 54.03 && lat < 54.43 && lng > -4.85 && lng < -4.3) return false;
  // France and the Low Countries below the Channel.
  if (lat < 51.0 && lng > 1.45) return false;
  return true;
}

// ── Search lock while moving (DESIGN 2.1) ─────────────────────────────────

export interface MovingLock {
  locked: boolean;
  /** When the speed first dropped below 3 mph (to unlock after 5 s). */
  slowSinceMs: number | null;
}

export const initialMovingLock: MovingLock = { locked: false, slowSinceMs: null };

/**
 * Moving = speed smoothed over 5 s at or above 10 mph. Unlocks by itself
 * after 5 s below 3 mph. "I'm a passenger" is applied by the screen.
 */
export function updateMovingLock(prev: MovingLock, smoothedMps: number | null, nowMs: number): MovingLock {
  const v = smoothedMps ?? 0;
  if (v >= 10 * MPH) return { locked: true, slowSinceMs: null };
  if (!prev.locked) return prev;
  if (v < 3 * MPH) {
    const since = prev.slowSinceMs ?? nowMs;
    return nowMs - since >= 5_000 ? { locked: false, slowSinceMs: null } : { locked: true, slowSinceMs: since };
  }
  return { locked: true, slowSinceMs: null };
}

// ── Camera zoom by speed (DESIGN 2.3) ─────────────────────────────────────

export interface ZoomState {
  level: 15 | 16 | 17;
  changedAtMs: number;
}

/** Apple's camera altitude for each zoom level, metres. */
export const ALTITUDE_FOR: Record<15 | 16 | 17, number> = { 17: 500, 16: 900, 15: 1800 };

/** Under 30 mph 17, 30 to 55 mph 16, over 55 mph 15; changes at most every 5 s.
 *  Within 150 m of a manoeuvre, one step closer. */
export function nextZoom(prev: ZoomState | null, speedMps: number | null, nowMs: number): ZoomState {
  const mph = (speedMps ?? 0) / MPH;
  const want: 15 | 16 | 17 = mph > 55 ? 15 : mph >= 30 ? 16 : 17;
  if (!prev) return { level: want, changedAtMs: nowMs };
  if (want === prev.level || nowMs - prev.changedAtMs < 5_000) return prev;
  return { level: want, changedAtMs: nowMs };
}

export function zoomNearManoeuvre(level: 15 | 16 | 17, distanceToNext: number): number {
  return distanceToNext < 150 ? Math.min(18, level + 1) : level;
}

// ── Night map (DESIGN 2.15): sunrise / sunset at the car ─────────────────

/** True between sunset and sunrise at this place (NOAA approximation). */
export function isNight(p: LatLng, at: Date): boolean {
  const rad = Math.PI / 180;
  const start = Date.UTC(at.getUTCFullYear(), 0, 0);
  const day = Math.floor((at.getTime() - start) / 86_400_000);
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (day + 10));
  const cosH =
    (Math.sin(-0.833 * rad) - Math.sin(p.lat * rad) * Math.sin(decl * rad)) /
    (Math.cos(p.lat * rad) * Math.cos(decl * rad));
  if (cosH > 1) return true; // polar night
  if (cosH < -1) return false; // midnight sun
  const h = Math.acos(cosH) / rad; // degrees
  // Equation of time (minutes), small but keeps it within a few minutes.
  const b = rad * (360 / 365) * (day - 81);
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const noonUtcMin = 720 - 4 * p.lng - eot;
  const riseMin = noonUtcMin - 4 * h;
  const setMin = noonUtcMin + 4 * h;
  const nowMin = at.getUTCHours() * 60 + at.getUTCMinutes();
  return nowMin < riseMin || nowMin > setMin;
}

// ── Resume after the app was closed (DESIGN 2.10, PLAN 1.7) ──────────────

export const RESUME_MAX_AGE_MS = 30 * 60 * 1000;
export const RESUME_MAX_OFF_ROUTE_M = 2_000;

export interface SavedSession {
  destination: { lat: number; lng: number; label: string | null };
  startedAtMs: number;
  updatedAtMs: number;
  /** The rest of the route, thinned to a point every few hundred metres. */
  remaining: Array<[number, number]>;
}

/** Offer "Carry on to {place}?" only for a recent, unfinished session the
 *  phone is still near. Unknown position: offer (the driver decides). */
export function shouldOfferResume(s: SavedSession | null, nowMs: number, here: LatLng | null): boolean {
  if (!s) return false;
  if (nowMs - s.updatedAtMs > RESUME_MAX_AGE_MS || nowMs < s.startedAtMs) return false;
  if (!here || s.remaining.length === 0) return true;
  let best = Infinity;
  for (const [lat, lng] of s.remaining) best = Math.min(best, distanceMeters(here, { lat, lng }));
  return best <= RESUME_MAX_OFF_ROUTE_M;
}

/** Every nth point of the line from `fromIndex`, with the last one, at most `max`. */
export function thinLine(line: Array<[number, number]>, fromIndex: number, max = 60): Array<[number, number]> {
  const rest = line.slice(Math.max(0, fromIndex));
  if (rest.length <= max) return rest;
  const step = Math.ceil(rest.length / max);
  const out = rest.filter((_, i) => i % step === 0);
  const last = rest[rest.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

// ── Recent destinations (DESIGN 2.1: the last 5, on the phone only) ──────

export interface RecentDestination {
  lat: number;
  lng: number;
  label: string;
  atMs: number;
}

export function addRecentDestination(list: RecentDestination[], d: RecentDestination, max = 5): RecentDestination[] {
  const rest = list.filter((x) => distanceMeters(x, d) > 75);
  return [d, ...rest].slice(0, max);
}

// ── Arrival auto-close (DESIGN 2.5) ───────────────────────────────────────

export const ARRIVED_AUTO_CLOSE_MS = 60_000;
export const ARRIVED_DRIVE_OFF_M = 300;

export function shouldCloseAfterArrival(args: { arrivedAtMs: number; nowMs: number; distanceFromDestination: number | null }): boolean {
  if (args.nowMs - args.arrivedAtMs >= ARRIVED_AUTO_CLOSE_MS) return true;
  return args.distanceFromDestination != null && args.distanceFromDestination > ARRIVED_DRIVE_OFF_M;
}

// ── Recording chip (DESIGN 1.4), read-only from the recorder's state ─────

export type RecordingChip = "recording" | "off" | null;

/**
 * From tracking_state values (read, never written): a trip is open, a shift
 * or Start Trip is running, Automatic trips is switched off or paused.
 */
export function recordingChip(state: Record<string, string | undefined>, nowMs: number): RecordingChip {
  if (state.auto_recording_active === "1") return "recording";
  if (state.active_shift_id) return "recording";
  const pausedUntil = Number(state.drive_pause_until);
  if (Number.isFinite(pausedUntil) && pausedUntil > nowMs) return "off";
  const sw = state.drive_detection_enabled;
  if (sw !== undefined && sw !== "1") return "off";
  return null;
}

// ── Times on the bottom bar update calmly (DESIGN 2.3) ───────────────────

export interface CalmFigures {
  remainingSeconds: number;
  remainingMeters: number;
  arrivalMs: number;
  updatedAtMs: number;
}

/** Figures change at most every 30 s; the arrival time only when it moves a minute. */
export function calmFigures(prev: CalmFigures | null, live: { remainingSeconds: number; remainingMeters: number }, nowMs: number): CalmFigures {
  const arrivalMs = nowMs + live.remainingSeconds * 1000;
  if (!prev || nowMs - prev.updatedAtMs >= 30_000) {
    const keepArrival = prev && Math.abs(arrivalMs - prev.arrivalMs) < 60_000;
    return { ...live, arrivalMs: keepArrival ? prev!.arrivalMs : arrivalMs, updatedAtMs: nowMs };
  }
  return prev;
}

export function speedMph(mps: number | null): number | null {
  return mps == null ? null : mps / MPH;
}

// ── Problem reports (1.4.0 test) ────────────────────────────────────────

/** "Report a problem with Directions" (1.4.0 test): ?topic=directions&ref=<session>
 *  tags the report with the session and route ids only, never a place. */
export function directionsReportPrefix(ref: string | undefined): string {
  const safe = (ref ?? "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
  return `[Directions test${safe ? `, ${safe}` : ""}]`;
}

