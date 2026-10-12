// Is part of a recording a flight? The pure rule. No React Native, no SQLite.
//
// 12 Oct 2026: an Android driver flew Edinburgh to Toronto with automatic
// trips on. The phone recorded the flight as one 6.9-hour "drive" (4,667
// fixes), worked out a distance over 2,000 miles, and the server refused the
// save (a trip over 2,000 miles is "Distance exceeds reasonable limit").
// finalize then threw and left the fixes in place, so it tried again about
// once a minute until the driver had landed and driven on in Toronto.
//
// A flight is not a drive and must never become a trip. But a recording often
// holds more than the flight: the drive to the airport before it, the drive
// from the airport after it. So this does not judge the whole recording. It
// finds the airborne stretch and says where it starts and ends, so finalize
// can cut it out and carry on with the car legs either side.
//
// What counts as airborne, and why it cannot be a drive:
//
//  * Speed over a window of at least FLIGHT_SMOOTH_SEC (30 s) of at least
//    FLIGHT_STEP_MPH, 200 mph: the chord from the latest fix that is at least
//    30 s older, over the elapsed time (consecutive fixes, when they are
//    already further apart than that). No car goes there; the fastest UK and
//    Eurostar trains top out near 186 mph. Jets cruise at 450 mph and up.
//    Why a window: consecutive fixes one second apart with +-15 m of jitter
//    swing a steady 186 mph between roughly 120 and 250 mph, so a two-hour
//    high-speed train run WAS cut as a flight in a reviewer's probe (12 Oct
//    2026). Over 30 s the same jitter moves the figure by about 1%.
//  * Sustained, not a blip: those fast steps add up to FLIGHT_MIN_FAST_SEC,
//    ten minutes. A GPS glitch is a handful of seconds. A plane's sparse
//    trace (a fix at the gate, then nothing until the other end, hours later)
//    is one long step, so one step of ten minutes or more counts too.
//  * It went somewhere: the net displacement from the start of the fast
//    stretch to its end is FLIGHT_MIN_MILES (60) or more, and the average
//    over the whole stretch, gaps included, is still FLIGHT_MIN_AVG_MPH.
//  * It did not come back: a one-fix teleport (a Wi-Fi or cell-tower position
//    in the wrong city) jumps out and jumps back. If the fixes just before or
//    just after the stretch sit near the other end of it, the stretch is a
//    glitch, not a journey.
//
// Fixes either side of the core that are still above FLIGHT_SHOULDER_MPH
// (take-off roll, climb-out, final approach) are cut with it; the fix at each
// boundary is kept, so the car legs end and begin where the phone really was
// on the ground.
//
// Conservative on purpose. Anything this misses falls through to the old
// guards, so a missed flight costs nothing new; a false positive would throw
// away a real drive. Every number was picked to sit well clear of any road
// vehicle, and a drive cannot reach any of them.

export interface FlightFix {
  lat: number;
  lng: number;
  /** ISO timestamp. */
  recorded_at: string;
}

/** Faster than this between two fixes is not a car, or a UK/Eurostar train. */
export const FLIGHT_STEP_MPH = 200;
/** Speed is judged over at least this long, so GPS jitter cannot fake it. */
export const FLIGHT_SMOOTH_SEC = 30;
/** The fast steps must add up to this long: a glitch is seconds, not minutes. */
export const FLIGHT_MIN_FAST_SEC = 10 * 60;
/** The stretch must have gone at least this far, start to end. */
export const FLIGHT_MIN_MILES = 60;
/** ...and averaged at least this over the whole stretch, gaps included. */
export const FLIGHT_MIN_AVG_MPH = 150;
/** Fast stretches this close together in time are one flight. */
export const FLIGHT_MERGE_GAP_MS = 15 * 60 * 1000;
/** Take-off roll, climb-out and approach: cut while steps are above this. */
export const FLIGHT_SHOULDER_MPH = 100;
/** How far either side of a stretch to look for a "came straight back". */
const RETURN_LOOK_FIXES = 3;
const RETURN_LOOK_MS = 15 * 60 * 1000;
/** Back within this of where it left (or the greater of this and 10%): glitch. */
const RETURN_NEAR_MILES = 5;

export interface FlightSpan {
  /** Index of the last fix BEFORE the flight (kept: the car leg ends here). */
  startIdx: number;
  /** Index of the first fix AFTER the flight (kept: the next leg starts here). */
  endIdx: number;
  /** Fixes strictly between the two: the airborne ones, to be cut. */
  removedCount: number;
  /** "dense" when the plane gave a trace, "sparse" when it gave a jump. */
  kind: "dense" | "sparse";
  /** Straight-line miles from startIdx to endIdx. */
  miles: number;
  /** Seconds between the two boundary fixes. */
  spanSec: number;
  /** Seconds spent in steps at or above FLIGHT_STEP_MPH. */
  fastSec: number;
  /** Fastest single step, mph. */
  peakMph: number;
}

const R_MILES = 3958.8;

function miles(a: FlightFix, b: FlightFix): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface Group {
  s: number; // index of the fix the first fast step leaves
  e: number; // index of the fix the last fast step arrives at
  fastSec: number;
  peakMph: number;
}

/**
 * Find the flights in a time-ordered run of fixes. Returns spans in order,
 * not overlapping. An empty array means "no flight here", which is nearly
 * always the answer.
 */
export function findFlights(fixes: ReadonlyArray<FlightFix>): FlightSpan[] {
  const n = fixes.length;
  if (n < 2) return [];
  const t: number[] = new Array(n);
  const ok: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    t[i] = Date.parse(fixes[i].recorded_at);
    ok[i] = Number.isFinite(t[i]) && Number.isFinite(fixes[i].lat) && Number.isFinite(fixes[i].lng);
  }

  // Speed of the step arriving at each fix. -1 where it cannot be judged
  // (a bad fix, or no time passed between the two).
  // Measured over the nearest earlier fix that is at least FLIGHT_SMOOTH_SEC
  // older (see the header), so `from[i]` is where the window for fix i starts.
  const stepMph: number[] = new Array(n).fill(-1);
  const from: number[] = new Array(n).fill(0);
  // Consecutive-fix speed, used ONLY to widen a confirmed flight over its
  // take-off roll and approach (the window lags a fast-accelerating plane).
  const rawMph: number[] = new Array(n).fill(-1);
  for (let i = 1; i < n; i++) {
    if (ok[i] && ok[i - 1] && t[i] > t[i - 1]) {
      rawMph[i] = miles(fixes[i - 1], fixes[i]) / ((t[i] - t[i - 1]) / 3600000);
    }
  }
  for (let i = 1; i < n; i++) {
    if (!ok[i]) continue;
    let j = i - 1;
    // Step back over bad fixes and fixes too close in time to judge.
    while (j >= 0 && (!ok[j] || (t[i] - t[j]) / 1000 < FLIGHT_SMOOTH_SEC)) j--;
    if (j < 0) continue;
    const dtSec = (t[i] - t[j]) / 1000;
    from[i] = j;
    stepMph[i] = miles(fixes[j], fixes[i]) / (dtSec / 3600);
  }

  // Group the fast steps. Two fast stretches within FLIGHT_MERGE_GAP_MS of
  // each other are one flight (a bad fix in mid-air must not split it); a
  // teleport out and back merges into one group too, and then nets to nothing.
  const groups: Group[] = [];
  for (let i = 1; i < n; i++) {
    if (stepMph[i] < FLIGHT_STEP_MPH) continue;
    // Time newly covered by this fast reading: from the previous fix (the
    // windows overlap, so counting the whole window would count it many times).
    const dtSec = Math.max(0, (t[i] - t[i - 1]) / 1000);
    const last = groups[groups.length - 1];
    if (last && t[from[i]] - t[last.e] <= FLIGHT_MERGE_GAP_MS) {
      last.e = i;
      last.fastSec += dtSec;
      last.peakMph = Math.max(last.peakMph, stepMph[i]);
    } else {
      groups.push({ s: from[i], e: i, fastSec: dtSec, peakMph: stepMph[i] });
    }
  }

  const spans: FlightSpan[] = [];
  for (const g of groups) {
    if (g.fastSec < FLIGHT_MIN_FAST_SEC) continue;
    const spanSec = (t[g.e] - t[g.s]) / 1000;
    if (!(spanSec > 0)) continue;
    const coreMiles = miles(fixes[g.s], fixes[g.e]);
    if (coreMiles < FLIGHT_MIN_MILES) continue;
    if (coreMiles / (spanSec / 3600) < FLIGHT_MIN_AVG_MPH) continue;

    // Did it come straight back? Out and back is a glitch, not a journey.
    const near = Math.max(RETURN_NEAR_MILES, coreMiles * 0.1);
    let cameBack = false;
    for (let k = g.e + 1; k <= Math.min(n - 1, g.e + RETURN_LOOK_FIXES); k++) {
      if (!ok[k] || t[k] - t[g.e] > RETURN_LOOK_MS) break;
      if (miles(fixes[k], fixes[g.s]) <= near) cameBack = true;
    }
    for (let k = g.s - 1; k >= Math.max(0, g.s - RETURN_LOOK_FIXES); k--) {
      if (!ok[k] || t[g.s] - t[k] > RETURN_LOOK_MS) break;
      if (miles(fixes[k], fixes[g.e]) <= near) cameBack = true;
    }
    if (cameBack) continue;

    // Widen over the shoulders: take-off roll, climb, approach, roll-out.
    const floor = spans.length > 0 ? spans[spans.length - 1].endIdx : 0;
    let s = g.s;
    while (s > floor && rawMph[s] >= FLIGHT_SHOULDER_MPH) s--;
    let e = g.e;
    while (e < n - 1 && rawMph[e + 1] >= FLIGHT_SHOULDER_MPH) e++;
    // A second flight whose start fix is the last one's end is allowed: a
    // connection with no ground fixes between, still two flights.
    spans.push({
      startIdx: s,
      endIdx: e,
      removedCount: e - s - 1,
      kind: g.e - g.s === 1 ? "sparse" : "dense",
      miles: Math.round(miles(fixes[s], fixes[e]) * 10) / 10,
      spanSec: Math.round((t[e] - t[s]) / 1000),
      fastSec: Math.round(g.fastSec),
      peakMph: Math.round(g.peakMph),
    });
  }
  return spans;
}

/**
 * Cut the airborne fixes out. Returns what is left, in order, and the indexes
 * (into the returned array) where a new leg begins: the first fix after each
 * flight. The caller must start a new leg there even when the gap is short,
 * or the car legs either side would be joined by a straight line.
 */
export function cutFlights<T extends FlightFix>(
  fixes: ReadonlyArray<T>,
  spans: ReadonlyArray<FlightSpan>
): { kept: T[]; legStarts: number[] } {
  if (spans.length === 0) return { kept: fixes.slice(), legStarts: [] };
  const kept: T[] = [];
  const legStarts: number[] = [];
  let cursor = 0;
  for (const span of spans) {
    for (let i = cursor; i <= span.startIdx; i++) kept.push(fixes[i]);
    legStarts.push(kept.length);
    cursor = span.endIdx;
  }
  for (let i = cursor; i < fixes.length; i++) kept.push(fixes[i]);
  return { kept, legStarts };
}
