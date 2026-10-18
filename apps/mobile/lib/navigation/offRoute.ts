// Off the route, and when to ask for a new one.
//
// Off route: more than about 50 m from the line for 3 fixes in a row, or more
// than 150 m once. The 50 m grows with the accuracy the phone reports, so a
// fuzzy fix between tall buildings does not count as leaving the road; a fix
// worse than 100 m says nothing either way.
//
// Before the car has reached the route (it starts in a car park or a side
// road the router snapped past) it is only off route once it is driving
// away: 150 m further than where it started.

export const SOFT_LIMIT_M = 50;
export const HARD_LIMIT_M = 150;
export const SOFT_FIXES = 3;
/** Fixes worse than this are ignored. */
export const USELESS_ACCURACY_M = 100;
/** Within this (plus a little accuracy) the car has reached the route. */
export const JOIN_M = 40;
export const REROUTE_MIN_INTERVAL_MS = 10_000;

export interface OffRouteState {
  consecutive: number;
  /** The car has been on the line at least once. */
  joined: boolean;
  /** Distance from the route at the first usable fix, before joining. */
  startDistance: number | null;
  offRoute: boolean;
}

export const initialOffRouteState: OffRouteState = {
  consecutive: 0,
  joined: false,
  startDistance: null,
  offRoute: false,
};

export function softLimit(accuracyM: number | null | undefined): number {
  const acc = accuracyM == null || !Number.isFinite(accuracyM) ? 10 : accuracyM;
  return SOFT_LIMIT_M + Math.max(0, Math.min(acc, 50) - 15);
}

export function assessOffRoute(
  state: OffRouteState,
  fix: { distance: number; accuracyM?: number | null; speedMps?: number | null }
): OffRouteState {
  const acc = fix.accuracyM ?? null;
  if (acc != null && acc > USELESS_ACCURACY_M) return state;
  const d = fix.distance;

  if (!state.joined) {
    const startDistance = state.startDistance ?? d;
    if (d <= JOIN_M + Math.min(acc ?? 0, 30)) {
      return { consecutive: 0, joined: true, startDistance, offRoute: false };
    }
    return { ...state, startDistance, offRoute: d > startDistance + HARD_LIMIT_M };
  }

  if (d > HARD_LIMIT_M && (acc == null || acc <= 50)) {
    return { ...state, consecutive: Math.max(state.consecutive, SOFT_FIXES), offRoute: true };
  }
  if (d > softLimit(acc)) {
    // Parked or crawling: GPS wanders while the car does not. Hold the count.
    const stopped = fix.speedMps != null && fix.speedMps < 1;
    const consecutive = stopped ? state.consecutive : state.consecutive + 1;
    return { ...state, consecutive, offRoute: consecutive >= SOFT_FIXES };
  }
  return { ...state, consecutive: 0, offRoute: false };
}

/** At most one route request every 10 seconds, and never two at once. */
export function shouldReroute(args: {
  offRoute: boolean;
  nowMs: number;
  lastRequestAtMs: number | null;
  inFlight: boolean;
}): boolean {
  if (!args.offRoute || args.inFlight) return false;
  if (args.lastRequestAtMs == null) return true;
  return args.nowMs - args.lastRequestAtMs >= REROUTE_MIN_INTERVAL_MS;
}
