import { describe, it, expect } from "vitest";
import type { TaxOverview } from "@mileclear/shared";
import {
  certificateHint,
  daysText,
  daysTone,
  deadlineYear,
  homeLineText,
  isOverdue,
  leadForDate,
  resolvePersona,
  returnCardMode,
  returnHeadlineTodo,
  rowGroups,
  showProBadge,
  showsDiffersLine,
  differsLineApplies,
  overviewOutOfStep,
} from "../tax/persona";

const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

function ret(over: Partial<NonNullable<TaxOverview["return"]>> = {}): NonNullable<TaxOverview["return"]> {
  return {
    taxYear: "2025-26",
    deadline: "2027-01-31",
    daysToDeadline: 113,
    attentionCount: 3,
    headline: "",
    attentionItems: [],
    returnMileagePence: 0,
    businessMiles: 100,
    earningsPence: 5000,
    ...over,
  };
}

function overview(over: Partial<TaxOverview> = {}): TaxOverview {
  return {
    today: "2026-10-10",
    lead: "return",
    workType: "gig",
    isCompanyDriver: false,
    isPremium: false,
    hasTrips: true,
    claim: { taxYear: "2026-27", totalMiles: 10, businessMiles: 8, claimPence: 400 },
    return: ret(),
    thisYear: null,
    plan: null,
    relief: null,
    failed: [],
    ...over,
  };
}

describe("resolvePersona", () => {
  const base = { isPersonal: false, isCompanyDriver: false, workType: "gig" as string | null };
  it("personal mode beats everything", () => {
    expect(resolvePersona({ ...base, isPersonal: true, isCompanyDriver: true, workType: "employee" })).toBe("personal");
  });
  it("company driver beats work type", () => {
    expect(resolvePersona({ ...base, isCompanyDriver: true, workType: "both" })).toBe("company");
  });
  it("work types", () => {
    expect(resolvePersona({ ...base, workType: "employee" })).toBe("employee");
    expect(resolvePersona({ ...base, workType: "both" })).toBe("both");
    expect(resolvePersona({ ...base, workType: "gig" })).toBe("gig");
    expect(resolvePersona({ ...base, workType: null })).toBe("gig");
    expect(resolvePersona({ ...base, workType: undefined })).toBe("gig");
  });
});

describe("leadForDate", () => {
  it("return leads 6 April to 31 January", () => {
    expect(leadForDate(4, 6)).toBe("return");
    expect(leadForDate(10, 10)).toBe("return");
    expect(leadForDate(12, 31)).toBe("return");
    expect(leadForDate(1, 1)).toBe("return");
    expect(leadForDate(1, 31)).toBe("return");
  });
  it("this year leads 1 February to 5 April", () => {
    expect(leadForDate(2, 1)).toBe("this_year");
    expect(leadForDate(3, 31)).toBe("this_year");
    expect(leadForDate(4, 1)).toBe("this_year");
    expect(leadForDate(4, 5)).toBe("this_year");
  });
});

describe("days labels", () => {
  it("words", () => {
    expect(daysText(113)).toBe("113 days left");
    expect(daysText(1)).toBe("1 day left");
    expect(daysText(0)).toBe("Due today");
    expect(daysText(-4)).toBe("4 days late");
    expect(daysText(-1)).toBe("1 day late");
  });
  it("tones", () => {
    expect(daysTone(91)).toBe("calm");
    expect(daysTone(90)).toBe("soon");
    expect(daysTone(31)).toBe("soon");
    expect(daysTone(30)).toBe("urgent");
    expect(daysTone(0)).toBe("urgent");
    expect(daysTone(-3)).toBe("urgent");
  });
  it("headline and deadline year", () => {
    expect(returnHeadlineTodo(1, 2027)).toBe("1 thing to sort before 31 January 2027");
    expect(returnHeadlineTodo(3, 2027)).toBe("3 things to sort before 31 January 2027");
    expect(deadlineYear("2027-01-31")).toBe(2027);
  });
});

describe("returnCardMode", () => {
  it("todo and done when leading", () => {
    expect(returnCardMode("return", ret(), "2023-24")).toBe("todo");
    expect(returnCardMode("return", ret({ attentionCount: 0 }), "2023-24")).toBe("done");
  });
  it("asks when nothing is recorded and no start year was given", () => {
    expect(returnCardMode("return", ret({ businessMiles: 0, earningsPence: 0 }), null)).toBe("ask");
  });
  it("does not ask once a start year is set, or when there is data", () => {
    expect(returnCardMode("return", ret({ businessMiles: 0, earningsPence: 0 }), "earlier")).toBe("todo");
    expect(returnCardMode("return", ret({ businessMiles: 5, earningsPence: 0 }), null)).toBe("todo");
  });
  it("is hidden when the server sent no return", () => {
    expect(returnCardMode("return", null, null)).toBe("hidden");
  });
  it("from February shows second only while things remain", () => {
    expect(returnCardMode("this_year", ret({ attentionCount: 2 }), "earlier")).toBe("todo");
    expect(returnCardMode("this_year", ret({ attentionCount: 0 }), "earlier")).toBe("hidden");
    expect(returnCardMode("this_year", ret({ businessMiles: 0, earningsPence: 0, attentionCount: 0 }), null)).toBe("hidden");
  });
  it("overdue only when late with items left", () => {
    expect(isOverdue(ret({ daysToDeadline: -2 }))).toBe(true);
    expect(isOverdue(ret({ daysToDeadline: -2, attentionCount: 0 }))).toBe(false);
    expect(isOverdue(ret({ daysToDeadline: 0 }))).toBe(false);
  });
});

describe("differs line", () => {
  it("shows only when the two figures differ", () => {
    expect(showsDiffersLine(400, 500)).toBe(true);
    expect(showsDiffersLine(500, 500)).toBe(false);
    expect(showsDiffersLine(null, 500)).toBe(false);
  });
  it("applies only to both, or gig with an employer rate (SPEC 3.2)", () => {
    expect(differsLineApplies("both", null)).toBe(true);
    expect(differsLineApplies("gig", 30)).toBe(true);
    expect(differsLineApplies("gig", 0)).toBe(true);
    expect(differsLineApplies("gig", null)).toBe(false);
    expect(differsLineApplies("gig", undefined)).toBe(false);
    expect(differsLineApplies("employee", 30)).toBe(false);
  });
});

describe("overview out of step with the profile", () => {
  const o = (workType: TaxOverview["workType"], isCompanyDriver = false) => ({ workType, isCompanyDriver });
  it("matches when work type and team agree (null work type reads as gig)", () => {
    expect(overviewOutOfStep(o("gig"), { workType: null, isCompanyDriver: false })).toBe(false);
    expect(overviewOutOfStep(o("both"), { workType: "both", isCompanyDriver: false })).toBe(false);
  });
  it("is out of step after a work type or team change", () => {
    expect(overviewOutOfStep(o("employee"), { workType: "both", isCompanyDriver: false })).toBe(true);
    expect(overviewOutOfStep(o("gig"), { workType: "gig", isCompanyDriver: true })).toBe(true);
  });
  it("is never out of step with nothing to compare", () => {
    expect(overviewOutOfStep(null, { workType: "both", isCompanyDriver: false })).toBe(false);
    expect(overviewOutOfStep(o("gig"), null)).toBe(false);
  });
});

describe("rows", () => {
  const opts = { isPremium: false, reliefPence: 0, formatPence: fmt };
  const ids = (p: Parameters<typeof rowGroups>[0], o = opts) =>
    rowGroups(p, o).flatMap((g) => g.rows.map((r) => r.id));
  const titles = (p: Parameters<typeof rowGroups>[0], o = opts) => rowGroups(p, o).map((g) => g.title);

  it("gig", () => {
    expect(ids("gig")).toEqual(["wizard", "reconciliation", "guide", "downloads", "certificate", "accountant", "tax_details"]);
    expect(titles("gig")).toEqual(["YOUR RETURN", "RECORDS", "SETTINGS"]);
  });
  it("both adds claims with the pounds", () => {
    expect(ids("both", { ...opts, reliefPence: 41200 })).toContain("relief");
    const relief = rowGroups("both", { ...opts, reliefPence: 41200 }).flatMap((g) => g.rows).find((r) => r.id === "relief");
    expect(relief?.hint).toBe("£412.00 to claim");
    const none = rowGroups("both", opts).flatMap((g) => g.rows).find((r) => r.id === "relief");
    expect(none?.hint).toBe("Tax back when your employer pays less");
  });
  it("employee", () => {
    expect(ids("employee")).toEqual(["downloads", "certificate", "accountant", "employee_sa", "tax_details"]);
    expect(titles("employee")).toEqual(["RECORDS", "SELF-EMPLOYED TOO?", "SETTINGS"]);
  });
  it("company has no accountant, relief only above zero", () => {
    expect(ids("company")).toEqual(["downloads", "certificate", "tax_details"]);
    expect(ids("company", { ...opts, reliefPence: 100 })).toEqual(["downloads", "certificate", "relief", "tax_details"]);
  });
  it("personal", () => {
    expect(ids("personal")).toEqual(["downloads", "switch_work"]);
  });
  it("downloads hints per persona", () => {
    const hint = (p: Parameters<typeof rowGroups>[0]) =>
      rowGroups(p, opts).flatMap((g) => g.rows).find((r) => r.id === "downloads")?.hint;
    expect(hint("gig")).toBe("Trip log, CSV and Self Assessment PDF");
    expect(hint("employee")).toBe("Trip log for your employer");
    expect(hint("company")).toBe("Trip log, CSV and PDF");
    expect(hint("personal")).toBe("Your trips as CSV or PDF");
  });
  it("only Downloads is marked as Pro", () => {
    for (const p of ["gig", "both", "employee", "company", "personal"] as const) {
      const pro = rowGroups(p, opts).flatMap((g) => g.rows).filter((r) => r.pro).map((r) => r.id);
      expect(pro).toEqual(["downloads"]);
    }
  });
  it("certificate hint follows Pro", () => {
    expect(certificateHint(false)).toBe("Free to preview, share with Pro");
    expect(certificateHint(true)).toBe("A summary of your miles you can share");
  });
  it("PRO badge only once the user has loaded and is not Pro", () => {
    expect(showProBadge({ userLoading: true, isPremium: false })).toBe(false);
    expect(showProBadge({ userLoading: false, isPremium: false })).toBe(true);
    expect(showProBadge({ userLoading: false, isPremium: true })).toBe(false);
  });
});

describe("homeLineText", () => {
  it("return lead with items", () => {
    expect(homeLineText("gig", overview(), null, fmt)).toBe("2025-26 return: 3 things to sort · 113 days left");
    expect(homeLineText("both", overview({ return: ret({ attentionCount: 1 }) }), null, fmt)).toBe(
      "2025-26 return: 1 thing to sort · 113 days left",
    );
  });
  it("return lead, nothing left", () => {
    expect(homeLineText("gig", overview({ return: ret({ attentionCount: 0 }) }), null, fmt)).toBe(
      "2025-26 return: ready to file · 113 days left",
    );
  });
  it("this-year lead prefers the weekly put-by, then tax so far", () => {
    const plan = { weeklySetAsidePence: 5800 } as NonNullable<TaxOverview["plan"]>;
    const thisYear = { estimatedTaxPence: 123456 } as NonNullable<TaxOverview["thisYear"]>;
    expect(homeLineText("gig", overview({ lead: "this_year", plan, thisYear }), null, fmt)).toBe(
      "Put by £58.00 a week for your next tax payment",
    );
    expect(
      homeLineText("gig", overview({ lead: "this_year", plan: { ...plan, weeklySetAsidePence: null }, thisYear }), null, fmt),
    ).toBe("Tax so far this year: £1234.56");
    expect(
      homeLineText("gig", overview({ lead: "this_year", plan: null, thisYear: { ...thisYear, estimatedTaxPence: 0 } }), null, fmt),
    ).toBeNull();
  });
  it("asks on Home while the Tax tab asks (nothing recorded, no start year)", () => {
    const empty = ret({ businessMiles: 0, earningsPence: 0, attentionCount: 2 });
    expect(homeLineText("both", overview({ return: empty }), null, fmt)).toBe(
      "Do you need a 2025-26 return? · 113 days left",
    );
  });
  it("employee needs relief above zero", () => {
    expect(homeLineText("employee", overview({ workType: "employee" }), 41200, fmt)).toBe(
      "Mileage Allowance Relief: £412.00 to claim",
    );
    expect(homeLineText("employee", overview(), 0, fmt)).toBeNull();
    expect(homeLineText("employee", overview(), null, fmt)).toBeNull();
  });
  it("company and personal show nothing; nor does no data or no trips", () => {
    expect(homeLineText("company", overview(), 100, fmt)).toBeNull();
    expect(homeLineText("personal", overview(), 100, fmt)).toBeNull();
    expect(homeLineText("gig", null, null, fmt)).toBeNull();
    expect(homeLineText("gig", overview({ hasTrips: false }), null, fmt)).toBeNull();
  });
  it("late return reads as late", () => {
    expect(homeLineText("gig", overview({ return: ret({ daysToDeadline: -2 }) }), null, fmt)).toBe(
      "2025-26 return: 3 things to sort · 2 days late",
    );
  });
});
