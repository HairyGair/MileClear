import { describe, expect, it } from "vitest";
import { planClearTrackAlert } from "../../services/clearTrackAlertRule.js";

describe("planClearTrackAlert (28 Sep 2026: stop the repeat Discord posts)", () => {
  it("leaves out drivers support already emailed, and stays quiet when nobody is new", () => {
    const p = planClearTrackAlert(["james", "lauren", "becky"], new Set(["james", "lauren", "becky"]), new Set());
    expect(p.shouldPost).toBe(false);
    expect(p.handledCount).toBe(3);
    expect(p.showIds.size).toBe(0);
  });

  it("does not re-post drivers #founder already heard about this week", () => {
    const p = planClearTrackAlert(["rachel", "stephen"], new Set(), new Set(["rachel", "stephen"]));
    expect(p.shouldPost).toBe(false);
    expect([...p.showIds]).toEqual(["rachel", "stephen"]);
  });

  it("posts once a new driver appears, listing the unhandled ones", () => {
    const p = planClearTrackAlert(["rachel", "kada", "james"], new Set(["james"]), new Set(["rachel"]));
    expect(p.shouldPost).toBe(true);
    expect([...p.newIds]).toEqual(["kada"]);
    expect([...p.showIds]).toEqual(["rachel", "kada"]);
    expect(p.handledCount).toBe(1);
  });
});
