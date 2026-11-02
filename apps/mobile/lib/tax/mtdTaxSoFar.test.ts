import { describe, it, expect, beforeEach } from "vitest";
import type { HmrcCalculationListItem, HmrcCalculationSummary } from "../api/hmrc";
import {
  inYearCalculationsNewestFirst,
  selfEmploymentProfit,
  figuresUpTo,
  poundsShort,
  taxSoFarView,
  remindersSub,
  hubTaxYear,
  HUB_HELP_ROWS,
  TAX_SO_FAR_HEADING,
  SEE_HOW_WORKED_OUT,
  NEWEST_PENDING_LINE,
  NEWEST_PENDING_LINE_TEST,
  REMINDERS_SAVE_FAILED,
} from "./mtdTaxSoFar";
import {
  readTaxSoFarCache,
  writeTaxSoFarCache,
  invalidateHubCache,
  invalidateTaxSoFarCache,
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
    expect(figuresUpTo(fulfilled, "2026-11-01T14:32:00.000Z")).toBe("5 October");
  });

  it("ignores quarters received after the calculation", () => {
    expect(figuresUpTo(fulfilled, "2026-08-01T10:00:00.000Z")).toBe("5 July");
  });

  it("is null when it can't be told", () => {
    expect(figuresUpTo(null, "2026-11-01T10:00:00.000Z")).toBeNull();
    expect(figuresUpTo(fulfilled, undefined)).toBeNull();
    expect(figuresUpTo([{ ...fulfilled[0], receivedDate: undefined }], "2026-11-01")).toBeNull();
    expect(figuresUpTo(fulfilled, "2026-07-01T10:00:00.000Z")).toBeNull();
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
      { env: "production", upTo: "5 July" },
    );
    expect(v?.totalText).toBe("£0.00");
    expect(v?.pill).toBe("HMRC estimate");
    expect(v?.sentence).toBe(
      "Your profit up to 5 July (£8,180) is under the £12,570 you can earn tax-free in a year. HMRC updates this each time you send.",
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

describe("job tax and refunds", () => {
  const profitRaw = { calculation: { incomeSummaryTotals: { totalSelfEmploymentProfit: 17948 } } };

  it("a negative total with tax paid through a job gets its own sentence", () => {
    const v = taxSoFarView(calc({ totalIncomeTaxAndNicsDue: -120, totalTaxDeducted: 900, raw: profitRaw }), { env: "production" });
    expect(v?.sentence).toBe(
      "You've paid more through your job than HMRC's estimate so far. HMRC sorts this out when you finish the year.",
    );
    expect(v?.sentence).not.toMatch(/refund/i);
  });

  it("above zero with job tax does not quote self-employed profit alone", () => {
    const v = taxSoFarView(calc({ totalIncomeTaxAndNicsDue: 300, totalTaxDeducted: 900, raw: profitRaw }), { env: "production" });
    expect(v?.sentence).toBe(
      "Worked out from what you've sent so far and the tax you've paid through your job. HMRC updates this each time you send.",
    );
  });

  it("£0 with job tax does not claim the profit is under the tax-free amount", () => {
    const v = taxSoFarView(
      calc({
        totalIncomeTaxAndNicsDue: 0,
        totalTaxDeducted: 500,
        personalAllowance: 12570,
        raw: { calculation: { incomeSummaryTotals: { totalSelfEmploymentProfit: 100 } } },
      }),
      { env: "production" },
    );
    expect(v?.sentence).not.toMatch(/tax-free/);
  });

  it("adds the still-working line for an older calculation", () => {
    const v = taxSoFarView(calc({ totalIncomeTaxAndNicsDue: 300 }), { env: "production", newestPending: true });
    expect(v?.pendingLine).toBe("HMRC is still working out your newest update.");
    expect(taxSoFarView(calc({ totalIncomeTaxAndNicsDue: 300 }), { env: "production" })?.pendingLine).toBeNull();
  });
});

describe("which tax year the hub shows", () => {
  const q = (start: string, end: string, due: string, status: "Open" | "Fulfilled") => ({ start, end, due, status });

  it("uses the newest quarter HMRC has, so the last quarter's estimate shows until 7 May", () => {
    const fulfilled = [
      q("2026-04-06", "2026-07-05", "2026-08-07", "Fulfilled"),
      q("2027-01-06", "2027-04-05", "2027-05-07", "Fulfilled"),
    ];
    expect(hubTaxYear([], fulfilled, "2027-04-20")).toBe("2026-27");
  });

  it("else the year of the next quarter due", () => {
    const open = [
      q("2027-04-06", "2027-07-05", "2027-08-07", "Open"),
      q("2027-01-06", "2027-04-05", "2027-05-07", "Open"),
    ];
    expect(hubTaxYear(open, null, "2027-04-20")).toBe("2026-27");
  });

  it("else today's tax year, on the 6 April boundary", () => {
    expect(hubTaxYear([], null, "2027-04-03")).toBe("2026-27");
    expect(hubTaxYear([], [], "2027-04-06")).toBe("2027-28");
  });
});

describe("tax so far cache", () => {
  beforeEach(() => invalidateTaxSoFarCache());

  it("is reused for the same driver and year until it expires", () => {
    writeTaxSoFarCache("u1", "2026-27", "calc", {}, 1000);
    expect(readTaxSoFarCache("u1", "2026-27", 1000 + TAX_SO_FAR_CACHE_MS - 1)?.value).toBe("calc");
    expect(readTaxSoFarCache("u1", "2026-27", 1000 + TAX_SO_FAR_CACHE_MS)).toBeNull();
    expect(readTaxSoFarCache("u2", "2026-27", 1001)).toBeNull();
    expect(readTaxSoFarCache("u1", "2027-28", 1001)).toBeNull();
  });

  it("is cleared by its own invalidate, not by the hub's", () => {
    writeTaxSoFarCache("u1", "2026-27", "calc", {}, 1000);
    invalidateHubCache();
    expect(readTaxSoFarCache("u1", "2026-27", 1001)?.value).toBe("calc");
    invalidateTaxSoFarCache();
    expect(readTaxSoFarCache("u1", "2026-27", 1001)).toBeNull();
  });
});

describe("copy", () => {
  const all = [
    TAX_SO_FAR_HEADING,
    SEE_HOW_WORKED_OUT,
    NEWEST_PENDING_LINE,
    NEWEST_PENDING_LINE_TEST,
    REMINDERS_SAVE_FAILED,
    remindersSub(true),
    remindersSub(false),
    ...HUB_HELP_ROWS.flatMap((r) => [r.title, r.sub]),
  ].join("\n");

  it("uses no em dashes and makes no claims about MileClear", () => {
    expect(all).not.toMatch(/—|–/);
    expect(all).not.toMatch(/approved|recognised|recognized|HMRC-ready/i);
  });

  it("says the switch covers every tax date, on and off", () => {
    expect(remindersSub(true)).toBe("Quarterly updates: 7 days and 1 day before. Also covers your other tax date reminders.");
    expect(remindersSub(false)).toBe("Push off for every tax date. Emails aren't affected.");
  });
});

