/**
 * HMRC Self Assessment self-employment pages: box numbers, guidance text,
 * and 2025-26 UK tax band constants for the Self Assessment Wizard and
 * Accountant Portal.
 *
 * MileClear targets the SHORT self-employment pages, SA103S, which is the
 * form for a business with annual turnover below £90,000 (nearly every gig
 * driver). The full pages, SA103F, number their boxes differently, so a box
 * number shown without a form name always means the SA103S.
 *
 * Source (checked 2 Oct 2026): "Self-employment (short)" SA103S 2026, tax
 * year 6 April 2025 to 5 April 2026, HMRC 12/25, and its notes:
 *   https://www.gov.uk/government/publications/self-assessment-self-employment-short-sa103s
 *   https://assets.publishing.service.gov.uk/media/69c12ae013101e9908704a53/SA103S-2026.pdf
 *   https://assets.publishing.service.gov.uk/media/69ce15395cf899414a0bc69f/SA103S_Notes_2026.pdf
 * Labels below are the printed labels with HMRC's en dashes written as
 * hyphens. When HMRC publishes a new year's form, re-check every label;
 * hmrc-sa103.test.ts pins this table.
 *
 * All monetary thresholds are in pence (integers).
 * No em dashes anywhere - hyphens only.
 */

// ---------------------------------------------------------------------------
// SA103S form: every box from "Business income" to the CIS box
// ---------------------------------------------------------------------------

/**
 * The 2025-26 SA103S, box number to printed label. Business details
 * (boxes 1 to 8) are left out: they hold dates and ticks, never a figure
 * MileClear works out. Keys are strings because HMRC uses boxes like
 * "10.1" and "25.2".
 */
export const SA103S_FORM_BOXES = {
  // Business income (page SES 1)
  "9": "Your turnover - the takings, fees, sales or money earned by your business",
  "10": "Any other business income not included in box 9",
  "10.1": "Trading income allowance - read the notes",
  // Allowable business expenses (page SES 1)
  "11": "Costs of goods bought for resale or goods used",
  "12": "Car, van and travel expenses - after private use proportion",
  "13": "Wages, salaries and other staff costs",
  "14": "Rent, rates, power and insurance costs",
  "15": "Repairs and maintenance of property and equipment",
  "16": "Accountancy, legal and other professional fees",
  "17": "Interest and bank and credit card financial charges",
  "18": "Phone, fax, stationery and other office costs",
  "19": "Other allowable business expenses - client entertaining costs are not an allowable expense",
  "20": "Total allowable expenses - total of boxes 11 to 19",
  // Net profit or loss (page SES 2)
  "21": "Net profit - if your business income is more than your expenses (if box 9 + box 10 minus box 20 is positive)",
  "22": "Or, net loss - if your expenses exceed your business income (if box 20 minus (box 9 + box 10) is positive)",
  // Capital allowances (page SES 2)
  "23": "Annual Investment Allowance",
  "24": "Allowance for small balance of unrelieved expenditure",
  "24.1": "Zero-emission car allowance",
  "25": "Other capital allowances",
  "25.1": "The Structures and Buildings Allowance",
  "25.2": "Freeport and Investment Zones Structures and Buildings Allowance",
  "26": "Total balancing charges - for example, where you have disposed of items for more than their tax value",
  // Calculating your taxable profits (page SES 2)
  "27": "Goods and/or services for your own use",
  "28": "Net business profit for tax purposes (if box 21 + box 26 + box 27 minus (boxes 22 to 25.2) is positive). Or if you've completed box 10.1 (box 21 + box 26 + box 27 minus box 10.1)",
  "29": "Loss brought forward from earlier years set off against this year's profits - up to the amount in box 28",
  "30": "Any other business income not included in box 9 or box 10",
  // Total taxable profits or net business loss (page SES 2)
  "31": "Total taxable profits from this business (if box 28 + box 30 minus box 29 is positive)",
  "32": "Net business loss for tax purposes (if boxes 22 to 25.2 minus (box 21 + box 26 + box 27) is positive)",
  // Losses, NICs and CIS (page SES 2)
  "33": "Loss from this tax year set off against other income for 2025-26",
  "34": "Loss to be carried back to previous years and set off against income (or capital gains)",
  "35": "Total loss to carry forward after all other set-offs - including unused losses brought forward",
  "36": "If your total profits for 2025-26 are less than £6,845 and you choose to pay Class 2 NICs voluntarily, put 'X' in the box",
  "37": "If you're exempt from paying Class 4 NICs, put 'X' in the box",
  "38": "Total Construction Industry Scheme (CIS) deductions taken from your payments by contractors - CIS subcontractors only",
} as const;

export type Sa103sFormBox = keyof typeof SA103S_FORM_BOXES;

/**
 * The SA103S expense boxes MileClear's expense categories land in.
 * Box 12 also holds the flat-rate mileage figure: the SA103S has no separate
 * simplified-expenses box, and the notes put a car's business running costs
 * in box 12 ("Simplified expenses" and the capital allowances notes, page
 * SESN 3). The SA103F notes (box 20, page SEFN 6) list what "car, van and
 * travel expenses" covers: insurance, repairs, servicing, fuel, parking,
 * hire charges, vehicle licence fees, train, bus, air and taxi fares, and
 * hotel room costs and meals on overnight business trips.
 */
export const SA103S_EXPENSE_BOXES = {
  carVanTravel: 12,
  professionalFees: 16,
  officeCosts: 18,
  otherExpenses: 19,
} as const;

// ---------------------------------------------------------------------------
// Wizard box guide (the boxes a driver on the mileage rate fills in)
// ---------------------------------------------------------------------------

export type Sa103Section =
  | "income"
  | "expenses"
  | "net_profit"
  | "taxable_profit";

export interface Sa103Box {
  /** The SA103S box number (always a key of SA103S_FORM_BOXES) */
  box: number;
  /** HMRC's printed label for this box, exactly as in SA103S_FORM_BOXES */
  label: string;
  /** Plain English explanation for self-employed drivers */
  description: string;
  /**
   * Which key of the /self-assessment/summary `sa103Values` map holds the
   * figure for this box. Values: "totalEarnings" | "otherIncome" |
   * "carVanTravelExpenses" | "professionalFees" | "officeCosts" |
   * "otherAllowableExpenses" | "totalAllowableExpenses" | "netProfitTotal" |
   * "netLossTotal" | "netBusinessProfit" | "taxableProfit"
   */
  dataKey: string;
  /** Which part of the SA103S this box sits in */
  section: Sa103Section;
  /** Highlighted in the wizard as a box nearly every driver fills in */
  key?: boolean;
}

/**
 * SA103S boxes for a self-employed driver claiming the HMRC mileage rate.
 * The wizard shows the ones with a non-zero figure.
 *
 * Key rule: the mileage rate replaces fuel, insurance, repairs, servicing,
 * road tax and MOT for that vehicle, so those are not added to box 12.
 * Parking, tolls, congestion charges, public transport fares and overnight
 * travel costs are still claimed, and they go in box 12 alongside the
 * mileage figure.
 */
export const SA103_BOXES: readonly Sa103Box[] = [
  // ------ Business income ---------------------------------------------------
  {
    box: 9,
    label: SA103S_FORM_BOXES["9"],
    description:
      "Your total income from self-employment this tax year, before any expenses. " +
      "For gig drivers this is the total of all your platform earnings, tips included.",
    dataKey: "totalEarnings",
    section: "income",
    key: true,
  },
  {
    box: 10,
    label: SA103S_FORM_BOXES["10"],
    description:
      "Business income that is not part of your turnover in box 9. Most drivers " +
      "leave this empty.",
    dataKey: "otherIncome",
    section: "income",
  },

  // ------ Allowable business expenses ---------------------------------------
  {
    box: 12,
    label: SA103S_FORM_BOXES["12"],
    description:
      "Your mileage figure (the HMRC rate times your business miles) plus parking, " +
      "tolls, congestion and clean air zone charges, public transport fares, and hotel " +
      "and meal costs on overnight business trips. Because you claim the mileage " +
      "rate, do not add fuel, insurance, repairs, servicing, road tax or MOT for the " +
      "same vehicle: the rate already covers them.",
    dataKey: "carVanTravelExpenses",
    section: "expenses",
    key: true,
  },
  {
    box: 16,
    label: SA103S_FORM_BOXES["16"],
    description: "Fees for an accountant, solicitor or other professional for your business.",
    dataKey: "professionalFees",
    section: "expenses",
  },
  {
    box: 18,
    label: SA103S_FORM_BOXES["18"],
    description:
      "The business share of your phone bill, plus small equipment, apps and " +
      "subscriptions you use for the work.",
    dataKey: "officeCosts",
    section: "expenses",
  },
  {
    box: 19,
    label: SA103S_FORM_BOXES["19"],
    description:
      "Allowable costs that fit none of the boxes above, such as a uniform or " +
      "protective clothing.",
    dataKey: "otherAllowableExpenses",
    section: "expenses",
  },
  {
    box: 20,
    label: SA103S_FORM_BOXES["20"],
    description:
      "Boxes 12, 16, 18 and 19 added up, mileage included. If your turnover was below " +
      "£90,000, HMRC's notes say you may put just this total and leave boxes 11 to 19 empty.",
    dataKey: "totalAllowableExpenses",
    section: "expenses",
    key: true,
  },

  // ------ Net profit or loss ------------------------------------------------
  {
    box: 21,
    label: SA103S_FORM_BOXES["21"],
    description: "Box 9 plus box 10, minus box 20, when that leaves a profit.",
    dataKey: "netProfitTotal",
    section: "net_profit",
  },
  {
    box: 22,
    label: SA103S_FORM_BOXES["22"],
    description: "Use this instead of box 21 when your expenses in box 20 were more than your income.",
    dataKey: "netLossTotal",
    section: "net_profit",
  },

  // ------ Taxable profit ----------------------------------------------------
  {
    box: 28,
    label: SA103S_FORM_BOXES["28"],
    description:
      "For most drivers on the mileage rate this is the same as box 21. It changes if " +
      "you claim capital allowances (boxes 23 to 25.2), have balancing charges (box 26) " +
      "or took goods for your own use (box 27).",
    dataKey: "netBusinessProfit",
    section: "taxable_profit",
  },
  {
    box: 31,
    label: SA103S_FORM_BOXES["31"],
    description:
      "The profit your Income Tax and National Insurance are worked out on. The same as " +
      "box 28 unless you have losses from earlier years (box 29) or other business " +
      "income (box 30).",
    dataKey: "taxableProfit",
    section: "taxable_profit",
    key: true,
  },
] as const;

// ---------------------------------------------------------------------------
// SA103 Guidance Text
// ---------------------------------------------------------------------------

export interface Sa103Guidance {
  /** Overview of the HMRC simplified mileage (flat rate) method */
  simplifiedMileage: string;
  /** Overview of the actual vehicle costs method */
  actualCosts: string;
  /** Guidance on which method to choose */
  whichMethod: string;
  /** Key filing deadlines */
  deadlines: string;
  /** Standard disclaimer */
  disclaimer: string;
}

/**
 * Plain English guidance for self-employed drivers completing SA103.
 * No em dashes - hyphens only.
 */
export const SA103_GUIDANCE: Sa103Guidance = {
  simplifiedMileage:
    "The simplified mileage method (also called the flat rate or fixed rate method) " +
    "lets you claim a set pence-per-mile rate instead of working out your actual " +
    "vehicle running costs. From the 2026-27 tax year onwards (6 April 2026), cars " +
    "and vans use 55p per mile for the first 10,000 business miles, then 25p per mile " +
    "above 10,000 (the rate was 45p/25p up to and including 2025-26). Motorcycles " +
    "use a flat 24p per mile. On the short self-employment pages (SA103S) the amount " +
    "goes in box 12, car, van and travel expenses. You cannot also claim the vehicle's " +
    "actual running costs for the same vehicle in the same year. Parking, tolls and " +
    "congestion charges still go in box 12 on top of the mileage figure, and the " +
    "business share of your phone goes in box 18.",

  actualCosts:
    "Under the actual costs method you work out the real running costs of your vehicle " +
    "for the year - fuel, insurance, MOT, road tax, servicing and repairs - then " +
    "multiply by your business-use percentage (business miles divided by total miles). " +
    "On the SA103S these also go in box 12, car, van and travel expenses. You can claim " +
    "capital allowances for the vehicle itself in boxes 24 to 25 (a car cannot get " +
    "the Annual Investment Allowance in box 23). " +
    "This method often produces a larger deduction for high-mileage drivers with " +
    "expensive vehicles, but requires detailed records and receipts.",

  whichMethod:
    "Simplified mileage is simpler and requires only an accurate mileage log, which " +
    "MileClear provides automatically. It works well for most gig workers and " +
    "self-employed drivers. Consider actual costs if: your vehicle is expensive to " +
    "run (large engine, high insurance), your business-use percentage is very high " +
    "(above 80%), or an accountant has confirmed actual costs would give a larger " +
    "deduction. Once you switch to actual costs for a vehicle you cannot go back to " +
    "simplified mileage for that vehicle in future years.",

  deadlines:
    "Paper SA100 Self Assessment returns must reach HMRC by 31 October after the " +
    "tax year ends (e.g. 31 October 2026 for the 2025-26 year). Online returns via " +
    "HMRC's website or commercial software must be filed by 31 January (e.g. 31 " +
    "January 2027 for 2025-26). Any tax owed is also due by 31 January. Payments on " +
    "account (advance payments toward the next year's bill) may be due on 31 January " +
    "and 31 July if your tax bill exceeds a certain threshold.",

  disclaimer:
    "This is guidance only, not tax advice. Tax rules can change and individual " +
    "circumstances vary. Check with HMRC directly (gov.uk/self-assessment) or a " +
    "qualified accountant before submitting your return.",
} as const;

// ---------------------------------------------------------------------------
// UK Tax Bands 2025-26
// ---------------------------------------------------------------------------

export interface UkTaxBand {
  /** Descriptive name for this band or charge */
  band: string;
  /** Type of charge */
  type: "income_tax" | "class2_ni" | "class4_ni";
  /** Lower threshold in pence (inclusive). 0 means from zero. */
  fromPence: number;
  /** Upper threshold in pence (inclusive). null means no upper limit. */
  toPence: number | null;
  /** Rate as a decimal (e.g. 0.20 for 20%). -1 for fixed-amount charges. */
  rate: number;
  /**
   * Fixed annual amount in pence. Only set for Class 2 NI which is a flat
   * weekly charge rather than a percentage of profit.
   */
  fixedAnnualPence?: number;
  /** Human-readable description of when this band applies */
  description: string;
}

/**
 * UK Income Tax and National Insurance bands for the 2025-26 tax year.
 * For self-employed individuals. All thresholds in pence.
 *
 * Source: gov.uk/income-tax-rates and gov.uk/self-employed-national-insurance-rates
 */
export const UK_TAX_BANDS: readonly UkTaxBand[] = [
  // Income Tax
  {
    band: "Personal Allowance",
    type: "income_tax",
    fromPence: 0,
    toPence: 1_257_000, // 12,570
    rate: 0,
    description: "No Income Tax on the first £12,570 of taxable income.",
  },
  {
    band: "Basic Rate",
    type: "income_tax",
    fromPence: 1_257_100, // 12,571
    toPence: 5_027_000, // 50,270
    rate: 0.20,
    description: "20% Income Tax on taxable income between £12,571 and £50,270.",
  },
  {
    band: "Higher Rate",
    type: "income_tax",
    fromPence: 5_027_100, // 50,271
    toPence: 12_514_000, // 125,140
    rate: 0.40,
    description: "40% Income Tax on taxable income between £50,271 and £125,140.",
  },
  {
    band: "Additional Rate",
    type: "income_tax",
    fromPence: 12_514_100, // 125,141
    toPence: null,
    rate: 0.45,
    description: "45% Income Tax on taxable income above £125,140.",
  },

  // Class 2 NI - flat weekly charge if profits exceed the Small Profits Threshold
  {
    band: "Class 2 NI",
    type: "class2_ni",
    fromPence: 1_257_000, // 12,570 - Small Profits Threshold
    toPence: null,
    rate: -1,
    fixedAnnualPence: 17_940, // 52 weeks x £3.45 = £179.40
    description:
      "Class 2 National Insurance - £3.45 per week (£179.40/year) if annual " +
      "self-employed profits exceed £12,570.",
  },

  // Class 4 NI - percentage of profits between thresholds
  {
    band: "Class 4 NI (Lower)",
    type: "class4_ni",
    fromPence: 1_257_000, // 12,570 - Lower Profits Limit
    toPence: 5_027_000, // 50,270 - Upper Profits Limit
    rate: 0.06,
    description:
      "Class 4 National Insurance at 6% on self-employed profits between " +
      "£12,570 and £50,270.",
  },
  {
    band: "Class 4 NI (Upper)",
    type: "class4_ni",
    fromPence: 5_027_100, // 50,271
    toPence: null,
    rate: 0.02,
    description:
      "Class 4 National Insurance at 2% on self-employed profits above £50,270.",
  },
] as const;
