// Should a stop request actually stop the native SDK? (26 Sep 2026)
//
// stopNativeLocationEngine used to return early unless THIS JS process had
// started the engine. The SDK does not live in the JS process: with
// stopOnTerminate:false and startOnBoot it keeps running natively across
// force-quits and relaunches, and a launch that never called
// startNativeLocationEngine (a background relaunch, a paused phone, a
// logged-out one) has `started === false` while the SDK is fully enabled.
// Peter Hazelgrove signed out and force-quit on 25 Sep 2026 and the SDK kept
// recording at home all day: logout asked for a stop and got a no-op.
//
// `force` is for callers whose promise is "nothing records after this"
// (logout). Other callers keep the old meaning, "undo what this process
// started", so an engine switch or a diagnostics toggle behaves as before.

export interface NativeStopInput {
  /** This JS process started the engine (the module's `started` flag). */
  startedHere: boolean;
  force: boolean;
  /** getState().enabled, or null when unknown (no getState, or it threw). */
  sdkEnabled: boolean | null;
}

export function shouldStopNativeEngine({ startedHere, force, sdkEnabled }: NativeStopInput): boolean {
  if (startedHere) return true;
  if (!force) return false;
  // Unknown is stopped too: stop() on an already-stopped SDK is harmless, a
  // missed stop on a running one is a phone recording after sign-out.
  return sdkEnabled !== false;
}
