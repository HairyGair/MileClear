import { describe, it, expect } from "vitest";
import { explainEstimate, taxFreeShare, formatPounds } from "./mtdEstimate";
import type { HmrcCalculationSummary } from "../api/hmrc";

const base: HmrcCalculationSummary = { calculationId: "c", taxYear: "2026-27", ready: true, raw: {} };

// Shapes follow HMRC Individual Calculations v8.0 (taxBands, nic4Bands, personalAllowance).
const selfEmployedOnly: HmrcCalculationSummary = {
  ...base,
  totalIncomeTaxAndNicsDue: 1398.31,
  personalAllowance: 12570,
  totalTaxableIncome: 5378.1,
  incomeTaxAmount: 1075.62,
  nic2: 0,
  nic4: 322.69,
  incomeTaxBands: [{ name: "BRT", rate: 20, income: 5378.1, amount: 1075.62 }],
  class4Bands: [
    { name: "zero-rate", rate: 0, income: 0, amount: 0 },
    { name: "basic-rate", rate: 6, income: 5378.1, amount: 322.69 },
  ],
};

describe("explainEstimate", () => {
  it("uses HMRC's bands and rates, and says this year", () => {
    const e = explainEstimate(selfEmployedOnly);
    expect(e.total).toBe(1398.31);
    expect(e.lines.map((l) => l.label)).toEqual([
      "The first £12,570 of your income this year is tax-free",
      "Income tax, 20% of the next £5,378.10",
      "National Insurance, 6% of the same",
    ]);
    expect(e.lines.map((l) => l.amount)).toEqual([0, 1075.62, 322.69]);
    expect(taxFreeShare(e)).toBeCloseTo(12570 / 17948.1);
  });

  it("falls back to plain amounts, no percentages, when HMRC sent no bands", () => {
    const e = explainEstimate({ ...base, totalIncomeTaxAndNicsDue: 125, incomeTaxAmount: 100, nic2: 5, nic4: 20 });
    expect(e.lines).toEqual([
      { kind: "taxed", label: "Income tax", amount: 100 },
      { kind: "taxed", label: "National Insurance", amount: 25 },
    ]);
    expect(taxFreeShare(e)).toBeNull();
  });

  it("shows Class 2 only when HMRC returns a non-zero amount", () => {
    const withClass2 = explainEstimate({ ...selfEmployedOnly, nic2: 3.5, totalIncomeTaxAndNicsDue: 1401.81 });
    expect(withClass2.lines.at(-1)).toMatchObject({ amount: 3.5 });
    expect(explainEstimate(selfEmployedOnly).lines.some((l) => l.label.includes("flat"))).toBe(false);
  });

  it("subtracts tax already paid through a job and still reconciles", () => {
    // PAYE job: bands include job pay, so tax charged is bigger than the headline.
    const e = explainEstimate({
      ...base,
      totalIncomeTaxAndNicsDue: 1398.31,
      totalTaxDeducted: 2000,
      personalAllowance: 12570,
      incomeTaxBands: [{ rate: 20, income: 16000, amount: 2800 }],
      class4Bands: [{ rate: 6, income: 5378.1, amount: 598.31 }],
      nic4: 598.31,
      incomeTaxAmount: 2800,
    });
    expect(e.lines.map((l) => l.kind)).toEqual(["free", "taxed", "taxed", "paid"]);
    expect(e.lines.at(-1)).toEqual({ kind: "paid", label: "Tax already paid through your job", amount: -2000 });
  });

  it("shows the headline alone when the lines don't add up to it", () => {
    const e = explainEstimate({ ...selfEmployedOnly, totalIncomeTaxAndNicsDue: 3000 });
    expect(e.total).toBe(3000);
    expect(e.lines).toEqual([]);
    expect(taxFreeShare(e)).toBeNull();
  });

  it("tolerates a pound of rounding either way", () => {
    expect(explainEstimate({ ...selfEmployedOnly, totalIncomeTaxAndNicsDue: 1398.9 }).lines.length).toBeGreaterThan(0);
    expect(explainEstimate({ ...selfEmployedOnly, totalIncomeTaxAndNicsDue: 1400 }).lines).toEqual([]);
  });

  it("leaves out bands where nothing was charged, and handles nothing to pay", () => {
    const e = explainEstimate({
      ...base,
      totalIncomeTaxAndNicsDue: 0,
      personalAllowance: 12570,
      totalTaxableIncome: 0,
      incomeTaxAmount: 0,
      nic4: 0,
      incomeTaxBands: [{ rate: 20, income: 0, amount: 0 }],
    });
    expect(e.total).toBe(0);
    expect(e.lines.map((l) => l.kind)).toEqual(["free", "taxed", "taxed"]);
  });
});

describe("formatPounds", () => {
  it("uses a plain minus", () => {
    expect(formatPounds(-2000)).toBe("-£2,000.00");
    expect(formatPounds(1.5)).toBe("£1.50");
  });
});
