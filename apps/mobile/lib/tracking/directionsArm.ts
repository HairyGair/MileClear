// The Directions arm, LOG ONLY in this build (PLAN-recording.md section 2,
// Anthony's Q1). When guidance starts on a parked phone, the plan is to arm
// the recorder for 15 minutes and open on the first movement. This build
// does not arm anything: it keeps an in-memory "would arm" record so that
// handleNativeLocation can say, on the fix where it would have happened,
// "a recording would have opened here" (directions_would_open via arm).
//
// Inert by construction:
//   - the record lives in this process only; nothing is read or written;
//   - with no record (every phone that has not just started guidance with
//     DIRECTIONS_RECORDING on) the per-fix check is one null test;
//   - it never throws, and the caller ignores everything but a log line;
//   - it is one-shot: the first movement, an expiry or the end of guidance
//     clears it.

import { armStep, newArm, type DirectionsArm, type DirectionsFix } from "./directionsOpenRule";

let wouldArm: DirectionsArm | null = null;

export interface DirectionsLogLine {
  event: string;
  data: Record<string, unknown>;
}

/** Guidance started on a parked phone (log mode): remember it. */
export function setWouldArm(sessionId: string, nowMs: number, startFix: DirectionsFix | null): void {
  wouldArm = newArm(sessionId, nowMs, startFix);
}

/** Guidance ended: forget it. Returns whether one was waiting. */
export function clearWouldArm(sessionId: string): boolean {
  if (!wouldArm || wouldArm.sessionId !== sessionId) return false;
  wouldArm = null;
  return true;
}

export function hasWouldArm(): boolean {
  return wouldArm !== null;
}

function timestampMs(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 1e12) return n;
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return fallback;
}

/** The recorder's fix shape (handleNativeLocation) as the rule's. */
export function directionsFixOf(loc: {
  coords?: { latitude?: number; longitude?: number; speed?: number | null; accuracy?: number | null } | null;
  timestamp?: unknown;
}, nowMs: number): DirectionsFix | null {
  const c = loc?.coords;
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const speed = num(c.speed);
  return {
    lat: c.latitude as number,
    lng: c.longitude as number,
    speedMps: speed != null && speed >= 0 ? speed : null,
    accuracyM: num(c.accuracy),
    atMs: timestampMs(loc.timestamp, nowMs),
  };
}

/**
 * A fix with no recording open (handleNativeLocation, after the pause,
 * switch, low-power, kerbside and recording checks), or a moving fix from
 * guidance itself. Returns the log line when an armed session would have
 * opened (or lapsed) on it, else null. Never throws.
 */
export function directionsArmFix(fix: DirectionsFix | null, nowMs: number, source: "recorder" | "guidance"): DirectionsLogLine | null {
  const arm = wouldArm;
  if (!arm) return null;
  try {
    if (!fix) return null;
    const step = armStep(arm, fix, nowMs);
    if (step.kind === "wait") {
      wouldArm = step.arm;
      return null;
    }
    wouldArm = null;
    if (step.kind === "expired") {
      return { event: "directions_arm_expired", data: { sessionId: arm.sessionId, mode: "log", armedMs: nowMs - arm.armedAtMs } };
    }
    return {
      event: "directions_would_open",
      data: {
        sessionId: arm.sessionId,
        mode: "log",
        via: "arm",
        movedBy: step.via,
        source,
        msAfterGuidanceStart: Math.max(0, fix.atMs - arm.armedAtMs),
        plantedStart: step.plantStart,
        plantMetres: step.plantMetres,
        speedMph: fix.speedMps != null ? Math.round(fix.speedMps * 2.23694) : null,
        accuracy: fix.accuracyM != null ? Math.round(fix.accuracyM) : null,
      },
    };
  } catch {
    wouldArm = null;
    return null;
  }
}

/** Tests only. */
export function _resetDirectionsArm(): void {
  wouldArm = null;
}
