/**
 * The reap event names the recording it ended (1 Nov 2026): the openId on the
 * newest trip.signal_start, if that signal belongs to the reaped flag.
 */
import { describe, it, expect } from "vitest";

import { pickSignalOpen } from "../../jobs/recordingWatchdog.js";

const MIN = 60 * 1000;
const START = new Date("2026-11-01T09:00:00Z");

describe("pickSignalOpen", () => {
  it("returns the newest signal's openId when it matches the flag", () => {
    const signals = [
      { createdAt: new Date(START.getTime() + MIN), metadata: { openId: "onew123abc" } },
      { createdAt: new Date(START.getTime() - 5 * 60 * MIN), metadata: { openId: "oold123abc" } },
    ];
    expect(pickSignalOpen(signals, START)).toEqual({
      openId: "onew123abc",
      signalAt: new Date(START.getTime() + MIN).toISOString(),
    });
  });

  it("skips signals from builds that sent no openId and takes the next", () => {
    const signals = [
      { createdAt: new Date(START.getTime() + 2 * MIN), metadata: { activityType: "trip" } },
      { createdAt: new Date(START.getTime() + MIN), metadata: { openId: "onew123abc" } },
    ];
    expect(pickSignalOpen(signals, START)?.openId).toBe("onew123abc");
  });

  it("refuses a signal from an earlier recording", () => {
    const signals = [{ createdAt: new Date(START.getTime() - 3 * 60 * MIN), metadata: { openId: "oold123abc" } }];
    expect(pickSignalOpen(signals, START)).toBeNull();
  });

  it("accepts the newest signal when the flag has no start time", () => {
    const signals = [{ createdAt: START, metadata: { openId: "onew123abc" } }];
    expect(pickSignalOpen(signals, null)?.openId).toBe("onew123abc");
  });

  it("returns null for no signals or unreadable metadata", () => {
    expect(pickSignalOpen([], START)).toBeNull();
    expect(pickSignalOpen([{ createdAt: START, metadata: null }], START)).toBeNull();
    expect(pickSignalOpen([{ createdAt: START, metadata: [] }], START)).toBeNull();
  });
});
