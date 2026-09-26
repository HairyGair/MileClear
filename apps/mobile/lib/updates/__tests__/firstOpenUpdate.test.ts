import { describe, expect, it } from "vitest";
import { FIRST_OPEN_WINDOW_MS, firstOpenPrecheck, firstOpenRestartDecision } from "../firstOpenUpdate";

const base = { isEnabled: true, isEmbeddedLaunch: true, appActive: true, recording: false, msSinceLaunch: 4000 };

describe("first open after an App Store update", () => {
  it("restarts into the downloaded update on Chris Saunders' case: embedded launch, on screen, idle, early", () => {
    expect(firstOpenRestartDecision(base)).toEqual({ restart: true });
  });

  it("does nothing on an ordinary launch that is already running an update", () => {
    expect(firstOpenPrecheck({ isEnabled: true, isEmbeddedLaunch: false })).toBe("not_embedded");
    expect(firstOpenRestartDecision({ ...base, isEmbeddedLaunch: false })).toEqual({ restart: false, reason: "not_embedded" });
  });

  it("does nothing where updates are off (Expo Go, dev)", () => {
    expect(firstOpenPrecheck({ isEnabled: false, isEmbeddedLaunch: true })).toBe("updates_disabled");
  });

  it("never restarts in the background, mid-recording, or after the first minute", () => {
    expect(firstOpenRestartDecision({ ...base, appActive: false })).toEqual({ restart: false, reason: "background" });
    expect(firstOpenRestartDecision({ ...base, recording: true })).toEqual({ restart: false, reason: "recording" });
    expect(firstOpenRestartDecision({ ...base, msSinceLaunch: FIRST_OPEN_WINDOW_MS + 1 })).toEqual({ restart: false, reason: "too_late" });
    expect(firstOpenRestartDecision({ ...base, msSinceLaunch: FIRST_OPEN_WINDOW_MS })).toEqual({ restart: true });
  });
});
