// What finalize and the heartbeat would do for a Directions drive, LOG ONLY
// in this build (PLAN-recording.md section 4, build step 5).
//
// Finalize SAVES FIRST, exactly as it would without Directions, and only then
// calls noteDirectionsAfterSave without waiting for it. That reads the
// guidance sessions overlapping the saved trip (driveLog.ts, read-only), runs
// the fill and naming rules on the trip's real fixes, logs what they would
// do, and sends a small note as a follow-up update (gpsQuality.directions,
// merged on the server). Nothing it does can reach the trip's segmentation,
// coordinates, distance, start, end or addresses: it is given copies of the
// fixes after the save, and the only write is that note.
//
// The heartbeat calls noteHeartbeatWouldHold, also without waiting, before
// its stale finalize (the Mike French case, 20 Oct): would a live session
// have held it? Logged only.
//
// Both do nothing unless the last profile fetch said DIRECTIONS_RECORDING is
// log or on (the kill switch), never throw, and give up after a short wait.
// No detection.ts import (it calls us); the logger is passed in.

import type { DriveSession } from "../navigation/driveSessions";
import { readDirectionsRecordingMode, readDriveSessions } from "../navigation/driveLog";
import { metresOffRouteAt, onRouteWithin, planRouteFill, type FillFix } from "./routeFillRule";
import { directionsNameRule, metresBucket } from "./directionsNameRule";

export type DirectionsLog = (event: string, data: Record<string, unknown>) => void;

/** Give up on a Directions question after this long. */
export const DIRECTIONS_FINALIZE_TIMEOUT_MS = 1_500;
/** The heartbeat would hold a recording only while the last fix was this fast... */
export const HOLD_MIN_SPEED_MPS = 15 * 0.44704;
/** ...and the silence is shorter than this. */
export const HOLD_MAX_IDLE_MS = 30 * 60 * 1000;
/** At most this many gaps described in the note. */
const NOTE_MAX_GAPS = 20;

export interface DirectionsCoord {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string | number;
}

/** The note sent to the server. No place: where the driver was going stays
 *  on the phone (navigation_drives); the server learns only its kind. */
export interface DirectionsNote {
  sessionId: string;
  /** Always "log" in this build, whatever the server switch says. */
  mode: "log";
  destination: { savedPlace: boolean; savedType: string | null; hasName: boolean };
  wouldFill: {
    miles: number;
    gapCount: number;
    realMiles: number;
    lowConfidence: boolean;
    /** The gap after this trip's last fix was longer than the journey-end
     *  setting (so the next fixes became another trip), and the route would
     *  have filled it. Only possible with a journey end under 30 minutes. */
    wouldJoinNext: boolean;
    rejected: Record<string, number>;
    gaps: Array<{ fromMs: number; toMs: number; miles: number; crowMiles: number; points: number }>;
  };
  wouldName: { use: boolean; source: "saved" | "search" | null; reason: string | null; metresBucket: string | null };
}

export interface DirectionsDeps {
  read?: typeof readDriveSessions;
  readMode?: typeof readDirectionsRecordingMode;
  log: DirectionsLog;
}

function atMs(v: string | number): number {
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e12) return n;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : NaN;
}

function toFixes(coords: ReadonlyArray<DirectionsCoord>): FillFix[] {
  const out: FillFix[] = [];
  for (const c of coords) {
    const t = atMs(c.recorded_at);
    if (!Number.isFinite(t) || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    out.push({ lat: c.lat, lng: c.lng, speed: c.speed, accuracy: c.accuracy, atMs: t });
  }
  return out;
}

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), DIRECTIONS_FINALIZE_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/** The kill switch: the profile's current DIRECTIONS_RECORDING, then only
 *  sessions that were not off themselves. */
async function liveSessions(deps: DirectionsDeps, fromMs: number, toMs: number): Promise<DriveSession[]> {
  if ((await (deps.readMode ?? readDirectionsRecordingMode)()) === "off") return [];
  return (await (deps.read ?? readDriveSessions)(fromMs, toMs)).filter((s) => s.mode !== "off");
}

type NoteArgs = {
  coords: ReadonlyArray<DirectionsCoord>;
  rawCoords?: ReadonlyArray<DirectionsCoord>;
  splitMs?: number | null;
  endAddressKnown: boolean;
};

async function computeNote(args: NoteArgs, deps: DirectionsDeps): Promise<DirectionsNote | null> {
  const fixes = toFixes(args.coords);
  if (fixes.length < 2) return null;
  const startMs = fixes[0].atMs;
  const endMs = fixes[fixes.length - 1].atMs;

  // The fix that came next in the buffer, if the journey-end setting cut the
  // trip there. Counted once, by the trip it ends (each leg of a multi-leg
  // buffer is its own finalize pass, and judges only its own next gap).
  let next: FillFix | null = null;
  if (args.rawCoords && args.splitMs != null && args.splitMs > 0) {
    for (const f of toFixes(args.rawCoords)) {
      if (f.atMs > endMs && (!next || f.atMs < next.atMs)) next = f;
    }
    if (next && next.atMs - endMs <= args.splitMs) next = null;
  }

  const sessions = await liveSessions(deps, startMs, next ? next.atMs : endMs);
  if (sessions.length === 0) return null;

  const plan = planRouteFill(fixes, sessions);
  const name = directionsNameRule({ sessions, tripStartMs: startMs, tripEndMs: endMs, lastFix: fixes[fixes.length - 1] });
  const wouldJoinNext = next != null && planRouteFill([fixes[fixes.length - 1], next], sessions).gaps.length > 0;

  const s =
    sessions.find((x) => x.sessionId === name.sessionId) ??
    sessions.find((x) => x.sessionId === plan.gaps[0]?.sessionId) ??
    sessions[sessions.length - 1];

  deps.log("finalize_directions_fill", {
    sessionId: s.sessionId,
    mode: "log",
    planned: plan.gaps.length,
    applied: 0,
    miles: plan.miles,
    realMiles: plan.realMiles,
    lowConfidence: plan.lowConfidence,
    wouldJoinNext,
    fixes: plan.gaps.reduce((n, g) => n + g.points.length, 0),
    rejected: plan.rejected,
  });
  deps.log("finalize_directions_named", {
    sessionId: s.sessionId,
    mode: "log",
    wouldUse: name.use,
    source: name.source,
    reason: name.reason,
    metresBucket: name.metresBucket,
    endAddressKnown: args.endAddressKnown,
  });

  return {
    sessionId: s.sessionId,
    mode: "log",
    destination: {
      savedPlace: !!s.destination.savedLocationId,
      savedType: s.destination.savedType,
      hasName: !!s.destination.name?.trim(),
    },
    wouldFill: {
      miles: plan.miles,
      gapCount: plan.gaps.length,
      realMiles: plan.realMiles,
      lowConfidence: plan.lowConfidence,
      wouldJoinNext,
      rejected: plan.rejected as Record<string, number>,
      gaps: plan.gaps.slice(0, NOTE_MAX_GAPS).map((g) => ({
        fromMs: g.fromMs,
        toMs: g.toMs,
        miles: g.miles,
        crowMiles: g.crowMiles,
        points: g.points.length,
      })),
    },
    wouldName: { use: name.use, source: name.source, reason: name.reason, metresBucket: name.metresBucket },
  };
}

/**
 * What would Directions do for this trip? Null (and nothing logged) when the
 * switch is off or no guidance session overlaps it, which is every trip on
 * every phone that has not used Directions with the switch on. Never throws;
 * null after DIRECTIONS_FINALIZE_TIMEOUT_MS.
 */
export async function directionsLogForTrip(args: NoteArgs, deps: DirectionsDeps): Promise<DirectionsNote | null> {
  try {
    return await withTimeout(computeNote(args, deps), null);
  } catch {
    return null;
  }
}

type UpdateTrip = (id: string, data: { gpsQuality: Record<string, unknown> }) => Promise<unknown>;

const syncUpdate: UpdateTrip = async (id, data) => {
  const { syncUpdateTrip } = await import("../sync/actions");
  return syncUpdateTrip(id, data);
};

/**
 * Finalize's call, AFTER the trip is saved, never awaited. Works out the note
 * (directionsLogForTrip) and puts it on the saved trip with a follow-up
 * update. A trip whose create is still queued (offline, or a duplicate the
 * phone skipped) has no server id yet: its note is dropped and that is
 * logged. Never throws.
 */
export async function noteDirectionsAfterSave(
  args: NoteArgs & { tripId: string | null; log: DirectionsLog },
  deps: { read?: typeof readDriveSessions; readMode?: typeof readDirectionsRecordingMode; update?: UpdateTrip } = {}
): Promise<void> {
  try {
    // Off the caller's stack before any work at all.
    await Promise.resolve();
    const note = await directionsLogForTrip(args, { read: deps.read, readMode: deps.readMode, log: args.log });
    if (!note) return;
    if (!args.tripId) {
      args.log("finalize_directions_note_dropped", { sessionId: note.sessionId, mode: "log", reason: "not_saved_to_server" });
      return;
    }
    await (deps.update ?? syncUpdate)(args.tripId, { gpsQuality: { directions: note as unknown as Record<string, unknown> } });
  } catch (err) {
    try {
      args.log("finalize_directions_note_dropped", {
        mode: "log",
        reason: "error",
        error: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
      });
    } catch {
      // never into finalize
    }
  }
}

/**
 * The heartbeat's question before a stale finalize, LOG ONLY, never awaited:
 * was a live Directions session being followed, with the last fix on its
 * route at 15 mph or more, and the silence under 30 minutes? Logs
 * heartbeat_finalize_would_hold_directions when a live session exists. The
 * finalize runs at the same time, so the last fix may already be gone
 * (lastFixRead false). Never throws; gives up after DIRECTIONS_FINALIZE_TIMEOUT_MS.
 */
export async function noteHeartbeatWouldHold(
  args: { idleMs: number; nowMs: number; lastFix: () => Promise<DirectionsCoord | null> },
  deps: DirectionsDeps
): Promise<void> {
  const run = async () => {
    const live = (await liveSessions(deps, args.nowMs - HOLD_MAX_IDLE_MS, args.nowMs)).filter(
      (s) => !s.passenger && s.endedAtMs == null
    );
    if (live.length === 0) return;
    const s = live[live.length - 1];
    const last = await args.lastFix();
    const fix = last ? toFixes([last])[0] ?? null : null;
    const off = fix ? metresOffRouteAt(s, fix) : null;
    const onRoute = fix ? onRouteWithin(off, fix.accuracy) : false;
    const fast = fix?.speed != null && fix.speed >= HOLD_MIN_SPEED_MPS;
    const shortSilence = args.idleMs < HOLD_MAX_IDLE_MS;
    deps.log("heartbeat_finalize_would_hold_directions", {
      sessionId: s.sessionId,
      mode: "log",
      wouldHold: onRoute && fast && shortSilence,
      idleMs: args.idleMs,
      lastFixRead: fix != null,
      onRoute,
      offRouteBucket: metresBucket(off),
      lastSpeedMph: fix?.speed != null ? Math.round(fix.speed * 2.23694) : null,
    });
  };
  try {
    await withTimeout(run(), undefined);
  } catch {
    // never into the heartbeat
  }
}
