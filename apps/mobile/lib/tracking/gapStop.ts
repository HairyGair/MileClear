// When a silence in the fixes means the journey ended.
//
// The first version of this rule (build 85, Class 20) asked one question: did
// the device move less than 250 m across the silence? If yes, it was a stop.
// That assumes the next fix arrives where the driver parked. On a phone that
// slept through the visit it does not: it arrives once they are moving again,
// several hundred metres down the road.
//
// Rachel Thorndyke's 26-27 Aug rounds, every silence in them measured:
//
//   gap    drift   speed before the silence   what it really was
//   859s   501 m   15,11,15,8,3 mph           a visit    <- old rule said "keep going"
//   540s   507 m   27,22,27,15,invalid        a visit    <- old rule said "keep going"
//   281s  1380 m   11,13,6,3,2 mph            a visit    <- old rule said "keep going"
//   467s    38 m   29,34,34,30,27 mph         arriving   <- old rule said "stop", rightly
//
// The drift column separates none of them. The speed column separates all four:
// at a visit the car had already come to rest before the phone went quiet.
// So ask that instead, and keep the drift test as the second answer for the
// case where the speed is unreadable.
//
// Pure module, like journeyBoundary.ts, because detection.ts pulls in the whole
// native tracking stack and the test runner cannot import it.

/** A stop this long is a stop. Matches AUTO_SPLIT_MIN_DWELL_SEC on the server
 *  so the engine and the server-side visit split cannot disagree about what a
 *  visit is. Safe to sit this low ONLY because the rule below also requires the
 *  vehicle to have stopped: four minutes of silence at 30 mph is a tunnel, not
 *  a visit, and is no longer treated as one. */
export const GAP_STOP_MS = 4 * 60 * 1000;

/** Drift bound for the fallback test, unchanged from build 85. */
export const GAP_STOP_DRIFT_M = 250;

/** ~4 mph. Above walking, below any traffic crawl: a car doing less than this
 *  has arrived somewhere. Deliberately NOT the 15 mph drive-DETECTION bar,
 *  which is about starting a recording, not ending one. */
export const STOPPED_SPEED_MS = 1.8;

/** How many fixes before the silence to look at when the newest has no usable
 *  speed of its own. */
const SPEED_FALLBACK_FIXES = 5;

export interface RecentFix {
  lat: number;
  lng: number;
  /** m/s as the engine stored it. RNBG writes -1 for "no reading"; older rows
   *  can be null. */
  speed: number | null;
  atMs: number;
}

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function usableSpeed(fix: RecentFix | undefined): number | null {
  if (!fix) return null;
  if (fix.speed == null || !Number.isFinite(fix.speed) || fix.speed < 0) return null;
  return fix.speed;
}

/**
 * Had the vehicle already come to rest when the fixes stopped arriving?
 *
 * `recent` is newest-first; recent[0] is the last fix before the silence.
 * Returns null when there is nothing to judge on, so the caller can fall back
 * to the drift test rather than guessing.
 */
export function wasStoppedBeforeSilence(recent: RecentFix[]): boolean | null {
  if (recent.length === 0) return null;

  const own = usableSpeed(recent[0]);
  if (own !== null) return own < STOPPED_SPEED_MS;

  // No reading on the last fix. Ask the run it belongs to: how fast was the
  // vehicle actually covering ground over the fixes leading into the silence?
  const window = recent.slice(0, SPEED_FALLBACK_FIXES);
  const oldest = window[window.length - 1];
  if (window.length < 2 || oldest.atMs >= recent[0].atMs) return null;
  const seconds = (recent[0].atMs - oldest.atMs) / 1000;
  const metres = metersBetween(oldest.lat, oldest.lng, recent[0].lat, recent[0].lng);
  return metres / seconds < STOPPED_SPEED_MS;
}

export type GapStopReason =
  | "stopped_before_silence"
  | "no_drift_across_silence"
  | "still_driving";

export interface GapStopDecision {
  finalize: boolean;
  reason: GapStopReason;
  /** True when the speed had to be inferred from displacement. */
  inferred: boolean;
}

/**
 * Decide what a silence longer than GAP_STOP_MS meant.
 *
 * `driftM` is the distance from the last fix before the silence to the first
 * fix after it.
 */
export function gapStopDecision(args: {
  driftM: number;
  recent: RecentFix[];
}): GapStopDecision {
  const stopped = wasStoppedBeforeSilence(args.recent);
  const inferred = args.recent.length > 0 && usableSpeed(args.recent[0]) === null;
  if (stopped === true) {
    return { finalize: true, reason: "stopped_before_silence", inferred };
  }
  // Either the car was moving when the phone went quiet, or we cannot tell.
  // Either way, a next fix within touching distance of the last one means it
  // went nowhere in between, which is still a stop.
  if (args.driftM < GAP_STOP_DRIFT_M) {
    return { finalize: true, reason: "no_drift_across_silence", inferred };
  }
  return { finalize: false, reason: "still_driving", inferred };
}

/**
 * Does this fix count as the vehicle still being on a journey?
 *
 * Used to stamp the idle timer that ends a recording. Before 27 Aug 2026 the
 * native engine stamped that timer on EVERY buffered fix, parked ones included,
 * so its ten-minute stop timeout could never expire and the watchdog and
 * background-fetch finalizers that depend on it never fired. A driver who
 * parked and walked about kept one recording open for the rest of the round.
 *
 * `previous` is the last buffered fix, used when the incoming one has no speed
 * reading of its own. With neither, the answer is yes: a missing reading must
 * never end a live drive.
 */
export function isJourneyStillMoving(
  fix: { lat: number; lng: number; speed: number | null; atMs: number },
  previous?: RecentFix
): boolean {
  const own = usableSpeed(fix);
  if (own !== null) return own >= STOPPED_SPEED_MS;
  if (!previous) return true;
  const seconds = (fix.atMs - previous.atMs) / 1000;
  if (!(seconds > 0)) return true;
  const metres = metersBetween(previous.lat, previous.lng, fix.lat, fix.lng);
  return metres / seconds >= STOPPED_SPEED_MS;
}
