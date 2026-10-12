import { describe, expect, it } from "vitest";
import { planClearTrackAlert, planSilentNaming, SILENT_CONFIRM_MS } from "../../services/clearTrackAlertRule.js";

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

describe("planSilentNaming (12 Oct 2026: 80% of silent flags corrected themselves)", () => {
  const NOW = 1_800_000_000_000;
  it("logs a first sighting and does not name the driver", () => {
    const p = planSilentNaming(["a"], new Map(), NOW);
    expect([...p.firstSeenIds]).toEqual(["a"]);
    expect(p.nameIds.size).toBe(0);
  });
  it("leaves out a driver first seen less than 24h ago, without logging again", () => {
    const p = planSilentNaming(["a"], new Map([["a", NOW - SILENT_CONFIRM_MS + 60_000]]), NOW);
    expect(p.nameIds.size).toBe(0);
    expect(p.firstSeenIds.size).toBe(0);
    expect(p.waitingCount).toBe(1);
  });
  it("names a driver first seen 24h or more ago", () => {
    const p = planSilentNaming(["a"], new Map([["a", NOW - SILENT_CONFIRM_MS]]), NOW);
    expect([...p.nameIds]).toEqual(["a"]);
  });
  it("handles a mixed list and duplicate ids", () => {
    const p = planSilentNaming(["a", "b", "c", "a"], new Map([["a", NOW - 2 * SILENT_CONFIRM_MS], ["b", NOW - 1000]]), NOW);
    expect([...p.nameIds]).toEqual(["a"]);
    expect([...p.firstSeenIds]).toEqual(["c"]);
    expect(p.waitingCount).toBe(1);
  });
});
