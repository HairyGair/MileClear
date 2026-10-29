// Home's first load during an open shift, kept pure so it can be tested
// (app/(tabs)/dashboard.tsx does the work).
//
// Rich, 29 Oct 2026 (Android, OUKITEL): Google Play updated MileClear to 1.4.0
// in the middle of his shift, and Home stayed on its loading skeleton until he
// reinstalled. loadData only cleared `loading` in its finally, after the "give
// an open shift its GPS back" block, and that block awaited a permission
// prompt chain and the native engine. One of those never answered, so Home
// never showed the shift, its End Shift button or anything else. Reinstalling
// then threw the shift's stored route away (0 trips for 05:49-13:38).
//
// Now Home shows as soon as its data is in, the GPS block runs on its own and
// never prompts, and a backstop clears a load that is still stuck.

/** A load still not finished after this is reported and cleared. */
export const HOME_LOADING_STUCK_MS = 12_000;

/** Where loadData last got to, for the stuck report. */
export type HomeLoadStage =
  | "start"
  | "auto_end_check"
  | "fetch"
  | "auto_ended_check"
  | "shown"
  | "done";

/**
 * Whether Home should give an open shift its GPS back. Only with no task
 * running and foreground location already granted: Home never asks for
 * permission on its own (the blocker card and the Start Shift flow do), so a
 * phone without it is left to those.
 */
export function shouldResumeShiftGps(i: { trackingActive: boolean; foregroundGranted: boolean }): boolean {
  return !i.trackingActive && i.foregroundGranted;
}

/** A GPS give-back still running after this is taken as stuck, and a new one may start. */
export const SHIFT_GPS_RESUME_STUCK_MS = 60_000;

/**
 * One give-back at a time (loadData runs on every focus), but one that never
 * finished must not block every later one for the rest of the shift.
 */
export function resumeMayStart(runningSinceMs: number | null, nowMs: number): boolean {
  return runningSinceMs == null || nowMs - runningSinceMs >= SHIFT_GPS_RESUME_STUCK_MS;
}

/** Whether the backstop should step in: still loading when the timer fires. */
export function loadingIsStuck(stillLoading: boolean, elapsedMs: number): boolean {
  return stillLoading && elapsedMs >= HOME_LOADING_STUCK_MS;
}

/** The coordinate-free event a stuck load sends. */
export function loadingStuckEvent(stage: HomeLoadStage, hasActiveShift: boolean, platform: string) {
  return { stage, hasActiveShift, platform };
}

/** The coordinate-free event a render crash sends: short message and stack only. */
export function renderErrorEvent(
  error: unknown,
  componentStack: string | null | undefined,
  route: string | null
): { message: string; componentStack: string; route: string | null } {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : "unknown";
  return {
    message: message.slice(0, 200),
    componentStack: (componentStack ?? "").trim().slice(0, 500),
    route,
  };
}
