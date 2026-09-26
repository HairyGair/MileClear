import { describe, it, expect } from "vitest";
import { shouldStopNativeEngine } from "../nativeStopRule";

describe("shouldStopNativeEngine", () => {
  it("stops an engine this process started, forced or not", () => {
    expect(shouldStopNativeEngine({ startedHere: true, force: false, sdkEnabled: null })).toBe(true);
    expect(shouldStopNativeEngine({ startedHere: true, force: true, sdkEnabled: false })).toBe(true);
  });

  it("keeps the old meaning for unforced callers: nothing started here, nothing to undo", () => {
    expect(shouldStopNativeEngine({ startedHere: false, force: false, sdkEnabled: true })).toBe(false);
    expect(shouldStopNativeEngine({ startedHere: false, force: false, sdkEnabled: null })).toBe(false);
  });

  it("logout stops an SDK running natively that this launch never started (Peter Hazelgrove, 25 Sep 2026)", () => {
    expect(shouldStopNativeEngine({ startedHere: false, force: true, sdkEnabled: true })).toBe(true);
  });

  it("logout stops when the SDK state is unknown", () => {
    expect(shouldStopNativeEngine({ startedHere: false, force: true, sdkEnabled: null })).toBe(true);
  });

  it("skips a forced stop only when the SDK says it is already off", () => {
    expect(shouldStopNativeEngine({ startedHere: false, force: true, sdkEnabled: false })).toBe(false);
  });
});
