// What MileClear is willing to put in a driver's annual submission
// (allowances and adjustments, Self Employment Business API 5.0).
//
// Pure function, no I/O, so the rules can be tested on their own. The
// guiding rule: only send a figure MileClear can justify from its own data.
// Anything else is left empty and the driver is told, in plain English,
// what was not sent and why.
//
// The rules, with sources (full notes in docs/hmrc-end-of-year-oct2026.md):
//
// 1. Vehicle capital allowances: never sent.
//    MileClear claims vehicle costs with the flat rate per mile (simplified
//    expenses, the AMAP rates). GOV.UK "Simplified expenses: Vehicles": the
//    flat rate is used "instead of the actual costs of buying and running your
//    vehicle", and "You cannot claim simplified expenses for a vehicle you've
//    already claimed capital allowances for". Claiming both double counts the
//    vehicle. This covers capitalAllowanceMainPool, capitalAllowanceSpecialRatePool,
//    capitalAllowanceSingleAssetPool and zeroEmissionsCarAllowance for the vehicle.
//    https://www.gov.uk/simpler-income-tax-simplified-expenses/vehicles
//
// 2. Equipment allowances (annual investment allowance etc): never sent.
//    Cash basis: "you can only claim capital allowances on business cars"
//    (GOV.UK "Claim capital allowances: What you can claim on"), and equipment
//    is already claimed as an expense in MileClear's quarterly updates.
//    Traditional accounting: equipment may need capital allowances, which
//    MileClear does not work out. Either way MileClear sends nothing and
//    explains which case applies.
//    https://www.gov.uk/capital-allowances/what-you-can-claim-on
//
// 3. Trading allowance: never sent.
//    "cannot deduct any other expenses or allowances if you claim the
//    allowances" (GOV.UK "Tax-free allowances on property and trading income").
//    MileClear's quarterly updates already claim expenses, and HMRC's service
//    guide says all expenses must be removed from the final cumulative update
//    before the trading allowance is claimed. When the allowance would beat the
//    expenses claimed, the driver is told it might suit them.
//    https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income
//
// 4. Adjustments (basis adjustment, transition profit, balancing charges,
//    goods for own use, accounting and averaging adjustments, Class 4
//    adjustments) and the Class 4 exemption reason: never sent. MileClear holds
//    no data that produces any of them.
//
// Result today: the body is always null, so MileClear sends no annual
// submission. The function still returns a typed body so a future rule can
// add a figure in one place, with a test.

import type { HmrcAnnualSubmission } from "./annualSubmission.js";

/** The trading allowance, in pence. £1,000 a year. */
export const TRADING_ALLOWANCE_PENCE = 100_000;

export interface AnnualMappingInput {
  taxYear: string;
  /**
   * HMRC's accounting type for the business, from Business Details. Null
   * when HMRC did not say. "CASH" = cash basis, "ACCRUALS" = traditional.
   */
  accountingType: "CASH" | "ACCRUALS" | null;
  /** Income for the whole tax year, as worked out for the quarterly updates. */
  turnoverPence: number;
  /** Everything claimed against that income: mileage at the flat rate plus other expenses. */
  expensesClaimedPence: number;
}

export interface AnnualMappingItem {
  key: "vehicle_allowances" | "equipment_allowances" | "trading_allowance" | "adjustments";
  label: string;
  /** Always false today. Kept so the screen can show "Sent" once a rule sends something. */
  sent: boolean;
  reason: string;
}

export interface AnnualMappingResult {
  /** What to send to HMRC, or null when MileClear has nothing it can justify. */
  body: HmrcAnnualSubmission | null;
  items: AnnualMappingItem[];
  /** Extra things the driver should check before carrying on. */
  notes: string[];
}

function formatPounds(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function buildAnnualSubmission(input: AnnualMappingInput): AnnualMappingResult {
  const items: AnnualMappingItem[] = [];
  const notes: string[] = [];

  // Rule 1: vehicle.
  items.push({
    key: "vehicle_allowances",
    label: "Capital allowances on your vehicle",
    sent: false,
    reason:
      "Not sent. MileClear claims your vehicle with the flat rate per mile. That rate covers buying and running the vehicle, so you can't also claim capital allowances on it.",
  });

  // Rule 2: equipment.
  let equipmentReason: string;
  if (input.accountingType === "CASH") {
    equipmentReason =
      "Not sent. HMRC has you on cash basis. Equipment you bought, like a phone holder or a bag, is claimed as an expense in your quarterly updates instead.";
  } else if (input.accountingType === "ACCRUALS") {
    equipmentReason =
      "Not sent. HMRC has you on traditional accounting. Equipment may need capital allowances, and MileClear doesn't work those out.";
    notes.push(
      "HMRC has your business on traditional accounting. MileClear works out your figures as if you use cash basis. Check with an accountant before you submit your tax return."
    );
  } else {
    equipmentReason =
      "Not sent. On cash basis, equipment is already claimed as an expense in your quarterly updates. On traditional accounting it may need capital allowances, and MileClear doesn't work those out.";
  }
  items.push({
    key: "equipment_allowances",
    label: "Allowances on equipment",
    sent: false,
    reason: equipmentReason,
  });

  // Rule 3: trading allowance.
  items.push({
    key: "trading_allowance",
    label: "Trading allowance (£1,000)",
    sent: false,
    reason:
      "Not sent. You can't claim it as well as the expenses already in your quarterly updates.",
  });
  const allowanceWorth = Math.min(Math.max(input.turnoverPence, 0), TRADING_ALLOWANCE_PENCE);
  if (input.turnoverPence > 0 && allowanceWorth > input.expensesClaimedPence) {
    notes.push(
      `Your expenses for the year are ${formatPounds(Math.max(input.expensesClaimedPence, 0))}. The £1,000 trading allowance could lower your tax more. MileClear can't claim it for you, because your expenses would have to come out of your quarterly updates first. Speak to an accountant or HMRC before you carry on.`
    );
  }

  // Rule 4: adjustments.
  items.push({
    key: "adjustments",
    label: "Adjustments to your profit",
    sent: false,
    reason:
      "Not sent. MileClear has nothing that changes your profit at the end of the year, such as transition profit, balancing charges or goods you took for your own use. If one of these applies to you, send it with other software or HMRC online services.",
  });

  return { body: null, items, notes };
}
