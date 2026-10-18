// The navigator: one pure step per GPS fix. Snap to the route, work out the
// step and the distance to the next manoeuvre, decide what to say, notice
// leaving the route and arriving. No React, no timers, no I/O, so a whole
// drive can be replayed in a test.
//
// It never touches trip recording: it only reads fixes (see fixBus.ts), and
// arriving just ends the directions.

import type { NavigationRoute, NavigationStep } from "@mileclear/shared";
import {
  announce,
  currentInstruction,
  initialAnnouncerState,
  type AnnouncerState,
  type Announcement,
} from "./announcer";
import { bearingDeg, bearingDiff, distanceMeters, type LatLng } from "./geo";
import { assessOffRoute, initialOffRouteState, USELESS_ACCURACY_M, type OffRouteState } from "./offRoute";
import { arrivedPhrase } from "./phrases";
import { spokenRoad } from "./streetSpeech";
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

/** Where a fix came from, for diagnostics (counts only). */
export type FixSource = "native" | "task" | "bridge" | "test";

export interface NavFix {
  lat: number;
  lng: number;
  /** m/s; null when the phone does not know. */
  speedMps: number | null;
  /** Metres, as reported by the phone. */
  accuracyM: number | null;
  /** Degrees from north, when the phone reports one. */
  headingDeg: number | null;
  atMs: number;
  source?: FixSource;
}

/** Within this of the destination (plus up to 20 m of GPS accuracy) is there. */
export const ARRIVE_RADIUS_M = 30;
/** ...but only this close to the end along the route, so a round trip that
 *  ends where it starts does not "arrive" at the first fix. */
const ARRIVE_ALONG_WINDOW_M = 250;
/** Moving at least this far between fixes gives a usable direction. */
const COURSE_MIN_MOVE_M = 8;
/** No usable fix for longer than this is a gap (a tunnel, a lost signal). */
export const GAP_MS = 10_000;
/** After a gap, this many fixes cannot start a reroute. */
const FIXES_AFTER_GAP = 2;
/** Speed is smoothed over this window (DESIGN 3.4). */
const SPEED_WINDOW_MS = 5_000;

export interface NavigatorState {
  prepared: PreparedRoute;
  destination: LatLng;
  destinationName: string | null;
  anchor: SnapAnchor | null;
  stepIndex: number;
  along: number;
  segIndex: number;
  offRoute: OffRouteState;
  announcer: AnnouncerState;
  lastFix: NavFix | null;
  lastUsableAtMs: number | null;
  fixesSinceGap: number;
  speeds: Array<{ atMs: number; v: number }>;
  courseDeg: number | null;
  arrived: boolean;
  /** The route starts with a U-turn (the car faces the wrong way), as step 0
   *  or as step 1 within 60 m of the start (a reroute): its index. It is the
   *  first thing said and shown until the car is heading along the line. */
  uturnAt: number | null;
}

export interface NavView {
  /** The car's position on the route, or the fix itself when off it. */
  position: LatLng | null;
  /** Direction of the route at the car (steady), else of travel. */
  courseDeg: number | null;
  distanceFromRoute: number | null;
  stepIndex: number;
  segIndex: number;
  /** The manoeuvre coming up; null on the last step. */
  next: NavigationStep | null;
  /** The manoeuvre after it, when it is close enough for the "Then" strip. */
  then: NavigationStep | null;
  distanceToNext: number;
  remainingMeters: number;
  remainingSeconds: number;
  speedLimitMph: number | null;
  speedMps: number | null;
  offRoute: boolean;
  arrived: boolean;
}

export function startNavigation(
  route: NavigationRoute,
  destination?: LatLng,
  opts: { name?: string | null; fresh?: "start" | "reroute" } = {}
): NavigatorState {
  const prepared = prepareRoute(route);
  const last = prepared.points[prepared.points.length - 1];
  return {
    prepared,
    destination: destination ?? last ?? { lat: 0, lng: 0 },
    destinationName: opts.name ?? null,
    anchor: null,
    stepIndex: 0,
    along: 0,
    segIndex: 0,
    offRoute: initialOffRouteState,
    announcer: initialAnnouncerState(opts.fresh ?? "start"),
    lastFix: null,
    lastUsableAtMs: null,
    fixesSinceGap: FIXES_AFTER_GAP,
    speeds: [],
    courseDeg: null,
    arrived: false,
    uturnAt: uturnAtStart(route, prepared),
  };
}

/** A U-turn the car has to make before anything else, if there is one. */
export const UTURN_START_M = 60;
function uturnAtStart(route: NavigationRoute, r: PreparedRoute): number | null {
  // Only a plain U-turn on one road. A turn round through a side street
  // (`via`, e.g. right into Strawberry Place and right back) is an ordinary
  // manoeuvre with its own distance prompts.
  const plain = (i: number) => route.steps[i]?.type === "uturn" && !route.steps[i]?.via?.trim();
  if (plain(0)) return 0;
  if (plain(1) && (r.stepAlong[1] ?? Infinity) <= UTURN_START_M) return 1;
  return null;
}

/**
 * The next step that is really a manoeuvre after `stepIndex`: a "continue"
 * onto the road the car is already on is not one (the voice skips it, so the
 * banner does too, and the real turn after it is announced on time).
 */
export function nextManoeuvreIndex(steps: NavigationStep[], stepIndex: number): number {
  let i = stepIndex + 1;
  while (i < steps.length - 1) {
    const s = steps[i];
    if (s.type !== "continue") break;
    const to = spokenRoad(s);
    const from = steps[i - 1] ? spokenRoad(steps[i - 1]) : null;
    if (to && to !== from) break;
    i++;
  }
  return i;
}

/** A new route after a reroute. Keeps the destination and recent motion;
 *  the first instruction of the new route is said straight away. */
export function replaceRoute(state: NavigatorState, route: NavigationRoute): NavigatorState {
  const fresh = startNavigation(route, state.destination, { name: state.destinationName, fresh: "reroute" });
  return {
    ...fresh,
    lastFix: state.lastFix,
    lastUsableAtMs: state.lastUsableAtMs,
    speeds: state.speeds,
    courseDeg: state.courseDeg,
  };
}

function instantSpeed(fix: NavFix, last: NavFix | null): number | null {
  if (fix.speedMps != null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0) return fix.speedMps;
  if (!last) return null;
  const dt = (fix.atMs - last.atMs) / 1000;
  if (dt <= 0 || dt > 30) return null;
  return distanceMeters(last, fix) / dt;
}

export function smoothedSpeed(speeds: Array<{ atMs: number; v: number }>): number | null {
  if (speeds.length === 0) return null;
  return speeds.reduce((a, s) => a + s.v, 0) / speeds.length;
}

function courseOf(fix: NavFix, last: NavFix | null, speed: number | null, prev: number | null): number | null {
  if (fix.headingDeg != null && fix.headingDeg >= 0 && Number.isFinite(fix.headingDeg) && (speed ?? 0) > 2) {
    return fix.headingDeg % 360;
  }
  if (last && distanceMeters(last, fix) >= COURSE_MIN_MOVE_M) return bearingDeg(last, fix);
  return prev;
}

function thenStep(r: PreparedRoute, stepIndex: number, speed: number | null): NavigationStep | null {
  const target = nextManoeuvreIndex(r.route.steps, stepIndex);
  const afterIndex = nextManoeuvreIndex(r.route.steps, target);
  const after = r.route.steps[afterIndex];
  if (!after || after.type === "arrive") return null;
  const a = r.stepAlong[target];
  const b = r.stepAlong[afterIndex];
  if (a == null || b == null) return null;
  const gap = b - a;
  const s = Math.max(1, speed ?? 0);
  return gap <= 150 || gap / s <= 10 ? after : null;
}

export function viewOf(state: NavigatorState, extra?: Partial<NavView>): NavView {
  const r = state.prepared;
  const target = nextManoeuvreIndex(r.route.steps, state.stepIndex);
  const next = state.uturnAt != null ? r.route.steps[state.uturnAt] : (r.route.steps[target] ?? null);
  const speed = smoothedSpeed(state.speeds);
  return {
    position: null,
    courseDeg: state.courseDeg,
    distanceFromRoute: null,
    stepIndex: state.stepIndex,
    segIndex: state.segIndex,
    next,
    then: thenStep(r, state.stepIndex, speed),
    distanceToNext: state.uturnAt != null ? 0 : distanceToStep(r, target, state.along),
    remainingMeters: Math.max(0, r.total - state.along),
    remainingSeconds: remainingSeconds(r, state.stepIndex, state.along),
    // Not while off the line: the limit belongs to a road the car is not on.
    speedLimitMph: state.offRoute.offRoute ? null : speedLimitAt(r, state.segIndex),
    speedMps: speed,
    offRoute: state.offRoute.offRoute,
    arrived: state.arrived,
    ...extra,
  };
}

export interface NavStep {
  state: NavigatorState;
  view: NavView;
  /** Say this, if anything. */
  say: Announcement | null;
  /** Off the route: the screen should ask for a new one (it throttles). */
  wantReroute: boolean;
  /** False for a fix too poor to use (accuracy worse than 50 m). */
  usable: boolean;
}

export interface StepOptions {
  /** Would this prompt be spoken now? When it would not (another prompt is
   *  still playing, or one started under 5 s ago), the announcer does not
   *  count it as said, so it is tried again on the next fix instead of being
   *  lost. Muted or on a call counts as said: those prompts are never owed. */
  canSay?: (a: Announcement) => boolean;
}

export function stepNavigation(state: NavigatorState, fix: NavFix, opts: StepOptions = {}): NavStep {
  if (state.arrived) return { state, view: viewOf(state), say: null, wantReroute: false, usable: false };

  // Too fuzzy to place the car: as if no fix came (DESIGN 2.6).
  if (fix.accuracyM != null && fix.accuracyM > USELESS_ACCURACY_M) {
    const next = { ...state, lastFix: fix };
    return { state: next, view: viewOf(next), say: null, wantReroute: false, usable: false };
  }

  const r = state.prepared;
  const afterGap = state.lastUsableAtMs != null && fix.atMs - state.lastUsableAtMs > GAP_MS;
  const fixesSinceGap = afterGap ? 0 : state.fixesSinceGap + 1;
  const v = instantSpeed(fix, state.lastFix);
  const speeds = [...state.speeds, ...(v != null ? [{ atMs: fix.atMs, v }] : [])].filter(
    (s) => fix.atMs - s.atMs <= SPEED_WINDOW_MS
  );
  const speed = smoothedSpeed(speeds);
  const travelCourse = courseOf(fix, state.lastFix, v, state.courseDeg);
  const snap = snapToRoute(
    r,
    { lat: fix.lat, lng: fix.lng, courseDeg: travelCourse, speedMps: v, atMs: fix.atMs },
    afterGap && state.anchor ? { ...state.anchor } : state.anchor
  );

  let next: NavigatorState = {
    ...state,
    lastFix: fix,
    lastUsableAtMs: fix.atMs,
    fixesSinceGap,
    speeds,
    courseDeg: travelCourse,
  };
  if (!snap) return { state: next, view: viewOf(next), say: null, wantReroute: false, usable: true };

  // Off route: never judged on the first fixes after a gap, so a tunnel exit
  // (or a phone waking up) never starts a reroute.
  const offRoute =
    fixesSinceGap < FIXES_AFTER_GAP
      ? { ...state.offRoute, consecutive: 0, offRoute: false }
      : assessOffRoute(state.offRoute, { distance: snap.distance, accuracyM: fix.accuracyM, speedMps: v });
  next = { ...next, offRoute };

  if (offRoute.offRoute) {
    return {
      state: next,
      view: viewOf(next, { position: { lat: fix.lat, lng: fix.lng }, distanceFromRoute: snap.distance }),
      say: null,
      wantReroute: true,
      usable: true,
    };
  }

  // On the route: move along it. The step never goes backwards, so jitter at
  // a junction cannot repeat a prompt.
  const along = snap.along;
  const stepIndex = Math.max(state.stepIndex, stepIndexAt(r, along));
  next = {
    ...next,
    along,
    stepIndex,
    segIndex: snap.segIndex,
    anchor: { along, atMs: fix.atMs },
    // The route's own direction at the car: steady, unlike GPS course.
    courseDeg: snap.distance < 30 ? snap.bearing : travelCourse,
  };

  // Arrived: close to the destination near the end of the line, or past the
  // final step's manoeuvre.
  const remaining = Math.max(0, r.total - along);
  const nearEnd = remaining <= ARRIVE_ALONG_WINDOW_M;
  const lastStep = r.route.steps.length - 1;
  // Close to the destination counts only once no manoeuvre is left before
  // the end: a turn just short of it must still be given.
  const noManoeuvreLeft = nextManoeuvreIndex(r.route.steps, stepIndex) >= lastStep;
  const atDestination =
    nearEnd &&
    noManoeuvreLeft &&
    distanceMeters(fix, state.destination) <= ARRIVE_RADIUS_M + Math.min(fix.accuracyM ?? 0, 20);
  const pastFinal = r.total > 0 && (remaining <= 10 || (lastStep > 0 && stepIndex >= lastStep));
  if (atDestination || pastFinal) {
    next = { ...next, arrived: true };
    return {
      state: next,
      view: viewOf(next, { position: snap.point, distanceFromRoute: snap.distance }),
      say: { text: arrivedPhrase(state.destinationName), urgent: true, tier: "now" },
      wantReroute: false,
      usable: true,
    };
  }

  // A route that starts with a U-turn: say and show that first, until the
  // car is going the line's way (moving, within 30 m, heading within 60
  // degrees of it) or has gone 50 m along.
  if (next.uturnAt != null) {
    const uturnAlong = r.stepAlong[next.uturnAt] ?? 0;
    const aligned = snap.distance < 30 && (v ?? 0) > 2 && travelCourse != null && bearingDiff(travelCourse, snap.bearing) < 60;
    const turned = along > uturnAlong + 50 || (aligned && along >= uturnAlong);
    if (turned) next = { ...next, stepIndex: Math.max(next.stepIndex, next.uturnAt), uturnAt: null };
  }

  const steps = r.route.steps;
  if (next.uturnAt != null) {
    const a = announce(state.announcer, {
      stepIndex: -1,
      next: steps[next.uturnAt],
      distanceToNext: 0,
      current: null,
      stepLength: 0,
      after: steps[next.uturnAt + 1] ?? null,
      gapAfter: null,
      speedMps: speed,
      arriveName: state.destinationName,
    });
    const said = a.say && opts.canSay && !opts.canSay(a.say) ? null : a.say;
    next = { ...next, announcer: said || !a.say ? a.state : state.announcer };
    return { state: next, view: viewOf(next, { position: snap.point, distanceFromRoute: snap.distance }), say: said, wantReroute: false, usable: true };
  }

  // Prompts are for the next real manoeuvre (same-road "continue" steps are
  // skipped), keyed by its index so passing a skipped step changes nothing.
  const cur = next.stepIndex;
  const target = nextManoeuvreIndex(steps, cur);
  const afterIndex = nextManoeuvreIndex(steps, target);
  const nextStep = steps[target] ?? null;
  const after = steps[afterIndex] ?? null;
  const distanceToNext = distanceToStep(r, target, along);
  const gapAfter =
    after && r.stepAlong[afterIndex] != null && r.stepAlong[target] != null
      ? r.stepAlong[afterIndex] - r.stepAlong[target]
      : null;
  const stepLength = (r.stepAlong[target] ?? r.total) - (r.stepAlong[cur] ?? 0);
  const a = announce(state.announcer, {
    stepIndex: target - 1,
    next: nextStep,
    distanceToNext,
    current: steps[target - 1] ?? null,
    stepLength,
    after,
    gapAfter,
    speedMps: speed,
    arriveName: state.destinationName,
  });
  // Only count a prompt as said if the voice will actually say it now.
  const say = a.say && opts.canSay && !opts.canSay(a.say) ? null : a.say;
  next = { ...next, announcer: say || !a.say ? a.state : state.announcer };

  return {
    state: next,
    view: viewOf(next, { position: snap.point, distanceFromRoute: snap.distance }),
    say,
    wantReroute: false,
    usable: true,
  };
}

/** The instruction to repeat (banner tap, end of a call, voice back on). */
export function repeatInstruction(state: NavigatorState, maxMetres = Infinity): string | null {
  if (state.arrived || state.offRoute.offRoute) return null;
  const r = state.prepared;
  return currentInstruction(
    {
      next: r.route.steps[nextManoeuvreIndex(r.route.steps, state.stepIndex)] ?? null,
      distanceToNext: distanceToStep(r, nextManoeuvreIndex(r.route.steps, state.stepIndex), state.along),
      arriveName: state.destinationName,
    },
    maxMetres
  );
}

/** No usable fix for this long: show "Waiting for GPS" (DESIGN 2.6). */
export const GPS_STALE_MS = 5_000;

export function gpsStale(lastFixAtMs: number | null, nowMs: number): boolean {
  return lastFixAtMs == null || nowMs - lastFixAtMs > GPS_STALE_MS;
}
