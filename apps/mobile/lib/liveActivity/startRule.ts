// Whether to adopt the Live Activity that is already running, or start one.
//
// 7 Sep 2026, from the presence probe (OTA #11). During an OPEN recording the
// probe found no Live Activity in 478 of 483 checks, across 203 users, while
// the server had 6,188 push-to-start pushes accepted by Apple. The cause is
// ours, in the native module: `startActivity` ends EVERY existing activity
// before it calls `Activity.request`, and that request always throws in the
// background ("Target is not foreground" — 410 events, 158 users). So the
// sequence within one drive was:
//
//   local start attempt  -> nothing to kill, request fails, push requested
//   push arrives ~3 s    -> the Dynamic Island lights up
//   ANY later start      -> kills the pushed activity, request fails again,
//                           and the server's per-user cooldown refuses a
//                           second push. Dark for the rest of the drive.
//
// At least five call sites can fire a start inside one drive (the native
// engine's motion change, the JS promotion paths, the dashboard's foreground
// catch-up), so the second attempt is the common case, not the rare one.
//
// The rule: if an activity is already on screen and still running, adopt it.
// Callers update it with real distance a moment later, which is what they
// wanted from the start. Only replace one that has finished its business.
//
// Pure so it can be tested without the native module.

/** Phases that mean the activity is still showing a drive in progress. */
export const LIVE_PHASES = ["active"] as const;

export interface StartDecisionInput {
  /** id of an Activity<MileClearAttributes> already running, if any. */
  existingId: string | null;
  /** Its content-state phase, if it could be read. */
  existingPhase: string | null;
  /** Whether the app is in the foreground right now. */
  appActive: boolean;
}

export type StartDecision =
  | { action: "adopt"; activityId: string }
  | { action: "start"; reason: "none_running" | "existing_finished" }
  | { action: "skip"; reason: "background" };

// 8 Sep 2026, from the probe again, after the adopt rule shipped over the
// air (OTA #15/#16): 54 of 91 checks during an open recording still carried
// "Target is not foreground" and no activity. The adopt rule only helps when
// the JS layer can SEE the pushed activity; the binary's native startActivity
// still ends every activity before its own request, which cannot succeed in
// the background on any build before 89. So from the background we do not
// call it at all. Nothing is lost: a background request never succeeded, and
// the push-to-start path that follows a failed local start is unchanged.
export function decideLiveActivityStart(input: StartDecisionInput): StartDecision {
  const { existingId, existingPhase, appActive } = input;
  if (existingId) {
    // A phase we cannot read is treated as live: destroying a running activity
    // is the failure we are fixing, and a stale one costs only a wrong label
    // until the next update, which lands seconds later.
    if (existingPhase == null || (LIVE_PHASES as readonly string[]).includes(existingPhase)) {
      return { action: "adopt", activityId: existingId };
    }
    if (!appActive) return { action: "skip", reason: "background" };
    return { action: "start", reason: "existing_finished" };
  }
  if (!appActive) return { action: "skip", reason: "background" };
  return { action: "start", reason: "none_running" };
}
