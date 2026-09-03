import { describe, it, expect } from "vitest";
import {
  decidePresenceProbe,
  PRESENCE_PROBE_COOLDOWN_MS,
  PRESENCE_SIGNAL_WINDOW_MS,
} from "../liveActivity/presenceRule";

const T = 1_788_500_000_000;

describe("decidePresenceProbe", () => {
  it("does nothing when there is no recording and no recent signal", () => {
    expect(decidePresenceProbe({ now: T, recordingOpen: false, lastSignalAt: null, lastProbeAt: null })).toEqual({
      probe: false,
      reason: "no_context",
    });
  });

  it("probes while a recording is open", () => {
    expect(decidePresenceProbe({ now: T, recordingOpen: true, lastSignalAt: null, lastProbeAt: null })).toEqual({
      probe: true,
      context: "recording_open",
    });
  });

  it("probes after a recent start signal even if the recording has closed", () => {
    const d = decidePresenceProbe({ now: T, recordingOpen: false, lastSignalAt: T - 4 * 60_000, lastProbeAt: null });
    expect(d).toEqual({ probe: true, context: "recent_signal" });
  });

  it("treats a signal older than the window as no context", () => {
    const d = decidePresenceProbe({
      now: T,
      recordingOpen: false,
      lastSignalAt: T - PRESENCE_SIGNAL_WINDOW_MS - 1,
      lastProbeAt: null,
    });
    expect(d).toEqual({ probe: false, reason: "no_context" });
  });

  it("ignores a signal timestamp from the future (clock skew)", () => {
    const d = decidePresenceProbe({ now: T, recordingOpen: false, lastSignalAt: T + 60_000, lastProbeAt: null });
    expect(d).toEqual({ probe: false, reason: "no_context" });
  });

  it("holds off inside the cooldown, then probes again", () => {
    const inside = decidePresenceProbe({ now: T, recordingOpen: true, lastSignalAt: null, lastProbeAt: T - 60_000 });
    expect(inside).toEqual({ probe: false, reason: "cooldown" });
    const after = decidePresenceProbe({
      now: T,
      recordingOpen: true,
      lastSignalAt: null,
      lastProbeAt: T - PRESENCE_PROBE_COOLDOWN_MS,
    });
    expect(after).toEqual({ probe: true, context: "recording_open" });
  });

  it("prefers the recording context when both apply", () => {
    const d = decidePresenceProbe({ now: T, recordingOpen: true, lastSignalAt: T - 1000, lastProbeAt: null });
    expect(d).toEqual({ probe: true, context: "recording_open" });
  });
});
