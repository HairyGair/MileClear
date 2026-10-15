import { describe, it, expect } from "vitest";
import { endRecordingNow, endTripFailureCopy, endTripQueuedCopy, END_TRIP_WAIT_MS, type EndTripDeps } from "../endTrip";

/** A fake recording + finalize. `saveWorks` decides whether finalize closes it. */
function fakeRecording(opts: { saveWorks: boolean; inFlight?: boolean; failure?: unknown }) {
  const log: string[] = [];
  let open = true;
  let inFlight = opts.inFlight ?? false;
  let settle: () => void = () => {};
  const running = new Promise<void>((resolve) => {
    settle = () => {
      inFlight = false;
      resolve();
    };
  });
  const deps: EndTripDeps = {
    isFinalizeInFlight: () => inFlight,
    waitForFinalize: () => {
      log.push("wait");
      return inFlight ? running : Promise.resolve();
    },
    finalize: async () => {
      log.push("finalize");
      if (opts.saveWorks) open = false;
    },
    isRecordingOpen: async () => open,
    lastFinalizeFailure: () => opts.failure ?? null,
    // Never times out unless a test says so.
    sleep: () => new Promise(() => {}),
    handOff: async () => {
      log.push("handOff");
      open = false;
      return { kind: "closed", queued: 1 };
    },
    previousFailures: 0,
  };
  return {
    deps,
    log,
    /** The running pass finishes, closing the recording if `closes`. */
    finishInFlight(closes: boolean) {
      if (closes) open = false;
      settle();
    },
  };
}

describe("endRecordingNow", () => {
  it("goes to Trips when the save closes the recording", async () => {
    const r = fakeRecording({ saveWorks: true });
    expect(await endRecordingNow(r.deps)).toEqual({ kind: "closed" });
    expect(r.log).toEqual(["finalize"]);
  });

  it("stays on screen, with the reason, when the recording is still open after the save", async () => {
    const failure = new Error("database is locked");
    const r = fakeRecording({ saveWorks: false, failure });
    const outcome = await endRecordingNow(r.deps);
    expect(outcome).toEqual({ kind: "still_open", error: failure, willHandOffNext: true });
  });

  it("stays on screen when finalize throws and the recording is still open", async () => {
    const r = fakeRecording({ saveWorks: false });
    const boom = new Error("geocode crashed");
    r.deps.finalize = async () => {
      throw boom;
    };
    expect(await endRecordingNow(r.deps)).toEqual({ kind: "still_open", error: boom, willHandOffNext: true });
  });

  it("waits for a finalize already running instead of moving on (Tom, 14 Oct)", async () => {
    const r = fakeRecording({ saveWorks: true, inFlight: true });
    let settled = false;
    const pending = endRecordingNow(r.deps).then((o) => {
      settled = true;
      return o;
    });
    await new Promise((res) => setTimeout(res, 10));
    expect(settled).toBe(false);
    expect(r.log).toEqual(["wait"]);
    // The running pass saves the trip: End does not run a second one.
    r.finishInFlight(true);
    expect(await pending).toEqual({ kind: "closed" });
    expect(r.log).toEqual(["wait"]);
  });

  it("tries again itself when the running pass leaves the recording open", async () => {
    const r = fakeRecording({ saveWorks: true, inFlight: true });
    const pending = endRecordingNow(r.deps);
    r.finishInFlight(false);
    expect(await pending).toEqual({ kind: "closed" });
    expect(r.log).toEqual(["wait", "finalize"]);
  });

  it("stays on the recording screen when the flag cannot be read", async () => {
    const r = fakeRecording({ saveWorks: true });
    r.deps.isRecordingOpen = async () => {
      throw new Error("db closed");
    };
    const outcome = await endRecordingNow(r.deps);
    expect(outcome.kind).toBe("still_open");
  });

  it("hands back with 'still saving' when the save runs past the wait", async () => {
    const r = fakeRecording({ saveWorks: true, inFlight: true });
    let waited = 0;
    r.deps.sleep = async (ms) => {
      waited = ms;
    };
    expect(await endRecordingNow(r.deps)).toEqual({ kind: "still_saving" });
    expect(waited).toBe(END_TRIP_WAIT_MS);
  });
});

describe("a save that keeps failing (no dead end)", () => {
  it("first failed End stays on screen and does not hand off yet", async () => {
    const r = fakeRecording({ saveWorks: false });
    const outcome = await endRecordingNow(r.deps);
    expect(outcome.kind).toBe("still_open");
    expect(r.log).not.toContain("handOff");
  });

  it("second failed End hands the recording to the upload queue and goes to Trips", async () => {
    const r = fakeRecording({ saveWorks: false, failure: new Error("database is locked") });
    r.deps.previousFailures = 1;
    expect(await endRecordingNow(r.deps)).toEqual({ kind: "queued", queued: 1 });
    expect(r.log).toEqual(["finalize", "handOff"]);
  });

  it("stays on screen when even the hand-off cannot queue it", async () => {
    const r = fakeRecording({ saveWorks: false });
    r.deps.previousFailures = 1;
    r.deps.handOff = async () => ({ kind: "keep" });
    expect((await endRecordingNow(r.deps)).kind).toBe("still_open");
  });

  it("says 'still saving' when another save holds the recording at hand-off time", async () => {
    const r = fakeRecording({ saveWorks: false });
    r.deps.previousFailures = 1;
    r.deps.handOff = async () => ({ kind: "busy" });
    expect(await endRecordingNow(r.deps)).toEqual({ kind: "still_saving" });
  });
});

describe("endTripFailureCopy", () => {
  it("gives the real reason first, then says pressing End again puts it in Trips", () => {
    const copy = endTripFailureCopy({ kind: "still_open", error: new Error("database is locked"), willHandOffNext: true });
    expect(copy.title).toBe("Couldn't save this trip yet");
    expect(copy.message).toBe(
      "database is locked\n\nIt's kept safe on your phone. Hold End trip again and it will go into Trips to upload on its own."
    );
  });

  it("gives the pass-cap reason in plain words", () => {
    const err = new Error("This recording holds more separate journeys than one save can take, so some are still waiting.");
    expect(endTripFailureCopy({ kind: "still_open", error: err, willHandOffNext: true }).message).toMatch(/more separate journeys/);
  });

  it("does not promise an upload when the phone was offline", () => {
    const copy = endTripFailureCopy({ kind: "still_open", error: new Error("Network error"), willHandOffNext: false });
    expect(copy.message).not.toMatch(/upload automatically/);
    expect(copy.message).toBe(
      "We couldn't reach the server, so nothing was changed. Check your connection and try again.\n\nIt's kept safe on your phone. Try again in a minute."
    );
  });

  it("works without a reason, and for a save still running", () => {
    expect(endTripFailureCopy({ kind: "still_open", error: null, willHandOffNext: false }).message).toBe(
      "It's kept safe on your phone. Try again in a minute."
    );
    expect(endTripFailureCopy({ kind: "still_saving" }).title).toBe("Still saving this trip");
  });

  it("tells the driver a handed-off trip is waiting to upload, or that nothing was a drive", () => {
    expect(endTripQueuedCopy(1).title).toBe("Trip waiting to upload");
    expect(endTripQueuedCopy(2).message).toMatch(/^2 trips are in Trips/);
    expect(endTripQueuedCopy(0).title).toBe("Recording ended");
  });

  it("uses no em dashes", () => {
    const dash = new RegExp(String.fromCharCode(0x2014));
    for (const c of [
      endTripFailureCopy({ kind: "still_open", error: null, willHandOffNext: true }),
      endTripFailureCopy({ kind: "still_open", error: null, willHandOffNext: false }),
      endTripFailureCopy({ kind: "still_saving" }),
      endTripQueuedCopy(0),
      endTripQueuedCopy(1),
      endTripQueuedCopy(3),
    ]) {
      expect(c.title + c.message).not.toMatch(dash);
    }
  });
});

