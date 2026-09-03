// What to do about the Live Activity when the native engine opens a recording.
//
// The in-app switch (Settings > Notifications > "Live Activity",
// autoTripLiveActivity) stopped the LOCAL start but not the push: the
// push-to-start request was sent after the preference-gated start returned,
// so a driver who had turned it off still had the server ask Apple to show
// one (found 3 Sep 2026). One decision, made once, covers both paths.

export type AutoTripLiveActivityAction = "suppressed_by_pref" | "local_started" | "push_requested";

export function decideAutoTripLiveActivity(input: {
  /** notification preference autoTripLiveActivity (default true). */
  prefEnabled: boolean;
  /** Whether a local start succeeded (only attempted when prefEnabled). */
  localStarted: boolean;
}): AutoTripLiveActivityAction {
  if (!input.prefEnabled) return "suppressed_by_pref";
  return input.localStarted ? "local_started" : "push_requested";
}
