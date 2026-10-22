// When Directions may ask for a recording to open (PLAN-recording.md
// sections 1 and 2, Anthony's Q1: arm on a parked phone and open on the first
// movement, with the trip starting where guidance started).
//
// Pure. The handler (directionsDrive.ts) gathers the facts with read-only
// reads and acts on the answer. In this build it only logs the answer:
// DIRECTIONS_RECORDING "on" is treated exactly like "log" (see
// directionsActsOn), so nothing here can open, arm or change a recording yet.

import type { DirectionsRecordingMode } from "../navigation/driveSessions";

const MPH = 0.44704;
/** Moving: a fix at or above this, good to 50 m. */
export const DIRECTIONS_MOVING_MPS = 9 * MPH;
export const DIRECTIONS_FIX_MAX_ACCURACY_M = 50;
/** A fix older than this says nothing about now. */
export const DIRECTIONS_FIX_MAX_AGE_MS = 30_000;
/** An arm lasts this long, then lapses. */
export const DIRECTIONS_ARM_TTL_MS = 15 * 60 * 1000;
/** Two fixes this far apart, averaging the moving speed, count as moving. */
export const DIRECTIONS_ARM_PAIR_MIN_M = 100;
/** ...and no further apart in time than this (an older one is not "the last fix"). */
export const DIRECTIONS_ARM_PAIR_MAX_GAP_MS = 2 * 60 * 1000;
/** The trip may start where guidance started if that was this recent... */
export const DIRECTIONS_PLANT_MAX_AGE_MS = 5 * 60 * 1000;
/** ...and this close to where the car first moved. */
export const DIRECTIONS_PLANT_MAX_M = 2_000;

/**
 * Whether Directions may act on a recording in this build. Never: "log" and
 * "on" both only log, until a week of log data has been read (PLAN section 9,
 * step 6). The one switch to change when opening goes live.
 */
export function directionsActsOn(_mode: DirectionsRecordingMode): false {
  return false;
}

export interface DirectionsFix {
  lat: number;
  lng: number;
  speedMps: number | null;
  accuracyM: number | null;
  atMs: number;
}

export interface DirectionsOpenInputs {
  mode: DirectionsRecordingMode;
  passenger: boolean;
  /** This phone's recorder (the native engine) is present. */
  engineAvailable: boolean;
  /** Automatic trips switched on. */
  switchOn: boolean;
  /** A pause is running. */
  paused: boolean;
  /** A shift or Start Trip holds the GPS. */
  shiftLocked: boolean;
  /** An automatic recording is already open. */
  recording: boolean;
  /** "Not driving" was tapped recently. */
  notDrivingCooldown: boolean;
  fix: DirectionsFix | null;
  nowMs: number;
}

export type DirectionsSkipReason =
  | "mode_off"
  | "passenger"
  | "no_engine"
  | "switched_off"
  | "paused"
  | "shift_or_start_trip"
  | "already_recording"
  | "not_driving_cooldown";

export type DirectionsOpenDecision =
  | { action: "open_now"; reason: "moving" }
  | { action: "arm"; reason: "not_moving" | "no_fix" }
  | { action: "skip"; reason: DirectionsSkipReason };

export function isMovingFix(f: DirectionsFix | null): boolean {
  return (
    !!f &&
    f.speedMps != null &&
    f.speedMps >= DIRECTIONS_MOVING_MPS &&
    f.accuracyM != null &&
    f.accuracyM <= DIRECTIONS_FIX_MAX_ACCURACY_M
  );
}

/** What guidance starting should do. Every refusal the recorder would make
 *  is a skip here first, so a skip never even reaches the opener. */
export function directionsOpenDecision(i: DirectionsOpenInputs): DirectionsOpenDecision {
  if (i.mode === "off") return { action: "skip", reason: "mode_off" };
  if (i.passenger) return { action: "skip", reason: "passenger" };
  if (!i.engineAvailable) return { action: "skip", reason: "no_engine" };
  if (!i.switchOn) return { action: "skip", reason: "switched_off" };
  if (i.paused) return { action: "skip", reason: "paused" };
  if (i.shiftLocked) return { action: "skip", reason: "shift_or_start_trip" };
  if (i.recording) return { action: "skip", reason: "already_recording" };
  if (i.notDrivingCooldown) return { action: "skip", reason: "not_driving_cooldown" };
  if (!i.fix) return { action: "arm", reason: "no_fix" };
  const fresh = i.nowMs - i.fix.atMs <= DIRECTIONS_FIX_MAX_AGE_MS;
  if (fresh && isMovingFix(i.fix)) return { action: "open_now", reason: "moving" };
  return { action: "arm", reason: "not_moving" };
}

// ── The arm: wait for the first movement ─────────────────────────────────

export interface DirectionsArm {
  sessionId: string;
  armedAtMs: number;
  expiresAtMs: number;
  /** Where guidance started, for the trip's start. */
  startFix: DirectionsFix | null;
  /** The last fix seen while armed, for the two-fix rule. */
  lastFix: DirectionsFix | null;
}

export function newArm(sessionId: string, nowMs: number, startFix: DirectionsFix | null): DirectionsArm {
  return { sessionId, armedAtMs: nowMs, expiresAtMs: nowMs + DIRECTIONS_ARM_TTL_MS, startFix, lastFix: startFix };
}

export type ArmStep =
  | { kind: "expired" }
  | { kind: "wait"; arm: DirectionsArm }
  | { kind: "move"; via: "speed" | "pair"; plantStart: boolean; plantMetres: number | null };

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
/** Great-circle metres. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const goodAccuracy = (f: DirectionsFix) => f.accuracyM != null && f.accuracyM <= DIRECTIONS_FIX_MAX_ACCURACY_M;

/**
 * One fix while armed. Moving = one fix at 9 mph or more (good to 50 m), or
 * two good fixes at least 100 m apart, no more than two minutes apart,
 * averaging 9 mph or more. On a move, whether the trip may start where
 * guidance started (<= 5 min old, <= 2 km away).
 */
export function armStep(arm: DirectionsArm, fix: DirectionsFix, nowMs: number): ArmStep {
  if (nowMs > arm.expiresAtMs) return { kind: "expired" };
  let via: "speed" | "pair" | null = isMovingFix(fix) ? "speed" : null;
  const prev = arm.lastFix;
  if (!via && prev && goodAccuracy(prev) && goodAccuracy(fix)) {
    const dt = fix.atMs - prev.atMs;
    if (dt > 0 && dt <= DIRECTIONS_ARM_PAIR_MAX_GAP_MS) {
      const m = metresBetween(prev, fix);
      if (m >= DIRECTIONS_ARM_PAIR_MIN_M && m / (dt / 1000) >= DIRECTIONS_MOVING_MPS) via = "pair";
    }
  }
  if (!via) return { kind: "wait", arm: { ...arm, lastFix: fix } };
  const start = arm.startFix;
  let plantStart = false;
  let plantMetres: number | null = null;
  if (start) {
    plantMetres = Math.round(metresBetween(start, fix));
    const age = fix.atMs - start.atMs;
    plantStart = age >= 0 && age <= DIRECTIONS_PLANT_MAX_AGE_MS && plantMetres <= DIRECTIONS_PLANT_MAX_M;
  }
  return { kind: "move", via, plantStart, plantMetres };
}
