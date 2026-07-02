// HMRC MTD ITSA — Individual Calculations API.
//
// Triggers HMRC's tax calculation engine against whatever data the user
// has submitted (period summaries from selfEmployment.ts, plus anything
// HMRC already knows from PAYE etc), and reads back the calculated
// figures: taxable income, income tax, NI2, NI4, total liability.
//
// MileClear uses this for two flows:
//
//   1. **Tax Readiness cross-check.** Our own Tax Readiness card estimates
//      tax+NI based on tracked profit. After a quarterly submission, we
//      ask HMRC to do the same calc and compare — if MileClear's estimate
//      diverges by >5%, we flag the discrepancy. Closes the loop on "is
//      our number actually right?"
//
//   2. **Year-end declaration ("crystallise").** At end of tax year the
//      user reviews HMRC's final calc, then crystallises = locks the
//      figures and submits the formal Self Assessment. Phase 2.5 / 3.
//
// Architecture note: trigger is async server-side at HMRC. POST returns
// immediately with a calculationId; HMRC takes 10-30s to actually run the
// calc; the GET endpoint returns 202 (still calculating) or 200 (done).
// Callers should poll. We don't add server-side polling here — mobile/web
// can poll directly with backoff.
//
// Endpoints (v8.0 — taxYear and calculationType moved into the path):
//   POST /individuals/calculations/{nino}/self-assessment/{taxYear}/trigger/{calculationType}
//   GET  /individuals/calculations/{nino}/self-assessment/{taxYear}
//   GET  /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}
//
// Reference: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-calculations-api/8.0

import type { ClientContext, ServerContext } from "./fraudPreventionHeaders.js";
import { hmrcCall } from "./client.js";
import { isValidHmrcTaxYear } from "./selfEmployment.js";

const CALC_API_VERSION = "8.0";

/**
 * Calculation type — what this calculation represents.
 *
 *  - in-year: an estimate based on data submitted so far. Default for
 *    MileClear's mid-year cross-check. Doesn't lock anything.
 *  - intent-to-finalise: signals the user intends to crystallise. HMRC
 *    runs the calc with end-of-year semantics; user can still amend.
 *  - intent-to-amend: a recalculation after amending an already-
 *    submitted period.
 */
export type CalculationType = "in-year" | "intent-to-finalise" | "intent-to-amend";

const VALID_CALC_TYPES: CalculationType[] = [
  "in-year",
  "intent-to-finalise",
  "intent-to-amend",
];

export function isValidCalculationType(t: string): t is CalculationType {
  return (VALID_CALC_TYPES as string[]).includes(t);
}

/** Response from POST trigger — calculation kicked off, but not yet ready.
 * v8.0 returns only the calculationId; we echo back the type we requested. */
export interface HmrcTriggerCalculationResponse {
  calculationId: string;
  calculationType?: CalculationType;
}

/** Item in the list-calculations response (v8.0). */
export interface HmrcCalculationListItem {
  calculationId: string;
  calculationTimestamp: string;        // ISO datetime
  calculationType: CalculationType;
  calculationTrigger?: string;         // e.g. "customer-request" | "unattended"
  calculationOutcome?: string;         // e.g. "PROCESSED" | "ERROR"
  requestedBy?: "customer" | "agent" | "hmrc";
  fromDate?: string;                   // ISO date
  toDate?: string;                     // ISO date
  totalIncomeTaxAndNicsDue?: number;   // pounds
  intentToCrystallise?: boolean;
  crystallised?: boolean;
}

export interface HmrcCalculationListResponse {
  calculations: HmrcCalculationListItem[];
}

/**
 * Headline calculation summary. The full HMRC response is enormous (the
 * v7 schema has dozens of nested sections — incomeSummary, taxableIncome,
 * incomeTaxNicsCalculated, allowancesDeductionsReliefs, lossSummary, etc).
 *
 * MileClear consumes only the headline figures. We keep the full payload
 * available via `raw` so the mobile UI can render any deeper section if
 * we add a "View full HMRC breakdown" screen later.
 */
export interface HmrcCalculationSummary {
  calculationId: string;
  taxYear: string;                          // "2025-26"
  /** Total income across all sources, in pounds. */
  totalIncomeReceived?: number;
  /** Allowances + deductions HMRC applied, in pounds. */
  totalAllowancesAndDeductions?: number;
  /** Income subject to tax after allowances, in pounds. */
  totalTaxableIncome?: number;
  /** Income tax amount before NIC, in pounds. */
  incomeTaxAmount?: number;
  /** Class 2 NI, in pounds. */
  nic2?: number;
  /** Class 4 NI, in pounds. */
  nic4?: number;
  /** Total income tax + NIC due, in pounds. The headline figure. */
  totalIncomeTaxAndNicsDue?: number;
  /** Whether the calculation has finished running on HMRC's side. */
  ready: boolean;
  /** Full HMRC response — preserved verbatim for downstream UI. */
  raw: unknown;
}

/**
 * Trigger a new calculation. HMRC runs this asynchronously; the calc
 * may not be ready when this returns. Caller should poll the retrieve
 * endpoint with the returned calculationId until it returns 200.
 */
export async function triggerCalculation(args: {
  userId: string;
  nino: string;
  taxYear: string;
  calculationType: CalculationType;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcTriggerCalculationResponse> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }
  if (!isValidCalculationType(args.calculationType)) {
    throw new Error(`Invalid calculationType: ${args.calculationType}`);
  }

  const res = await hmrcCall<{ calculationId: string }>({
    userId: args.userId,
    method: "POST",
    // v8.0: taxYear + calculationType are path segments; no query/body.
    path: `/individuals/calculations/${encodeURIComponent(args.nino)}/self-assessment/${encodeURIComponent(args.taxYear)}/trigger/${encodeURIComponent(args.calculationType)}`,
    apiVersion: CALC_API_VERSION,
    client: args.client,
    server: args.server,
  });
  return { calculationId: res.calculationId, calculationType: args.calculationType };
}

/**
 * List calculations for a tax year. Most recent first (HMRC sorts by
 * calculationTimestamp descending). Drives the "Recent calculations"
 * list in the mobile UI; users can tap one to view its breakdown.
 */
export async function listCalculations(args: {
  userId: string;
  nino: string;
  taxYear: string;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcCalculationListItem[]> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }

  const data = await hmrcCall<HmrcCalculationListResponse>({
    userId: args.userId,
    method: "GET",
    // v8.0: taxYear is a path segment, not a query param.
    path: `/individuals/calculations/${encodeURIComponent(args.nino)}/self-assessment/${encodeURIComponent(args.taxYear)}`,
    apiVersion: CALC_API_VERSION,
    client: args.client,
    server: args.server,
  });

  return data.calculations ?? [];
}

/**
 * Retrieve the full breakdown for one calculation. If the calc is still
 * running on HMRC's side, the response will indicate that — we surface
 * `ready: false` so callers know to poll again.
 *
 * Note: HMRC sometimes returns a 204/202 while calculating. Our hmrcCall
 * helper throws on non-2xx, so we depend on the body containing enough
 * shape to detect a "not ready yet" state. Currently we mark ready=true
 * whenever a body returns; HMRC's v7 schema always includes `metadata`
 * once the calc is started, and the headline endOfYearEstimate fields
 * appear once it completes.
 */
export async function retrieveCalculation(args: {
  userId: string;
  nino: string;
  taxYear: string;
  calculationId: string;
  client: ClientContext;
  server: ServerContext;
}): Promise<HmrcCalculationSummary> {
  if (!isValidHmrcTaxYear(args.taxYear)) {
    throw new Error(`Invalid HMRC tax year format: ${args.taxYear} (expected YYYY-YY)`);
  }
  const raw = await hmrcCall<HmrcCalculationRaw>({
    userId: args.userId,
    method: "GET",
    // v8.0: taxYear is a path segment between self-assessment and the id.
    path: `/individuals/calculations/${encodeURIComponent(args.nino)}/self-assessment/${encodeURIComponent(args.taxYear)}/${encodeURIComponent(args.calculationId)}`,
    apiVersion: CALC_API_VERSION,
    client: args.client,
    server: args.server,
  });

  return summariseCalculation(raw, args.calculationId);
}

// HMRC's v7 calculation response is sprawling. We type only the bits we
// summarise; everything else passes through under `raw` so the UI can
// rummage if needed.
interface HmrcCalculationRaw {
  metadata?: {
    calculationId?: string;
    taxYear?: string;
    calculationTimestamp?: string;
    calculationType?: string;
    requestedBy?: string;
    intentToCrystallise?: boolean;
    crystallised?: boolean;
  };
  calculation?: {
    // v8.0 headline location: calculation.taxCalculation.*
    taxCalculation?: {
      totalIncomeTaxAndNicsDue?: number;
      incomeTax?: {
        totalIncomeReceivedFromAllSources?: number;
        totalAllowancesAndDeductions?: number;
        totalTaxableIncome?: number;
        incomeTaxDueAfterReliefs?: number;
        incomeTaxCharged?: number;
      };
      nics?: {
        class2Nics?: { amount?: number };
        class4Nics?: { totalClass4Charge?: number };
      };
    };
    endOfYearEstimate?: {
      totalEstimatedIncome?: number;
      totalAllowancesAndDeductions?: number;
      totalTaxableIncome?: number;
      incomeTaxAmount?: number;
      nic2?: number;
      nic4?: number;
      totalNicAmount?: number;
      incomeTaxNicAmount?: number;
    };
    incomeSummary?: {
      totalIncomeReceived?: number;
    };
    taxableIncome?: {
      totalTaxableIncome?: number;
    };
    incomeTaxNicsCalculated?: {
      totalIncomeTaxAndNicsDue?: number;
      incomeTax?: { incomeTaxAmount?: number };
      nics?: { nic2NetOfDeductions?: number; nic4NetOfDeductions?: number };
    };
    allowancesAndDeductions?: {
      totalAllowancesAndDeductions?: number;
    };
  };
  // HMRC sometimes shape-shifts; we keep the rest of the body for
  // forwards-compat by relying on TypeScript's structural typing.
  [k: string]: unknown;
}

/**
 * Project the headline figures out of HMRC's response. Same logic
 * exposed as a pure function so we can unit-test it without going
 * through the full hmrcCall path.
 */
export function summariseCalculation(
  raw: HmrcCalculationRaw,
  fallbackCalcId: string
): HmrcCalculationSummary {
  const meta = raw.metadata ?? {};
  const calc = raw.calculation ?? {};
  const tc = calc.taxCalculation ?? {};          // v8.0 headline location
  const tci = tc.incomeTax ?? {};
  const tcn = tc.nics ?? {};
  const eoy = calc.endOfYearEstimate ?? {};
  const income = calc.incomeSummary ?? {};
  const taxable = calc.taxableIncome ?? {};
  const itnic = calc.incomeTaxNicsCalculated ?? {};   // v7.0 fallback
  const adr = calc.allowancesAndDeductions ?? {};

  // Totals — prefer the v8.0 taxCalculation figures, fall back to the
  // v8.0 endOfYearEstimate (in-year calcs) and finally the v7.0 shape.
  const totalIncomeTaxAndNicsDue =
    tc.totalIncomeTaxAndNicsDue ??
    eoy.incomeTaxNicAmount ??
    itnic.totalIncomeTaxAndNicsDue ??
    undefined;

  const incomeTaxAmount =
    tci.incomeTaxDueAfterReliefs ??
    tci.incomeTaxCharged ??
    eoy.incomeTaxAmount ??
    itnic.incomeTax?.incomeTaxAmount ??
    undefined;

  const nic2 =
    eoy.nic2 ?? tcn.class2Nics?.amount ?? itnic.nics?.nic2NetOfDeductions ?? undefined;
  const nic4 =
    eoy.nic4 ?? tcn.class4Nics?.totalClass4Charge ?? itnic.nics?.nic4NetOfDeductions ?? undefined;

  const totalIncomeReceived =
    tci.totalIncomeReceivedFromAllSources ??
    eoy.totalEstimatedIncome ??
    income.totalIncomeReceived ??
    undefined;

  const totalTaxableIncome =
    tci.totalTaxableIncome ?? eoy.totalTaxableIncome ?? taxable.totalTaxableIncome ?? undefined;

  const totalAllowancesAndDeductions =
    tci.totalAllowancesAndDeductions ??
    eoy.totalAllowancesAndDeductions ??
    adr.totalAllowancesAndDeductions ??
    undefined;

  // "Ready" = HMRC has produced at least the headline number. Mid-flight
  // responses can have metadata + empty calculation — we treat those as
  // not-ready so the caller polls again.
  const ready =
    totalIncomeTaxAndNicsDue !== undefined ||
    incomeTaxAmount !== undefined ||
    totalIncomeReceived !== undefined;

  return {
    calculationId: meta.calculationId ?? fallbackCalcId,
    taxYear: meta.taxYear ?? "",
    totalIncomeReceived,
    totalAllowancesAndDeductions,
    totalTaxableIncome,
    incomeTaxAmount,
    nic2,
    nic4,
    totalIncomeTaxAndNicsDue,
    ready,
    raw,
  };
}
