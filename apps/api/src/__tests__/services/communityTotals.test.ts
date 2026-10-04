import { describe, it, expect } from "vitest";
import { roundDriversDown, roundMilesDown } from "../../services/communityTotals.js";

describe("roundMilesDown", () => {
  it("rounds a million-plus down to the nearest 100,000", () => {
    expect(roundMilesDown(1_312_480.6)).toBe(1_300_000);
    expect(roundMilesDown(1_000_000)).toBe(1_000_000);
  });
  it("rounds tens of thousands down to the nearest 10,000", () => {
    expect(roundMilesDown(982_422)).toBe(980_000);
    expect(roundMilesDown(10_000)).toBe(10_000);
  });
  it("rounds small figures down to the nearest 100", () => {
    expect(roundMilesDown(9_999)).toBe(9_900);
  });
  it("never goes negative or NaN", () => {
    expect(roundMilesDown(0)).toBe(0);
    expect(roundMilesDown(-5)).toBe(0);
    expect(roundMilesDown(Number.NaN)).toBe(0);
  });
});

describe("roundDriversDown", () => {
  it("rounds hundreds down to the nearest 50", () => {
    expect(roundDriversDown(811)).toBe(800);
    expect(roundDriversDown(663)).toBe(650);
    expect(roundDriversDown(100)).toBe(100);
  });
  it("rounds thousands down to the nearest 100", () => {
    expect(roundDriversDown(1_249)).toBe(1_200);
  });
  it("rounds small counts down to the nearest 10", () => {
    expect(roundDriversDown(99)).toBe(90);
    expect(roundDriversDown(0)).toBe(0);
    expect(roundDriversDown(Number.NaN)).toBe(0);
  });
});
