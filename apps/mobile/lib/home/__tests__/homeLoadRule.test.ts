import { describe, expect, it } from "vitest";
import {
  HOME_LOADING_STUCK_MS,
  SHIFT_GPS_RESUME_STUCK_MS,
  loadingIsStuck,
  resumeMayStart,
  resumeMayTakeLock,
  afterResume,
  tierBecameUsable,
  stepUpShouldResume,
  loadingStuckEvent,
  renderErrorEvent,
  shouldResumeShiftGps,
} from "../homeLoadRule";

describe("shouldResumeShiftGps", () => {
  it("resumes only with no task running and location already granted", () => {
    expect(shouldResumeShiftGps({ trackingActive: false, foregroundGranted: true })).toBe(true);
  });
  it("never resumes over a running task", () => {
    expect(shouldResumeShiftGps({ trackingActive: true, foregroundGranted: true })).toBe(false);
  });
  it("leaves a phone without permission to the blocker card, never prompts", () => {
    expect(shouldResumeShiftGps({ trackingActive: false, foregroundGranted: false })).toBe(false);
  });
});

describe("resumeMayStart", () => {
  const now = 1_800_000_000_000;
  it("starts when none is running", () => {
    expect(resumeMayStart(null, now)).toBe(true);
  });
  it("waits for a running one", () => {
    expect(resumeMayStart(now - SHIFT_GPS_RESUME_STUCK_MS + 1, now)).toBe(false);
  });
  it("takes over from one that never finished", () => {
    expect(resumeMayStart(now - SHIFT_GPS_RESUME_STUCK_MS, now)).toBe(true);
  });
});

describe("resumeMayTakeLock", () => {
  it("takes a free lock or its own", () => {
    expect(resumeMayTakeLock(null, "A")).toBe(true);
    expect(resumeMayTakeLock("A", "A")).toBe(true);
  });
  it("never takes a Start Trip's or another shift's", () => {
    expect(resumeMayTakeLock("__quick_trip__", "A")).toBe(false);
    expect(resumeMayTakeLock("B", "A")).toBe(false);
  });
});

describe("afterResume", () => {
  it("keeps the lock while the shift is still the open one", () => {
    expect(afterResume("A", "A", "A", true)).toBe("keep");
  });
  it("releases a ghost lock written after End Shift", () => {
    expect(afterResume("A", "A", null, false)).toBe("release");
  });
  it("keeps a shift the phone still has open even if Home briefly lost it", () => {
    expect(afterResume("A", "A", null, true)).toBe("keep");
  });
  it("releases a shift End Shift is ending, though its row still says active", () => {
    expect(afterResume("A", "A", null, true, true)).toBe("release");
    expect(afterResume("A", "A", "A", true, true)).toBe("release");
  });
  it("still restores a newer shift while the old one is being ended", () => {
    expect(afterResume("A", "A", "B", true, true)).toBe("release_and_resume_current");
  });
  it("leaves someone else's lock even while ending", () => {
    expect(afterResume(null, "A", null, true, true)).toBe("leave");
  });
  it("releases and gives a newer shift its GPS back when A overwrote B's lock", () => {
    expect(afterResume("A", "A", "B", false)).toBe("release_and_resume_current");
  });
  it("leaves a lock that is not this shift's alone", () => {
    expect(afterResume("B", "A", "B", false)).toBe("leave");
    expect(afterResume(null, "A", null, false)).toBe("leave");
    expect(afterResume("__quick_trip__", "A", null, false)).toBe("leave");
  });
});

describe("stepUpShouldResume", () => {
  const base = { tierBecameUsable: true, hasOpenShift: true, startingShift: false, lockStarting: false };
  it("resumes an open shift once location becomes usable", () => {
    expect(stepUpShouldResume(base)).toBe(true);
  });
  it("stands aside while Start Shift is under way", () => {
    expect(stepUpShouldResume({ ...base, startingShift: true })).toBe(false);
    expect(stepUpShouldResume({ ...base, lockStarting: true })).toBe(false);
  });
  it("needs both the step-up and an open shift", () => {
    expect(stepUpShouldResume({ ...base, tierBecameUsable: false })).toBe(false);
    expect(stepUpShouldResume({ ...base, hasOpenShift: false })).toBe(false);
  });
});

describe("tierBecameUsable", () => {
  it("only on the step from none", () => {
    expect(tierBecameUsable("none", "foreground")).toBe(true);
    expect(tierBecameUsable("none", "always")).toBe(true);
    expect(tierBecameUsable("foreground", "always")).toBe(false);
    expect(tierBecameUsable(null, "always")).toBe(false);
    expect(tierBecameUsable("none", "none")).toBe(false);
  });
});

describe("loadingIsStuck", () => {
  it("steps in only while still loading, from the limit on", () => {
    expect(loadingIsStuck(true, HOME_LOADING_STUCK_MS)).toBe(true);
    expect(loadingIsStuck(true, HOME_LOADING_STUCK_MS - 1)).toBe(false);
    expect(loadingIsStuck(false, HOME_LOADING_STUCK_MS * 2)).toBe(false);
  });
});

describe("events", () => {
  it("stuck event carries the stage and nothing else personal", () => {
    expect(loadingStuckEvent("fetch", true, "android")).toEqual({ stage: "fetch", hasActiveShift: true, platform: "android" });
  });
  it("render error is cut short", () => {
    const e = renderErrorEvent(new TypeError("x".repeat(400)), " in Home\n" + "y".repeat(900), "/(tabs)/dashboard");
    expect(e.message.startsWith("TypeError: x")).toBe(true);
    expect(e.message).toHaveLength(200);
    expect(e.componentStack).toHaveLength(500);
    expect(e.componentStack.startsWith("in Home")).toBe(true);
    expect(e.route).toBe("/(tabs)/dashboard");
  });
  it("render error copes with odd throws", () => {
    expect(renderErrorEvent("boom", undefined, null)).toEqual({ message: "boom", componentStack: "", route: null });
    expect(renderErrorEvent({ weird: true }, null, null).message).toBe("unknown");
  });
});
