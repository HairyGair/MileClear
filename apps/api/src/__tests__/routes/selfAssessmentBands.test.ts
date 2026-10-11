/** Self Assessment wizard: the tax-band rows for rest of UK and Scotland (11 Oct 2026). */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));

import { estimateUkTax, getIncomeTaxRates } from "@mileclear/shared";
import { buildTaxBandBreakdown } from "../../routes/selfAssessment/index.js";

function rows(profitPence: number, scottishTaxpayer: boolean, otherIncomePence: number | null = null) {
  const taxYear = "2026-27";
  const est = estimateUkTax(profitPence, { taxYear, scottishTaxpayer, otherIncomePence });
  const r = buildTaxBandBreakdown(profitPence, est, otherIncomePence, getIncomeTaxRates(taxYear, scottishTaxpayer ? "scotland" : "rUK"));
  const it = r.filter((x) => x.type === "income_tax");
  return { est, it, sum: it.reduce((s, x) => s + x.amountPence, 0) };
}

describe("buildTaxBandBreakdown", () => {
  it("Scotland, 50,000 profit: five rows that add up to the estimate", () => {
    const { est, it, sum } = rows(5_000_000, true);
    expect(it.map((x) => x.band)).toEqual(["Personal Allowance", "Starter Rate", "Basic Rate", "Intermediate Rate", "Higher Rate"]);
    expect(it.map((x) => x.ratePct)).toEqual([0, 0.19, 0.2, 0.21, 0.42]);
    expect(Math.abs(sum - est.incomeTaxPence)).toBeLessThanOrEqual(2);
    expect(it[1].description).toBe("19% on profit between £12,570 and £16,537 (Scottish rate)");
    expect(it[4].description).toBe("42% on profit between £43,662 and £75,000 (Scottish rate)");
  });

  it("rest of UK, 130,000 profit: the allowance has gone and the rows still add up", () => {
    const { est, it, sum } = rows(13_000_000, false);
    expect(it.map((x) => x.band)).toEqual(["Personal Allowance", "Basic Rate", "Higher Rate", "Additional Rate"]);
    expect(est.incomeTaxPence).toBe(4_470_300);
    expect(Math.abs(sum - est.incomeTaxPence)).toBeLessThanOrEqual(2);
    expect(it[0].description).toContain("you keep £0 of it");
    expect(it[3].description).toBe("45% on profit above £125,140");
  });

  it("Scotland with other income: only the bands the profit reaches", () => {
    const { it, sum, est } = rows(1_000_000, true, 4_000_000);
    expect(it.map((x) => x.band)).toEqual(["Personal Allowance", "Intermediate Rate", "Higher Rate"]);
    expect(est.incomeTaxPence).toBe(343_098);
    expect(Math.abs(sum - est.incomeTaxPence)).toBeLessThanOrEqual(2);
  });
});
