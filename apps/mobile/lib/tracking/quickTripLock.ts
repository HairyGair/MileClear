// Whether a __quick_trip__ lock should still stop auto-detection from running.
//
// Duncan Norton, 14 Sep 2026: tapped Start Trip, never tapped Arrive. The lock
// sat on his phone for over three hours and every detection tick logged
// detection_skipped/active_quick_trip — 181 of them inside a 200-row log, so
// the true figure is higher. He drove for about two hours and nothing recorded.
//
// Three guards were meant to prevent exactly that. None fired:
//
//   guard                what went wrong
//   -----------------    ------------------------------------------------------
//   20-min breadcrumb    the background location task writes breadcrumbs under
//                        whatever active_shift_id says, so a moving phone keeps
//                        renewing the lock's own liveness. It feeds itself.
//   18h / 3h span cap    measured from the earliest breadcrumb or the
//                        quick_trip_start row, and tapping Start Trip again
//                        rewrites BOTH (trip-form clears the coords and writes a
//                        fresh row), so the clock restarts and the cap is never
//                        reached.
//   foreground exemption had no age bound at all. Having the app on screen made
//                        the code MORE protective of a broken lock, which is why
//                        "just open the app" was the wrong advice to give him.
//
// Pure module, like gapStop.ts and journeyBoundary.ts, because detection.ts
// pulls in the whole native tracking stack and the test runner cannot import it.

/** A breadcrumb this recent means the trip is genuinely recording right now. */
export const QUICK_TRIP_LIVE_COORD_MS = 20 * 60 * 1000;

/** Covers the tap-Start -> first-fix gap, when no breadcrumb exists yet. */
export const QUICK_TRIP_STALE_MS = 3 * 60 * 60 * 1000;

/** No genuine single quick trip runs this long. */
export const QUICK_TRIP_MAX_SPAN_MS = 18 * 60 * 60 * 1000;

/** Tighter cap with no quick_trip_start row: no trip-form session owns it. */
export const QUICK_TRIP_NO_START_MAX_SPAN_MS = 3 * 60 * 60 * 1000;

export type QuickTripLockAction =
  /** A real recording owns the GPS. Yield; change nothing. */
  | "suppress"
  /** Drop the lock AND turn its breadcrumbs into trips. */
  | "recover"
  /** Drop the lock, LEAVE the breadcrumbs. */
  | "release_lock_only";

export type QuickTripLockReason =
  | "live_breadcrumb"
  | "recently_started"
  | "foreground_form"
  | "span_cap"
  | "foreground_stale"
  | "orphan";

export interface QuickTripLockDecision {
  action: QuickTripLockAction;
  reason: QuickTripLockReason;
}

/**
 * Decide what to do about a `__quick_trip__` lock.
 *
 * Every timestamp is epoch ms, or null when the underlying row is absent.
 * `lockStartedAtMs` is `active_shift_started_at`, written on every
 * startQuickTripTracking. Including it in the age anchor is what stops a lock
 * from being immortal: the breadcrumbs and the start row are both rewritten by
 * a fresh Start Trip tap, but a lock that is never released keeps its original
 * stamp only until the next tap, so this is the anchor most likely to survive.
 */
export function quickTripLockDecision(args: {
  nowMs: number;
  firstCoordMs: number | null;
  lastCoordMs: number | null;
  quickTripStartMs: number | null;
  lockStartedAtMs: number | null;
  appActive: boolean;
}): QuickTripLockDecision {
  const { nowMs, firstCoordMs, lastCoordMs, quickTripStartMs, lockStartedAtMs, appActive } = args;

  const anchors = [firstCoordMs, quickTripStartMs, lockStartedAtMs].filter(
    (v): v is number => v != null && Number.isFinite(v)
  );
  const anchorMs = anchors.length > 0 ? Math.min(...anchors) : null;

  const spanCapMs =
    quickTripStartMs != null ? QUICK_TRIP_MAX_SPAN_MS : QUICK_TRIP_NO_START_MAX_SPAN_MS;
  if (anchorMs != null && nowMs - anchorMs > spanCapMs) {
    return { action: "recover", reason: "span_cap" };
  }

  if (lastCoordMs != null && nowMs - lastCoordMs < QUICK_TRIP_LIVE_COORD_MS) {
    return { action: "suppress", reason: "live_breadcrumb" };
  }
  if (quickTripStartMs != null && nowMs - quickTripStartMs < QUICK_TRIP_STALE_MS) {
    return { action: "suppress", reason: "recently_started" };
  }

  // Past this point the lock is NOT live: no breadcrumb for 20 minutes and, if
  // a start row exists, it is already older than QUICK_TRIP_STALE_MS.
  //
  // The old code returned "suppress" here whenever the app was on screen with a
  // start row, to avoid recovering a trail the open form still holds in memory
  // and duplicating it at Arrive. That guard was right about the duplicate and
  // wrong about everything else: a genuinely in-progress foreground trip is
  // always live by definition, because the form is writing breadcrumbs. So
  // reaching here with the app open means the form is NOT recording.
  //
  // Release the lock so detection resumes, but leave the breadcrumbs alone, so
  // if this call is wrong the form can still recover the trail at Arrive.
  if (quickTripStartMs != null && appActive) {
    return { action: "release_lock_only", reason: "foreground_stale" };
  }

  return { action: "recover", reason: "orphan" };
}
