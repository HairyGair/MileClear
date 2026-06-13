import { describe, it, expect } from "vitest";
import {
  assessCleanAirZones,
  CLEAN_AIR_ZONES,
  detectCleanAirZoneCrossings,
  assessTripCleanAirZoneCharges,
} from "./cleanAirZone.js";

describe("assessCleanAirZones", () => {
  it("treats electric vehicles as zero-emission and compliant everywhere", () => {
    const a = assessCleanAirZones({ fuelType: "ELECTRICITY" });
    expect(a.verdict).toBe("compliant");
    expect(a.confidence).toBe("confirmed");
    expect(a.zeroEmission).toBe(true);
  });

  it("uses euroStatus as the primary signal — diesel Euro 6 is compliant", () => {
    const a = assessCleanAirZones({ euroStatus: "EURO 6", fuelType: "DIESEL" });
    expect(a.verdict).toBe("compliant");
    expect(a.confidence).toBe("confirmed");
  });

  it("diesel below Euro 6 is non-compliant", () => {
    const a = assessCleanAirZones({ euroStatus: "EURO 5", fuelType: "DIESEL" });
    expect(a.verdict).toBe("non_compliant");
    expect(a.confidence).toBe("confirmed");
  });

  it("petrol Euro 4 is compliant (lower bar than diesel)", () => {
    const a = assessCleanAirZones({ euroStatus: "EURO 4", fuelType: "PETROL" });
    expect(a.verdict).toBe("compliant");
  });

  it("petrol Euro 3 is non-compliant", () => {
    const a = assessCleanAirZones({ euroStatus: "EURO 3", fuelType: "PETROL" });
    expect(a.verdict).toBe("non_compliant");
  });

  it("parses messy euroStatus strings like 'EURO 6 AD'", () => {
    const a = assessCleanAirZones({ euroStatus: "EURO 6 AD", fuelType: "DIESEL" });
    expect(a.verdict).toBe("compliant");
  });

  it("treats petrol hybrids by petrol rules", () => {
    const a = assessCleanAirZones({ euroStatus: "EURO 4", fuelType: "HYBRID ELECTRIC" });
    expect(a.verdict).toBe("compliant");
  });

  it("falls back to registration date when euroStatus is blank, flagged as estimated", () => {
    const recent = assessCleanAirZones({ fuelType: "DIESEL", firstRegistration: "2018-03" });
    expect(recent.verdict).toBe("compliant");
    expect(recent.confidence).toBe("estimated");

    const old = assessCleanAirZones({ fuelType: "DIESEL", firstRegistration: "2012-06" });
    expect(old.verdict).toBe("non_compliant");
    expect(old.confidence).toBe("estimated");
  });

  it("returns unknown when neither euroStatus nor a usable reg date is present", () => {
    const a = assessCleanAirZones({ fuelType: "DIESEL" });
    expect(a.verdict).toBe("unknown");
    expect(a.confidence).toBe("unknown");
  });

  it("charges cars only in Class D + ULEZ; vans more widely", () => {
    const car = assessCleanAirZones({ euroStatus: "EURO 3", fuelType: "PETROL", vehicleClass: "car" });
    const carCharging = car.zones.filter((z) => z.chargesThisVehicle).map((z) => z.id);
    expect(carCharging).toContain("london-ulez");
    expect(carCharging).toContain("birmingham"); // Class D
    expect(carCharging).not.toContain("sheffield"); // Class C — cars exempt
    expect(carCharging).not.toContain("portsmouth"); // Class B

    const van = assessCleanAirZones({ euroStatus: "EURO 3", fuelType: "PETROL", vehicleClass: "van" });
    const vanCharging = van.zones.filter((z) => z.chargesThisVehicle).map((z) => z.id);
    expect(vanCharging).toContain("sheffield"); // Class C charges vans
    expect(vanCharging).not.toContain("portsmouth"); // Class B doesn't charge vans
  });

  it("exposes the applicable charge amount per zone for the vehicle type", () => {
    const van = assessCleanAirZones({ euroStatus: "EURO 5", fuelType: "DIESEL", vehicleClass: "van" });
    const sheffield = van.zones.find((z) => z.id === "sheffield");
    expect(sheffield?.chargePence).toBe(1000);
    const car = assessCleanAirZones({ euroStatus: "EURO 5", fuelType: "DIESEL", vehicleClass: "car" });
    const sheffieldCar = car.zones.find((z) => z.id === "sheffield");
    expect(sheffieldCar?.chargePence).toBeNull();
  });

  it("always returns every known zone", () => {
    const a = assessCleanAirZones({ euroStatus: "EURO 6", fuelType: "PETROL" });
    expect(a.zones).toHaveLength(CLEAN_AIR_ZONES.length);
  });
});

describe("detectCleanAirZoneCrossings", () => {
  it("detects a route through central London (ULEZ)", () => {
    const crossed = detectCleanAirZoneCrossings([
      { lat: 51.5074, lng: -0.1278 }, // Trafalgar Square
    ]);
    expect(crossed).toContain("london-ulez");
  });

  it("detects a route through Birmingham city centre", () => {
    const crossed = detectCleanAirZoneCrossings([{ lat: 52.4778, lng: -1.8925 }]);
    expect(crossed).toContain("birmingham");
  });

  it("does not flag a rural route far from any zone", () => {
    const crossed = detectCleanAirZoneCrossings([
      { lat: 54.0, lng: -2.8 }, // Lake District
      { lat: 53.0, lng: -3.5 }, // mid-Wales
    ]);
    expect(crossed).toHaveLength(0);
  });

  it("returns empty for no coordinates", () => {
    expect(detectCleanAirZoneCrossings([])).toHaveLength(0);
  });
});

describe("assessTripCleanAirZoneCharges", () => {
  it("charges a non-compliant car driving through London ULEZ", () => {
    const r = assessTripCleanAirZoneCharges({
      euroStatus: "EURO 3",
      fuelType: "PETROL",
      vehicleClass: "car",
      coords: [{ lat: 51.5074, lng: -0.1278 }],
    });
    expect(r.compliant).toBe(false);
    expect(r.charges.map((c) => c.zoneId)).toContain("london-ulez");
    expect(r.charges.find((c) => c.zoneId === "london-ulez")?.chargePence).toBe(1250);
  });

  it("a compliant vehicle is never charged, even through a zone", () => {
    const r = assessTripCleanAirZoneCharges({
      euroStatus: "EURO 6",
      fuelType: "DIESEL",
      vehicleClass: "car",
      coords: [{ lat: 51.5074, lng: -0.1278 }],
    });
    expect(r.compliant).toBe(true);
    expect(r.charges).toHaveLength(0);
  });

  it("a non-compliant CAR is not charged in a Class C zone (Sheffield), but a van is", () => {
    const coords = [{ lat: 53.3811, lng: -1.4701 }]; // central Sheffield
    const car = assessTripCleanAirZoneCharges({ euroStatus: "EURO 3", fuelType: "PETROL", vehicleClass: "car", coords });
    expect(car.charges.find((c) => c.zoneId === "sheffield")).toBeUndefined();
    const van = assessTripCleanAirZoneCharges({ euroStatus: "EURO 3", fuelType: "PETROL", vehicleClass: "van", coords });
    expect(van.charges.find((c) => c.zoneId === "sheffield")?.chargePence).toBe(1000);
  });
});
