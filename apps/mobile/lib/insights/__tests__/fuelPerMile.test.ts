import { describe, it, expect } from "vitest";
import { fuelPerMile } from "../fuelPerMile";

describe("Go deeper running cost per mile", () => {
  it("uses the fill-up figure when there is one", () => {
    expect(fuelPerMile({ fuelCostPerMilePence: 13.3, estimatedFuelCostPerMilePence: null })).toEqual({ pence: 13.3, isEstimate: false });
  });
  it("falls back to the estimate the Fuel card shows", () => {
    expect(fuelPerMile({ fuelCostPerMilePence: null, estimatedFuelCostPerMilePence: 13.5 })).toEqual({ pence: 13.5, isEstimate: true });
  });
  it("is null with neither (old API without the estimate field too)", () => {
    expect(fuelPerMile({ fuelCostPerMilePence: null, estimatedFuelCostPerMilePence: null })).toBeNull();
    expect(fuelPerMile({ fuelCostPerMilePence: null })).toBeNull();
  });
});
