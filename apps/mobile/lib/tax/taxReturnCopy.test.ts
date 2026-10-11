import { describe, it, expect } from "vitest";
import {
  taxReturnYearOptions,
  taxYearRangeLabel,
  taxYearEndLabel,
  formatPounds,
  totalDueLine,
  fieldLabel,
  heldAnnualLines,
  toIsoDay,
  periodAnswerLabel,
  accountingTypeLabel,
  lateAccountingDateNote,
} from "./taxReturnCopy";

describe("accounting period and method words", () => {
  it("formats a picked date as YYYY-MM-DD in local time", () => {
    expect(toIsoDay(new Date(2026, 3, 5, 23, 30))).toBe("2026-04-05");
  });

  it("describes each period answer", () => {
    expect(periodAnswerLabel({ choice: "tax_year" }, "2025-26")).toBe("6 April 2025 to 5 April 2026, the tax year");
    expect(periodAnswerLabel({ choice: "to_31_march" }, "2025-26")).toBe("1 April 2025 to 31 March 2026");
    expect(periodAnswerLabel({ choice: "none" }, "2025-26")).toBe("No accounting period ended in this tax year");
    expect(periodAnswerLabel({ choice: "custom", startDate: "2025-01-01", endDate: "2025-12-31" }, "2025-26")).toBe(
      "1 Jan 2025 to 31 Dec 2025"
    );
  });

  it("names the accounting methods the way HMRC does", () => {
    expect(accountingTypeLabel("CASH")).toBe("Cash basis");
    expect(accountingTypeLabel("ACCRUAL")).toBe("Traditional accounting");
  });
});

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

describe("lateAccountingDateNote", () => {
  it("shows for a period ending 31 March", () => {
    expect(lateAccountingDateNote("to_31_march", null, "2025-26")).toMatch(/opt out/);
  });
  it("shows for own dates ending 31 March to 4 April of the next year", () => {
    expect(lateAccountingDateNote("custom", new Date(2026, 3, 4), "2025-26")).not.toBeNull();
    expect(lateAccountingDateNote("custom", new Date(2026, 2, 31), "2025-26")).not.toBeNull();
  });
  it("doesn't show for the tax year, no period, or other dates", () => {
    expect(lateAccountingDateNote("tax_year", null, "2025-26")).toBeNull();
    expect(lateAccountingDateNote("none", null, "2025-26")).toBeNull();
    expect(lateAccountingDateNote("custom", new Date(2026, 3, 5), "2025-26")).toBeNull();
    expect(lateAccountingDateNote("custom", new Date(2025, 11, 31), "2025-26")).toBeNull();
  });
});
