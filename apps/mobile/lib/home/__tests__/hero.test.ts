import { describe, it, expect } from "vitest";
import { selectHero, claimGainNote, milesFigure, type HeroInputs, type HeroStats } from "../hero";

const OCT = new Date(2026, 9, 10, 12, 0);

const stats = (over: Partial<HeroStats> = {}): HeroStats => ({
  taxYear: "2026-27",
  deductionPence: 13933,
  businessMiles: 253.2,
  totalMiles: 300,
  totalTrips: 24,
  ...over,
});
const week = { totalMiles: 190, businessMiles: 182, totalTrips: 5 };
const base = (over: Partial<HeroInputs> = {}): HeroInputs => ({
  persona: "gig",
  now: OCT,
  stats: stats(),
  previousYear: null,
  week,
  month: { totalMiles: 205, businessMiles: 150, totalTrips: 5, previousMiles: 640 },
  ...over,
});

function figure(h: ReturnType<typeof selectHero>) {
  if (h.kind !== "figure") throw new Error(`expected figure, got ${h.kind}`);
  return h;
}

describe("selectHero Work", () => {
  it("leads a gig driver with the claim and business miles this week", () => {
    const h = figure(selectHero(base()));
    expect(h.label).toBe("Mileage claim · 2026-27");
    expect(h.figure).toBe("£139.33");
    expect(h.line).toBe("182 business miles this week");
    expect(h.target).toBe("tax");
    expect(h.claimPence).toBe(13933);
  });

  it("Both and Employee get the same claim hero", () => {
    expect(figure(selectHero(base({ persona: "both" }))).figure).toBe("£139.33");
    expect(figure(selectHero(base({ persona: "employee" }))).figure).toBe("£139.33");
  });

  it("says so plainly when no business miles this week, never 0", () => {
    const h = figure(selectHero(base({ week: { totalMiles: 4, businessMiles: 0, totalTrips: 1 } })));
    expect(h.line).toBe("No business miles yet this week");
  });

  it("a company driver gets business miles, not a claim", () => {
    const h = figure(selectHero(base({ persona: "company", stats: stats({ businessMiles: 1204 }) })));
    expect(h.label).toBe("Business miles · 2026-27");
    expect(h.figure).toBe("1,204");
    expect(h.unit).toBe("miles");
    expect(h.line).toBe("182 business miles this week");
    expect(h.claimPence).toBeNull();
  });

  it("early in the tax year leads with last year's claim and shows this year so far", () => {
    const h = figure(
      selectHero(
        base({
          now: new Date(2026, 5, 1),
          stats: stats({ deductionPence: 1240 }),
          previousYear: { taxYear: "2025-26", deductionPence: 112000, businessMiles: 2500 },
        })
      )
    );
    expect(h.label).toBe("Mileage claim · 2025-26");
    expect(h.figure).toBe("£1,120.00");
    expect(h.line).toBe("2026-27 so far: £12.40");
  });

  it("a claim under 50 pounds with plenty of miles leads with miles", () => {
    const h = figure(selectHero(base({ stats: stats({ deductionPence: 3100, totalMiles: 2140 }) })));
    expect(h.label).toBe("Since 6 April");
    expect(h.figure).toBe("2,140");
    expect(h.unit).toBe("miles");
    expect(h.line).toBe("£31.00 claim so far");
  });

  it("trips but none Business shows miles, not a zero claim", () => {
    const h = figure(selectHero(base({ stats: stats({ deductionPence: 0, businessMiles: 0, totalMiles: 80 }) })));
    expect(h.figure).toBe("80");
    expect(h.line).toBe("None marked Business yet");
    expect(h.figure).not.toMatch(/0\.00/);
  });

  it("is hidden for a new driver", () => {
    expect(selectHero(base({ stats: stats({ totalTrips: 0, deductionPence: 0 }) })).kind).toBe("hidden");
  });

  it("is loading until the stats arrive", () => {
    expect(selectHero(base({ stats: null })).kind).toBe("loading");
  });
});

describe("selectHero Personal", () => {
  it("leaves the week out rather than say 0 this week", () => {
    const h = figure(selectHero(base({ persona: "personal", week: { totalMiles: 0, businessMiles: 0, totalTrips: 0 } })));
    expect(h.line).toBe("5 trips this month");
  });

  it("leads with the month's miles", () => {
    const h = figure(selectHero(base({ persona: "personal" })));
    expect(h.label).toBe("October");
    expect(h.figure).toBe("205");
    expect(h.unit).toBe("miles");
    expect(h.line).toBe("190 miles this week · 5 trips this month");
    expect(h.target).toBe("insights_month");
  });

  it("a quiet month names last month, not a zero", () => {
    const h = figure(
      selectHero(base({ persona: "personal", month: { totalMiles: 0, businessMiles: 0, totalTrips: 0, previousMiles: 640 } }))
    );
    expect(h.figure).toBe("A quiet month so far");
    expect(h.line).toBe("September: 640 miles");
  });

  it("is loading until the month is in", () => {
    expect(selectHero(base({ persona: "personal", month: null })).kind).toBe("loading");
  });
});

describe("claimGainNote", () => {
  it("shows a gain of a pound or more", () => {
    expect(claimGainNote(13251, 13933)).toBe("+£6.82 from your last trip");
  });
  it("stays quiet for small, negative or unknown changes", () => {
    expect(claimGainNote(100, 150)).toBeNull();
    expect(claimGainNote(500, 100)).toBeNull();
    expect(claimGainNote(null, 100)).toBeNull();
  });
});

describe("milesFigure", () => {
  it("keeps one decimal under 100 and whole numbers above", () => {
    expect(milesFigure(12.44)).toBe("12.4");
    expect(milesFigure(182)).toBe("182");
    expect(milesFigure(1204.4)).toBe("1,204");
    expect(milesFigure(5)).toBe("5");
  });
});
