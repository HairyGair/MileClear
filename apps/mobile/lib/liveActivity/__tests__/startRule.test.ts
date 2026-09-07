import { describe, it, expect } from "vitest";
import { decideLiveActivityStart } from "../startRule";

describe("decideLiveActivityStart", () => {
  it("starts one when nothing is running", () => {
    expect(decideLiveActivityStart({ existingId: null, existingPhase: null })).toEqual({
      action: "start",
      reason: "none_running",
    });
  });

  it("adopts the activity a push-to-start already put on screen", () => {
    expect(decideLiveActivityStart({ existingId: "abc", existingPhase: "active" })).toEqual({
      action: "adopt",
      activityId: "abc",
    });
  });

  it("adopts when the phase cannot be read, rather than destroying it", () => {
    expect(decideLiveActivityStart({ existingId: "abc", existingPhase: null })).toEqual({
      action: "adopt",
      activityId: "abc",
    });
  });

  it("replaces one whose drive has finished", () => {
    for (const phase of ["ended", "saving", "too_short", "no_signal", "classified_business"]) {
      expect(decideLiveActivityStart({ existingId: "abc", existingPhase: phase })).toEqual({
        action: "start",
        reason: "existing_finished",
      });
    }
  });
});
