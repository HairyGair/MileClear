import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));

import { NZ_REGIME, kmToMiles } from "@mileclear/shared";
import { buildRegimeSummary, type SummaryVehicle } from "../../services/regimeSummary.js";

const car: SummaryVehicle = {
  id: "v1",
  make: "Toyota",
  model: "Corolla",
  fuelType: "petrol",
  vehicleType: "car",
  providedByOthers: false,
};

const km = (n: number) => kmToMiles(n);

describe("buildRegimeSummary (New Zealand)", () => {
  it("counts all travel for the tier, business for the claim, per vehicle", () => {
    const s = buildRegimeSummary({
      regime: NZ_REGIME,
      taxYear: "2025-26",
      vehicles: [car],
      defaultVehicleId: "v1",
      trips: [
        { distanceMiles: km(15_000), classification: "business", vehicleId: "v1" },
        { distanceMiles: km(4_000), classification: "personal", vehicleId: "v1" },
        // No vehicle: goes on the default one.
        { distanceMiles: km(1_000), classification: "unclassified", vehicleId: null },
      ],
    });
    expect(s.currency).toBe("NZD");
    expect(s.vehicles).toHaveLength(1);
    expect(s.vehicles[0].totalDistance).toBeCloseTo(20_000, 1);
    expect(s.vehicles[0].businessDistance).toBeCloseTo(15_000, 1);
    // 10,500 km at $1.20 + 4,500 km at 37c
    expect(s.totalAmountMinor).toBeCloseTo(10_500 * 120 + 4_500 * 37, -1);
    expect(s.ratesYear).toBe("2025-26");
    expect(s.provisional).toBe(false);
    expect(s.someWithoutFigure).toBe(false);
    expect(s.start).toBe("2025-03-31T11:00:00.000Z");
  });

  it("the current year uses the latest published rates, marked provisional", () => {
    const s = buildRegimeSummary({
      regime: NZ_REGIME,
      taxYear: "2026-27",
      vehicles: [car],
      defaultVehicleId: "v1",
      trips: [{ distanceMiles: km(100), classification: "business", vehicleId: "v1" }],
    });
    expect(s.ratesYear).toBe("2025-26");
    expect(s.provisional).toBe(true);
  });

  it("no figure for trips with no vehicle, a fuel IRD has no rate for, or someone else's vehicle", () => {
    const s = buildRegimeSummary({
      regime: NZ_REGIME,
      taxYear: "2025-26",
      vehicles: [
        { ...car, id: "lpg", fuelType: "lpg" },
        { ...car, id: "van", providedByOthers: true },
      ],
      defaultVehicleId: null,
      trips: [
        { distanceMiles: km(100), classification: "business", vehicleId: null },
        { distanceMiles: km(200), classification: "business", vehicleId: "lpg" },
        { distanceMiles: km(300), classification: "business", vehicleId: "van" },
      ],
    });
    expect(s.totalAmountMinor).toBe(0);
    expect(s.someWithoutFigure).toBe(true);
    const reasons = Object.fromEntries(s.vehicles.map((v) => [v.vehicleId ?? "none", v.noClaimReason]));
    expect(reasons).toEqual({ none: "no_vehicle", lpg: "fuel_unknown", van: "provided_by_others" });
  });

  it("a trip on a deleted vehicle id falls back to the default vehicle", () => {
    const s = buildRegimeSummary({
      regime: NZ_REGIME,
      taxYear: "2025-26",
      vehicles: [car],
      defaultVehicleId: "v1",
      trips: [{ distanceMiles: km(50), classification: "business", vehicleId: "gone" }],
    });
    expect(s.vehicles.map((v) => v.vehicleId)).toEqual(["v1"]);
  });
});
