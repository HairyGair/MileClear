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
//
// A save that fails every time must not leave the driver stuck on that
// message (15 Oct 2026 review). On the second failed End for the same
// recording, the recording is handed to the upload queue by the same rules as
// the rescue on open (rescueHandoff.ts) and closed: the trip is in Trips,
// waiting to upload.

import { describeError } from "../api/apiError";

export type HandOffResult = { kind: "busy" } | { kind: "keep" } | { kind: "closed"; queued: number };

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
  /** detection.ts handOffOpenRecordingToQueue(). */
  handOff: () => Promise<HandOffResult>;
  /** Earlier End presses on THIS recording that left it open. */
  previousFailures: number;
}

/** How long End keeps its spinner before saying "still saving". Finalize is
 *  network-bound (map matching, addresses, the upload) and keeps going in the
 *  background after this; the screen goes to Trips by itself when it closes. */
export const END_TRIP_WAIT_MS = 45_000;

/** Failed End presses on one recording before it is handed to the queue. */
export const HAND_OFF_AFTER_FAILURES = 1;

export type EndTripOutcome =
  /** The recording is closed: go to Trips. */
  | { kind: "closed" }
  /** The save kept failing, so the recording went to the upload queue and
   *  is closed: go to Trips, say it is waiting to upload. */
  | { kind: "queued"; queued: number }
  /** Still open after the save: stay, say why. */
  | { kind: "still_open"; error: unknown; willHandOffNext: boolean }
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

async function readOpen(deps: EndTripDeps): Promise<boolean> {
  try {
    return await deps.isRecordingOpen();
  } catch {
    // Cannot tell: staying on the recording screen is the safe side.
    return true;
  }
}

export async function endRecordingNow(deps: EndTripDeps): Promise<EndTripOutcome> {
  const TIMED_OUT = Symbol("timed_out");
  const result = await Promise.race([
    runEnd(deps),
    deps.sleep(END_TRIP_WAIT_MS).then(() => TIMED_OUT),
  ]);
  if (result === TIMED_OUT) return { kind: "still_saving" };
  if (!(await readOpen(deps))) return { kind: "closed" };
  const error = result ?? deps.lastFinalizeFailure() ?? null;
  if (deps.previousFailures >= HAND_OFF_AFTER_FAILURES) {
    let handed: HandOffResult = { kind: "keep" };
    try {
      handed = await deps.handOff();
    } catch {}
    if (handed.kind === "closed" && !(await readOpen(deps))) {
      return { kind: "queued", queued: handed.queued };
    }
    if (handed.kind === "busy") return { kind: "still_saving" };
  }
  return {
    kind: "still_open",
    error,
    willHandOffNext: deps.previousFailures + 1 >= HAND_OFF_AFTER_FAILURES,
  };
}

/** What the driver is told when End could not close the recording. */
export function endTripFailureCopy(outcome: Extract<EndTripOutcome, { kind: "still_open" | "still_saving" }>): {
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
  const next = outcome.willHandOffNext
    ? "It's kept safe on your phone. Hold End trip again and it will go into Trips to upload on its own."
    : "It's kept safe on your phone. Try again in a minute.";
  if (outcome.error == null) return { title, message: next };
  // savedLocally false: the offline wording must not promise an upload that
  // has not been queued. The reason comes first, then what happens next.
  const { message } = describeError(outcome.error, title, { savedLocally: false });
  return { title, message: `${message}\n\n${next}` };
}

/** What the driver is told when the recording went to the upload queue. */
export function endTripQueuedCopy(queued: number): { title: string; message: string } {
  if (queued === 0) {
    return {
      title: "Recording ended",
      message: "This recording didn't look like a drive (too short, a walk, or GPS drift), so no trip was added.",
    };
  }
  return {
    title: "Trip waiting to upload",
    message:
      queued === 1
        ? "It's in Trips now and will finish uploading on its own. You don't need to do anything."
        : `${queued} trips are in Trips now and will finish uploading on their own. You don't need to do anything.`,
  };
}
