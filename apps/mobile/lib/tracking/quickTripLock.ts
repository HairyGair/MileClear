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

/**
 * A Start Trip that has driven and then gone this long without a driving-
 * speed fix is parked: finish it as if Arrive had been tapped when the
 * driving stopped.
 *
 * Samantha Birch, 30 Sep 2026: tapped Start Trip at 08:54 and never tapped
 * Arrive. She is a mobile foot-care practitioner, so she walks between
 * clients, and every walking fix renewed QUICK_TRIP_LIVE_COORD_MS above: the
 * lock stayed "live" until 17:47, the phone ran navigation-grade GPS all day
 * (76% to 29% with a charge in between), and the whole day saved as one
 * 14-mile trip. Liveness has to mean DRIVING, not any fix.
 */
export const QUICK_TRIP_PARKED_MS = 15 * 60 * 1000;

/** A Start Trip that has recorded no driving at all is let go after this. */
export const QUICK_TRIP_NEVER_DROVE_MS = 60 * 60 * 1000;

/**
 * "Keep Start Trip going until I tap Arrived" (Settings > Tracking). Kada, an
 * Amazon Flex driver, 9 Oct 2026: a 36-minute wait at the delivery station
 * ended her Start Trip by the parked rule above and the rest of the block came
 * in as separate trips. With the setting on, neither the parked nor the
 * never-drove rule applies, and the lock counts as freshly started for this
 * long instead of QUICK_TRIP_STALE_MS. The 18-hour span cap still applies, so
 * a forgotten Start Trip cannot hold the GPS forever.
 */
export const QUICK_TRIP_UNTIL_ARRIVED_MS = 12 * 60 * 60 * 1000;

/**
 * Does this Start Trip hold through stops (no 15-minute parked finish, the
 * "Still on your trip?" reminder instead)?
 *
 * Shaun, 10 Oct 2026: Automatic trips off, he used Start Trip, stopped for 18
 * minutes part way, and the parked rule saved the first 16 miles and handed
 * back to automatic trips. With them off nothing recorded the other ~100
 * miles. The parked finish only makes sense when automatic trips will pick up
 * the next drive, so with them off Start Trip runs until Arrived, as if the
 * setting were on. `automaticTripsOn` is readDetectionSwitch (a pause still
 * reads on: it ends by itself).
 */
export function startTripHoldsThroughStops(args: {
  /** The "Start Trip runs until I tap Arrived" setting. */
  settingOn: boolean;
  automaticTripsOn: boolean;
}): { on: boolean; source: "setting" | "automatic_trips_off" | null } {
  if (args.settingOn) return { on: true, source: "setting" };
  if (!args.automaticTripsOn) return { on: true, source: "automatic_trips_off" };
  return { on: false, source: null };
}

/**
 * The notification after a background finish (parked or never drove). With
 * automatic trips off, "your next drives record automatically" is not true.
 */
export function quickTripAutoFinishCopy(args: {
  tripsSaved: number;
  automaticTripsOn: boolean;
}): { title: string; body: string; action: "open_trips" | "open_dashboard" } {
  const next = args.automaticTripsOn
    ? "Your next drives record automatically."
    : "Automatic trips are off, so tap Start Trip for your next drive.";
  return args.tripsSaved > 0
    ? {
        title: "Trip saved",
        body: `You'd parked, so your Start Trip was finished and saved. ${next}`,
        action: "open_trips",
      }
    : {
        title: "Start Trip ended",
        body: `Your Start Trip hadn't recorded any driving, so it was switched off to save battery. ${next}`,
        action: "open_dashboard",
      };
}

export type QuickTripLockAction =
  /** A real recording owns the GPS. Yield; change nothing. */
  | "suppress"
  /** Drop the lock AND turn its breadcrumbs into trips. */
  | "recover"
  /** Drop the lock, LEAVE the breadcrumbs. */
  | "release_lock_only"
  /** Parked: trim the trail to the last driving fix, then recover it. */
  | "finish";

export type QuickTripLockReason =
  | "live_breadcrumb"
  | "recently_started"
  | "foreground_form"
  | "span_cap"
  | "foreground_stale"
  | "orphan"
  | "parked"
  | "never_drove";

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
  /** Latest breadcrumb that shows driving (staleShiftRule.lastDrivingFixMs);
   *  null = none recorded. Omitted by callers that predate the parked rule. */
  lastDrivingMs?: number | null;
  /** The driver's "keep Start Trip going until I tap Arrived" setting. */
  untilArrived?: boolean;
  /**
   * Automatic trips switched off (startTripHoldsThroughStops). Like the
   * setting, no parked finish and the 12-hour liveness; unlike it, the
   * never-drove rule still lets an untouched Start Trip go after an hour.
   */
  automaticTripsOff?: boolean;
}): QuickTripLockDecision {
  const { nowMs, firstCoordMs, lastCoordMs, quickTripStartMs, lockStartedAtMs, appActive } = args;
  const untilArrived = args.untilArrived === true;
  const automaticTripsOff = args.automaticTripsOff === true;
  const holdsThroughStops = untilArrived || automaticTripsOff;

  const anchors = [firstCoordMs, quickTripStartMs, lockStartedAtMs].filter(
    (v): v is number => v != null && Number.isFinite(v)
  );
  const anchorMs = anchors.length > 0 ? Math.min(...anchors) : null;

  const spanCapMs =
    quickTripStartMs != null ? QUICK_TRIP_MAX_SPAN_MS : QUICK_TRIP_NO_START_MAX_SPAN_MS;
  if (anchorMs != null && nowMs - anchorMs > spanCapMs) {
    return { action: "recover", reason: "span_cap" };
  }

  // A real Start Trip, with the app off screen (the open form owns its own
  // Arrive, so never finish from under it): judge it by DRIVING, not by any
  // fix, because walking fixes keep the breadcrumb test below forever live.
  if (quickTripStartMs != null && !appActive && !untilArrived && args.lastDrivingMs !== undefined) {
    const drove = args.lastDrivingMs;
    if (drove != null && Number.isFinite(drove) && drove >= quickTripStartMs) {
      // Nothing would record the rest of the journey with automatic trips off.
      if (!automaticTripsOff && nowMs - drove >= QUICK_TRIP_PARKED_MS) {
        return { action: "finish", reason: "parked" };
      }
    } else if (nowMs - quickTripStartMs >= QUICK_TRIP_NEVER_DROVE_MS) {
      // Nothing driven: "finish" trims every fix, so no walk is saved as a trip.
      return { action: "finish", reason: "never_drove" };
    }
  }

  if (lastCoordMs != null && nowMs - lastCoordMs < QUICK_TRIP_LIVE_COORD_MS) {
    return { action: "suppress", reason: "live_breadcrumb" };
  }
  const staleMs = holdsThroughStops ? QUICK_TRIP_UNTIL_ARRIVED_MS : QUICK_TRIP_STALE_MS;
  if (quickTripStartMs != null && nowMs - quickTripStartMs < staleMs) {
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
