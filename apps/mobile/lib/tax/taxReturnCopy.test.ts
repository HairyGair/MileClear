import { describe, it, expect } from "vitest";
import {
  taxReturnYearOptions,
  taxYearRangeLabel,
  taxYearEndLabel,
  formatPounds,
  totalDueLine,
  fieldLabel,
  heldAnnualLines,
} from "./taxReturnCopy";

describe("taxReturnCopy", () => {
  it("offers the last ended tax year first, then the current one", () => {
    expect(taxReturnYearOptions(new Date("2026-10-11T12:00:00Z"))).toEqual(["2025-26", "2026-27"]);
    expect(taxReturnYearOptions(new Date("2027-04-06T12:00:00Z"))).toEqual(["2026-27", "2027-28"]);
    expect(taxReturnYearOptions(new Date("2099-05-01T12:00:00Z"))).toEqual(["2098-99", "2099-00"]);
  });

  it("labels the tax year", () => {
    expect(taxYearRangeLabel("2025-26")).toBe("6 April 2025 to 5 April 2026");
    expect(taxYearEndLabel("2025-26")).toBe("5 April 2026");
  });

  it("formats pounds, with a dash for missing", () => {
    expect(formatPounds(1931.8)).toBe("£1,931.80");
    expect(formatPounds(-12.5)).toBe("-£12.50");
    expect(formatPounds(undefined)).toBe("-");
  });

  it("says refund when HMRC's total is negative", () => {
    expect(totalDueLine(-250)).toEqual({ label: "Refund due to you", amount: "£250.00" });
    expect(totalDueLine(100).label).toBe("Income Tax and National Insurance due");
  });

  it("makes HMRC field names readable", () => {
    expect(fieldLabel("annualInvestmentAllowance")).toBe("Annual investment allowance");
    expect(heldAnnualLines({ allowances: { annualInvestmentAllowance: 500, structuredBuildingAllowance: [{}] } })).toEqual([
      "Annual investment allowance: £500.00",
      "Structured building allowance: 1 item",
    ]);
    expect(heldAnnualLines(null)).toEqual([]);
  });
});
