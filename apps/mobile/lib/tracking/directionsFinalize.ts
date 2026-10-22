// What finalize and the heartbeat would do for a Directions drive, LOG ONLY
// in this build (PLAN-recording.md section 4, build step 5).
//
// Finalize asks directionsLogForTrip about the trip it is about to save. It
// reads the guidance sessions that overlap the trip (driveLog.ts, read-only),
// runs the fill and naming rules on the trip's real fixes, logs what they
// would do, and returns a small note for gpsQuality.directions. That is the
// ONLY change to the trip: the segmentation, coordinates, distance, start
// and end, and addresses are exactly what they would have been, because
// nothing here is given them to change. With no session the answer is null
// and the create body is the very same object (withDirectionsNote).
//
// The heartbeat asks noteHeartbeatWouldHold before its stale finalize (the
// Mike French case, 20 Oct): would a live session have held it? Logged only.
//
// Both never throw and give up after a short wait: a Directions question must
// never hold up or break a save. No detection.ts import (it calls us); the
// logger is passed in.

import type { DriveSession } from "../navigation/driveSessions";
import { readDriveSessions } from "../navigation/driveLog";
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

export interface DirectionsNote {
  sessionId: string;
  /** Always "log" in this build, whatever the server switch says. */
  mode: "log";
  serverMode: string;
  destination: DriveSession["destination"];
  wouldFill: {
    miles: number;
    gapCount: number;
    realMiles: number;
    lowConfidence: boolean;
    /** Gaps longer than the journey-end setting (they split the buffer into
     *  separate trips today) that the route would have filled. */
    wouldJoinLegs: number;
    rejected: Record<string, number>;
    gaps: Array<{ fromMs: number; toMs: number; miles: number; crowMiles: number; points: number }>;
  };
  wouldName: { use: boolean; source: "saved" | "search" | null; reason: string | null; metresBucket: string | null };
}

function atMs(v: string | number): number {
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e12) return n;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : NaN;
}

function toFixes(coords: DirectionsCoord[]): FillFix[] {
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

async function computeNote(
  args: { coords: DirectionsCoord[]; rawCoords?: DirectionsCoord[]; splitMs?: number | null; endAddressKnown: boolean },
  deps: { read: typeof readDriveSessions; log: DirectionsLog }
): Promise<DirectionsNote | null> {
  const fixes = toFixes(args.coords);
  if (fixes.length < 2) return null;
  const startMs = fixes[0].atMs;
  const endMs = fixes[fixes.length - 1].atMs;
  const sessions = (await deps.read(startMs, endMs)).filter((s) => s.mode !== "off");
  if (sessions.length === 0) return null;

  const plan = planRouteFill(fixes, sessions);
  const name = directionsNameRule({ sessions, tripStartMs: startMs, tripEndMs: endMs, lastFix: fixes[fixes.length - 1] });

  // Gaps the journey-end setting split off as other trips (F5): would the
  // route have filled them? Counted on the whole buffer, pair by pair.
  let wouldJoinLegs = 0;
  if (args.rawCoords && args.splitMs != null && args.splitMs > 0) {
    const raw = toFixes(args.rawCoords);
    for (let i = 1; i < raw.length; i++) {
      if (raw[i].atMs - raw[i - 1].atMs > args.splitMs && planRouteFill([raw[i - 1], raw[i]], sessions).gaps.length > 0) wouldJoinLegs++;
    }
  }

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
    wouldJoinLegs,
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
    serverMode: s.mode,
    destination: s.destination,
    wouldFill: {
      miles: plan.miles,
      gapCount: plan.gaps.length,
      realMiles: plan.realMiles,
      lowConfidence: plan.lowConfidence,
      wouldJoinLegs,
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
 * Finalize's question, LOG ONLY: what would Directions do for this trip?
 * Null (and nothing logged) when no guidance session overlaps it, which is
 * every trip on every phone that has not used Directions with the switch on.
 * Never throws; null after DIRECTIONS_FINALIZE_TIMEOUT_MS.
 */
export async function directionsLogForTrip(
  args: { coords: DirectionsCoord[]; rawCoords?: DirectionsCoord[]; splitMs?: number | null; endAddressKnown: boolean },
  deps: { read?: typeof readDriveSessions; log: DirectionsLog }
): Promise<DirectionsNote | null> {
  try {
    return await withTimeout(computeNote(args, { read: deps.read ?? readDriveSessions, log: deps.log }), null);
  } catch {
    return null;
  }
}

/** The create body with the note added under gpsQuality.directions, and
 *  nothing else changed. No note: the very same object back. */
export function withDirectionsNote<T extends { gpsQuality?: Record<string, unknown> }>(body: T, note: DirectionsNote | null): T {
  if (!note) return body;
  return { ...body, gpsQuality: { ...(body.gpsQuality ?? {}), directions: note as unknown as Record<string, unknown> } };
}

/**
 * The heartbeat's question before a stale finalize, LOG ONLY: was a live
 * Directions session being followed, with the last fix on its route at 15
 * mph or more, and the silence under 30 minutes? Logs
 * heartbeat_finalize_would_hold_directions when a live session exists. Never
 * throws; gives up after DIRECTIONS_FINALIZE_TIMEOUT_MS.
 */
export async function noteHeartbeatWouldHold(
  args: { idleMs: number; nowMs: number; lastFix: () => Promise<DirectionsCoord | null> },
  deps: { read?: typeof readDriveSessions; log: DirectionsLog }
): Promise<void> {
  const run = async () => {
    const read = deps.read ?? readDriveSessions;
    const live = (await read(args.nowMs - HOLD_MAX_IDLE_MS, args.nowMs)).filter(
      (s) => s.mode !== "off" && !s.passenger && s.endedAtMs == null
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
