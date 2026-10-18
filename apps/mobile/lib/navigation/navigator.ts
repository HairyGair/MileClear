// The navigator: one pure step per GPS fix. Snap to the route, work out the
// step and the distance to the next manoeuvre, decide what to say, notice
// leaving the route and arriving. No React, no timers, no I/O, so a whole
// drive can be replayed in a test.
//
// It never touches trip recording: it only reads fixes the recorder already
// had (see fixBus.ts), and arriving just ends guidance.

import type { NavigationRoute, NavigationStep } from "@mileclear/shared";
import { announce, initialAnnouncerState, type AnnouncerState } from "./announcer";
import { bearingDeg, distanceMeters, type LatLng } from "./geo";
import { assessOffRoute, initialOffRouteState, type OffRouteState } from "./offRoute";
import { ARRIVED_PHRASE, REROUTING_PHRASE } from "./phrases";
import {
  distanceToStep,
  prepareRoute,
  remainingSeconds,
  snapToRoute,
  speedLimitAt,
  stepIndexAt,
  type PreparedRoute,
  type SnapAnchor,
} from "./route";

export interface NavFix {
  lat: number;
  lng: number;
  /** m/s; null or negative when the phone does not know. */
  speedMps: number | null;
  /** Metres, as reported by the phone. */
  accuracyM: number | null;
  /** Degrees from north, when the phone reports one. */
  headingDeg: number | null;
  atMs: number;
}

/** Within this of the destination (plus up to 20 m of GPS accuracy) is there. */
export const ARRIVE_RADIUS_M = 30;
/** ...but only this close to the end along the route, so a round trip that
 *  ends where it starts does not "arrive" at the first fix. */
const ARRIVE_ALONG_WINDOW_M = 250;
/** Moving at least this far between fixes gives a usable direction. */
const COURSE_MIN_MOVE_M = 8;

export interface NavigatorState {
  prepared: PreparedRoute;
  destination: LatLng;
  anchor: SnapAnchor | null;
  stepIndex: number;
  along: number;
  offRoute: OffRouteState;
  announcer: AnnouncerState;
  lastFix: NavFix | null;
  courseDeg: number | null;
  /** "Rerouting" has been said for the current time off the route. */
  reroutingSaid: boolean;
  arrived: boolean;
}

export interface NavView {
  /** The car's position on the route, or the fix itself when off it. */
  position: LatLng | null;
  courseDeg: number | null;
  distanceFromRoute: number | null;
  stepIndex: number;
  /** The manoeuvre coming up; null on the last step. */
  next: NavigationStep | null;
  distanceToNext: number;
  remainingMeters: number;
  remainingSeconds: number;
  speedLimitMph: number | null;
  offRoute: boolean;
  arrived: boolean;
}

export function startNavigation(route: NavigationRoute, destination?: LatLng): NavigatorState {
  const prepared = prepareRoute(route);
  const last = prepared.points[prepared.points.length - 1];
  return {
    prepared,
    destination: destination ?? last ?? { lat: 0, lng: 0 },
    anchor: null,
    stepIndex: 0,
    along: 0,
    offRoute: initialOffRouteState,
    announcer: initialAnnouncerState(),
    lastFix: null,
    courseDeg: null,
    reroutingSaid: false,
    arrived: false,
  };
}

/** A new route after a reroute. Keeps the destination, the last fix and the
 *  fact that "Rerouting" was said; prompts start again for the new line. */
export function replaceRoute(state: NavigatorState, route: NavigationRoute): NavigatorState {
  const fresh = startNavigation(route, state.destination);
  return { ...fresh, lastFix: state.lastFix, courseDeg: state.courseDeg };
}

function usableSpeed(fix: NavFix, last: NavFix | null): number | null {
  if (fix.speedMps != null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0) return fix.speedMps;
  if (!last) return null;
  const dt = (fix.atMs - last.atMs) / 1000;
  if (dt <= 0 || dt > 30) return null;
  return distanceMeters(last, fix) / dt;
}

function courseOf(fix: NavFix, last: NavFix | null, speed: number | null, prev: number | null): number | null {
  if (fix.headingDeg != null && fix.headingDeg >= 0 && Number.isFinite(fix.headingDeg) && (speed ?? 0) > 2) {
    return fix.headingDeg % 360;
  }
  if (last && distanceMeters(last, fix) >= COURSE_MIN_MOVE_M) return bearingDeg(last, fix);
  return prev;
}

export function viewOf(state: NavigatorState, extra?: Partial<NavView>): NavView {
  const r = state.prepared;
  const next = r.route.steps[state.stepIndex + 1] ?? null;
  return {
    position: null,
    courseDeg: state.courseDeg,
    distanceFromRoute: null,
    stepIndex: state.stepIndex,
    next,
    distanceToNext: distanceToStep(r, state.stepIndex + 1, state.along),
    remainingMeters: Math.max(0, r.total - state.along),
    remainingSeconds: remainingSeconds(r, state.stepIndex, state.along),
    speedLimitMph: null,
    offRoute: state.offRoute.offRoute,
    arrived: state.arrived,
    ...extra,
  };
}

export interface NavStep {
  state: NavigatorState;
  view: NavView;
  /** Say these, in order. */
  speak: string[];
  /** Off the route: the screen should ask for a new one (it throttles). */
  wantReroute: boolean;
}

export function stepNavigation(state: NavigatorState, fix: NavFix): NavStep {
  if (state.arrived) return { state, view: viewOf(state), speak: [], wantReroute: false };

  const r = state.prepared;
  const speed = usableSpeed(fix, state.lastFix);
  const courseDeg = courseOf(fix, state.lastFix, speed, state.courseDeg);
  const snap = snapToRoute(r, { lat: fix.lat, lng: fix.lng, courseDeg, speedMps: speed, atMs: fix.atMs }, state.anchor);
  const speak: string[] = [];

  let next: NavigatorState = { ...state, lastFix: fix, courseDeg };
  if (!snap) return { state: next, view: viewOf(next), speak, wantReroute: false };

  const offRoute = assessOffRoute(state.offRoute, {
    distance: snap.distance,
    accuracyM: fix.accuracyM,
    speedMps: speed,
  });
  next = { ...next, offRoute };

  if (offRoute.offRoute) {
    if (!state.reroutingSaid) speak.push(REROUTING_PHRASE);
    next = { ...next, reroutingSaid: true };
    return {
      state: next,
      view: viewOf(next, { position: { lat: fix.lat, lng: fix.lng }, distanceFromRoute: snap.distance }),
      speak,
      wantReroute: true,
    };
  }

  // On the route (or not far enough off to count): move along it. The step
  // never goes backwards, so jitter at a junction cannot repeat a prompt.
  const credible = fix.accuracyM == null || fix.accuracyM <= 100;
  const along = credible ? snap.along : state.along;
  const stepIndex = Math.max(state.stepIndex, stepIndexAt(r, along));
  next = {
    ...next,
    along,
    stepIndex,
    reroutingSaid: false,
    anchor: credible ? { along, atMs: fix.atMs } : state.anchor,
  };

  // Arrived: close to the destination near the end of the line, or past the
  // final step's manoeuvre.
  const remaining = Math.max(0, r.total - along);
  const nearEnd = remaining <= ARRIVE_ALONG_WINDOW_M;
  const atDestination =
    nearEnd &&
    distanceMeters(fix, state.destination) <= ARRIVE_RADIUS_M + Math.min(fix.accuracyM ?? 0, 20);
  const lastStep = r.route.steps.length - 1;
  const pastFinal = r.total > 0 && (remaining <= 10 || (lastStep > 0 && stepIndex >= lastStep));
  if (atDestination || pastFinal) {
    next = { ...next, arrived: true };
    speak.push(ARRIVED_PHRASE);
    return {
      state: next,
      view: viewOf(next, { position: snap.point, distanceFromRoute: snap.distance }),
      speak,
      wantReroute: false,
    };
  }

  const steps = r.route.steps;
  const nextStep = steps[stepIndex + 1] ?? null;
  const after = steps[stepIndex + 2] ?? null;
  const distanceToNext = distanceToStep(r, stepIndex + 1, along);
  const gapAfter =
    after && r.stepAlong[stepIndex + 2] != null && r.stepAlong[stepIndex + 1] != null
      ? r.stepAlong[stepIndex + 2] - r.stepAlong[stepIndex + 1]
      : null;
  const a = announce(state.announcer, {
    stepIndex,
    next: nextStep,
    distanceToNext,
    after,
    gapAfter,
    speedMps: speed,
  });
  next = { ...next, announcer: a.state };
  if (a.speak) speak.push(a.speak);

  return {
    state: next,
    view: viewOf(next, {
      position: snap.point,
      distanceFromRoute: snap.distance,
      speedLimitMph: speedLimitAt(r, snap.segIndex),
    }),
    speak,
    wantReroute: false,
  };
}

/** No fix for this long: show "Waiting for GPS". */
export const GPS_STALE_MS = 8_000;

export function gpsStale(lastFixAtMs: number | null, nowMs: number): boolean {
  return lastFixAtMs == null || nowMs - lastFixAtMs > GPS_STALE_MS;
}
