/**
 * HMRC approved mileage rates by tax year (4 Oct 2026). Years before 2025-26
 * used to fall through to the newest table, pricing a backdated 2024-25 trip
 * at 55p instead of 45p.
 */
import { describe, it, expect } from "vitest";
import { getHmrcRatesForTaxYear } from "./index";
import { calculateMileageDeduction } from "../utils/index";

describe("getHmrcRatesForTaxYear", () => {
  it("45p before 2026-27, 55p from 2026-27", () => {
    expect(getHmrcRatesForTaxYear("2011-12").car.first10000).toBe(45);
    expect(getHmrcRatesForTaxYear("2024-25").car.first10000).toBe(45);
    expect(getHmrcRatesForTaxYear("2025-26").car.first10000).toBe(45);
    expect(getHmrcRatesForTaxYear("2026-27").car.first10000).toBe(55);
  });
  it("an uncatalogued future year uses the latest rates", () => {
    expect(getHmrcRatesForTaxYear("2030-31").car.first10000).toBe(55);
  });
  it("a 2024-25 deduction is priced at 45p", () => {
    expect(calculateMileageDeduction("car", 1000, { taxYear: "2024-25" }).deductionPence).toBe(45000);
  });
});
