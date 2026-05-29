// Phantom-trip detection. Two distinct signatures both flag as phantom:
//
// 1. Walking-speed signature: short distance, long duration, low average
//    speed. Almost certainly the mobile detection layer mistaking GPS-drift
//    reacquisitions for driving. Fixed in build 60 mobile via the
//    calc-speed gate (CALC_SPEED_MIN_DIST_M 30→100m); this server-side
//    guard backstops users on older builds.
//
// 2. Crow-flies signature: auto-detected, fewer than 3 GPS coordinates,
//    yet >= 1 mile distance. The map can only render a single straight
//    line for a trip with 2 coords, and at >=1 mile it's almost certainly
//    not a real drive (real short drives have at least a few intermediate
//    fixes). Anthony surfaced this 6 May 2026 after seeing 14-17 mile
//    "trips" that visually crossed entire cities as a single chord.
//
// Either signature flips isPhantomTrip = true. The trip is still created
// in the DB for diagnostics, but excluded from user-facing reads and
// analytics aggregates.

const PHANTOM_MIN_DURATION_SEC = 5 * 60;   // 5 min
const PHANTOM_MAX_DISTANCE_MILES = 1.0;    // 1 mile
const PHANTOM_MAX_AVG_MPH = 5;             // 5 mph (walking)
const CROW_FLIES_MIN_DISTANCE_MILES = 1.0;
const CROW_FLIES_MIN_COORDS = 3;

export interface PhantomCheckInput {
  distanceMiles: number;
  startedAt: Date | string;
  endedAt: Date | string | null | undefined;
  isManualEntry: boolean;
  /** Number of GPS coordinates on the trip. When < 3 with auto-detection
   *  and meaningful distance, the saved trip can only render as a single
   *  chord — almost always wrong data. */
  coordinateCount?: number;
  /** True when the device has independent evidence it genuinely moved, even
   *  though few coords survived accuracy filtering: it captured a dense raw
   *  trace (many fixes dropped only for low accuracy, e.g. cell-tower 1000m
   *  fixes on weak signal), or OSRM map-matched the trace to real roads.
   *  This suppresses ONLY the crow-flies signature (sparse-but-far), never
   *  the walking signature - a stationary GPS-drift "walk" also produces
   *  many raw fixes, so raw count is not evidence of driving there.
   *  Fixes genuine sparse drives being hidden as phantoms (golf-club case,
   *  audit Track A #5/#7). */
  hasRealMovementEvidence?: boolean;
}

export function looksLikePhantomTrip(args: PhantomCheckInput): boolean {
  if (args.isManualEntry) return false;

  // Crow-flies check fires regardless of duration/avg-speed. An auto trip
  // with 0/1/2 coords and >=1 mile distance is structurally suspect —
  // UNLESS the device has independent evidence it really moved (dense raw
  // trace or a successful road map-match), in which case the sparseness is a
  // GPS-quality artifact of weak signal, not a fake chord.
  if (
    args.coordinateCount !== undefined &&
    args.coordinateCount < CROW_FLIES_MIN_COORDS &&
    args.distanceMiles >= CROW_FLIES_MIN_DISTANCE_MILES &&
    !args.hasRealMovementEvidence
  ) {
    return true;
  }

  if (!args.endedAt) return false;
  const startMs = new Date(args.startedAt).getTime();
  const endMs = new Date(args.endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

  const durationSec = (endMs - startMs) / 1000;
  if (durationSec < PHANTOM_MIN_DURATION_SEC) return false;
  if (args.distanceMiles >= PHANTOM_MAX_DISTANCE_MILES) return false;

  const hours = durationSec / 3600;
  if (hours <= 0) return false;
  const avgMph = args.distanceMiles / hours;
  return avgMph < PHANTOM_MAX_AVG_MPH;
}

// Single source of truth lives in @mileclear/shared so the mobile finalize
// guard and this server guard can never drift. Re-exported here so existing
// imports from this module keep working.
export { hasRealMovementEvidence } from "@mileclear/shared";
