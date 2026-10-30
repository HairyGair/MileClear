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
  it("35p after 10,000 miles from 2027-28 (Autumn Budget 2026), 25p before", () => {
    expect(getHmrcRatesForTaxYear("2026-27").car.after10000).toBe(25);
    expect(getHmrcRatesForTaxYear("2027-28").car.after10000).toBe(35);
    expect(getHmrcRatesForTaxYear("2027-28").van.after10000).toBe(35);
    expect(getHmrcRatesForTaxYear("2027-28").motorbike.flat).toBe(24);
  });
  it("an uncatalogued future year uses the newest rates", () => {
    expect(getHmrcRatesForTaxYear("2030-31").car.first10000).toBe(55);
    expect(getHmrcRatesForTaxYear("2030-31").car.after10000).toBe(35);
  });
  it("300 business miles a week: £6,900 in 2026-27, £7,460 in 2027-28", () => {
    expect(calculateMileageDeduction("car", 15_600, { taxYear: "2026-27" }).deductionPence).toBe(690_000);
    expect(calculateMileageDeduction("car", 15_600, { taxYear: "2027-28" }).deductionPence).toBe(746_000);
  });
  it("a 2024-25 deduction is priced at 45p", () => {
    expect(calculateMileageDeduction("car", 1000, { taxYear: "2024-25" }).deductionPence).toBe(45000);
  });
});
