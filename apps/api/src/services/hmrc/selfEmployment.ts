// HMRC MTD ITSA — Self Employment Business API (read operations).
//
// Phase 2 day 2: read-only. Period summary creation (the harder
// mapping work) lands in day 3-5 once the schema-mapping helpers
// in services/hmrc/periodMapping.ts are in place.
//
// Endpoints (read):
//   GET /individuals/business/self-employment/{nino}/{businessId}/period?taxYear=YYYY-YY
//   GET /individuals/business/self-employment/{nino}/{businessId}/period/{periodId}?taxYear=YYYY-YY
//
// Endpoints (write — TODO day 3-5):
//   POST /individuals/business/self-employment/{nino}/{businessId}/period?taxYear=YYYY-YY
//   PUT  /individuals/business/self-employment/{nino}/{businessId}/period/{periodId}?taxYear=YYYY-YY
//
// Reference: https://developer.service.hmrc.uk/api-documentation/docs/api/service/self-employment-business-api/5.0

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall } from "./client.js";

const SE_API_VERSION = "5.0";

/**
 * Validate a tax year string in HMRC's YYYY-YY format (e.g. "2025-26").
 * The two halves must be consecutive years, and the second half must be
 * exactly the last two digits of (firstHalf + 1).
 */
export function isValidHmrcTaxYear(taxYear: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(taxYear);
  if (!match) return false;
  const start = parseInt(match[1], 10);
  const endShort = parseInt(match[2], 10);
  const expectedEndShort = (start + 1) % 100;
  return endShort === expectedEndShort;
}

/** Item in a period-summary list — the index, not the full data. */
export interface HmrcPeriodSummaryListItem {
  periodId: string;            // HMRC's identifier, format depends on API era
  periodStartDate: string;     // ISO date
  periodEndDate: string;       // ISO date
  creationDate?: string;       // ISO date — set after a submission is made
}

export interface HmrcPeriodSummaryListResponse {
  periods: HmrcPeriodSummaryListItem[];
}

/** Income block within a period-summary detail. */
export interface HmrcPeriodIncome {
  turnover?: number;     // Gross turnover for the period, in £.pp
  other?: number;        // Other business income (£.pp)
  taxTakenOffTradingIncome?: number;
}

/**
 * Expense block. Either detailed (per-category) or consolidated (single
 * total). HMRC accepts only one shape per submission; consolidatedExpenses
 * is for traders below the VAT threshold who aren't keeping detailed
 * categorisation.
 */
export interface HmrcPeriodExpenses {
  costOfGoods?: number;
  paymentsToSubcontractors?: number;
  wagesAndStaffCosts?: number;
  carVanTravelExpenses?: number;
  premisesRunningCosts?: number;
  maintenanceCosts?: number;
  adminCosts?: number;
  businessEntertainmentCosts?: number;
  advertisingCosts?: number;
  interestOnBankOtherLoans?: number;
  financeCharges?: number;
  irrecoverableDebts?: number;
  professionalFees?: number;
  depreciation?: number;
  otherExpenses?: number;
}

/** Disallowable expenses — the portion of each that's NOT tax-deductible. */
export interface HmrcPeriodDisallowableExpenses {
  costOfGoodsDisallowable?: number;
  paymentsToSubcontractorsDisallowable?: number;
  wagesAndStaffCostsDisallowable?: number;
  carVanTravelExpensesDisallowable?: number;
  premisesRunningCostsDisallowable?: number;
  maintenanceCostsDisallowable?: number;
  adminCostsDisallowable?: number;
  businessEntertainmentCostsDisallowable?: number;
  advertisingCostsDisallowable?: number;
  interestOnBankOtherLoansDisallowable?: number;
  financeChargesDisallowable?: number;
  irrecoverableDebtsDisallowable?: number;
  professionalFeesDisallowable?: number;
  depreciationDisallowable?: number;
  otherExpensesDisallowable?: number;
}

export interface HmrcPeriodSummaryDetail {
  periodDates: {
    periodStartDate: string;
    periodEndDate: string;
  };
  periodIncome?: HmrcPeriodIncome;
  periodExpenses?: HmrcPeriodExpenses;
  periodDisallowableExpenses?: HmrcPeriodDisallowableExpenses;
}

/**
 * List the period summaries already submitted for a tax year. A user with
 * no submissions yet for the year gets an empty array. Drives the "Q1
 * submitted ✓ / Q2 not yet" UI on the obligations screen.
 */
export async function listPeriodSummaries(args: {
  userId: string;
  nino: string;
  businessId: string;
  taxYear: string;          // "2025-26"
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcPeriodSummaryListItem[]> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }

  const data = await hmrcCall<HmrcPeriodSummaryListResponse>({
    userId: args.userId,
    method: "GET",
    path: `/individuals/business/self-employment/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/period`,
    apiVersion: SE_API_VERSION,
    query: { taxYear: args.taxYear },
    client: args.client,
    server: args.server,
  });

  return (data.periods ?? []).sort((a, b) =>
    a.periodStartDate.localeCompare(b.periodStartDate)
  );
}

/**
 * Retrieve the full detail of one previously-submitted period summary.
 * Used in the mobile UI to show "what we sent HMRC last quarter" and to
 * pre-fill an amend if the user notices an error.
 */
export async function retrievePeriodSummary(args: {
  userId: string;
  nino: string;
  businessId: string;
  taxYear: string;
  periodId: string;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcPeriodSummaryDetail> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }

  return hmrcCall<HmrcPeriodSummaryDetail>({
    userId: args.userId,
    method: "GET",
    path: `/individuals/business/self-employment/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/period/${encodeURIComponent(args.periodId)}`,
    apiVersion: SE_API_VERSION,
    query: { taxYear: args.taxYear },
    client: args.client,
    server: args.server,
  });
}
