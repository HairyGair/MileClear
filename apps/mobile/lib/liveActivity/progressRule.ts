// How often the native engine's location stream feeds the Live Activity.
//
// Until 8 Sep 2026 it never did: the only running-distance updates lived in
// the old JS location task and in the in-app screens, so on the native
// engine (every iOS phone since build 73) an activity showed "0.0 mi, 0 mph"
// for the whole drive while its clock ran. Anthony's own lock screen, ten
// minutes into a drive, was the proof. Native fixes arrive every few
// seconds; the widget does not need them all.

export const PROGRESS_PUSH_INTERVAL_MS = 15_000;

export interface ProgressPushInput {
  now: number;
  lastPushAt: number | null;
}

export function decideProgressPush(input: ProgressPushInput): boolean {
  if (input.lastPushAt == null) return true;
  return input.now - input.lastPushAt >= PROGRESS_PUSH_INTERVAL_MS;
}
