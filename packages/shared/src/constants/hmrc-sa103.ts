/**
 * HMRC Self Assessment SA103 (Self-employment) form mappings, guidance text,
 * and 2025-26 UK tax band constants for use in the Self Assessment Wizard
 * and Accountant Portal.
 *
 * All monetary thresholds are in pence (integers).
 * No em dashes anywhere - hyphens only.
 */

// ---------------------------------------------------------------------------
// SA103 Box Mappings
// ---------------------------------------------------------------------------

export type Sa103Section =
  | "income"
  | "expenses"
  | "simplified_expenses"
  | "tax_adjustments";

export interface Sa103Box {
  /** The box number printed on the HMRC SA103 form */
  box: number;
  /** HMRC's official label for this box */
  label: string;
  /** Plain English explanation for self-employed drivers */
  description: string;
  /**
   * Which MileClear data field maps to this box.
   * Values: "totalEarnings" | "mileageDeduction" | "allowableExpenses" |
   *         "netProfit" | "motorExpenses" | "otherExpenses" | "adjustedProfit" |
   *         "taxableProfit" | "otherIncome" | "totalExpenses"
   */
  dataKey: string;
  /** Which section of the SA103 this box belongs to */
  section: Sa103Section;
}

/**
 * HMRC SA103 Self-employment form box mappings relevant to gig workers
 * and self-employed drivers using the simplified mileage method.
 *
 * Key rule: if you use simplified mileage (Box 46), you CANNOT also claim
 * actual motor expenses in Box 25. Other deductible expenses (parking,
 * tolls, phone) still go in Box 27.
 */
export const SA103_BOXES: readonly Sa103Box[] = [
  // ------ Income section --------------------------------------------------
  {
    box: 9,
    label: "Your turnover - the takings, fees, sales or money earned by your business",
    description:
      "Your total gross income from all self-employment sources in this tax year. " +
      "For gig workers this is the sum of all platform earnings before any expenses.",
    dataKey: "totalEarnings",
    section: "income",
  },
  {
    box: 10,
    label: "Any other business income not included in box 9",
    description:
      "Income from secondary self-employment activities not already counted in Box 9, " +
      "for example tips paid directly by customers or referral bonuses.",
    dataKey: "otherIncome",
    section: "income",
  },

  // ------ Expenses section (actual costs method) --------------------------
  {
    box: 17,
    label: "Total allowable expenses",
    description:
      "Total of all allowable business expenses claimed under the actual costs method. " +
      "Do NOT complete this section if you are using simplified mileage (Box 46) for " +
      "your vehicle costs - use the simplified expenses section instead.",
    dataKey: "totalExpenses",
    section: "expenses",
  },
  {
    box: 18,
    label: "Net profit - if your business income is more than your expenses",
    description:
      "Your taxable profit calculated as turnover minus total allowable expenses. " +
      "This is what HMRC uses to calculate your Income Tax and National Insurance bill.",
    dataKey: "netProfit",
    section: "expenses",
  },
  {
    box: 20,
    label: "Total allowable expenses (short form)",
    description:
      "On the short SA103S form this single box captures all allowable expenses combined. " +
      "On the full SA103F form individual expense categories are broken out separately.",
    dataKey: "allowableExpenses",
    section: "expenses",
  },
  {
    box: 25,
    label: "Motor expenses",
    description:
      "Actual vehicle running costs for the year (fuel, insurance, maintenance, MOT, " +
      "road tax, servicing), apportioned for business use. " +
      "IMPORTANT: you cannot claim Box 25 AND Box 46 (simplified mileage) in the same " +
      "tax year for the same vehicle. Choose one method and stick to it.",
    dataKey: "motorExpenses",
    section: "expenses",
  },
  {
    box: 27,
    label: "Other allowable business expenses",
    description:
      "Expenses that are deductible even if you use simplified mileage: parking charges, " +
      "bridge tolls, congestion / ULEZ charges, the business portion of your phone bill, " +
      "equipment, uniform or PPE, and subscription apps used for work.",
    dataKey: "otherExpenses",
    section: "expenses",
  },
  {
    box: 29,
    label: "Total allowable expenses (full form)",
    description:
      "Sum of all individual expense boxes on the full SA103F form. " +
      "If you use simplified mileage, this total will exclude motor expenses (Box 25) " +
      "and instead include only your non-vehicle allowable expenses.",
    dataKey: "totalExpenses",
    section: "expenses",
  },

  // ------ Simplified expenses section -------------------------------------
  {
    box: 46,
    label: "Flat rate expenses for vehicles (simplified expenses)",
    description:
      "The HMRC flat-rate mileage allowance for your business miles: 45p per mile " +
      "for the first 10,000 miles and 25p per mile above 10,000 miles (cars and vans). " +
      "Motorbikes use 24p per mile flat. This is calculated automatically by MileClear " +
      "from your classified business trips. Using this box means you cannot claim " +
      "actual vehicle costs in Box 25.",
    dataKey: "mileageDeduction",
    section: "simplified_expenses",
  },

  // ------ Tax adjustments section -----------------------------------------
  {
    box: 49,
    label: "Adjusted profit for the year",
    description:
      "Your net profit after any HMRC adjustments, disallowable expenses have been " +
      "added back, and any overlap relief or other adjustments have been applied.",
    dataKey: "adjustedProfit",
    section: "tax_adjustments",
  },
  {
    box: 51,
    label: "Total taxable profits from this business",
    description:
      "The final profit figure that feeds into your Self Assessment tax calculation. " +
      "This amount is added to any other income you have to determine your overall " +
      "Income Tax and National Insurance liability.",
    dataKey: "taxableProfit",
    section: "tax_adjustments",
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
    "vehicle running costs. For cars and vans the rate is 45p per mile for the first " +
    "10,000 business miles in a tax year, then 25p per mile for every mile above " +
    "10,000. Motorcycles use a flat 24p per mile. The amount goes in Box 46 of SA103. " +
    "You cannot claim actual running costs (Box 25) for the same vehicle in the same " +
    "year. Other expenses such as parking, tolls, and your work phone can still be " +
    "claimed separately in Box 27.",

  actualCosts:
    "Under the actual costs method you work out the real running costs of your vehicle " +
    "for the year - fuel, insurance, MOT, road tax, servicing and repairs - then " +
    "multiply by your business-use percentage (business miles divided by total miles). " +
    "These go in Box 25. You can also claim capital allowances for the vehicle itself. " +
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
