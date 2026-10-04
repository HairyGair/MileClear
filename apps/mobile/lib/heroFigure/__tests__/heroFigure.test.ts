import { describe, it, expect } from "vitest";
import {
  chooseHeroFigure,
  daysIntoTaxYear,
  previousTaxYear,
  wantsPreviousYear,
  SMALL_DEDUCTION_PENCE,
  EARLY_TAX_YEAR_DAYS,
  MIN_MILES_TO_LEAD,
  type HeroYearFigure,
} from "../index";

// Local-time dates, the same way parseTaxYear builds 6 April.
const OCT_4 = new Date(2026, 9, 4, 9, 0);
const APRIL_11 = new Date(2026, 3, 11, 9, 0);
const JULY_20 = new Date(2026, 6, 20, 9, 0);

const cur = (deductionPence: number, businessMiles = 0): HeroYearFigure => ({
  taxYear: "2026-27",
  deductionPence,
  businessMiles,
});
const last = (deductionPence: number, taxYear = "2025-26"): HeroYearFigure => ({
  taxYear,
  deductionPence,
  businessMiles: 1000,
});

describe("previousTaxYear", () => {
  it("steps back one year", () => {
    expect(previousTaxYear("2026-27")).toBe("2025-26");
    expect(previousTaxYear("2000-01")).toBe("1999-00");
  });
  it("rejects anything that isn't a tax year", () => {
    expect(previousTaxYear("")).toBeNull();
    expect(previousTaxYear("2026")).toBeNull();
  });
});

describe("daysIntoTaxYear", () => {
  it("is 0 on 6 April and counts up", () => {
    expect(daysIntoTaxYear(new Date(2026, 3, 6, 12), "2026-27")).toBe(0);
    expect(daysIntoTaxYear(APRIL_11, "2026-27")).toBe(5);
  });
  it("treats a malformed tax year as not early", () => {
    expect(daysIntoTaxYear(APRIL_11, "nonsense")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("chooseHeroFigure", () => {
  it("the 4 Oct review: £2.66 this year, £1,800 last year -> last year leads", () => {
    const choice = chooseHeroFigure({
      now: OCT_4,
      current: cur(266, 5),
      totalMilesThisYear: 248,
      previous: last(180000),
    });
    expect(choice).toEqual({ kind: "previous_year", previous: last(180000) });
  });

  it("early in the year, last year leads even when this year is past £50", () => {
    const choice = chooseHeroFigure({
      now: APRIL_11,
      current: cur(12000),
      totalMilesThisYear: 300,
      previous: last(250000),
    });
    expect(choice.kind).toBe("previous_year");
  });

  it("after the early window, a healthy current year leads", () => {
    const choice = chooseHeroFigure({
      now: JULY_20,
      current: cur(SMALL_DEDUCTION_PENCE),
      totalMilesThisYear: 300,
      previous: last(250000),
    });
    expect(choice).toEqual({ kind: "current" });
  });

  it("the early window ends after EARLY_TAX_YEAR_DAYS", () => {
    const start = new Date(2026, 3, 6, 12);
    const inside = new Date(start.getTime() + (EARLY_TAX_YEAR_DAYS - 1) * 86400000);
    const outside = new Date(start.getTime() + EARLY_TAX_YEAR_DAYS * 86400000);
    const input = { current: cur(20000), totalMilesThisYear: 400, previous: last(250000) };
    expect(chooseHeroFigure({ ...input, now: inside }).kind).toBe("previous_year");
    expect(chooseHeroFigure({ ...input, now: outside }).kind).toBe("current");
  });

  it("never leads with a small last year", () => {
    const choice = chooseHeroFigure({
      now: OCT_4,
      current: cur(266),
      totalMilesThisYear: 10,
      previous: last(SMALL_DEDUCTION_PENCE - 1),
    });
    expect(choice).toEqual({ kind: "current" });
  });

  it("never leads with a last year smaller than this year", () => {
    const choice = chooseHeroFigure({
      now: APRIL_11,
      current: cur(90000),
      totalMilesThisYear: 2000,
      previous: last(60000),
    });
    expect(choice).toEqual({ kind: "current" });
  });

  it("ignores a figure for the wrong year", () => {
    const choice = chooseHeroFigure({
      now: OCT_4,
      current: cur(266),
      totalMilesThisYear: 10,
      previous: last(180000, "2024-25"),
    });
    expect(choice).toEqual({ kind: "current" });
  });

  it("small deduction, plenty of miles, no last year -> miles lead", () => {
    const choice = chooseHeroFigure({
      now: OCT_4,
      current: cur(266, 5),
      totalMilesThisYear: 248,
      previous: null,
    });
    expect(choice).toEqual({ kind: "miles_tracked", miles: 248 });
  });

  it("small deduction and few miles -> this year still leads", () => {
    const choice = chooseHeroFigure({
      now: OCT_4,
      current: cur(266, 5),
      totalMilesThisYear: MIN_MILES_TO_LEAD - 1,
      previous: null,
    });
    expect(choice).toEqual({ kind: "current" });
  });

  it("a zero deduction is left to the dashboard's own empty states", () => {
    const choice = chooseHeroFigure({
      now: OCT_4,
      current: cur(0),
      totalMilesThisYear: 500,
      previous: null,
    });
    expect(choice).toEqual({ kind: "current" });
  });

  it("a zero deduction this year still shows a good last year", () => {
    const choice = chooseHeroFigure({
      now: APRIL_11,
      current: cur(0),
      totalMilesThisYear: 0,
      previous: last(150000),
    });
    expect(choice.kind).toBe("previous_year");
  });
});

describe("wantsPreviousYear", () => {
  it("only fetches last year when this year is weak", () => {
    expect(wantsPreviousYear(OCT_4, cur(266))).toBe(true);
    expect(wantsPreviousYear(APRIL_11, cur(90000))).toBe(true);
    expect(wantsPreviousYear(JULY_20, cur(90000))).toBe(false);
  });
});

describe("labels", () => {
  it("formats whole miles with separators", async () => {
    const { formatWholeMiles } = await import("../index");
    expect(formatWholeMiles(4752.3)).toBe("4,752");
    expect(formatWholeMiles(248)).toBe("248");
    expect(formatWholeMiles(1234567.6)).toBe("1,234,568");
    expect(formatWholeMiles(-3)).toBe("0");
  });
  it("names the day a tax year ended", async () => {
    const { taxYearEndLabel } = await import("../index");
    expect(taxYearEndLabel("2025-26")).toBe("5 April 2026");
    expect(taxYearEndLabel("bad")).toBeNull();
  });
});
