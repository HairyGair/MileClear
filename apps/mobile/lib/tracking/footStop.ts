// Foot-stop (23 Sep 2026). A recording closes when the phone stops moving, and
// walking is moving: Anthony drove to golf, parked at 10:21, and the drive
// stayed open for the whole round. The Live Activity counted "driving" for
// three hours and the trip only saved when he drove home. The engine's own
// stop detection (stopTimeout) and both backstops (heartbeat staleness,
// gap-stop) wait for stillness or silence, and a walking phone gives neither.
//
// The motion coprocessor labels every fix. Five minutes of the phone being
// carried on foot, with no in-vehicle reading and nothing at driving speed in
// that window, means the driver has parked and walked away: the same length
// of stop the engine already uses (stopTimeout: 5) to split a trip.
//
// Android never reports an activity (motion permissions are blocked for Play),
// so this never fires there. Pure so it can be tested without the engine.

export const FOOT_STOP_MS = 5 * 60 * 1000;
export const FOOT_STOP_MIN_ON_FOOT_FIXES = 5;
export const FOOT_STOP_MIN_CONFIDENCE = 50;
/** Any fix faster than this (m/s, about 9 mph) in the window is not someone
 *  on foot, whatever the label says, and vetoes the stop. */
export const FOOT_STOP_MAX_SPEED_MS = 4;

const ON_FOOT: ReadonlySet<string> = new Set(["walking", "on_foot", "running"]);
const IN_VEHICLE: ReadonlySet<string> = new Set(["in_vehicle", "automotive", "on_bicycle"]);

export interface ActivityFix {
  atMs: number;
  /** m/s; RNBG writes -1 for "no reading". */
  speed: number | null;
  activity: string | null;
  confidence: number | null;
}

export interface FootStopDecision {
  finalize: boolean;
  /** Earliest fix of the on-foot stretch: everything from here on is the walk,
   *  not the drive, and is removed before the trip is closed. */
  walkStartedAtMs: number | null;
  onFootMs: number;
  onFootFixes: number;
}

/**
 * Walk back from the newest fix while the phone reads on foot (or still, which
 * neither counts nor breaks the stretch: standing on a tee). An in-vehicle
 * reading or a fix at driving speed ends the stretch.
 */
export function footStopDecision(fixesNewestFirst: ActivityFix[]): FootStopDecision {
  let onFootFixes = 0;
  let earliestOnFoot: number | null = null;
  const newest = fixesNewestFirst[0]?.atMs ?? null;

  for (const f of fixesNewestFirst) {
    if (f.speed != null && f.speed > FOOT_STOP_MAX_SPEED_MS) break;
    const kind = f.activity ?? "";
    if (IN_VEHICLE.has(kind)) break;
    if (ON_FOOT.has(kind) && (f.confidence ?? 0) >= FOOT_STOP_MIN_CONFIDENCE) {
      onFootFixes++;
      earliestOnFoot = f.atMs;
    }
  }

  const onFootMs = newest != null && earliestOnFoot != null ? newest - earliestOnFoot : 0;
  const finalize = onFootFixes >= FOOT_STOP_MIN_ON_FOOT_FIXES && onFootMs >= FOOT_STOP_MS;
  return { finalize, walkStartedAtMs: finalize ? earliestOnFoot : null, onFootMs, onFootFixes };
}
