import { describe, it, expect } from "vitest";
import { shiftTripClassification } from "../shiftClassificationRule";

describe("shiftTripClassification", () => {
  it("makes a real shift's trips business, whatever the schedule says (28 Sep 2026)", () => {
    expect(shiftTripClassification("0b7d1c2e-shift", "unclassified")).toBe("business");
    expect(shiftTripClassification("0b7d1c2e-shift", "business")).toBe("business");
  });

  it("leaves a recovered Start Trip or arrived trip (no server shift) to the schedule, as before", () => {
    expect(shiftTripClassification(undefined, "unclassified")).toBe("unclassified");
    expect(shiftTripClassification(undefined, "business")).toBe("business");
    expect(shiftTripClassification("", "unclassified")).toBe("unclassified");
  });
});
