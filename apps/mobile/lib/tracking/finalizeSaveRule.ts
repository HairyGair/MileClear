// What finalize may send to the server, and what to do when the server says
// no: the pure part. No React Native, no SQLite, so it runs under vitest.
//
// 12 Oct 2026 (Edinburgh to Toronto): a 2,000-mile flight was refused with
// 400 "Distance exceeds reasonable limit" and retried every minute. The first
// fix (517a7735) cleared the buffer on ANY 4xx. A reviewer pointed out that
// real drives get 400s too, and clearing the buffer would delete them:
//
//   * more than 20,000 coordinates (a very long or very dense recording),
//   * a timestamp more than 24 h in the future (the phone's clock is ahead),
//   * a platform tag or classification the server does not know (app ahead of
//     server),
//   * one fix whose recorded_at cannot be parsed.
//
// So the rule is now: only the one verdict that is known garbage (a distance
// over the server's cap) consumes the buffer, and it is checked BEFORE the
// request as well. Every other refusal hands the drive to the sync queue
// (a local trip row plus a queued create) and clears the live buffer, so the
// drive is kept for a retry (app update, clock fix, "Try again") and the next
// drive is not held up behind it. A first design kept the drive in the live
// buffer with a wait; the next recording-open wiped it (nativeLocation clears
// the buffer when a new recording opens), so it lives in the queue instead.

import { filterTraceOutliers } from "@mileclear/shared";

/** The server's cap on one trip's distance (apps/api trips createTripSchema). */
export const SERVER_MAX_DISTANCE_MILES = 2000;
/** The server's cap on coordinates per create / merge request. */
export const SERVER_MAX_COORDINATES = 20000;
/** What we cut down to, comfortably under the cap. */
export const COORDINATE_TARGET = 19500;

/** Over the server's cap: known garbage (a flight the flight rule missed). */
export function exceedsServerDistance(miles: number): boolean {
  return Number.isFinite(miles) && miles > SERVER_MAX_DISTANCE_MILES;
}

// ── Coordinates for the wire ──────────────────────────────────────────────

export interface WireFix {
  lat: number;
  lng: number;
  recorded_at: string;
}

const ISO_START = /^\d{4}-\d{2}-\d{2}T/;

/** A recorded_at as an ISO string the server will parse, or null when it
 *  cannot be. ISO strings pass through untouched (so the stored started_at
 *  still matches what finalize dedups on); a raw native epoch (seconds or
 *  milliseconds, see nativeLocation.ts recordedAtMs) is converted. */
export function normaliseRecordedAt(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const str = String(v).trim();
  if (/^\d{9,13}(\.\d+)?$/.test(str)) {
    const n = Number(str);
    const d = new Date(n > 1e12 ? n : n * 1000);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const ms = Date.parse(str);
  if (!Number.isFinite(ms)) return null;
  return ISO_START.test(str) ? str : new Date(ms).toISOString();
}

const R_METRES = 6371008.8;
const METRES_PER_MILE = 1609.344;
function metres(a: WireFix, b: WireFix): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Keep the first and last fix, and any fix at least `minMetres` from the one
 *  kept before it. Distance thinning keeps the shape and drops dwell clusters. */
function thin<T extends WireFix>(fixes: ReadonlyArray<T>, minMetres: number): T[] {
  const out: T[] = [fixes[0]];
  const lastIdx = fixes.length - 1;
  for (let i = 1; i < lastIdx; i++) {
    if (metres(out[out.length - 1], fixes[i]) >= minMetres) out.push(fixes[i]);
  }
  out.push(fixes[lastIdx]);
  return out;
}

/** At most `max` fixes, first and last always kept. Thins by distance first
 *  (5 m, doubling) so the route keeps its turns; if that cannot get there
 *  (fixes all far apart) it falls back to every Nth fix plus the endpoints.
 *  A recording already under the cap comes back unchanged. */
export function downsampleCoordinates<T extends WireFix>(
  fixes: ReadonlyArray<T>,
  max: number = COORDINATE_TARGET
): T[] {
  if (fixes.length <= max) return fixes.slice();
  for (let m = 5; m <= 2560; m *= 2) {
    const t = thin(fixes, m);
    if (t.length <= max) return t;
  }
  const stride = Math.ceil((fixes.length - 1) / (max - 1));
  const out: T[] = [];
  for (let i = 0; i < fixes.length - 1; i += stride) out.push(fixes[i]);
  out.push(fixes[fixes.length - 1]);
  return out.length <= max ? out : out.slice(0, max - 1).concat(fixes[fixes.length - 1]);
}

export interface PreparedCoordinates<T> {
  coords: T[];
  /** Fixes dropped because their timestamp could not be parsed. */
  droppedBadTime: number;
  /** Fixes before thinning (after the bad-time drop). */
  beforeThinning: number;
}

/** What goes on the wire: unparseable timestamps dropped (one bad fix must
 *  not fail the whole drive), timestamps normalised to ISO, and the count
 *  brought under the server's cap. Distance is NOT computed here: it is worked
 *  out from the full set before this runs. */
export function prepareCoordinatesForServer<T extends WireFix>(
  fixes: ReadonlyArray<T>,
  max: number = COORDINATE_TARGET
): PreparedCoordinates<T> {
  const good: T[] = [];
  let droppedBadTime = 0;
  for (const f of fixes) {
    const iso = normaliseRecordedAt(f.recorded_at);
    if (iso === null || !Number.isFinite(f.lat) || !Number.isFinite(f.lng)) {
      droppedBadTime++;
      continue;
    }
    good.push(iso === f.recorded_at ? f : { ...f, recorded_at: iso });
  }
  return { coords: downsampleCoordinates(good, max), droppedBadTime, beforeThinning: good.length };
}

// ── Flight cut that survives a kill mid-finalize ──────────────────────────

/** tracking_state value for key `flight_cut`. */
export interface FlightCutState {
  /** recorded_at of the first fix after each cut flight: a leg starts there. */
  after: string[];
  /** `${before}|${after}` of each flight already reported. */
  reported: string[];
}

export function parseFlightCutState(raw: string | null | undefined): FlightCutState {
  const empty: FlightCutState = { after: [], reported: [] };
  if (!raw) return empty;
  try {
    const v = JSON.parse(raw);
    const strs = (x: unknown): string[] =>
      Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
    return { after: strs(v?.after), reported: strs(v?.reported) };
  } catch {
    return empty;
  }
}

export function flightReportKey(beforeAt: string, afterAt: string): string {
  return `${beforeAt}|${afterAt}`;
}

export interface FlightCutPlan<T> {
  /** The fixes left once every airborne stretch is out. */
  kept: T[];
  /** Indexes into `kept` where a new leg must start (this run's cuts and
   *  earlier runs' markers whose fix is still in the buffer). */
  legStartIdx: Set<number>;
  /** The state to store. */
  state: FlightCutState;
  /** Ranges (exclusive both ends) of recorded_at to DELETE. */
  deleteRanges: Array<{ afterExclusive: string; beforeExclusive: string }>;
  /** Flights not yet reported (index into the spans passed in). */
  toReport: number[];
}

export interface PlanSpan {
  startIdx: number;
  endIdx: number;
}

/** Pure: given the buffer, the spans the flight rule found and the stored
 *  state, say what to keep, where legs start, what to delete and what to
 *  report. In memory only; the caller does the writes. `cut` is cutFlights. */
export function planFlightCut<T extends { recorded_at: string }>(
  coords: ReadonlyArray<T>,
  spans: ReadonlyArray<PlanSpan>,
  stored: FlightCutState,
  cut: (c: ReadonlyArray<T>, s: ReadonlyArray<PlanSpan>) => { kept: T[]; legStarts: number[] }
): FlightCutPlan<T> {
  const { kept, legStarts } = spans.length > 0 ? cut(coords, spans) : { kept: coords.slice(), legStarts: [] };
  const after = new Set(stored.after);
  for (const i of legStarts) if (kept[i]) after.add(kept[i].recorded_at);
  const legStartIdx = new Set<number>();
  for (let i = 1; i < kept.length; i++) if (after.has(kept[i].recorded_at)) legStartIdx.add(i);
  const reported = new Set(stored.reported);
  const toReport: number[] = [];
  const deleteRanges: FlightCutPlan<T>["deleteRanges"] = [];
  spans.forEach((s, idx) => {
    const b = coords[s.startIdx].recorded_at;
    const a = coords[s.endIdx].recorded_at;
    deleteRanges.push({ afterExclusive: b, beforeExclusive: a });
    const key = flightReportKey(b, a);
    if (!reported.has(key)) {
      toReport.push(idx);
      reported.add(key);
    }
  });
  return {
    kept,
    legStartIdx,
    state: { after: [...after], reported: [...reported] },
    deleteRanges,
    toReport,
  };
}

/** After a consume that removed everything up to `processedMax` (or
 *  everything, when null): drop the markers and report keys that are behind
 *  it, keep the ones the buffer still needs. */
export function pruneFlightCutState(state: FlightCutState, processedMax: string | null): FlightCutState {
  if (processedMax === null) return { after: [], reported: [] };
  const max = Date.parse(processedMax);
  if (!Number.isFinite(max)) return { after: [], reported: [] };
  const later = (s: string) => {
    const ms = Date.parse(s);
    return Number.isFinite(ms) && ms > max;
  };
  return {
    after: state.after.filter(later),
    reported: state.reported.filter((k) => later(k.split("|")[1] ?? "")),
  };
}

// ── Bad first / last fix ──────────────────────────────────────────────────

/** A step faster than this between two fixes is not a car. */
export const ENDPOINT_MAX_MPH = 200;
/** A fix this close to latitude 0, longitude 0 is a cold-start placeholder. */
export const NULL_ISLAND_METRES = 1000;
/** ...and the jump must also be this long. A late wake plants the departure
 *  anchor up to 5 km before the first real fix, 30 s earlier, which reads as
 *  well over 200 mph from 2.7 km; it is the real start of the drive and must
 *  stay. The fixes this guard exists for (another city or country) are tens to
 *  thousands of miles out. 12 Oct 2026 review. */
export const ENDPOINT_MIN_JUMP_METRES = 16_093; // 10 miles

function stepMph(a: WireFix, b: WireFix): number | null {
  const ta = Date.parse(a.recorded_at);
  const tb = Date.parse(b.recorded_at);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  const miles = metres(a, b) / METRES_PER_MILE;
  const hours = Math.abs(tb - ta) / 3_600_000;
  if (hours <= 0) return miles > 0.1 ? Infinity : 0;
  return miles / hours;
}

/** Drop fixes that cannot be real ends of a drive: anything within ~1 km of
 *  0,0 (a cold-start placeholder), and a first or last fix that sits more than
 *  200 mph and at least 10 miles from its neighbour while that neighbour
 *  agrees with the next one (a stale far-away position). filterTraceOutliers keeps the endpoints on
 *  purpose, so one such fix could turn a real short drive into thousands of
 *  miles and get it cleared as "implausible". Returns the input untouched when
 *  nothing needs dropping or fewer than two fixes would remain. */
export function trimBadEndpoints<T extends WireFix>(fixes: ReadonlyArray<T>): { coords: T[]; dropped: number } {
  const zero: WireFix = { lat: 0, lng: 0, recorded_at: "" };
  let out = fixes.filter((f) => !(Number.isFinite(f.lat) && Number.isFinite(f.lng) && metres(f, zero) < NULL_ISLAND_METRES));
  for (let guard = 0; guard < 5 && out.length >= 3; guard++) {
    const a = stepMph(out[0], out[1]);
    const b = stepMph(out[1], out[2]);
    if (a !== null && a > ENDPOINT_MAX_MPH && metres(out[0], out[1]) >= ENDPOINT_MIN_JUMP_METRES && (b === null || b <= ENDPOINT_MAX_MPH)) {
      out = out.slice(1);
      continue;
    }
    const n = out.length;
    const c = stepMph(out[n - 2], out[n - 1]);
    const d = stepMph(out[n - 3], out[n - 2]);
    if (c !== null && c > ENDPOINT_MAX_MPH && metres(out[n - 2], out[n - 1]) >= ENDPOINT_MIN_JUMP_METRES && (d === null || d <= ENDPOINT_MAX_MPH)) {
      out = out.slice(0, n - 1);
      continue;
    }
    break;
  }
  if (out.length < 2 || out.length === fixes.length) return { coords: fixes.slice(), dropped: 0 };
  return { coords: out, dropped: fixes.length - out.length };
}

// ── The trip's ends, shared with the rescue hand-off ──────────────────────
// finalize (detection.ts) and the hand-off of a drive finalize could not save
// (rescueHandoff.ts) both work out a trip's start and end here, so a drive
// queued by one and later reached by the other gets the SAME startedAt. That
// is what the same-start guard in finalize and the server's userId+startedAt
// dedup key on (15 Oct 2026 review).

/** finalize's stop timeout: a fix across a longer gap is after the arrival. */
export const ARRIVAL_STOP_TIMEOUT_MS = 10 * 60 * 1000;
/** Any speed above this (m/s, ~2.2 mph) is still moving. */
export const ARRIVAL_CONTINUE_SPEED_MS = 1.0;

function metresR6371(a: WireFix, b: WireFix): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Index of the trip's last fix. Two ways a recording over-runs the arrival:
 * stationary drift after parking, and a late ping glued on across a parked
 * gap. A fix more than the stop timeout after the one before it is after the
 * arrival; otherwise the last fix with real movement is the end. At least 1
 * for two or more fixes.
 */
export function arrivalEndIndex<T extends WireFix & { speed?: number | null }>(
  fixes: ReadonlyArray<T>,
  stopTimeoutMs: number = ARRIVAL_STOP_TIMEOUT_MS,
  continueSpeedMs: number = ARRIVAL_CONTINUE_SPEED_MS
): number {
  let endIdx = fixes.length - 1;
  for (let i = fixes.length - 1; i > 0; i--) {
    const curr = fixes[i];
    const prev = fixes[i - 1];
    const gapMs = new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime();
    if (Number.isFinite(gapMs) && gapMs > stopTimeoutMs) {
      // Parked gap before this coord: the journey ended at prev.
      endIdx = i - 1;
      continue;
    }
    const speed = curr.speed != null && curr.speed > 0 ? curr.speed : 0;
    if (speed >= continueSpeedMs || metresR6371(prev, curr) > 30) {
      endIdx = i;
      break;
    }
    if (i === 1) endIdx = 1;
  }
  return endIdx;
}

type CleanFix = WireFix & { accuracy: number | null; speed?: number | null };

/** GPS outliers out (filterTraceOutliers), then a bad first or last fix
 *  (trimBadEndpoints). What finalize measures and saves. */
export function cleanTraceForSave<T extends CleanFix>(
  coords: T[]
): { outlierFiltered: T[]; coords: T[]; endpointsDropped: number } {
  const outlierFiltered = filterTraceOutliers(coords);
  const trimmed = trimBadEndpoints(outlierFiltered);
  return { outlierFiltered, coords: trimmed.coords, endpointsDropped: trimmed.dropped };
}

/** The startedAt / endedAt a trip is stored and sent with: the first and last
 *  cleaned fix, a raw native epoch made ISO, an ISO string unchanged. */
export function tripWireTimes(cleaned: ReadonlyArray<WireFix>): { startedAt: string; endedAt: string } | null {
  if (cleaned.length === 0) return null;
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  return {
    startedAt: normaliseRecordedAt(first.recorded_at) ?? first.recorded_at,
    endedAt: normaliseRecordedAt(last.recorded_at) ?? last.recorded_at,
  };
}
