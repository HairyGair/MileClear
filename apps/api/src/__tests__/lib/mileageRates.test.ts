import { describe, it, expect } from "vitest";
import {
  claimRatesFor,
  claimValuePence,
  employerRatesFor,
} from "../../lib/mileageRates.js";

const both = { workType: "both", employerMileageRatePence: 40, employerMileageRatePenceAfter10k: 25 };
const selfEmployed = { workType: "self_employed", employerMileageRatePence: 40, employerMileageRatePenceAfter10k: 25 };
const noRate = { workType: "both", employerMileageRatePence: null, employerMileageRatePenceAfter10k: null };

// The demo account on 7 Oct 2026: 97.9 gig-app miles + 213.7 untagged work miles.
const demoTrips = [
  { distanceMiles: 97.9, vehicleType: "car" as const, platformTag: "uber" },
  { distanceMiles: 213.7, vehicleType: "car" as const, platformTag: null },
];

describe("employerRatesFor", () => {
  it("applies only to employee/both drivers with a rate set", () => {
    expect(employerRatesFor(both)?.customRateFirst10kPence).toBe(40);
    expect(employerRatesFor(selfEmployed)).toBeNull();
    expect(employerRatesFor(noRate)).toBeNull();
    expect(employerRatesFor(null)).toBeNull();
  });
});

describe("claimRatesFor", () => {
  it("gig-app trips use the approved rates", () => {
    expect(claimRatesFor(both, "deliveroo")).toEqual({});
  });
  it("untagged trips use the employer's rate when one is set", () => {
    expect(claimRatesFor(both, null).customRateFirst10kPence).toBe(40);
  });
  it("without an employer rate every trip uses the approved rates", () => {
    expect(claimRatesFor(noRate, null)).toEqual({});
    expect(claimRatesFor(selfEmployed, null)).toEqual({});
  });
});

describe("claimValuePence", () => {
  it("values gig trips at 55p and work trips at the employer's 40p (2026-27)", () => {
    // 97.9 x 55p = 5384.5 -> 5385; 213.7 x 40p = 8548
    expect(claimValuePence(demoTrips, both, "2026-27")).toBe(5385 + 8548);
  });
  it("is unchanged for a driver with no employer rate", () => {
    expect(claimValuePence(demoTrips, noRate, "2026-27")).toBe(Math.round(311.6 * 55));
  });
  it("gives employer trips and self-employed trips separate 10,000-mile bands", () => {
    const trips = [
      { distanceMiles: 8000, vehicleType: "car" as const, platformTag: "uber" },
      { distanceMiles: 8000, vehicleType: "car" as const, platformTag: null },
    ];
    expect(claimValuePence(trips, both, "2026-27")).toBe(8000 * 55 + 8000 * 40);
  });
  it("cars and vans share one band", () => {
    const trips = [
      { distanceMiles: 6000, vehicleType: "car" as const, platformTag: "uber" },
      { distanceMiles: 6000, vehicleType: "van" as const, platformTag: "evri" },
    ];
    expect(claimValuePence(trips, noRate, "2026-27")).toBe(10000 * 55 + 2000 * 25);
  });
});
