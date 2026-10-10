import { describe, expect, it } from "vitest";
import { buildBusinessShareData, canIncludeEarnings, createPendingShare } from "../businessShare";

const cur = { businessMiles: 182.4, trips: 6, claimPence: 8208, earningsPence: 12345 };

describe("buildBusinessShareData", () => {
  it("leaves earnings out when the switch is off", () => {
    const d = buildBusinessShareData("Week of 5 Oct 2026", cur, false);
    expect(d.variant).toBe("mileage");
    expect(d.grossEarningsPence).toBe(0);
    expect(d.hmrcDeductionPence).toBe(8208);
    expect(d.businessMiles).toBe(182.4);
  });
  it("adds earnings when the switch is on", () => {
    expect(buildBusinessShareData("x", cur, true).grossEarningsPence).toBe(12345);
  });
  it("copes with unknown claim and earnings", () => {
    const d = buildBusinessShareData("x", { ...cur, claimPence: null, earningsPence: null }, true);
    expect(d.hmrcDeductionPence).toBe(0);
    expect(d.grossEarningsPence).toBe(0);
  });
});

describe("canIncludeEarnings", () => {
  it("is true only with logged earnings", () => {
    expect(canIncludeEarnings({ earningsPence: 1 })).toBe(true);
    expect(canIncludeEarnings({ earningsPence: 0 })).toBe(false);
    expect(canIncludeEarnings({ earningsPence: null })).toBe(false);
  });
});

describe("createPendingShare", () => {
  it("hands the held share over once", () => {
    const p = createPendingShare<string>();
    expect(p.take()).toBeNull();
    p.set("week");
    expect(p.take()).toBe("week");
    // onDismiss and the Android wait must never open two share sheets.
    expect(p.take()).toBeNull();
  });
  it("keeps the latest share chosen", () => {
    const p = createPendingShare<string>();
    p.set("week");
    p.set("month");
    expect(p.take()).toBe("month");
  });
});
