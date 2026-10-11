// HMRC Making Tax Digital for Income Tax: Self Employment Business API 5.0,
// annual submission (allowances and adjustments for the year).
//
// Thin transport layer. What MileClear is willing to put in the body lives
// in annualMapping.ts; this file only talks to HMRC.
//
// Endpoints (SE Business API 5.0, checked against HMRC's OpenAPI spec 11 Oct 2026):
//   PUT    /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}  create or amend, 204
//   GET    /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}  retrieve, 404 if none
//   DELETE /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}  delete, 204
//
// Amending REPLACES the whole record: HMRC says "it is necessary to provide
// all previously submitted figures again in addition to any new information".
//
// Reference: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-employment-business-api/5.0
// Research notes: docs/hmrc-end-of-year-oct2026.md

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall, HmrcError } from "./client.js";
import { isValidHmrcTaxYear } from "./selfEmployment.js";

const SE_API_VERSION = "5.0";

/** Allowances block. All amounts in pounds, at most 2 decimal places. */
export interface HmrcAnnualAllowances {
  annualInvestmentAllowance?: number;
  capitalAllowanceMainPool?: number;
  capitalAllowanceSpecialRatePool?: number;
  businessPremisesRenovationAllowance?: number;
  enhancedCapitalAllowance?: number;
  allowanceOnSales?: number;
  capitalAllowanceSingleAssetPool?: number;
  zeroEmissionsCarAllowance?: number;
  /** 0 to 1000. Cannot be sent alongside any other allowance. */
  tradingIncomeAllowance?: number;
  /** 2026-27 onwards, marked "[Test only]" by HMRC. */
  firstYearAllowanceOnPlantAndMachinery?: number;
  structuredBuildingAllowance?: unknown[];
  enhancedStructuredBuildingAllowance?: unknown[];
}

/** Adjustments block. All amounts in pounds, at most 2 decimal places. */
export interface HmrcAnnualAdjustments {
  includedNonTaxableProfits?: number;
  basisAdjustment?: number;
  /** 2025-26 only, deprecated by HMRC. */
  overlapReliefUsed?: number;
  accountingAdjustment?: number;
  averagingAdjustment?: number;
  outstandingBusinessIncome?: number;
  balancingChargeBpra?: number;
  balancingChargeOther?: number;
  goodsAndServicesOwnUse?: number;
  transitionProfitAmount?: number;
  transitionProfitAccelerationAmount?: number;
  /** 2026-27 onwards. */
  adjustmentToProfitsForClass4?: number;
}

export interface HmrcAnnualSubmission {
  adjustments?: HmrcAnnualAdjustments;
  allowances?: HmrcAnnualAllowances;
  nonFinancials?: {
    class4NicsExemptionReason?: string;
  };
}

interface AnnualArgs {
  userId: string;
  nino: string;
  businessId: string;
  taxYear: string;
  client: ClientContext;
  server: ServerContext;
}

function annualPath(args: Pick<AnnualArgs, "nino" | "businessId" | "taxYear">): string {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }
  return `/individuals/business/self-employment/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/annual/${encodeURIComponent(args.taxYear)}`;
}

/** True when the body has nothing in it. HMRC rejects an empty body. */
export function isEmptyAnnualSubmission(body: HmrcAnnualSubmission | null | undefined): boolean {
  if (!body) return true;
  const blocks = [body.adjustments, body.allowances, body.nonFinancials];
  return blocks.every(
    (b) => !b || Object.values(b).every((v) => v === undefined || (Array.isArray(v) && v.length === 0))
  );
}

/**
 * Create or amend the annual submission. Idempotent PUT; replaces whatever
 * HMRC held before. Refuses an empty body locally rather than letting HMRC
 * answer RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED.
 */
export async function submitAnnualSubmission(
  args: AnnualArgs & { body: HmrcAnnualSubmission }
): Promise<void> {
  const path = annualPath(args);
  if (isEmptyAnnualSubmission(args.body)) {
    throw new Error("submitAnnualSubmission needs at least one figure; HMRC rejects an empty body");
  }
  await hmrcCall<unknown>({
    userId: args.userId,
    method: "PUT",
    path,
    apiVersion: SE_API_VERSION,
    body: args.body,
    client: args.client,
    server: args.server,
  });
}

/** Retrieve what HMRC holds for the year. Null when nothing has been sent (404). */
export async function retrieveAnnualSubmission(
  args: AnnualArgs
): Promise<HmrcAnnualSubmission | null> {
  const path = annualPath(args);
  try {
    const data = await hmrcCall<HmrcAnnualSubmission | undefined>({
      userId: args.userId,
      method: "GET",
      path,
      apiVersion: SE_API_VERSION,
      client: args.client,
      server: args.server,
    });
    return data ?? null;
  } catch (err) {
    if (err instanceof HmrcError && err.httpStatus === 404) return null;
    throw err;
  }
}

/** Delete the annual submission for the year. */
export async function deleteAnnualSubmission(args: AnnualArgs): Promise<void> {
  const path = annualPath(args);
  await hmrcCall<unknown>({
    userId: args.userId,
    method: "DELETE",
    path,
    apiVersion: SE_API_VERSION,
    client: args.client,
    server: args.server,
  });
}
