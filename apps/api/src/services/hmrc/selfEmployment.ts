// HMRC MTD ITSA — Self Employment Business API.
//
// Read + write operations against the period summary endpoints. The
// MileClear-data-to-HMRC-payload mapping lives in periodMapping.ts;
// this file is the thin transport layer that talks to HMRC.
//
// Endpoints:
//   GET  /individuals/business/self-employment/{nino}/{businessId}/period?taxYear=YYYY-YY
//   GET  /individuals/business/self-employment/{nino}/{businessId}/period/{periodId}?taxYear=YYYY-YY
//   POST /individuals/business/self-employment/{nino}/{businessId}/period?taxYear=YYYY-YY
//   PUT  /individuals/business/self-employment/{nino}/{businessId}/period/{periodId}?taxYear=YYYY-YY
//
// Reference: https://developer.service.hmrc.uk/api-documentation/docs/api/service/self-employment-business-api/5.0

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall, HmrcError } from "./client.js";

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

/** Body shape for create + amend. periodDates only required on create. */
export interface HmrcPeriodSummarySubmitBody {
  periodDates?: {
    periodStartDate: string;
    periodEndDate: string;
  };
  periodIncome?: HmrcPeriodIncome;
  periodExpenses?: HmrcPeriodExpenses;
  periodDisallowableExpenses?: HmrcPeriodDisallowableExpenses;
}

/** HMRC's response when a period summary is created. */
export interface HmrcSubmitPeriodResponse {
  periodId: string;
}

/**
 * Submit a new quarterly period summary to HMRC. Returns the periodId
 * HMRC assigns — store it locally so the user can amend later if needed.
 *
 * Idempotency: HMRC rejects a second POST for the same period dates
 * (returns RULE_OVERLAPPING_PERIOD or RULE_DUPLICATE_PERIOD). The route
 * handler should catch those and route the user to the amend endpoint.
 */
export async function submitPeriodSummary(args: {
  userId: string;
  nino: string;
  businessId: string;
  taxYear: string;
  body: HmrcPeriodSummarySubmitBody;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcSubmitPeriodResponse> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }
  if (!args.body.periodDates) {
    throw new Error("submitPeriodSummary requires body.periodDates");
  }

  return hmrcCall<HmrcSubmitPeriodResponse>({
    userId: args.userId,
    method: "POST",
    path: `/individuals/business/self-employment/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/period`,
    apiVersion: SE_API_VERSION,
    query: { taxYear: args.taxYear },
    body: args.body,
    client: args.client,
    server: args.server,
  });
}

/**
 * Amend a previously-submitted period summary. periodDates cannot be
 * changed (HMRC keys the record by period boundary); pass income +
 * expenses only. HMRC accepts the same shape as create with periodDates
 * omitted — the periodId in the path identifies the record.
 */
export async function amendPeriodSummary(args: {
  userId: string;
  nino: string;
  businessId: string;
  taxYear: string;
  periodId: string;
  body: Omit<HmrcPeriodSummarySubmitBody, "periodDates">;
  client: ClientContext;
  server: ServerContext;
}): Promise<void> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }

  await hmrcCall<unknown>({
    userId: args.userId,
    method: "PUT",
    path: `/individuals/business/self-employment/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/period/${encodeURIComponent(args.periodId)}`,
    apiVersion: SE_API_VERSION,
    query: { taxYear: args.taxYear },
    body: args.body,
    client: args.client,
    server: args.server,
  });
}

// ── Cumulative period summary (v5.0, tax year 2025-26 onwards) ─────────────
//
// From 2025-26, in-year quarterly updates are CUMULATIVE year-to-date, not
// per-quarter. They go to a single idempotent PUT keyed by tax year - there is
// NO periodId. The old POST/PUT /period endpoints above are rejected for these
// years with RULE_TAX_YEAR_NOT_SUPPORTED, so this is the path that actually
// works for the MTD-mandated years.
//
//   PUT /individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}
//   GET /individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}
//
// periodDates spans the tax-year start (6 April) to the latest period end being
// reported; the income/expenses are the year-to-date totals.

/** Body for create/amend of a cumulative period summary. periodDates required. */
export interface HmrcCumulativeSubmitBody {
  periodDates: {
    periodStartDate: string;
    periodEndDate: string;
  };
  periodIncome?: HmrcPeriodIncome;
  periodExpenses?: HmrcPeriodExpenses;
  periodDisallowableExpenses?: HmrcPeriodDisallowableExpenses;
}

/**
 * Create or amend the cumulative period summary for a tax year. Idempotent:
 * the same PUT both creates the first time and amends thereafter. Returns
 * nothing (HMRC responds 200/204 with no periodId — the record is keyed by
 * tax year).
 */
export async function submitCumulativePeriodSummary(args: {
  userId: string;
  nino: string;
  businessId: string;
  taxYear: string;
  body: HmrcCumulativeSubmitBody;
  client: ClientContext;
  server: ServerContext;
}): Promise<void> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }
  if (!args.body.periodDates) {
    throw new Error("submitCumulativePeriodSummary requires body.periodDates");
  }

  await hmrcCall<unknown>({
    userId: args.userId,
    method: "PUT",
    path: `/individuals/business/self-employment/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/cumulative/${encodeURIComponent(args.taxYear)}`,
    apiVersion: SE_API_VERSION,
    body: args.body,
    client: args.client,
    server: args.server,
  });
}

/**
 * Retrieve the cumulative period summary for a tax year. Returns null when
 * nothing has been submitted yet (HMRC 404s in that case).
 */
export async function retrieveCumulativePeriodSummary(args: {
  userId: string;
  nino: string;
  businessId: string;
  taxYear: string;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcPeriodSummaryDetail | null> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }
  try {
    return await hmrcCall<HmrcPeriodSummaryDetail>({
      userId: args.userId,
      method: "GET",
      path: `/individuals/business/self-employment/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/cumulative/${encodeURIComponent(args.taxYear)}`,
      apiVersion: SE_API_VERSION,
      client: args.client,
      server: args.server,
    });
  } catch (err) {
    if (err instanceof HmrcError && err.httpStatus === 404) return null;
    throw err;
  }
}
