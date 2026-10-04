import { describe, it, expect } from "vitest";
import { parseStatementText, statementExternalId } from "../statementParser";

// Hand-written OCR output, shaped like what Apple Vision / ML Kit return for a
// phone screenshot: one entry per visual line, labels and figures often split.
// NOT real screenshots. Replace or extend with real samples from drivers.

const TODAY = new Date(2026, 9, 5, 12, 0, 0); // Mon 5 Oct 2026, local time

const parse = (lines: string[]) => parseStatementText(lines, { today: TODAY });

describe("parseStatementText: platform weekly summaries", () => {
  it("Uber weekly: label above figure, US-style range, ignores tips and promotions", () => {
    const r = parse([
      "9:41",
      "Earnings",
      "Sep 28 - Oct 5",
      "£412.50",
      "Online 32h 15m",
      "Trips 61",
      "Fares",
      "£356.10",
      "Promotions",
      "£20.00",
      "Tips",
      "£36.40",
      "£12.79/hr",
      "Uber",
    ]);
    expect(r.platform).toBe("uber");
    expect(r.periodStart).toBe("2026-09-28");
    expect(r.periodEnd).toBe("2026-10-05");
    expect(r.periodKind).toBe("range");
    expect(r.amountPence).toBe(41250);
    expect(r.tipsPence).toBe(3640);
    expect(r.confidence).toBe("high");
    expect(r.amountCandidates.map((c) => c.amountPence)).not.toContain(2000);
    expect(r.amountCandidates.map((c) => c.amountPence)).not.toContain(1279);
  });

  it("Uber Eats daily: single day with day name", () => {
    const r = parse([
      "Uber Eats",
      "Mon 28 Sep",
      "You earned",
      "£86.25",
      "11 deliveries",
      "Tips £9.50",
    ]);
    expect(r.platform).toBe("uber");
    expect(r.periodKind).toBe("day");
    expect(r.periodStart).toBe("2026-09-28");
    expect(r.periodEnd).toBe("2026-09-28");
    expect(r.amountPence).toBe(8625);
    expect(r.tipsPence).toBe(950);
  });

  it("Deliveroo: UK range with en dash, payment date ignored for the period", () => {
    const r = parse([
      "Deliveroo Rider",
      "Your statement",
      "28 Sep – 4 Oct",
      "Order fees £286.40",
      "Tips £14.00",
      "Adjustments £0.00",
      "Total £300.40",
      "Paid on Wed 7 Oct",
    ]);
    expect(r.platform).toBe("deliveroo");
    expect(r.periodStart).toBe("2026-09-28");
    expect(r.periodEnd).toBe("2026-10-04");
    expect(r.amountPence).toBe(30040);
    expect(r.tipsPence).toBe(1400);
    expect(r.confidence).toBe("high");
  });

  it("Just Eat: 'Earnings this week' and a thousands separator", () => {
    const r = parse([
      "Just Eat",
      "Week commencing 21/09/2026",
      "Earnings this week £1,034.60",
      "Shifts 6",
      "Tips £22.10",
    ]);
    expect(r.platform).toBe("just_eat");
    expect(r.periodStart).toBe("2026-09-21");
    expect(r.periodEnd).toBe("2026-09-27");
    expect(r.amountPence).toBe(103460);
  });

  it("Amazon Flex: 'Week of', block rows are not the total", () => {
    const r = parse([
      "amazon flex",
      "Earnings",
      "Week of Sep 21",
      "Mon, Sep 21  3:30 PM - 6:30 PM  £54.00",
      "Wed, Sep 23  10:00 AM - 2:00 PM  £72.00",
      "Sat, Sep 26  9:00 AM - 1:00 PM  £72.00",
      "Total earnings",
      "£198.00",
    ]);
    expect(r.platform).toBe("amazon_flex");
    expect(r.periodStart).toBe("2026-09-21");
    expect(r.periodEnd).toBe("2026-09-27");
    expect(r.amountPence).toBe(19800);
    expect(r.amountCandidates[0].label.toLowerCase()).toContain("total earnings");
  });

  it("Stuart: numeric range and 'Total:'", () => {
    const r = parse([
      "Stuart",
      "Earnings 28/09/2026 - 04/10/2026",
      "Jobs 34",
      "Total: £198.50",
      "Tips: £8.00",
    ]);
    expect(r.platform).toBe("stuart");
    expect(r.periodStart).toBe("2026-09-28");
    expect(r.periodEnd).toBe("2026-10-04");
    expect(r.amountPence).toBe(19850);
    expect(r.tipsPence).toBe(800);
  });

  it("Evri: pay statement with 'Total payment' and VAT line", () => {
    const r = parse([
      "evri",
      "Self-employed courier pay statement",
      "w/c 21/09/26",
      "Parcels delivered 412",
      "Parcel payments £380.24",
      "Fuel contribution £20.00",
      "Total payment £410.22",
      "Payment date 02/10/2026",
    ]);
    expect(r.platform).toBe("evri");
    expect(r.periodStart).toBe("2026-09-21");
    expect(r.periodEnd).toBe("2026-09-27");
    expect(r.amountPence).toBe(41022);
  });

  it("DPD: same-month range with a year", () => {
    const r = parse(["DPD", "Driver earnings", "1 - 7 Sep 2026", "Net pay £642.18", "Gross pay £700.00"]);
    expect(r.platform).toBe("dpd");
    expect(r.periodStart).toBe("2026-09-01");
    expect(r.periodEnd).toBe("2026-09-07");
    expect(r.amountPence).toBe(64218);
  });

  it("Bolt: maps to 'other' with the name kept, net beats gross", () => {
    const r = parse([
      "Bolt Food",
      "Weekly report",
      "21 Sept - 27 Sept",
      "Gross earnings £254.00",
      "Commission -£38.10",
      "Net earnings £215.90",
    ]);
    expect(r.platform).toBe("other");
    expect(r.platformName).toBe("Bolt");
    expect(r.amountPence).toBe(21590);
    expect(r.amountCandidates.map((c) => c.amountPence)).not.toContain(3810);
  });
});

describe("parseStatementText: never invents a value", () => {
  it("two different totals: no amount, both offered", () => {
    const r = parse([
      "Deliveroo",
      "28 Sep - 4 Oct",
      "Total £300.40",
      "Total £286.40",
    ]);
    expect(r.amountPence).toBeNull();
    expect(r.confidence).toBe("low");
    const offered = r.amountCandidates.map((c) => c.amountPence);
    expect(offered).toContain(30040);
    expect(offered).toContain(28640);
  });

  it("no labels at all: no amount, figures offered largest first", () => {
    const r = parse(["Uber", "£54.00", "£72.00", "£12.50"]);
    expect(r.amountPence).toBeNull();
    expect(r.amountCandidates.map((c) => c.amountPence)).toEqual([7200, 5400, 1250]);
  });

  it("only a gross figure: offered, not chosen", () => {
    const r = parse(["Gross earnings £254.00"]);
    expect(r.amountPence).toBeNull();
    expect(r.amountCandidates[0].amountPence).toBe(25400);
  });

  it("tips-only screen: no total", () => {
    const r = parse(["Uber", "Tips this week", "£36.40"]);
    expect(r.amountPence).toBeNull();
    expect(r.tipsPence).toBe(3640);
    expect(r.amountCandidates).toHaveLength(0);
  });

  it("'Total incl. tips' is still the total", () => {
    const r = parse(["Total incl. tips £120.00", "Tips £10.00"]);
    expect(r.amountPence).toBe(12000);
    expect(r.tipsPence).toBe(1000);
  });

  it("no platform or date: medium confidence, nulls kept", () => {
    const r = parse(["Total earnings", "£99.99"]);
    expect(r.amountPence).toBe(9999);
    expect(r.platform).toBeNull();
    expect(r.periodStart).toBeNull();
    expect(r.confidence).toBe("medium");
  });

  it("'Hi Stuart' is a name, not the Stuart platform", () => {
    const r = parse(["Hi Stuart", "Deliveroo", "Total £50.00"]);
    expect(r.platform).toBe("deliveroo");
  });

  it("days spread over more than a week give no period", () => {
    const r = parse(["Mon 7 Sep £20.00", "Fri 25 Sep £30.00"]);
    expect(r.periodStart).toBeNull();
  });

  it("a week's days with no heading span the week", () => {
    const r = parse(["Mon 28 Sep £20.00", "Tue 29 Sep £30.00", "Sun 4 Oct £25.00"]);
    expect(r.periodStart).toBe("2026-09-28");
    expect(r.periodEnd).toBe("2026-10-04");
  });
});

describe("parseStatementText: money and dates", () => {
  it("reads an OCR'd '£' as E", () => {
    const r = parse(["Total E123.45"]);
    expect(r.amountPence).toBe(12345);
  });

  it("ignores ratings and percentages", () => {
    const r = parse(["Rating 4.95", "Acceptance 92.00%", "Total £80.00"]);
    expect(r.amountCandidates.map((c) => c.amountPence)).toEqual([8000]);
  });

  it("a yearless range across New Year resolves to the right years", () => {
    const r = parseStatementText(["28 Dec - 3 Jan", "Total £100.00"], {
      today: new Date(2027, 0, 5),
    });
    expect(r.periodStart).toBe("2026-12-28");
    expect(r.periodEnd).toBe("2027-01-03");
  });

  it("a yearless date in the future is last year's", () => {
    const r = parse(["Sat 14 Nov", "Total £40.00"]);
    expect(r.periodStart).toBe("2025-11-14");
  });

  it("rejects impossible dates", () => {
    const r = parse(["31/09/2026", "Total £40.00"]);
    expect(r.periodStart).toBeNull();
  });

  it("keeps the raw lines for the 'what we read' view", () => {
    const r = parse(["  Uber  ", "", "Total £1.00"]);
    expect(r.rawLines).toEqual(["Uber", "Total £1.00"]);
  });

  it("accepts OCR line objects", () => {
    const r = parseStatementText([{ text: "Total £5.00" }], { today: TODAY });
    expect(r.amountPence).toBe(500);
  });
});

describe("statementExternalId", () => {
  it("is stable for the same platform, period and amount", () => {
    expect(statementExternalId("uber", "2026-09-28", "2026-10-04", 41250)).toBe(
      "ocr:uber:2026-09-28:2026-10-04:41250",
    );
  });

  it("keeps 'other' platforms apart by name", () => {
    expect(statementExternalId("other", "2026-09-21", "2026-09-27", 100, "Bolt")).toBe(
      "ocr:other-bolt:2026-09-21:2026-09-27:100",
    );
  });
});
