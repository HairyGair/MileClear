import { describe, it, expect } from "vitest";
import { claimableWhere, isClaimableTrip } from "../../lib/claimableTrips.js";

const CLAIMABLE = {
  OR: [{ vehicleId: null }, { vehicle: { is: { providedByOthers: false } } }],
};

describe("claimableWhere", () => {
  it("adds the claimable filter and keeps the rest of the where", () => {
    expect(claimableWhere({ userId: "u1", classification: "business" })).toEqual({
      userId: "u1",
      classification: "business",
      AND: [CLAIMABLE],
    });
  });

  it("keeps an existing OR untouched (trips with no vehicle stay in)", () => {
    const where = claimableWhere({ OR: [{ platformTag: "uber" }, { platformTag: null }] });
    expect(where.OR).toEqual([{ platformTag: "uber" }, { platformTag: null }]);
    expect(where.AND).toEqual([CLAIMABLE]);
  });

  it("appends to an existing AND, single or array", () => {
    expect(claimableWhere({ AND: { isPhantomTrip: false } }).AND).toEqual([{ isPhantomTrip: false }, CLAIMABLE]);
    expect(claimableWhere({ AND: [{ isPhantomTrip: false }] }).AND).toEqual([{ isPhantomTrip: false }, CLAIMABLE]);
  });
});

describe("isClaimableTrip", () => {
  it("claims business trips in your own vehicle or no vehicle", () => {
    expect(isClaimableTrip({ classification: "business", vehicle: { providedByOthers: false } })).toBe(true);
    expect(isClaimableTrip({ classification: "business", vehicle: null })).toBe(true);
    expect(isClaimableTrip({ classification: "business" })).toBe(true);
  });

  it("never claims a vehicle someone else pays for, or a non-business trip", () => {
    expect(isClaimableTrip({ classification: "business", vehicle: { providedByOthers: true } })).toBe(false);
    expect(isClaimableTrip({ classification: "personal", vehicle: null })).toBe(false);
    expect(isClaimableTrip({ classification: "unclassified", vehicle: { providedByOthers: false } })).toBe(false);
  });
});
