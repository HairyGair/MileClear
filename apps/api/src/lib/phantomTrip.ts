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

import { DRIVING_EVIDENCE_SPEED_MPH } from "@mileclear/shared";

const PHANTOM_MIN_DURATION_SEC = 5 * 60;   // 5 min
const PHANTOM_MAX_DISTANCE_MILES = 1.0;    // 1 mile
const PHANTOM_MAX_AVG_MPH = 5;             // 5 mph (walking)
const CROW_FLIES_MIN_DISTANCE_MILES = 1.0;
const CROW_FLIES_MIN_COORDS = 3;

// Teleport signature (27 Aug 2026). Both rules below describe a "trip" that
// is one cell-tower fix and one real fix, and NEITHER can be talked out of
// it by the reprieves — that is the whole point of them. Rachel Thorndyke's
// 26 Aug pair (1.56 mi in 1 second, 1.96 mi in 3 seconds, two coordinates
// each, first fix 2.2 and 2.4 km out at 2,180 m and 2,386 m accuracy) came
// through untouched because the client had marked them `lowConfidence`, and
// the crow-flies rule steps aside for that flag. lowConfidence means "a real
// drive whose middle iOS ate"; it cannot mean a mile and a half covered in a
// second, so the physics has to outrank it.
//
// trimEdgePhantoms could not help either: it needs more than 3 points to
// work with (MIN_POINTS_AFTER_TRIM) and these have two, so the purest form
// of the defect is exactly the form it never sees.
const TELEPORT_MIN_MILES = 0.3;
/** No car sustains this over a whole journey; 90 is the edge-trim's ceiling
 *  for a single hop, so a whole-trip average above 120 is unarguable. */
const TELEPORT_MAX_AVG_MPH = 120;
/** A fix this coarse is a cell tower, not GPS. Same number as
 *  EDGE_PHANTOM_ACCURACY_M in mapMatching.ts. */
const CELL_TOWER_ACCURACY_M = 500;
const CELL_TOWER_MIN_MILES = 0.5;

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
  /** Highest device-reported speed (mph) on the trip. A genuine driving speed
   *  can't be reached on foot or by GPS drift, so it rescues a short/sparse
   *  trip from BOTH the crow-flies and walking signatures. */
  maxSpeedMph?: number | null;
  /** The client deliberately KEPT this sparse trip flagged low-confidence (a
   *  >=1mi drive whose coords were lost to iOS suspension) rather than dropping
   *  it. Don't re-hide it as a crow-flies phantom — it's real, just uncertain. */
  lowConfidence?: boolean;
  /** Mean fix accuracy in metres, from the client's gpsQuality. In the
   *  thousands means the trip never had a GPS fix at all — every point is a
   *  cell tower, so the distance between them is a guess. */
  avgAccuracyM?: number | null;
}

/**
 * A distance no clock allows: the trip covers real ground in essentially no
 * time. Applies to a zero-duration trip too (a mile and a half stamped at one
 * instant), which is why the duration check is inside rather than an early
 * return on a missing end time.
 */
function looksLikeTeleport(args: PhantomCheckInput): boolean {
  if (args.distanceMiles < TELEPORT_MIN_MILES) return false;
  if (!args.endedAt) return false;
  const startMs = new Date(args.startedAt).getTime();
  const endMs = new Date(args.endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  const durationSec = (endMs - startMs) / 1000;
  if (durationSec < 0) return false;
  if (durationSec === 0) return true;
  return args.distanceMiles / (durationSec / 3600) > TELEPORT_MAX_AVG_MPH;
}

/**
 * Two cell-tower fixes and a straight line drawn between them. Separate from
 * the teleport rule because the two fixes can carry the same timestamp or
 * timestamps minutes apart, in which case the speed says nothing; the
 * accuracy still does.
 */
function looksLikeCellTowerChord(args: PhantomCheckInput): boolean {
  if (args.coordinateCount === undefined || args.coordinateCount >= CROW_FLIES_MIN_COORDS) {
    return false;
  }
  if (args.distanceMiles < CELL_TOWER_MIN_MILES) return false;
  if (typeof args.avgAccuracyM !== "number") return false;
  if (args.avgAccuracyM < CELL_TOWER_ACCURACY_M) return false;
  // A genuine driving speed anywhere on the trip still rescues it: the phone
  // was moving, whatever the position fixes were worth.
  return (args.maxSpeedMph ?? 0) < DRIVING_EVIDENCE_SPEED_MPH;
}

// Plausible-journey reprieve for the crow-flies signature (3 Aug 2026).
//
// The crow-flies rule had no upper bound and no time sanity check, so a REAL
// long drive whose intermediate fixes were lost to iOS suspension was hidden
// exactly like a fake chord. Jenkins, 3 Aug: Liverpool -> Leeds, 58.24 miles
// over 3h10m, 2 coordinates -> flagged phantom -> invisible in his trip list
// AND excluded from his HMRC mileage. Fleet audit the same day: 42 such trips
// across 17 users, 561 miles, 69% of all phantom-flagged mileage.
//
// The distinguishing fact is TIME. A GPS-spike teleport covers its distance
// essentially instantly, so the implied average speed is absurd. A real drive
// that lost its middle takes a driver's amount of time to get there. You also
// cannot GPS-drift a mile, let alone fifty — displacement at a plausible
// driving pace over a meaningful duration IS movement, however few fixes
// survived. Keep those; the sparse route renders poorly but the mileage is
// real and it is the user's tax record.
const REAL_JOURNEY_MIN_MILES = 3;
const REAL_JOURNEY_MIN_DURATION_SEC = 10 * 60;
const REAL_JOURNEY_MIN_AVG_MPH = 5;   // below this it's the walking signature's job
const REAL_JOURNEY_MAX_AVG_MPH = 90;  // above this no car sustained it — teleport
function looksLikeRealJourney(args: PhantomCheckInput): boolean {
  if (args.distanceMiles < REAL_JOURNEY_MIN_MILES) return false;
  if (!args.endedAt) return false;
  const startMs = new Date(args.startedAt).getTime();
  const endMs = new Date(args.endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  const durationSec = (endMs - startMs) / 1000;
  if (durationSec < REAL_JOURNEY_MIN_DURATION_SEC) return false;
  const avgMph = args.distanceMiles / (durationSec / 3600);
  return avgMph >= REAL_JOURNEY_MIN_AVG_MPH && avgMph <= REAL_JOURNEY_MAX_AVG_MPH;
}

export function looksLikePhantomTrip(args: PhantomCheckInput): boolean {
  if (args.isManualEntry) return false;

  // Physics first, ABOVE every reprieve. A trip that covers its distance in
  // no time, or that is two cell-tower fixes with a line between them, is not
  // a drive whatever the client flagged it.
  if (looksLikeTeleport(args)) return true;
  if (looksLikeCellTowerChord(args)) return true;

  // Speed reprieve: if the trip clocked a real driving speed at any point, it's
  // a genuine drive however short or sparse — never a phantom.
  if ((args.maxSpeedMph ?? 0) >= DRIVING_EVIDENCE_SPEED_MPH) return false;

  // Crow-flies check fires regardless of duration/avg-speed. An auto trip
  // with 0/1/2 coords and >=1 mile distance is structurally suspect —
  // UNLESS the device has independent evidence it really moved (dense raw
  // trace or a successful road map-match), in which case the sparseness is a
  // GPS-quality artifact of weak signal, not a fake chord.
  if (
    args.coordinateCount !== undefined &&
    args.coordinateCount < CROW_FLIES_MIN_COORDS &&
    args.distanceMiles >= CROW_FLIES_MIN_DISTANCE_MILES &&
    !args.hasRealMovementEvidence &&
    !args.lowConfidence &&
    !looksLikeRealJourney(args)
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
