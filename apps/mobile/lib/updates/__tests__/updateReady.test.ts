import { describe, expect, it } from "vitest";
import { CHECK_EVERY_MS, shouldCheckForUpdate, showUpdateBanner } from "../updateReadyRules";

describe("update-ready banner (Tom, 9 Oct 2026: still on the 7 Oct update hours after the odometer shipped)", () => {
  it("checks on first launch, then at most every 30 minutes", () => {
    const now = Date.parse("2026-10-09T16:32:00Z");
    expect(shouldCheckForUpdate(null, now)).toBe(true);
    expect(shouldCheckForUpdate(now - 60_000, now)).toBe(false);
    expect(shouldCheckForUpdate(now - CHECK_EVERY_MS, now)).toBe(true);
  });

  it("shows once an update is waiting", () => {
    expect(showUpdateBanner({ updateWaiting: true, recording: false, dismissed: false })).toBe(true);
    expect(showUpdateBanner({ updateWaiting: false, recording: false, dismissed: false })).toBe(false);
  });

  it("never shows while anything is recording, so a restart can't cut off a trip", () => {
    expect(showUpdateBanner({ updateWaiting: true, recording: true, dismissed: false })).toBe(false);
  });

  it("stays hidden after Later until the app comes back to the screen", () => {
    expect(showUpdateBanner({ updateWaiting: true, recording: false, dismissed: true })).toBe(false);
  });
});
