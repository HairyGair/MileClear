import { describe, it, expect } from "vitest";
import { decideLiveActivityStart } from "../startRule";

describe("decideLiveActivityStart", () => {
  it("starts one when nothing is running", () => {
    expect(decideLiveActivityStart({ existingId: null, existingPhase: null, appActive: true })).toEqual({
      action: "start",
      reason: "none_running",
    });
  });

  it("adopts the activity a push-to-start already put on screen", () => {
    expect(decideLiveActivityStart({ existingId: "abc", existingPhase: "active", appActive: true })).toEqual({
      action: "adopt",
      activityId: "abc",
    });
  });

  it("adopts when the phase cannot be read, rather than destroying it", () => {
    expect(decideLiveActivityStart({ existingId: "abc", existingPhase: null, appActive: true })).toEqual({
      action: "adopt",
      activityId: "abc",
    });
  });

  it("replaces one whose drive has finished", () => {
    for (const phase of ["ended", "saving", "too_short", "no_signal", "classified_business"]) {
      expect(decideLiveActivityStart({ existingId: "abc", existingPhase: phase, appActive: true })).toEqual({
        action: "start",
        reason: "existing_finished",
      });
    }
  });
  it("does not touch anything from the background when nothing is running", () => {
    expect(decideLiveActivityStart({ existingId: null, existingPhase: null, appActive: false })).toEqual({
      action: "skip",
      reason: "background",
    });
  });

  it("still adopts a pushed activity from the background", () => {
    expect(decideLiveActivityStart({ existingId: "abc", existingPhase: "active", appActive: false })).toEqual({
      action: "adopt",
      activityId: "abc",
    });
  });

  it("leaves a finished activity alone in the background rather than replacing it", () => {
    expect(decideLiveActivityStart({ existingId: "abc", existingPhase: "ended", appActive: false })).toEqual({
      action: "skip",
      reason: "background",
    });
  });
});
