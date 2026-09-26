// Should a headless location fix wake the native engine into tracking?
//
// Jenny Hyett-Bell's Galaxy S25+ (9 Sep 2026): Samsung ended the app between
// drives, so every drive after the first day ran with the SDK headless. In
// that state the only fixes were the single positions our heartbeat re-arm
// acquires, and the SDK's stationary geofence never fired an exit. One of
// those fixes read 22 m/s (50 mph) and was thrown away, because the headless
// task ignored location events and the speed backstop lives only in the
// app's foreground code. Result: three points for a nine-mile drive, and a
// 58-mile drive she had to type in herself.
//
// Pure decision so it can be unit-tested; the headless task feeds it the raw
// event and acts on the answer. The speed and accuracy test is the shared
// speedStartRule, the same one the foreground backstop in nativeLocation.ts
// uses, because the headless task hands the fix on to that handler.

import { decideSpeedStart } from "./speedStartRule";

export interface HeadlessFix {
  speedMs: number | null;
  accuracyM: number | null;
}

/** Pull speed and accuracy out of either headless event shape. */
export function readHeadlessFix(name: string, params: unknown): HeadlessFix | null {
  if (name !== "location" && name !== "motionchange") return null;
  const p = (params ?? {}) as Record<string, unknown>;
  const loc = (name === "motionchange" ? (p.location as Record<string, unknown> | undefined) : p) ?? {};
  const coords = (loc.coords ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { speedMs: num(coords.speed), accuracyM: num(coords.accuracy) };
}

export interface HeadlessWakeInput {
  fix: HeadlessFix | null;
  /** SDK state at the time; null when getState is unavailable. */
  isMoving: boolean | null;
  enabled: boolean | null;
  /** A coarse driving-speed fix woke the SDK to look again, within the
   *  confirm window. The SDK then reads moving, and that must not turn the
   *  better fix it was woken for away (see shouldConfirmCoarseFix). */
  confirming?: boolean;
}

/**
 * True when the fix is a confident driving-speed fix and the SDK is not
 * already tracking. A disabled SDK is never woken.
 */
export function decideHeadlessWake({ fix, isMoving, enabled, confirming = false }: HeadlessWakeInput): boolean {
  if (!fix) return false;
  if (enabled === false) return false;
  if (isMoving === true && !confirming) return false;
  return decideSpeedStart(fix.speedMs, fix.accuracyM).start;
}

/** How long a confirm lasts, and the least time between two of them. */
export const HEADLESS_CONFIRM_WINDOW_MS = 10 * 60 * 1000;

/** A confirm started at `startedAt` (epoch ms, 0 = never) is still running. */
export function isConfirming(startedAt: number, now: number): boolean {
  return startedAt > 0 && now >= startedAt && now - startedAt < HEADLESS_CONFIRM_WINDOW_MS;
}

/** A new confirm may start: none in the last window (a clock that went
 *  backwards counts as long ago, so it cannot block for ever). */
export function canStartConfirm(lastAt: number, now: number): boolean {
  return lastAt <= 0 || now < lastAt || now - lastAt >= HEADLESS_CONFIRM_WINDOW_MS;
}
