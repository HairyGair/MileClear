import { describe, it, expect } from "vitest";
import {
  SA103S_FORM_BOXES,
  SA103S_EXPENSE_BOXES,
  SA103_BOXES,
  SA103_GUIDANCE,
} from "./hmrc-sa103.js";
import { EXPENSE_CATEGORIES, sa103sExpenseBoxTotals } from "./index.js";

// Pinned against the 2025-26 SA103S, "Self-employment (short)", HMRC 12/25:
// https://assets.publishing.service.gov.uk/media/69c12ae013101e9908704a53/SA103S-2026.pdf
// If HMRC renumbers a box, this test should fail until a person has read
// the new form and updated SA103S_FORM_BOXES.
describe("SA103S_FORM_BOXES", () => {
  it("matches the 2025-26 SA103S box numbers and labels", () => {
    const short = Object.fromEntries(
      Object.entries(SA103S_FORM_BOXES).map(([box, label]) => [box, label.split(" - ")[0]])
    );
    expect(short).toEqual({
      "9": "Your turnover",
      "10": "Any other business income not included in box 9",
      "10.1": "Trading income allowance",
      "11": "Costs of goods bought for resale or goods used",
      "12": "Car, van and travel expenses",
      "13": "Wages, salaries and other staff costs",
      "14": "Rent, rates, power and insurance costs",
      "15": "Repairs and maintenance of property and equipment",
      "16": "Accountancy, legal and other professional fees",
      "17": "Interest and bank and credit card financial charges",
      "18": "Phone, fax, stationery and other office costs",
      "19": "Other allowable business expenses",
      "20": "Total allowable expenses",
      "21": "Net profit",
      "22": "Or, net loss",
      "23": "Annual Investment Allowance",
      "24": "Allowance for small balance of unrelieved expenditure",
      "24.1": "Zero-emission car allowance",
      "25": "Other capital allowances",
      "25.1": "The Structures and Buildings Allowance",
      "25.2": "Freeport and Investment Zones Structures and Buildings Allowance",
      "26": "Total balancing charges",
      "27": "Goods and/or services for your own use",
      "28": "Net business profit for tax purposes (if box 21 + box 26 + box 27 minus (boxes 22 to 25.2) is positive). Or if you've completed box 10.1 (box 21 + box 26 + box 27 minus box 10.1)",
      "29": "Loss brought forward from earlier years set off against this year's profits",
      "30": "Any other business income not included in box 9 or box 10",
      "31": "Total taxable profits from this business (if box 28 + box 30 minus box 29 is positive)",
      "32": "Net business loss for tax purposes (if boxes 22 to 25.2 minus (box 21 + box 26 + box 27) is positive)",
      "33": "Loss from this tax year set off against other income for 2025-26",
      "34": "Loss to be carried back to previous years and set off against income (or capital gains)",
      "35": "Total loss to carry forward after all other set-offs",
      "36": "If your total profits for 2025-26 are less than £6,845 and you choose to pay Class 2 NICs voluntarily, put 'X' in the box",
      "37": "If you're exempt from paying Class 4 NICs, put 'X' in the box",
      "38": "Total Construction Industry Scheme (CIS) deductions taken from your payments by contractors",
    });
  });

  it("has no em or en dashes in any label", () => {
    for (const label of Object.values(SA103S_FORM_BOXES)) {
      expect(label).not.toMatch(/[–—]/);
    }
  });

  it("names the expense boxes the categories use", () => {
    expect(SA103S_FORM_BOXES[String(SA103S_EXPENSE_BOXES.carVanTravel) as "12"]).toMatch(/^Car, van and travel expenses/);
    expect(SA103S_FORM_BOXES[String(SA103S_EXPENSE_BOXES.professionalFees) as "16"]).toMatch(/professional fees/);
    expect(SA103S_FORM_BOXES[String(SA103S_EXPENSE_BOXES.officeCosts) as "18"]).toMatch(/^Phone, fax, stationery/);
    expect(SA103S_FORM_BOXES[String(SA103S_EXPENSE_BOXES.otherExpenses) as "19"]).toMatch(/^Other allowable business expenses/);
  });
});

describe("SA103_BOXES (wizard guide)", () => {
  it("uses only real SA103S boxes, with HMRC's printed label", () => {
    for (const b of SA103_BOXES) {
      const formLabel = (SA103S_FORM_BOXES as Record<string, string>)[String(b.box)];
      expect(formLabel, `box ${b.box}`).toBeDefined();
      expect(b.label).toBe(formLabel);
    }
  });

  it("maps each figure to the right box", () => {
    const byKey = Object.fromEntries(SA103_BOXES.map((b) => [b.dataKey, b.box]));
    expect(byKey).toEqual({
      totalEarnings: 9,
      otherIncome: 10,
      carVanTravelExpenses: 12,
      professionalFees: 16,
      officeCosts: 18,
      otherAllowableExpenses: 19,
      totalAllowableExpenses: 20,
      netProfitTotal: 21,
      netLossTotal: 22,
      netBusinessProfit: 28,
      taxableProfit: 31,
    });
  });

  it("puts the mileage figure in box 12 and nowhere else", () => {
    const mileageBoxes = SA103_BOXES.filter((b) => /mileage figure/i.test(b.description));
    expect(mileageBoxes.map((b) => b.box)).toEqual([12]);
  });

  it("only mentions boxes that exist on the SA103S", () => {
    const text = [
      ...SA103_BOXES.map((b) => b.description),
      ...Object.values(SA103_GUIDANCE),
    ].join(" ");
    // "box 12", "boxes 23 to 25.2", "Boxes 12, 16, 18 and 19"
    const runs = text.match(/\b[Bb]ox(?:es)? \d+(?:\.\d+)?(?:(?:, | and | to )\d+(?:\.\d+)?)*/g) ?? [];
    const mentioned = runs.flatMap((r) => r.match(/\d+(?:\.\d+)?/g) ?? []);
    expect(mentioned.length).toBeGreaterThan(10);
    for (const n of mentioned) {
      expect(Object.keys(SA103S_FORM_BOXES), `box ${n}`).toContain(n);
    }
    expect(SA103_GUIDANCE.simplifiedMileage).toMatch(/box 12/);
  });
});

describe("EXPENSE_CATEGORIES.sa103sBox", () => {
  const box = (value: string) => EXPENSE_CATEGORIES.find((c) => c.value === value)?.sa103sBox;
  const label = (n: number) => (SA103S_FORM_BOXES as Record<string, string>)[String(n)];

  it("points every category at a real SA103S expense box (11 to 19)", () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(label(c.sa103sBox), c.value).toBeDefined();
      expect(c.sa103sBox).toBeGreaterThanOrEqual(11);
      expect(c.sa103sBox).toBeLessThanOrEqual(19);
    }
  });

  it("puts motoring and travel costs in car, van and travel expenses", () => {
    for (const v of [
      "parking",
      "tolls",
      "congestion",
      "public_transport",
      "maintenance",
      "insurance",
      "road_tax",
      "mot",
      "subsistence",
      "accommodation",
    ]) {
      expect(box(v), v).toBe(12);
      expect(label(box(v)!)).toMatch(/^Car, van and travel expenses/);
    }
  });

  it("puts phone, equipment and apps in office costs", () => {
    for (const v of ["phone", "equipment", "subscription"]) {
      expect(box(v), v).toBe(18);
      expect(label(box(v)!)).toMatch(/^Phone, fax, stationery and other office costs/);
    }
  });

  it("puts professional fees in the professional fees box", () => {
    expect(box("professional_fees")).toBe(16);
    expect(label(16)).toMatch(/professional fees/);
  });

  it("puts uniform and anything else in other allowable expenses", () => {
    for (const v of ["clothing", "other"]) {
      expect(box(v), v).toBe(19);
      expect(label(box(v)!)).toMatch(/^Other allowable business expenses/);
    }
  });

  it("sa103sExpenseBoxTotals sums claimable categories per box and drops running costs", () => {
    expect(
      sa103sExpenseBoxTotals([
        { category: "parking", totalPence: 1500 },
        { category: "accommodation", totalPence: 9000 },
        { category: "insurance", totalPence: 80_000 }, // replaced by the mileage rate
        { category: "phone", totalPence: 2000 },
        { category: "professional_fees", totalPence: 15_000 },
        { category: "clothing", totalPence: 3000 },
        { category: "not_a_category", totalPence: 999 },
      ])
    ).toEqual({ 12: 10_500, 16: 15_000, 18: 2000, 19: 3000 });
  });

  it("covers every category in one of the checks above", () => {
    const checked = new Set([
      "parking", "tolls", "congestion", "public_transport", "maintenance", "insurance",
      "road_tax", "mot", "subsistence", "accommodation", "phone", "equipment",
      "subscription", "professional_fees", "clothing", "other",
    ]);
    for (const c of EXPENSE_CATEGORIES) expect(checked.has(c.value), c.value).toBe(true);
  });
});
