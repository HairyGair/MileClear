import { describe, it, expect } from "vitest";
import { explainEstimate, taxFreeShare } from "./mtdEstimate";
import type { HmrcCalculationSummary } from "../api/hmrc";

const base: HmrcCalculationSummary = { calculationId: "c", taxYear: "2026-27", ready: true, raw: {} };

describe("explainEstimate", () => {
  it("uses HMRC's bands and rates", () => {
    const e = explainEstimate({
      ...base,
      totalIncomeTaxAndNicsDue: 1398.31,
      totalAllowancesAndDeductions: 12570,
      totalTaxableIncome: 5378.1,
      incomeTaxAmount: 1075.62,
      nic4: 322.69,
      incomeTaxBands: [{ name: "BRT", rate: 20, income: 5378.1, amount: 1075.62 }],
      class4Bands: [{ name: "BRT", rate: 6, income: 5378.1, amount: 322.69 }],
    });
    expect(e.total).toBe(1398.31);
    expect(e.lines.map((l) => l.label)).toEqual([
      "The first £12,570 of your income each year is tax-free",
      "Income tax, 20% of the next £5,378.10",
      "National Insurance, 6% of the same",
    ]);
    expect(e.lines.map((l) => l.amount)).toEqual([0, 1075.62, 322.69]);
    expect(taxFreeShare(e)).toBeCloseTo(12570 / 17948.1);
  });

  it("falls back to plain amounts, no percentages, when HMRC sent no bands", () => {
    const e = explainEstimate({ ...base, incomeTaxAmount: 100, nic2: 5, nic4: 20 });
    expect(e.total).toBe(125);
    expect(e.lines).toEqual([
      { kind: "taxed", label: "Income tax", amount: 100 },
      { kind: "taxed", label: "National Insurance", amount: 25 },
    ]);
    expect(taxFreeShare(e)).toBeNull();
  });

  it("shows Class 2 only when HMRC returns a non-zero amount", () => {
    const bands = { class4Bands: [{ rate: 6, income: 100, amount: 6 }] };
    const without = explainEstimate({ ...base, ...bands, nic2: 0, nic4: 6 });
    expect(without.lines).toHaveLength(1);
    const withIt = explainEstimate({ ...base, ...bands, nic2: 3.5, nic4: 6 });
    expect(withIt.lines).toHaveLength(2);
    expect(withIt.lines[1].amount).toBe(3.5);
  });

  it("leaves out bands where nothing was charged", () => {
    const e = explainEstimate({
      ...base,
      totalIncomeTaxAndNicsDue: 0,
      totalAllowancesAndDeductions: 12570,
      totalTaxableIncome: 0,
      incomeTaxBands: [{ rate: 20, income: 0, amount: 0 }],
    });
    expect(e.total).toBe(0);
    expect(e.lines).toHaveLength(1);
    expect(e.lines[0].kind).toBe("free");
  });
});
