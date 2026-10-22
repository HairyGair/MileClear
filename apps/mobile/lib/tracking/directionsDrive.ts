// The recorder's side of Directions (PLAN-recording.md section 2): the ONLY
// handler of guidanceIntent.ts. Guidance tells it that it started, saw
// movement or ended; this reads the recorder's state (read-only) and works
// out what should happen with directionsOpenDecision.
//
// LOG ONLY IN THIS BUILD. DIRECTIONS_RECORDING "log" and "on" both only log
// the decision (directionsActsOn is false for both). Nothing here opens,
// arms, ends, splits, pauses or re-powers a recording, and nothing here
// writes the recorder's state: the would-arm record is in memory
// (directionsArm.ts). Opening goes live in a later build, after a week of
// these logs has been read.
//
// Rules for this file (enforced by lib/navigation/__tests__/fixBus.test.ts):
// no engine calls, no finalize, no cancel, no tracking_state writes.

import { getDatabase } from "../db/index";
import { setGuidanceHandler, type GuidanceIntent } from "../navigation/guidanceIntent";
import { getDrivePauseUntil, isDriveDetectionSwitchOn, logDetectionEvent } from "./detection";
import { directionsActsOn, directionsOpenDecision, type DirectionsOpenInputs } from "./directionsOpenRule";
import { clearWouldArm, directionsArmFix, setWouldArm } from "./directionsArm";

type Facts = Omit<DirectionsOpenInputs, "mode" | "passenger" | "fix" | "nowMs">;

/** The recorder's state, read only. Anything unreadable reads as the answer
 *  that keeps Directions out of the way (a skip). */
async function readFacts(nowMs: number): Promise<Facts> {
  const facts: Facts = {
    engineAvailable: false,
    switchOn: false,
    paused: true,
    shiftLocked: true,
    recording: true,
    notDrivingCooldown: true,
  };
  try {
    // Loaded when needed, as detection.ts does, so registering this handler
    // at boot changes nothing about when the engine module loads.
    const { isNativeEngineTracking } = await import("./nativeLocation");
    facts.engineAvailable = isNativeEngineTracking();
  } catch {}
  try {
    facts.switchOn = await isDriveDetectionSwitchOn();
  } catch {}
  try {
    facts.paused = (await getDrivePauseUntil()) != null;
  } catch {}
  try {
    const db = await getDatabase();
    const value = async (key: string) =>
      (await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [key]))?.value ?? null;
    // A shift or Start Trip lock, as stored. The recorder's own check also
    // clears an abandoned lock; this read never does, so a ghost lock just
    // reads as locked (a skip).
    facts.shiftLocked = (await value("active_shift_id")) != null;
    facts.recording = (await value("auto_recording_active")) === "1";
    const until = Number(await value("not_driving_until"));
    facts.notDrivingCooldown = Number.isFinite(until) && nowMs < until;
  } catch {}
  return facts;
}

const log = (event: string, data: Record<string, unknown>) => logDetectionEvent(event, data).catch(() => {});

export async function handleGuidanceIntent(intent: GuidanceIntent): Promise<void> {
  try {
    const nowMs = Date.now();
    if (intent.kind === "ended") {
      if (clearWouldArm(intent.sessionId)) log("directions_arm_cleared", { sessionId: intent.sessionId, mode: "log", reason: intent.reason ?? null });
      return;
    }
    if (intent.kind === "moving") {
      // Guidance's own fixes (the foreground bridge) reach the arm too: with
      // the screen on, the recorder may still be asleep.
      const line = directionsArmFix(intent.fix, nowMs, "guidance");
      if (line) log(line.event, line.data);
      return;
    }

    // Started.
    const fix = intent.fix;
    const fixData = {
      fixAgeMs: fix ? nowMs - fix.atMs : null,
      speedMph: fix?.speedMps != null ? Math.round(fix.speedMps * 2.23694) : null,
      accuracy: fix?.accuracyM != null ? Math.round(fix.accuracyM) : null,
    };
    if (intent.mode === "off") {
      log("directions_open_decision", { sessionId: intent.sessionId, mode: "off", acts: false, action: "skip", reason: "mode_off" });
      return;
    }
    const facts = await readFacts(nowMs);
    const decision = directionsOpenDecision({ ...facts, mode: intent.mode, passenger: intent.passenger, fix, nowMs });
    // "on" is treated exactly like "log" in this build: never acts.
    const acts = directionsActsOn(intent.mode);
    log("directions_open_decision", {
      sessionId: intent.sessionId,
      mode: intent.mode,
      acts,
      action: decision.action,
      reason: decision.reason,
      ...fixData,
    });
    if (decision.action === "open_now") {
      log("directions_would_open", { sessionId: intent.sessionId, mode: "log", via: "now", msAfterGuidanceStart: 0, plantedStart: false, ...fixData });
    } else if (decision.action === "arm") {
      setWouldArm(intent.sessionId, nowMs, fix);
    }
  } catch {
    // never into guidance, never into the recorder
  }
}

let registered = false;

/** At boot, next to the engine setup. Idempotent. */
export function registerDirectionsDrive(): void {
  if (registered) return;
  registered = true;
  setGuidanceHandler(handleGuidanceIntent);
}
