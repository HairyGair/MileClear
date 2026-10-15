// End trip, from the recording screen: the decision part. The screen hands in
// the real finalize and a read of the recording flag; tests hand in fakes. No
// React Native, no SQLite, so it runs under vitest.
//
// Tom, 14 Oct 2026 (iPhone): a 46-minute automatic recording was open when he
// opened the app. "The trip seems to record, then doesn't give me the ability
// to end it." He went between the recording screen, Add trip and Trips for
// four minutes and no trip was saved. End trip awaited finalizeAutoTrip() and
// then ALWAYS went to Trips, but finalize:
//   * returns at once when another finalize is already running (the app-open
//     sweep, the stop timer), so End moved on while nothing had been saved yet;
//   * keeps the recording open when the save throws (the fixes stay on the
//     phone for a retry) and only says so in the phone's own log.
// So End now waits for a finalize already running, runs its own if the
// recording is still open, and then reads the recording flag. Only a closed
// recording goes to Trips; an open one stays on screen with the reason.

import { describeError } from "../api/apiError";

export interface EndTripDeps {
  /** A finalize pass is running right now. */
  isFinalizeInFlight: () => boolean;
  /** Settles when that pass has finished. Never rejects. */
  waitForFinalize: () => Promise<void>;
  /** finalizeAutoTrip(). */
  finalize: () => Promise<void>;
  /** Is the recording still open (auto_recording_active)? */
  isRecordingOpen: () => Promise<boolean>;
  /** Why the last pass kept the recording open, or null. */
  lastFinalizeFailure: () => unknown;
  /** Resolves after `ms`: the longest End waits before handing back. */
  sleep: (ms: number) => Promise<void>;
}

/** How long End keeps its spinner before saying "still saving". Finalize is
 *  network-bound (map matching, addresses, the upload) and keeps going in the
 *  background after this; the screen goes to Trips by itself when it closes. */
export const END_TRIP_WAIT_MS = 45_000;

export type EndTripOutcome =
  /** The recording is closed: go to Trips. */
  | { kind: "closed" }
  /** Still open after the save: stay, say why. */
  | { kind: "still_open"; error: unknown }
  /** The save is still running after END_TRIP_WAIT_MS: stay, say so. */
  | { kind: "still_saving" };

async function runEnd(deps: EndTripDeps): Promise<unknown> {
  let thrown: unknown = null;
  try {
    // A pass already running owns the buffer: let it finish rather than
    // racing it (finalizeAutoTrip would return straight away anyway).
    if (deps.isFinalizeInFlight()) await deps.waitForFinalize();
    if (await deps.isRecordingOpen()) {
      await deps.finalize();
      // Another pass can have taken the guard between the read above and
      // finalize's own check, in which case finalize returned at once.
      if (deps.isFinalizeInFlight()) await deps.waitForFinalize();
    }
  } catch (err) {
    thrown = err;
  }
  return thrown;
}

export async function endRecordingNow(deps: EndTripDeps): Promise<EndTripOutcome> {
  const TIMED_OUT = Symbol("timed_out");
  const result = await Promise.race([
    runEnd(deps),
    deps.sleep(END_TRIP_WAIT_MS).then(() => TIMED_OUT),
  ]);
  if (result === TIMED_OUT) return { kind: "still_saving" };
  let open: boolean;
  try {
    open = await deps.isRecordingOpen();
  } catch {
    // Cannot tell: staying on the recording screen is the safe side.
    open = true;
  }
  if (!open) return { kind: "closed" };
  return { kind: "still_open", error: result ?? deps.lastFinalizeFailure() ?? null };
}

const KEPT_SAFE = "It's kept safe on your phone. Try again in a minute.";

/** What the driver is told when End could not close the recording. */
export function endTripFailureCopy(outcome: Exclude<EndTripOutcome, { kind: "closed" }>): {
  title: string;
  message: string;
} {
  if (outcome.kind === "still_saving") {
    return {
      title: "Still saving this trip",
      message: "This is taking longer than usual. The trip is kept safe on your phone and will appear in Trips when it's done.",
    };
  }
  const title = "Couldn't save this trip yet";
  if (outcome.error == null) return { title, message: KEPT_SAFE };
  // savedLocally false: the offline wording must not promise an upload that
  // has not been queued. The reason comes first, then what happens next.
  const { message } = describeError(outcome.error, title, { savedLocally: false });
  return { title, message: `${message}\n\n${KEPT_SAFE}` };
}
