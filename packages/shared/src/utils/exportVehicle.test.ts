import { describe, it, expect } from "vitest";
import { exportVehicleChoices, exportVehicleLabel, exportVehicleSlug } from "./exportVehicle.js";

const qashqai = { id: "v1", make: "Nissan", model: "Qashqai", registrationPlate: "ab12 cde" };
const fiesta = { id: "v2", make: "Ford", model: "Fiesta", registrationPlate: null };

describe("exportVehicleLabel", () => {
  it("names the car with its plate in capitals", () => {
    expect(exportVehicleLabel(qashqai)).toBe("Nissan Qashqai (AB12 CDE)");
  });
  it("leaves the brackets off when there is no plate", () => {
    expect(exportVehicleLabel(fiesta)).toBe("Ford Fiesta");
  });
  it("never comes back blank", () => {
    expect(exportVehicleLabel({ make: " ", model: "", registrationPlate: null })).toBe("Vehicle");
  });
});

describe("exportVehicleSlug", () => {
  it("is lower case letters, digits and hyphens", () => {
    expect(exportVehicleSlug(qashqai)).toBe("nissan-qashqai-ab12cde");
    expect(exportVehicleSlug(fiesta)).toBe("ford-fiesta");
  });
  it("strips anything that could break a file name or a header", () => {
    const slug = exportVehicleSlug({ make: '=Evil"; rm', model: "../../x\r\n", registrationPlate: "Ä1" });
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it("is at most 40 characters and never ends in a hyphen", () => {
    const slug = exportVehicleSlug({ make: "A".repeat(30), model: "B".repeat(30), registrationPlate: null });
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
  it("falls back to 'vehicle'", () => {
    expect(exportVehicleSlug({ make: "!!", model: "", registrationPlate: "" })).toBe("vehicle");
  });
});

describe("exportVehicleChoices", () => {
  it("asks nothing with one car or none", () => {
    expect(exportVehicleChoices([])).toBeNull();
    expect(exportVehicleChoices([qashqai])).toBeNull();
  });
  it("puts All cars first, then each car", () => {
    expect(exportVehicleChoices([qashqai, fiesta])).toEqual([
      { vehicleId: undefined, label: "All cars" },
      { vehicleId: "v1", label: "Nissan Qashqai (AB12 CDE)" },
      { vehicleId: "v2", label: "Ford Fiesta" },
    ]);
  });
});
