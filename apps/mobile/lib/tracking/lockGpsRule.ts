// The rules for starting a shift's or a Start Trip's own GPS task, kept pure so
// they can be tested (lockGps.ts does the work).
//
// Android refuses to start the task's foreground service once the app is off
// screen: expo-location throws "Foreground service cannot be started when the
// application is in the background" before it registers the task. The start
// was wrapped in a silent catch, so the shift ran on with no GPS until Home
// happened to reload and re-attach it. Atif, 27 Oct 2026: Start Shift at
// 14:53, phone locked five seconds later, nothing recorded until about 15:49,
// two deliveries lost. Over the 30 days before, 12% of Android shifts saved no
// trip (iPhone 3%) and 13% saved their first trip an hour or more in (5%).

export type LockKind = "shift" | "quick_trip";

export const LOCK_GPS_WARNING_ID = "lock-gps-not-recording";

/** Minimum gap between two "not recording" warnings for the same lock. */
export const LOCK_GPS_WARNING_GAP_MS = 30 * 60 * 1000;

/**
 * What the `active_shift_id` lock is recording, or null when nothing should
 * have the task running: no lock, or the Arrived-pending marker (its trail is
 * finished and only waits to be saved).
 */
export function lockKindOf(
  lockValue: string | null | undefined,
  quickTripId: string,
  arrivedPendingId: string
): LockKind | null {
  if (!lockValue || lockValue === arrivedPendingId) return null;
  return lockValue === quickTripId ? "quick_trip" : "shift";
}

/** A short, coordinate-free description of why the start failed, for the event. */
export function gpsStartErrorText(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/in the background/i.test(message)) return "not_on_screen";
  if (/permissions were not found/i.test(message)) return "manifest_permission";
  if (/background.*(unauthori[sz]ed|permission)/i.test(message)) return "no_background_permission";
  if (typeof code === "string" && code) return code.slice(0, 80);
  return message ? message.slice(0, 120) : "unknown";
}

/** Whether a new warning may be shown, given when the last one was. */
export function warningDue(lastWarnedAtMs: number | null, nowMs: number): boolean {
  return lastWarnedAtMs == null || !Number.isFinite(lastWarnedAtMs) || nowMs - lastWarnedAtMs >= LOCK_GPS_WARNING_GAP_MS;
}

/** The notification shown while a shift or Start Trip has no GPS. */
export function lockGpsWarningCopy(kind: LockKind): { title: string; body: string } {
  return kind === "shift"
    ? { title: "Your shift isn't recording", body: "Open MileClear to start recording your shift's trips." }
    : { title: "Your trip isn't recording", body: "Open MileClear to start recording this trip." };
}
