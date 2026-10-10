import { describe, it, expect } from "vitest";
import { mapFuelFor, DIESEL, UNLEADED } from "../mapFuel";

describe("mapFuelFor: which price the fuel map pins show", () => {
  it("shows diesel for a diesel driver", () => {
    expect(mapFuelFor([{ fuelType: "diesel", isPrimary: true }])).toEqual(DIESEL);
  });

  it("keeps unleaded for petrol, hybrid, electric and no vehicle", () => {
    expect(mapFuelFor([{ fuelType: "petrol" }])).toEqual(UNLEADED);
    expect(mapFuelFor([{ fuelType: "hybrid" }])).toEqual(UNLEADED);
    expect(mapFuelFor([{ fuelType: "electric" }])).toEqual(UNLEADED);
    expect(mapFuelFor([])).toEqual(UNLEADED);
  });

  it("goes by the primary vehicle, else the newest", () => {
    expect(
      mapFuelFor([
        { fuelType: "petrol", isPrimary: false, createdAt: "2026-09-01" },
        { fuelType: "diesel", isPrimary: true, createdAt: "2026-01-01" },
      ])
    ).toEqual(DIESEL);
    expect(
      mapFuelFor([
        { fuelType: "petrol", createdAt: "2026-01-01" },
        { fuelType: "diesel", createdAt: "2026-09-01" },
      ])
    ).toEqual(DIESEL);
  });
});
