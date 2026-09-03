// When to ask iOS whether a Live Activity is actually on screen.
//
// Background (3 Sep 2026): the server has sent thousands of push-to-start
// requests and Apple accepted them, and we hold no evidence that a single
// one ever displayed. Anthony has never seen one; Sarah Webb reports the
// same with everything enabled. APNs 200 means "accepted", not "shown".
// The only observer that can settle it is the app itself, in the
// foreground, asking ActivityKit for the running activity.
//
// The probe fires on foreground when a recording is open or a start was
// signalled recently, and no more than once per cooldown so a driver who
// checks the app every minute does not flood the event log. Pure so it can
// be tested against the timings that matter.

export const PRESENCE_SIGNAL_WINDOW_MS = 15 * 60 * 1000;
export const PRESENCE_PROBE_COOLDOWN_MS = 5 * 60 * 1000;

export interface PresenceProbeInput {
  now: number;
  /** tracking_state.auto_recording_active, or an active shift. */
  recordingOpen: boolean;
  /** When the app last started (or asked the server to start) an activity. */
  lastSignalAt: number | null;
  /** When the probe last ran. */
  lastProbeAt: number | null;
}

export type PresenceProbeDecision =
  | { probe: true; context: "recording_open" | "recent_signal" }
  | { probe: false; reason: "no_context" | "cooldown" };

export function decidePresenceProbe(input: PresenceProbeInput): PresenceProbeDecision {
  const { now, recordingOpen, lastSignalAt, lastProbeAt } = input;
  const recentSignal = lastSignalAt != null && now - lastSignalAt >= 0 && now - lastSignalAt <= PRESENCE_SIGNAL_WINDOW_MS;
  if (!recordingOpen && !recentSignal) return { probe: false, reason: "no_context" };
  if (lastProbeAt != null && now - lastProbeAt < PRESENCE_PROBE_COOLDOWN_MS) return { probe: false, reason: "cooldown" };
  return { probe: true, context: recordingOpen ? "recording_open" : "recent_signal" };
}
