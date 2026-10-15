import { describe, it, expect } from "vitest";
import { endRecordingNow, endTripFailureCopy, END_TRIP_WAIT_MS, type EndTripDeps } from "../endTrip";

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
    expect(outcome).toEqual({ kind: "still_open", error: failure });
  });

  it("stays on screen when finalize throws and the recording is still open", async () => {
    const r = fakeRecording({ saveWorks: false });
    const boom = new Error("geocode crashed");
    r.deps.finalize = async () => {
      throw boom;
    };
    expect(await endRecordingNow(r.deps)).toEqual({ kind: "still_open", error: boom });
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

describe("endTripFailureCopy", () => {
  it("says the trip is kept and to try again, with the real reason first", () => {
    const copy = endTripFailureCopy({ kind: "still_open", error: new Error("database is locked") });
    expect(copy.title).toBe("Couldn't save this trip yet");
    expect(copy.message).toBe("database is locked\n\nIt's kept safe on your phone. Try again in a minute.");
  });

  it("does not promise an upload when the phone was offline", () => {
    const copy = endTripFailureCopy({ kind: "still_open", error: new Error("Network error") });
    expect(copy.message).not.toMatch(/upload automatically/);
    expect(copy.message).toMatch(/kept safe on your phone/);
  });

  it("works without a reason, and for a save still running", () => {
    expect(endTripFailureCopy({ kind: "still_open", error: null }).message).toBe(
      "It's kept safe on your phone. Try again in a minute."
    );
    expect(endTripFailureCopy({ kind: "still_saving" }).title).toBe("Still saving this trip");
  });

  it("uses no em dashes", () => {
    for (const o of [
      { kind: "still_open" as const, error: null },
      { kind: "still_saving" as const },
    ]) {
      const c = endTripFailureCopy(o);
      expect(c.title + c.message).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
    }
  });
});
