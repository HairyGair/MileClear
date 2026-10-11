import { describe, it, expect } from "vitest";
import { checkMtdScope, formatWholePounds, MTD_PHASES, MTD_SCOPE_TAX_YEARS } from "./mtdScope";

const OCT_2026 = new Date(2026, 9, 11, 12); // 11 Oct 2026, local noon
const MAY_2027 = new Date(2027, 4, 1, 12);
const MAY_2028 = new Date(2028, 4, 1, 12);
const gbp = (pounds: number) => pounds * 100;

describe("the thresholds", () => {
  it("are £50,000 from April 2026, £30,000 from April 2027 and £20,000 from April 2028", () => {
    expect(MTD_PHASES.map((p) => [p.startsOn, p.basedOnTaxYear, p.thresholdPence])).toEqual([
      ["2026-04-06", "2024-25", 5_000_000],
      ["2027-04-06", "2025-26", 3_000_000],
      ["2028-04-06", "2026-27", 2_000_000],
    ]);
    expect(MTD_SCOPE_TAX_YEARS).toEqual(["2024-25", "2025-26", "2026-27"]);
  });
});

describe("checkMtdScope", () => {
  it("over £50,000 in 2024-25: you need to now", () => {
    const r = checkMtdScope({ selfEmploymentPenceByTaxYear: { "2024-25": gbp(52_000) }, today: OCT_2026 });
    expect(r.answer).toBe("now");
    expect(r.headline).toBe("You need to now");
    expect(r.detail).toContain("over £50,000");
    expect(r.detail).toContain("6 April 2026");
  });

  it("exactly £50,000 is not over the limit", () => {
    const r = checkMtdScope({
      selfEmploymentPenceByTaxYear: { "2024-25": gbp(50_000), "2025-26": gbp(10_000), "2026-27": gbp(4_000) },
      today: OCT_2026,
    });
    expect(r.answer).toBe("not_yet");
  });

  it("over £30,000 in 2025-26: you'll need to from April 2027", () => {
    const r = checkMtdScope({
      selfEmploymentPenceByTaxYear: { "2024-25": gbp(28_000), "2025-26": gbp(34_500) },
      today: OCT_2026,
    });
    expect(r.answer).toBe("later");
    expect(r.headline).toBe("You'll need to from April 2027");
    expect(r.detail).toContain("2025-26 was over £30,000");
  });

  it("the same driver in May 2027 needs to now", () => {
    const r = checkMtdScope({ selfEmploymentPenceByTaxYear: { "2025-26": gbp(34_500) }, today: MAY_2027 });
    expect(r.answer).toBe("now");
    expect(r.detail).toContain("since 6 April 2027");
  });

  it("already over £20,000 part way through 2026-27: from April 2028, said as 'so far'", () => {
    const r = checkMtdScope({
      selfEmploymentPenceByTaxYear: { "2024-25": gbp(18_000), "2025-26": gbp(19_000), "2026-27": gbp(21_000) },
      today: OCT_2026,
    });
    expect(r.answer).toBe("later");
    expect(r.headline).toBe("You'll need to from April 2028");
    expect(r.detail).toContain("so far in 2026-27");
    expect(r.years[2].complete).toBe(false);
  });

  it("from April 2028 for 2026-27 income, once that year has finished", () => {
    const r = checkMtdScope({ selfEmploymentPenceByTaxYear: { "2026-27": gbp(25_000) }, today: MAY_2028 });
    expect(r.answer).toBe("now");
    expect(r.years[2].complete).toBe(true);
  });

  it("under every limit: you don't need to yet, with this year's running figure", () => {
    const r = checkMtdScope({
      selfEmploymentPenceByTaxYear: { "2024-25": gbp(12_000), "2025-26": gbp(15_000), "2026-27": gbp(8_250) },
      today: OCT_2026,
    });
    expect(r.answer).toBe("not_yet");
    expect(r.headline).toBe("You don't need to yet");
    expect(r.detail).toContain("£8,250");
    expect(r.detail).toContain("£20,000 limit for April 2028");
    expect(r.missingTaxYears).toEqual([]);
  });

  it("adds property income to self-employment income (both count, before expenses)", () => {
    const r = checkMtdScope({
      selfEmploymentPenceByTaxYear: { "2025-26": gbp(22_000) },
      propertyPenceByTaxYear: { "2025-26": gbp(9_000) },
      today: OCT_2026,
    });
    expect(r.answer).toBe("later");
    expect(r.years[1].qualifyingIncomePence).toBe(gbp(31_000));
  });

  it("names the years MileClear holds nothing for, but not years still to come", () => {
    const r = checkMtdScope({ selfEmploymentPenceByTaxYear: { "2026-27": gbp(3_000) }, today: OCT_2026 });
    expect(r.answer).toBe("not_yet");
    expect(r.missingTaxYears).toEqual(["2024-25", "2025-26"]);
    const early = checkMtdScope({ selfEmploymentPenceByTaxYear: {}, today: new Date(2025, 5, 1, 12) });
    expect(early.missingTaxYears).toEqual(["2024-25", "2025-26"]);
  });

  it("keeps to the wording rules", () => {
    const cases = [
      checkMtdScope({ selfEmploymentPenceByTaxYear: { "2024-25": gbp(60_000) }, today: OCT_2026 }),
      checkMtdScope({ selfEmploymentPenceByTaxYear: { "2025-26": gbp(40_000) }, today: OCT_2026 }),
      checkMtdScope({ selfEmploymentPenceByTaxYear: { "2026-27": gbp(1_000) }, today: OCT_2026 }),
    ];
    for (const r of cases) {
      const text = `${r.headline} ${r.detail}`;
      expect(text).not.toMatch(/—|–/);
      expect(text).not.toMatch(/HMRC[- ](ready|approved|compliant|recognised|accepted)/i);
    }
  });
});

describe("formatWholePounds", () => {
  it("prints whole pounds with UK separators", () => {
    expect(formatWholePounds(5_000_000)).toBe("£50,000");
    expect(formatWholePounds(825_050)).toBe("£8,250");
    expect(formatWholePounds(0)).toBe("£0");
  });
});
