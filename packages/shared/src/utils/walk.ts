// Walk detection (13 Sep 2026).
//
// The app records walks as drives. Anthony hit it himself walking the dog;
// Rachel Thorndyke spent 12 Sep walking a farmyard and field and produced four
// "trips". The standing answer has been for the driver to go through their
// mileage each day cancelling and deleting them, which is not an answer.
//
// WHY THE EXISTING GUARDS MISS IT
//
// The walking signature in phantomTrip.ts wants distance < 1 mile AND duration
// > 5 min AND average speed < 5 mph. A 2-mile dog walk clears the distance cap
// and is never even considered. The cap cannot simply be raised: a fleet
// dry-run over 45 days found 7,377 trips averaging under 8 mph, and the
// biggest were a 167-mile run over 25 hours and a 144-mile run that peaked at
// 72 mph. Those are real drives whose end time was never written, so average
// speed is measuring a broken clock, not a walking pace. Widening on average
// speed would de-count long genuine journeys.
//
// The obvious alternative, peak speed, is worse. Among trips whose reported
// peak never reached 12 mph are a 263-mile Carlisle-to-London run and a
// 183-mile trip carrying 2,269 coordinates. `maxSpeedMph` comes from the
// device speed field, which is absent or zero on a large slice of genuinely
// fast drives. Keying a drop on it would have hidden 1,578 trips and 5,156
// miles across 323 users.
//
// WHAT THIS MODULE USES INSTEAD
//
// 1. The motion coprocessor's own classification, which the background
//    geolocation engine already attaches to every fix (still / walking /
//    on_foot / running / on_bicycle / in_vehicle, with a confidence). We were
//    receiving it and throwing it away. It is ground truth about what the body
//    carrying the phone was doing, and it is independent of GPS entirely.
// 2. A SUSTAINED speed computed from the trace geometry rather than read from
//    the device speed field. Geometry is available whenever there are fixes
//    and timestamps, which is exactly the case where the device field is
//    missing.
// 3. Step count, where the platform can produce it, as corroboration.
//
// PLATFORM REALITY. iOS has all three. Android has none of the motion signals:
// the engine sets `disableMotionActivityUpdates` there because the
// ACTIVITY_RECOGNITION permission is blocked (Play treats it as a health
// feature needing a declaration this app cannot truthfully make), and
// expo-sensors throws NotSupportedException for a historical step query. So on
// Android the verdict falls back to geometry alone and will usually be
// "unknown", which is the safe answer: unknown changes nothing.
//
// THE ONE RULE THAT MATTERS: a walk verdict requires POSITIVE evidence of
// being on foot. Absence of driving evidence is never enough. Getting this
// backwards deletes somebody's tax record.

import { DRIVING_EVIDENCE_SPEED_MPH, haversineDistance } from "./index.js";

/** The motion classifications the native engine can report per fix. */
export type MotionActivityKind =
  | "unknown"
  | "still"
  | "walking"
  | "on_foot"
  | "running"
  | "on_bicycle"
  | "in_vehicle";

/** A buffered fix carrying whatever the motion coprocessor said at the time. */
export interface MotionFix {
  activity?: string | null;
  activity_confidence?: number | null;
}

/** A buffered fix with position and time, for the geometry pass. */
export interface TraceFix {
  lat: number;
  lng: number;
  recorded_at?: string;
}

/** Below this reported confidence the classification is a guess, not evidence.
 *  CoreMotion emits low-confidence guesses constantly while a phone sits on a
 *  passenger seat; counting them would make every drive look ambiguous. */
export const MOTION_MIN_CONFIDENCE = 50;

/** Fewer confident fixes than this and the sample is too thin to conclude
 *  anything from proportions. */
export const WALK_MIN_MOTION_FIXES = 5;

/** Share of confident fixes that must be on foot before a trip is a walk. */
export const WALK_MIN_ON_FOOT_PCT = 0.6;

/** Any meaningful share of in-vehicle fixes means a mixed trace (walk to the
 *  car, then drive). Those must stay trips: the drive part is real mileage. */
export const WALK_MAX_IN_VEHICLE_PCT = 0.2;

/** Share of confident fixes that makes a trip definitively a drive. */
export const DRIVE_MIN_IN_VEHICLE_PCT = 0.5;

/** No walk or run sustains this over a 45-second window. Deliberately well
 *  above running pace (a 5-minute mile is 12 mph) so a runner is never called
 *  a driver, and well below DRIVING_EVIDENCE_SPEED_MPH so the two tests do not
 *  overlap. */
export const WALK_MAX_SUSTAINED_MPH = 12;

/**
 * Walking pace held for the whole recording, on a trace dense enough to be
 * sure of it. This is the third kind of positive evidence, added 15 Sep 2026
 * after Anthony's round of golf was saved as a 1.9-mile drive: the motion
 * coprocessor called 76% of the fixes "in vehicle" (the phone was on a
 * trolley, which smooths out the walking motion), the pedometer counted too
 * few steps for a cadence verdict, and so the only proof left was the pace
 * itself. Forty minutes at a sustained 3 mph is not a car.
 *
 * Why this is safe where average and peak speed were not (see the header):
 * the sustained figure comes from the trace geometry with its own
 * timestamps, so a trip whose end time was never written still shows its
 * real driving windows, and a device speed field of zero does not matter.
 * A genuine crawl in a jam does not qualify either, because a recording
 * that contains any real driving has 45-second windows above running pace.
 * Fleet dry run over 14 days and 20,396 saved trips: 7 would have been
 * called walks, all 1.0-1.5 miles at under 4 mph. A recording that is
 * nothing but ten minutes of gridlock could be dropped; it is under a
 * mile and the drive either side of it is unaffected.
 */
export const WALK_PACE_MAX_SUSTAINED_MPH = 5;

/** No 45-second window (at the 95th percentile, so a single GPS jump does
 *  not veto) may exceed running pace. */
export const WALK_PACE_MAX_WINDOW_MPH = 12;

/** A pace verdict needs a long recording on a dense trace. */
export const WALK_PACE_MIN_DURATION_SEC = 600;
export const WALK_PACE_MIN_FIXES = 20;

/** Steps per minute that means the phone was being carried on foot. A walking
 *  cadence is 100-120; 50 is a generous floor that tolerates a phone in a bag
 *  and a pedometer that missed part of the window. */
export const WALK_MIN_STEPS_PER_MIN = 50;

/** A step-rate verdict needs a window long enough for the rate to mean
 *  something. Two minutes. */
export const WALK_MIN_STEPS_DURATION_SEC = 120;

/** Average speed (distance over elapsed time) at or above which a recording
 *  is never called a walk. The average was set aside as a walk signal because
 *  a broken end time drags it DOWN; nothing drags it UP, and nobody on foot
 *  averages 12 mph. Needed because the sustained speed is null on a sparse
 *  trace, and then a motion "on foot" reading used to win: 7.6 mi in 22 min
 *  and 1.9 mi in 2.5 min were both dropped as walks (23 Sep 2026). */
export const WALK_MAX_AVERAGE_MPH = 12;
/** Shortest recording the average-speed guard trusts; a few seconds of GPS
 *  jitter can fake a high average. */
export const WALK_AVERAGE_MIN_DURATION_SEC = 60;

/** Window over which speed must be held to count as sustained. Long enough to
 *  survive a single bad fix, short enough that a genuine short hop still
 *  produces one. */
export const SUSTAINED_SPEED_WINDOW_SEC = 45;

/** Which percentile of the window speeds to report. The top window would be
 *  one GPS artefact away from nonsense; the 90th is the fastest the trip
 *  really sustained. */
export const SUSTAINED_SPEED_PERCENTILE = 0.9;

/** Windows implying more than this are GPS artefacts (a suspension gap closed
 *  by a distant fix), not evidence of speed. filterTraceOutliers already drops
 *  ~120 mph jumps; this is the belt to that braces. */
const SUSTAINED_SPEED_MAX_PLAUSIBLE_MPH = 100;

const ON_FOOT: ReadonlySet<string> = new Set(["walking", "on_foot", "running"]);

/** What the motion coprocessor said across a whole trip. */
export interface MotionSummary {
  /** Fixes carrying a classification at or above MOTION_MIN_CONFIDENCE. */
  fixes: number;
  onFoot: number;
  inVehicle: number;
  still: number;
  /** 0-1, or null when there were too few confident fixes to divide by. */
  pctOnFoot: number | null;
  pctInVehicle: number | null;
}

/**
 * Count what the motion coprocessor reported across the trip's fixes.
 *
 * `still` is counted but never used to decide anything: a phone on a passenger
 * seat at a red light reports still, and so does a phone in a pocket at a bus
 * stop. It is recorded only so the stored evidence explains itself later.
 */
export function summariseMotion(coords: readonly MotionFix[]): MotionSummary {
  let fixes = 0;
  let onFoot = 0;
  let inVehicle = 0;
  let still = 0;

  for (const c of coords) {
    const kind = typeof c.activity === "string" ? c.activity : null;
    if (!kind || kind === "unknown") continue;
    const conf = typeof c.activity_confidence === "number" ? c.activity_confidence : null;
    if (conf !== null && conf < MOTION_MIN_CONFIDENCE) continue;
    fixes++;
    if (ON_FOOT.has(kind)) onFoot++;
    else if (kind === "in_vehicle") inVehicle++;
    else if (kind === "still") still++;
  }

  const divisible = fixes >= WALK_MIN_MOTION_FIXES;
  return {
    fixes,
    onFoot,
    inVehicle,
    still,
    pctOnFoot: divisible ? onFoot / fixes : null,
    pctInVehicle: divisible ? inVehicle / fixes : null,
  };
}

/**
 * The fastest speed the trip actually held for SUSTAINED_SPEED_WINDOW_SEC,
 * computed from the trace rather than read from the device.
 *
 * This exists because the device speed field cannot be trusted: the fleet
 * carries 100-mile-plus motorway drives whose recorded peak speed is 0. A
 * trace with positions and timestamps always knows how fast it moved.
 *
 * Returns null when the trace cannot support a single full window (too few
 * fixes, no timestamps, or a trip shorter than the window). Null means "no
 * opinion" and every caller must treat it as such.
 */
export function computeSustainedSpeedMph(
  coords: readonly TraceFix[],
  opts: { windowSec?: number; percentile?: number } = {}
): number | null {
  const windowSec = opts.windowSec ?? SUSTAINED_SPEED_WINDOW_SEC;
  const percentile = opts.percentile ?? SUSTAINED_SPEED_PERCENTILE;
  if (coords.length < 2) return null;

  // Cumulative miles and seconds, skipping anything without a usable time.
  const t: number[] = [];
  const d: number[] = [];
  let miles = 0;
  for (let i = 0; i < coords.length; i++) {
    const raw = coords[i].recorded_at;
    if (!raw) return null;
    const ms = new Date(raw).getTime();
    if (!Number.isFinite(ms)) return null;
    if (i > 0) {
      miles += haversineDistance(
        coords[i - 1].lat, coords[i - 1].lng,
        coords[i].lat, coords[i].lng
      );
    }
    t.push(ms / 1000);
    d.push(miles);
  }

  const speeds: number[] = [];
  let j = 0;
  for (let i = 0; i < t.length; i++) {
    if (j < i) j = i;
    while (j < t.length && t[j] - t[i] < windowSec) j++;
    if (j >= t.length) break;
    const dt = t[j] - t[i];
    if (dt <= 0) continue;
    const mph = (d[j] - d[i]) / (dt / 3600);
    if (mph >= 0 && mph <= SUSTAINED_SPEED_MAX_PLAUSIBLE_MPH) speeds.push(mph);
  }

  if (speeds.length === 0) return null;
  speeds.sort((a, b) => a - b);
  const idx = Math.min(speeds.length - 1, Math.floor(percentile * (speeds.length - 1)));
  return Math.round(speeds[idx] * 10) / 10;
}

export type WalkVerdict = "walk" | "drive" | "unknown";

export interface WalkDecisionInput {
  distanceMiles: number;
  durationSec: number;
  /** From computeSustainedSpeedMph. Null means no opinion. */
  sustainedSpeedMph: number | null;
  /** The 95th-percentile 45-second window speed, from
   *  computeSustainedSpeedMph with percentile 0.95. Null means no opinion. */
  sustainedSpeedP95Mph?: number | null;
  /** The device's own reported peak, if it reported one at all. Never used
   *  to call a drive a walk; only ever to refuse the walk-pace verdict. */
  deviceMaxSpeedMph?: number | null;
  /** Fixes in the trace the speeds were computed from. */
  fixes?: number | null;
  /** From summariseMotion. Absent on Android and on JS-engine traces. */
  motion?: MotionSummary | null;
  /** Steps counted over the trip window, where the platform can report them. */
  steps?: number | null;
}

export interface WalkDecision {
  verdict: WalkVerdict;
  /** Machine-readable why, logged with the decision so the rule is auditable
   *  against real trips later. */
  reason: string;
}

/**
 * Decide whether a recorded journey was a walk.
 *
 * Deliberately three-valued. "unknown" is the common answer and means "change
 * nothing", which is why Android losing every motion signal is safe rather
 * than harmful. Only "walk" suppresses a trip, and only positive on-foot
 * evidence can produce it.
 *
 * Driving evidence is checked first and wins outright, so a mixed trace (walk
 * to the car, then drive) stays a trip: the driving part is real mileage and
 * must never be thrown away to tidy up the walking part.
 */
export function decideWalk(input: WalkDecisionInput): WalkDecision {
  const { sustainedSpeedMph, sustainedSpeedP95Mph, deviceMaxSpeedMph, fixes, motion, steps, durationSec } = input;

  // Driving evidence, strongest first.
  if (sustainedSpeedMph !== null && sustainedSpeedMph >= DRIVING_EVIDENCE_SPEED_MPH) {
    return { verdict: "drive", reason: "sustained_driving_speed" };
  }

  // Too fast on average to have been on foot. Not proof of driving (a GPS
  // jump can inflate distance), so it only ever blocks the two walk
  // verdicts below; every other check answers as it always did.
  const tooFastOnAverage =
    durationSec >= WALK_AVERAGE_MIN_DURATION_SEC &&
    input.distanceMiles / (durationSec / 3600) >= WALK_MAX_AVERAGE_MPH;

  // Positive evidence #3, checked before the coprocessor's in-vehicle call
  // because that call is exactly what a phone on a golf trolley gets wrong.
  // Every condition must hold; any missing input refuses the verdict.
  if (
    !tooFastOnAverage &&
    sustainedSpeedMph !== null &&
    sustainedSpeedMph <= WALK_PACE_MAX_SUSTAINED_MPH &&
    typeof sustainedSpeedP95Mph === "number" &&
    sustainedSpeedP95Mph < WALK_PACE_MAX_WINDOW_MPH &&
    (deviceMaxSpeedMph == null || deviceMaxSpeedMph < WALK_PACE_MAX_WINDOW_MPH) &&
    typeof fixes === "number" &&
    fixes >= WALK_PACE_MIN_FIXES &&
    durationSec >= WALK_PACE_MIN_DURATION_SEC
  ) {
    return { verdict: "walk", reason: "walk_pace" };
  }

  if (
    motion &&
    motion.pctInVehicle !== null &&
    motion.pctInVehicle >= DRIVE_MIN_IN_VEHICLE_PCT
  ) {
    return { verdict: "drive", reason: "motion_in_vehicle" };
  }

  // Anything still moving faster than a runner is not a walk, but without
  // driving evidence it is not provably a drive either. Say so.
  if (sustainedSpeedMph !== null && sustainedSpeedMph >= WALK_MAX_SUSTAINED_MPH) {
    return { verdict: "unknown", reason: "too_fast_for_walk" };
  }

  if (tooFastOnAverage) {
    return { verdict: "unknown", reason: "too_fast_on_average" };
  }

  const mixed =
    motion && motion.pctInVehicle !== null && motion.pctInVehicle > WALK_MAX_IN_VEHICLE_PCT;

  // Positive evidence #1: the motion coprocessor says on foot.
  if (
    motion &&
    !mixed &&
    motion.pctOnFoot !== null &&
    motion.pctOnFoot >= WALK_MIN_ON_FOOT_PCT
  ) {
    return { verdict: "walk", reason: "motion_on_foot" };
  }

  // Positive evidence #2: a walking step cadence across the trip window.
  if (
    !mixed &&
    typeof steps === "number" &&
    steps > 0 &&
    durationSec >= WALK_MIN_STEPS_DURATION_SEC
  ) {
    const perMin = steps / (durationSec / 60);
    if (perMin >= WALK_MIN_STEPS_PER_MIN) {
      return { verdict: "walk", reason: "step_cadence" };
    }
  }

  return { verdict: "unknown", reason: "no_motion_evidence" };
}
