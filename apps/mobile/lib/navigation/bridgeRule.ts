// When the foreground bridge may run (PLAN.md F1, decision D1).
//
// The recorder is the GPS source. It goes quiet when the car is parked (the
// engine sleeps), when Automatic trips is off or paused, and on Android during
// a shift (low power). So while the Directions screen is on screen and the
// recorder has sent nothing for 4 seconds, Directions may ask expo-location
// for foreground fixes of its own. It stops as soon as the recorder speaks
// again, the screen loses focus, or the app leaves the foreground. It never
// runs in the background and never touches the recorder or its state.
//
// Pure, so the rule is tested without a phone.

export const BRIDGE_QUIET_MS = 4_000;
/** Once started, the bridge stays on at least this long, so a recorder that
 *  wakes and sleeps again cannot flap it on and off every few seconds.
 *  Losing focus or the foreground still stops it at once. */
export const BRIDGE_MIN_ON_MS = 15_000;

export function bridgeShouldRun(args: {
  /** The Directions screen is focused. */
  focused: boolean;
  /** AppState is "active" (foreground). */
  appActive: boolean;
  nowMs: number;
  /** The last recorder fix, or null if none since listening began. */
  lastRecorderAtMs: number | null;
  /** When the screen started listening. */
  listeningSinceMs: number;
  /** When the bridge started, if it is running. */
  runningSinceMs?: number | null;
}): boolean {
  if (!args.focused || !args.appActive) return false;
  if (args.runningSinceMs != null && args.nowMs - args.runningSinceMs < BRIDGE_MIN_ON_MS) return true;
  const quietSince = args.lastRecorderAtMs ?? args.listeningSinceMs;
  return args.nowMs - quietSince >= BRIDGE_QUIET_MS;
}
