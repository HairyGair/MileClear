import { describe, expect, it } from "vitest";
import {
  HOME_LOADING_STUCK_MS,
  SHIFT_GPS_RESUME_STUCK_MS,
  loadingIsStuck,
  resumeMayStart,
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
