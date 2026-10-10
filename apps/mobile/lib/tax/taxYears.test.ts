import { describe, it, expect } from "vitest";
import { defaultReturnYear, previousTaxYear, recentTaxYears } from "./taxYears";

describe("taxYears", () => {
  const oct2026 = new Date("2026-10-10T12:00:00Z");
  it("lists recent tax years newest first", () => {
    expect(recentTaxYears(3, oct2026)).toEqual(["2026-27", "2025-26", "2024-25"]);
  });
  it("respects the 6 April boundary", () => {
    expect(recentTaxYears(1, new Date("2026-04-05T12:00:00Z"))).toEqual(["2025-26"]);
    expect(recentTaxYears(1, new Date("2026-04-07T12:00:00Z"))).toEqual(["2026-27"]);
  });
  it("previous tax year", () => {
    expect(previousTaxYear(oct2026)).toBe("2025-26");
  });
  it("default year uses the cached return year, else previous", () => {
    expect(defaultReturnYear("2025-26", oct2026)).toBe("2025-26");
    expect(defaultReturnYear(null, oct2026)).toBe("2025-26");
    expect(defaultReturnYear(undefined, oct2026)).toBe("2025-26");
    expect(defaultReturnYear("garbage", oct2026)).toBe("2025-26");
  });
});
