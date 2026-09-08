import { describe, it, expect } from "vitest";
import { decideProgressPush, PROGRESS_PUSH_INTERVAL_MS } from "../liveActivity/progressRule";

const T = 1_788_500_000_000;

describe("decideProgressPush", () => {
  it("pushes on the first fix of a recording", () => {
    expect(decideProgressPush({ now: T, lastPushAt: null })).toBe(true);
  });

  it("holds inside the interval", () => {
    expect(decideProgressPush({ now: T, lastPushAt: T - 1000 })).toBe(false);
    expect(decideProgressPush({ now: T, lastPushAt: T - PROGRESS_PUSH_INTERVAL_MS + 1 })).toBe(false);
  });

  it("pushes once the interval has elapsed", () => {
    expect(decideProgressPush({ now: T, lastPushAt: T - PROGRESS_PUSH_INTERVAL_MS })).toBe(true);
    expect(decideProgressPush({ now: T, lastPushAt: T - 60_000 })).toBe(true);
  });
});
