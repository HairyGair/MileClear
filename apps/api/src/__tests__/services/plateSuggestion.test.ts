import { describe, it, expect } from "vitest";
import { suggestPlateCorrection, displayPlate, normalisePlate } from "../../services/plateSuggestion.js";

describe("suggestPlateCorrection", () => {
  it("swaps a zero for the letter O in the letter part (the DL740NT case)", () => {
    expect(suggestPlateCorrection("DL740NT")).toBe("DL74ONT");
  });

  it("swaps a letter O for a zero in the age identifier", () => {
    expect(suggestPlateCorrection("BD6O0JT")).toBe("BD60OJT");
  });

  it("handles 1/I, 5/S and 8/B look-alikes", () => {
    expect(suggestPlateCorrection("AB12CD1")).toBe("AB12CDI");
    expect(suggestPlateCorrection("5B12CDE")).toBe("SB12CDE");
    expect(suggestPlateCorrection("AB1BCDE")).toBe("AB18CDE");
  });

  it("ignores spaces and case, like the vehicles route", () => {
    expect(suggestPlateCorrection("dl74 0nt")).toBe("DL74ONT");
  });

  it("offers nothing for a plate that is already the right shape", () => {
    expect(suggestPlateCorrection("YL65JCJ")).toBeNull();
  });

  it("offers nothing when no look-alike swap makes it fit", () => {
    expect(suggestPlateCorrection("KA2496IH")).toBeNull(); // Indian plate, 8 characters
    expect(suggestPlateCorrection("AB12CD7")).toBeNull(); // 7 has no letter look-alike
    expect(suggestPlateCorrection("A9")).toBeNull();
    expect(suggestPlateCorrection("")).toBeNull();
  });
});

describe("displayPlate / normalisePlate", () => {
  it("spaces a current-format plate the way it is printed", () => {
    expect(displayPlate("DL74ONT")).toBe("DL74 ONT");
    expect(displayPlate("dl74 ont")).toBe("DL74 ONT");
  });

  it("leaves other shapes as typed, without spaces", () => {
    expect(displayPlate("KA2496IH")).toBe("KA2496IH");
    expect(normalisePlate(" ab 12 cde ")).toBe("AB12CDE");
  });
});
