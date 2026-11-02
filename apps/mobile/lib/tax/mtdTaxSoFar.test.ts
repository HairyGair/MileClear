import { describe, it, expect, beforeEach } from "vitest";
import type { HmrcCalculationListItem, HmrcCalculationSummary } from "../api/hmrc";
import {
  inYearCalculationsNewestFirst,
  selfEmploymentProfit,
  figuresUpToMonth,
  poundsShort,
  taxSoFarView,
  remindersSub,
  HUB_HELP_ROWS,
  TAX_SO_FAR_HEADING,
  SEE_HOW_WORKED_OUT,
} from "./mtdTaxSoFar";
import {
  readTaxSoFarCache,
  writeTaxSoFarCache,
  invalidateHubCache,
  TAX_SO_FAR_CACHE_MS,
} from "./mtdHubCache";

function item(id: string, ts: string, type: HmrcCalculationListItem["calculationType"] = "in-year"): HmrcCalculationListItem {
  return { calculationId: id, calculationTimestamp: ts, calculationType: type };
}

function calc(over: Partial<HmrcCalculationSummary> = {}): HmrcCalculationSummary {
  return {
    calculationId: "c1",
    taxYear: "2026-27",
    ready: true,
    raw: {},
    ...over,
  };
}

describe("which calculation is newest for the year", () => {
  it("keeps in-year ones only, newest first", () => {
    const out = inYearCalculationsNewestFirst([
      item("old", "2026-08-01T10:00:00.000Z"),
      item("final", "2026-12-01T10:00:00.000Z", "intent-to-finalise"),
      item("new", "2026-11-01T14:32:00.000Z"),
      item("mid", "2026-10-01T10:00:00.000Z"),
    ]);
    expect(out.map((c) => c.calculationId)).toEqual(["new", "mid", "old"]);
  });

  it("puts unreadable timestamps last and ignores items without an id", () => {
    const out = inYearCalculationsNewestFirst([
      item("bad", "not a date"),
      item("", "2026-11-02T10:00:00.000Z"),
      item("good", "2026-11-01T10:00:00.000Z"),
    ]);
    expect(out.map((c) => c.calculationId)).toEqual(["good", "bad"]);
  });

  it("is empty when HMRC has none", () => {
    expect(inYearCalculationsNewestFirst([])).toEqual([]);
  });
});

describe("self-employed profit from HMRC's calculation", () => {
  it("prefers HMRC's own total", () => {
    const raw = {
      calculation: {
        incomeSummaryTotals: { totalSelfEmploymentProfit: 8180 },
        businessProfitAndLoss: [{ incomeSourceType: "self-employment", taxableProfit: 1 }],
      },
    };
    expect(selfEmploymentProfit({ raw })).toBe(8180);
  });

  it("adds up the self-employment lines when there is no total", () => {
    const raw = {
      calculation: {
        businessProfitAndLoss: [
          { incomeSourceType: "self-employment", taxableProfit: 10000 },
          { incomeSourceType: "self-employment", netProfit: 7948 },
          { incomeSourceType: "uk-property", taxableProfit: 5000 },
        ],
      },
    };
    expect(selfEmploymentProfit({ raw })).toBe(17948);
  });

  it("is undefined when HMRC sent neither", () => {
    expect(selfEmploymentProfit({ raw: {} })).toBeUndefined();
    expect(selfEmploymentProfit({ raw: null })).toBeUndefined();
  });
});

describe("month the figures run up to", () => {
  const fulfilled = [
    { start: "2026-04-06", end: "2026-07-05", due: "2026-08-07", status: "Fulfilled" as const, receivedDate: "2026-07-20" },
    { start: "2026-07-06", end: "2026-10-05", due: "2026-11-07", status: "Fulfilled" as const, receivedDate: "2026-11-01" },
  ];

  it("is the end month of the newest quarter HMRC had when it ran", () => {
    expect(figuresUpToMonth(fulfilled, "2026-11-01T14:32:00.000Z")).toBe("October");
  });

  it("ignores quarters received after the calculation", () => {
    expect(figuresUpToMonth(fulfilled, "2026-08-01T10:00:00.000Z")).toBe("July");
  });

  it("is null when it can't be told", () => {
    expect(figuresUpToMonth(null, "2026-11-01T10:00:00.000Z")).toBeNull();
    expect(figuresUpToMonth(fulfilled, undefined)).toBeNull();
    expect(figuresUpToMonth([{ ...fulfilled[0], receivedDate: undefined }], "2026-11-01")).toBeNull();
    expect(figuresUpToMonth(fulfilled, "2026-07-01T10:00:00.000Z")).toBeNull();
  });
});

describe("the sentence under the figure", () => {
  it("£0 under the tax-free amount names the profit and the month", () => {
    const v = taxSoFarView(
      calc({
        totalIncomeTaxAndNicsDue: 0,
        personalAllowance: 12570,
        raw: { calculation: { incomeSummaryTotals: { totalSelfEmploymentProfit: 8180 } } },
      }),
      { env: "production", upToMonth: "July" },
    );
    expect(v?.totalText).toBe("£0.00");
    expect(v?.pill).toBe("HMRC estimate");
    expect(v?.sentence).toBe(
      "Your profit up to July (£8,180) is under the £12,570 you can earn tax-free in a year. HMRC updates this each time you send.",
    );
    expect(v?.canExplain).toBe(false);
  });

  it("£0 without a month says so far", () => {
    const v = taxSoFarView(
      calc({
        totalIncomeTaxAndNicsDue: 0,
        personalAllowance: 12570,
        raw: { calculation: { incomeSummaryTotals: { totalSelfEmploymentProfit: 8180 } } },
      }),
      { env: "production" },
    );
    expect(v?.sentence).toMatch(/^Your profit so far \(£8,180\)/);
  });

  it("£0 without HMRC's profit or allowance does not invent one", () => {
    const v = taxSoFarView(calc({ totalIncomeTaxAndNicsDue: 0 }), { env: "production" });
    expect(v?.sentence).toBe("No tax worked out on what you've sent so far. HMRC updates this each time you send.");
    expect(v?.sentence).not.toMatch(/12,570/);
  });

  it("above zero gives the profit and offers the explanation", () => {
    const v = taxSoFarView(
      calc({
        totalIncomeTaxAndNicsDue: 1398.31,
        raw: { calculation: { incomeSummaryTotals: { totalSelfEmploymentProfit: 17948 } } },
      }),
      { env: "production" },
    );
    expect(v?.totalText).toBe("£1,398.31");
    expect(v?.sentence).toBe("On £17,948 profit so far. HMRC updates this each time you send.");
    expect(v?.canExplain).toBe(true);
  });

  it("uses the same headline as the sent screen (HMRC's parts when no total)", () => {
    const v = taxSoFarView(calc({ incomeTaxAmount: 100, nic4: 30 }), { env: "production" });
    expect(v?.total).toBe(130);
  });

  it("says test service wording on the test service", () => {
    const v = taxSoFarView(calc({ totalIncomeTaxAndNicsDue: 50 }), { env: "sandbox" });
    expect(v?.pill).toBe("Test estimate");
    expect(v?.sentence).toMatch(/test service/);
  });
});

describe("hide rules", () => {
  it("hides with no calculation", () => {
    expect(taxSoFarView(null, { env: "production" })).toBeNull();
  });
  it("hides a calculation HMRC hasn't finished", () => {
    expect(taxSoFarView(calc({ ready: false, totalIncomeTaxAndNicsDue: 5 }), { env: "production" })).toBeNull();
  });
  it("hides when HMRC sent no figure", () => {
    expect(taxSoFarView(calc({ totalIncomeReceived: 1000 }), { env: "production" })).toBeNull();
  });
});

describe("pounds", () => {
  it("drops pence on whole pounds only", () => {
    expect(poundsShort(8180)).toBe("£8,180");
    expect(poundsShort(8180.5)).toBe("£8,180.50");
  });
});

describe("tax so far cache", () => {
  beforeEach(() => invalidateHubCache());

  it("is reused for the same driver and year until it expires", () => {
    writeTaxSoFarCache("u1", "2026-27", "calc", 1000);
    expect(readTaxSoFarCache("u1", "2026-27", 1000 + TAX_SO_FAR_CACHE_MS - 1)).toBe("calc");
    expect(readTaxSoFarCache("u1", "2026-27", 1000 + TAX_SO_FAR_CACHE_MS)).toBeNull();
    expect(readTaxSoFarCache("u2", "2026-27", 1001)).toBeNull();
    expect(readTaxSoFarCache("u1", "2027-28", 1001)).toBeNull();
  });

  it("is cleared after a send", () => {
    writeTaxSoFarCache("u1", "2026-27", "calc", 1000);
    invalidateHubCache();
    expect(readTaxSoFarCache("u1", "2026-27", 1001)).toBeNull();
  });
});

describe("copy", () => {
  const all = [
    TAX_SO_FAR_HEADING,
    SEE_HOW_WORKED_OUT,
    remindersSub(true),
    remindersSub(false),
    ...HUB_HELP_ROWS.flatMap((r) => [r.title, r.sub]),
  ].join("\n");

  it("uses no em dashes and makes no claims about MileClear", () => {
    expect(all).not.toMatch(/—|–/);
    expect(all).not.toMatch(/approved|recognised|recognized|HMRC-ready/i);
  });

  it("matches the spec for the reminders row", () => {
    expect(remindersSub(true)).toBe("7 days and 1 day before each date");
  });
});
