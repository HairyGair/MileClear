// HMRC MTD ITSA — Business Source Adjustable Summary (BSAS).
//
// BSAS is HMRC's "year-end snapshot" mechanism: a user triggers a BSAS
// against a self-employment business after the four quarterly period
// summaries are in, sees what HMRC's bottom-line figures would be, and
// optionally applies adjustments before crystallising for Self Assessment.
//
// MileClear scope (this file):
//   - Trigger a BSAS for a self-employment business + accounting period
//   - List BSASes for a tax year
//   - Retrieve a self-employment BSAS with summariser projection
//
// What this file does NOT include (deferred):
//   - Adjustment submission (POST .../adjust). Most gig drivers don't
//     need adjustments — accountancy-grade BSAS adjustment lives in a
//     2.0.x release if it gets demand. Adding it later is straight
//     forward; the trigger/retrieve scaffolding is the harder bit.
//
// Schedule context: BSAS is NOT on the 7 August 2026 critical path.
// The first quarterly submission window only requires period summaries
// + Individual Calculations. BSAS comes into play at year-end (April
// 2027 onward). We're building the scaffolding now so the API surface
// is complete for the 1.2.0 release — Phase 3 mobile UI can lean on
// these endpoints when we add the year-end review screen later.
//
// Endpoints (v7.0):
//   POST /individuals/self-assessment/adjustable-summary
//   GET  /individuals/self-assessment/adjustable-summary?taxYear=YYYY-YY&typeOfBusiness=
//   GET  /individuals/self-assessment/adjustable-summary/self-employment/{calculationId}?taxYear=YYYY-YY
//
// Reference: https://developer.service.hmrc.uk/api-documentation/docs/api/service/business-source-adjustable-summary-api/

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall } from "./client.js";
import { isValidHmrcTaxYear } from "./selfEmployment.js";

const BSAS_API_VERSION = "7.0";

/** Business types BSAS can be triggered for. */
export type BsasBusinessType =
  | "self-employment"
  | "uk-property-fhl"        // Furnished Holiday Lettings
  | "uk-property-non-fhl"
  | "foreign-property-fhl-eea"
  | "foreign-property";

const VALID_BSAS_TYPES: BsasBusinessType[] = [
  "self-employment",
  "uk-property-fhl",
  "uk-property-non-fhl",
  "foreign-property-fhl-eea",
  "foreign-property",
];

export function isValidBsasBusinessType(t: string): t is BsasBusinessType {
  return (VALID_BSAS_TYPES as string[]).includes(t);
}

/** Response from triggering a BSAS — the calc is queued. */
export interface HmrcTriggerBsasResponse {
  calculationId: string;
}

/** A BSAS list item. */
export interface HmrcBsasListItem {
  bsasId: string;
  requestedDateTime: string;        // ISO datetime
  summaryStatus: "valid" | "invalid" | "superseded";
  adjustedSummary: boolean;
  /** Indicates whether this BSAS has been adjusted by the user. */
  adjustedDateTime?: string;
}

/** HMRC groups list results by business type. */
export interface HmrcBsasListResponse {
  businessSources: {
    typeOfBusiness: BsasBusinessType;
    businessId?: string;
    accountingPeriod: { startDate: string; endDate: string };
    taxYear: string;
    summaries: HmrcBsasListItem[];
  }[];
}

/**
 * Self-employment BSAS retrieve — projected headline figures.
 * The full HMRC response is large (inputs / summaryCalculation /
 * adjustments / adjustedSummaryCalculation); we type the headline
 * figures and pass the rest through as `raw`.
 */
export interface HmrcBsasSummary {
  bsasId: string;
  taxYear: string;
  typeOfBusiness: BsasBusinessType;
  businessId?: string;
  accountingPeriod: { startDate: string; endDate: string };
  summaryStatus: "valid" | "invalid" | "superseded";
  /** Has the user submitted any adjustments to this BSAS? */
  adjustedSummary: boolean;
  /** Pre-adjustment totals (what HMRC pulled from period summaries). */
  totalIncome?: number;             // pounds
  totalExpenses?: number;
  netProfit?: number;
  netLoss?: number;
  /** Post-adjustment totals — only present if user has applied adjustments. */
  adjustedNetProfit?: number;
  adjustedNetLoss?: number;
  ready: boolean;
  raw: unknown;
}

/**
 * Trigger a BSAS for a self-employment business + accounting period.
 * Returns the calculationId. Like Individual Calculations, HMRC runs
 * the calc asynchronously — caller polls retrieve until ready.
 */
export async function triggerBsas(args: {
  userId: string;
  businessId: string;
  taxYear: string;
  accountingPeriodStartDate: string;     // YYYY-MM-DD
  accountingPeriodEndDate: string;       // YYYY-MM-DD
  typeOfBusiness?: BsasBusinessType;     // defaults to self-employment
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcTriggerBsasResponse> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }
  const typeOfBusiness = args.typeOfBusiness ?? "self-employment";

  return hmrcCall<HmrcTriggerBsasResponse>({
    userId: args.userId,
    method: "POST",
    path: `/individuals/self-assessment/adjustable-summary`,
    apiVersion: BSAS_API_VERSION,
    body: {
      accountingPeriod: {
        startDate: args.accountingPeriodStartDate,
        endDate: args.accountingPeriodEndDate,
      },
      typeOfBusiness,
      businessId: args.businessId,
      taxYear: args.taxYear,
    },
    client: args.client,
    server: args.server,
  });
}

/**
 * List BSASes for a tax year, optionally filtered by business type. Most
 * MileClear users have one self-employment trade; passing typeOfBusiness
 * = "self-employment" returns just that bucket.
 */
export async function listBsas(args: {
  userId: string;
  taxYear: string;
  typeOfBusiness?: BsasBusinessType;
  businessId?: string;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcBsasListResponse> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }

  return hmrcCall<HmrcBsasListResponse>({
    userId: args.userId,
    method: "GET",
    path: `/individuals/self-assessment/adjustable-summary`,
    apiVersion: BSAS_API_VERSION,
    query: {
      taxYear: args.taxYear,
      ...(args.typeOfBusiness ? { typeOfBusiness: args.typeOfBusiness } : {}),
      ...(args.businessId ? { businessId: args.businessId } : {}),
    },
    client: args.client,
    server: args.server,
  });
}

/**
 * Retrieve a self-employment BSAS by calculationId. Returns the headline
 * summary; the full HMRC response sits under `raw` for downstream UIs
 * that want the per-line breakdown (inputs, summaryCalculation,
 * adjustments, adjustedSummaryCalculation).
 */
export async function retrieveSelfEmploymentBsas(args: {
  userId: string;
  calculationId: string;
  taxYear: string;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcBsasSummary> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }

  const raw = await hmrcCall<HmrcBsasRaw>({
    userId: args.userId,
    method: "GET",
    path: `/individuals/self-assessment/adjustable-summary/self-employment/${encodeURIComponent(args.calculationId)}`,
    apiVersion: BSAS_API_VERSION,
    query: { taxYear: args.taxYear },
    client: args.client,
    server: args.server,
  });

  return summariseBsas(raw, args.calculationId);
}

interface HmrcBsasRaw {
  metadata?: {
    calculationId?: string;
    requestedDateTime?: string;
    adjustedDateTime?: string;
    nino?: string;
    taxYear?: string;
    summaryStatus?: "valid" | "invalid" | "superseded";
  };
  inputs?: {
    businessId?: string;
    typeOfBusiness?: BsasBusinessType;
    accountingPeriod?: { startDate?: string; endDate?: string };
  };
  summaryCalculation?: {
    totalIncome?: number;
    totalExpenses?: number;
    netProfit?: number;
    netLoss?: number;
  };
  adjustedSummaryCalculation?: {
    netProfit?: number;
    netLoss?: number;
  };
  adjustments?: unknown;            // present only if user has adjusted
  [k: string]: unknown;
}

/**
 * Project the headline figures out of HMRC's BSAS response. Same
 * pattern as summariseCalculation in calculations.ts — pure function
 * so it's unit-testable without the network round-trip.
 */
export function summariseBsas(raw: HmrcBsasRaw, fallbackBsasId: string): HmrcBsasSummary {
  const meta = raw.metadata ?? {};
  const inputs = raw.inputs ?? {};
  const sc = raw.summaryCalculation ?? {};
  const asc = raw.adjustedSummaryCalculation;

  const adjustedSummary = asc !== undefined && asc !== null;

  const ready =
    sc.totalIncome !== undefined ||
    sc.totalExpenses !== undefined ||
    sc.netProfit !== undefined ||
    sc.netLoss !== undefined;

  return {
    bsasId: meta.calculationId ?? fallbackBsasId,
    taxYear: meta.taxYear ?? "",
    typeOfBusiness: (inputs.typeOfBusiness ?? "self-employment") as BsasBusinessType,
    businessId: inputs.businessId,
    accountingPeriod: {
      startDate: inputs.accountingPeriod?.startDate ?? "",
      endDate: inputs.accountingPeriod?.endDate ?? "",
    },
    summaryStatus: meta.summaryStatus ?? "valid",
    adjustedSummary,
    totalIncome: sc.totalIncome,
    totalExpenses: sc.totalExpenses,
    netProfit: sc.netProfit,
    netLoss: sc.netLoss,
    adjustedNetProfit: asc?.netProfit,
    adjustedNetLoss: asc?.netLoss,
    ready,
    raw,
  };
}
