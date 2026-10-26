import { describe, it, expect, beforeEach } from "vitest";
import { clearPurchaseSource, notePaywallSource, purchaseSource } from "../purchaseSource";

describe("purchaseSource", () => {
  beforeEach(() => clearPurchaseSource());

  it("is the store when no Pro screen has opened", () => {
    expect(purchaseSource()).toBe("store");
  });

  it("is the last Pro screen's source for half an hour", () => {
    notePaywallSource("exports", 1_000);
    notePaywallSource("Journey Map", 2_000);
    expect(purchaseSource(2_000 + 30 * 60 * 1000)).toBe("Journey Map");
    expect(purchaseSource(2_001 + 30 * 60 * 1000)).toBe("store");
  });

  it("names the generic Pro screen when it opened with no source", () => {
    notePaywallSource(undefined, 0);
    expect(purchaseSource(0)).toBe("pro_screen");
  });

  it("only produces labels the server keeps", () => {
    for (const src of ["5th_trip", "Sort by work hours", "self-assessment", "5 more notification types"]) {
      notePaywallSource(src, 0);
      expect(purchaseSource(0)).toMatch(/^[\w .-]{1,64}$/);
    }
    clearPurchaseSource();
    expect(purchaseSource()).toMatch(/^[\w .-]{1,64}$/);
  });
});
