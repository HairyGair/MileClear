// Mobile HMRC API client — typed wrappers for every /hmrc/* route.
//
// Type definitions mirror the server-side response shapes from
// apps/api/src/services/hmrc/*.ts. We re-declare here rather than
// importing across packages because the server's types live in the API
// workspace, not @mileclear/shared. If the contract drifts, server-side
// tests catch it; mobile-side TypeScript only enforces what we expect
// to receive.

import { apiRequest } from "./index";

// ── Types (mirror of server response shapes) ─────────────────────────

export interface HmrcStatus {
  connected: boolean;
  environment?: "sandbox" | "production";
  scopes?: string[];
  expiresAt?: string;
  connectedAt?: string;
  hasNino: boolean;
  hasBusinessId: boolean;
  businessId?: string | null;
}

export interface HmrcBusinessSummary {
  typeOfBusiness: "self-employment" | "uk-property" | "foreign-property";
  businessId: string;
  tradingName?: string;
}

export interface HmrcBusinessDetails {
  businessId: string;
  typeOfBusiness: HmrcBusinessSummary["typeOfBusiness"];
  tradingName?: string;
  accountingType?: "CASH" | "ACCRUALS";
  commencementDate?: string;
  cessationDate?: string;
  businessAddressDetails?: {
    line1?: string;
    line2?: string;
    line3?: string;
    line4?: string;
    postalCode?: string;
    countryCode?: string;
  };
  firstAccountingPeriodStartDate?: string;
  firstAccountingPeriodEndDate?: string;
}

export interface HmrcObligation {
  start: string;          // ISO date
  end: string;
  due: string;
  status: "Open" | "Fulfilled";
  receivedDate?: string;
  periodKey?: string;
}

export interface HmrcPeriodSummaryListItem {
  periodId: string;
  periodStartDate: string;
  periodEndDate: string;
  creationDate?: string;
}

export interface PeriodSubmissionBreakdown {
  income: {
    turnoverPence: number;
    otherPence: number;
    earningCount: number;
    perPlatform: { platform: string; pence: number; count: number }[];
  };
  mileage: {
    businessMilesThisPeriod: number;
    businessMilesPriorInTaxYear: number;
    deductionPence: number;
    rateFirst10kPence: number;
    rateAfter10kPence: number;
    vehicleType: "car" | "van" | "motorbike";
    crossesTenKThreshold: boolean;
    tripCount: number;
  };
  expenses: {
    carVanTravelPence: number;
    adminCostsPence: number;
    otherExpensesPence: number;
    excludedNonAmapPence: number;
    expenseCount: number;
  };
  warnings: string[];
}

export interface PeriodSubmissionPayload {
  periodDates: { periodStartDate: string; periodEndDate: string };
  periodIncome: { turnover?: number; other?: number };
  periodExpenses: {
    carVanTravelExpenses?: number;
    adminCosts?: number;
    otherExpenses?: number;
    [k: string]: number | undefined;
  };
  breakdown: PeriodSubmissionBreakdown;
}

export interface HmrcCalculationListItem {
  calculationId: string;
  calculationTimestamp: string;
  calculationType: "in-year" | "intent-to-finalise" | "intent-to-amend";
  fromDate?: string;
  toDate?: string;
  totalIncomeTaxAndNicsDue?: number;
  intentToCrystallise?: boolean;
  crystallised?: boolean;
}

export interface HmrcCalculationSummary {
  calculationId: string;
  taxYear: string;
  totalIncomeReceived?: number;
  totalAllowancesAndDeductions?: number;
  totalTaxableIncome?: number;
  incomeTaxAmount?: number;
  nic2?: number;
  nic4?: number;
  totalIncomeTaxAndNicsDue?: number;
  ready: boolean;
  raw: unknown;
}

// ── Connection management ────────────────────────────────────────────

export function fetchHmrcStatus() {
  return apiRequest<{ data: HmrcStatus }>("/hmrc/status");
}

/**
 * Authenticated call that returns the HMRC consent URL to open in an
 * in-app browser. The mobile client cannot hit /hmrc/authorize directly
 * via the browser because the browser session has no Authorization
 * header. This API call carries the user's JWT, persists the state
 * token server-side, and hands back the URL ready to open.
 */
export function fetchAuthorizeUrl() {
  return apiRequest<{ data: { url: string } }>("/hmrc/authorize");
}

export function disconnectHmrc() {
  return apiRequest<{ data: { disconnected: boolean } }>("/hmrc/disconnect", {
    method: "POST",
  });
}

export function setHmrcNino(nino: string) {
  return apiRequest<{ data: { nino: string } }>("/hmrc/nino", {
    method: "POST",
    body: JSON.stringify({ nino }),
  });
}

// ── Businesses ───────────────────────────────────────────────────────

export function fetchHmrcBusinesses() {
  return apiRequest<{ data: { businesses: HmrcBusinessSummary[] } }>(
    "/hmrc/businesses"
  );
}

export function fetchHmrcBusinessDetails(businessId: string) {
  return apiRequest<{ data: HmrcBusinessDetails }>(
    `/hmrc/businesses/${encodeURIComponent(businessId)}`
  );
}

export function setHmrcBusinessId(businessId: string) {
  return apiRequest<{ data: { businessId: string } }>("/hmrc/business-id", {
    method: "POST",
    body: JSON.stringify({ businessId }),
  });
}

// ── Obligations ──────────────────────────────────────────────────────

export function fetchHmrcObligations(args?: {
  from?: string;
  to?: string;
  status?: "Open" | "Fulfilled";
}) {
  const params = new URLSearchParams();
  if (args?.from) params.set("from", args.from);
  if (args?.to) params.set("to", args.to);
  if (args?.status) params.set("status", args.status);
  const qs = params.toString();
  return apiRequest<{ data: { obligations: HmrcObligation[] } }>(
    `/hmrc/obligations${qs ? `?${qs}` : ""}`
  );
}

// ── Period summaries ─────────────────────────────────────────────────

export function fetchHmrcPeriods(businessId: string, taxYear: string) {
  return apiRequest<{ data: { periods: HmrcPeriodSummaryListItem[] } }>(
    `/hmrc/businesses/${encodeURIComponent(businessId)}/periods?taxYear=${encodeURIComponent(taxYear)}`
  );
}

export function fetchHmrcPeriod(
  businessId: string,
  periodId: string,
  taxYear: string
) {
  return apiRequest<{ data: unknown }>(
    `/hmrc/businesses/${encodeURIComponent(businessId)}/periods/${encodeURIComponent(periodId)}?taxYear=${encodeURIComponent(taxYear)}`
  );
}

export function previewPeriodSubmission(args: {
  businessId: string;
  taxYear: string;
  from: string;
  to: string;
}) {
  const params = new URLSearchParams({
    taxYear: args.taxYear,
    from: args.from,
    to: args.to,
  });
  return apiRequest<{ data: PeriodSubmissionPayload }>(
    `/hmrc/businesses/${encodeURIComponent(args.businessId)}/periods/preview?${params.toString()}`
  );
}

export function submitPeriod(args: {
  businessId: string;
  taxYear: string;
  periodStartDate: string;
  periodEndDate: string;
}) {
  return apiRequest<{
    data: { periodId: string; breakdown: PeriodSubmissionBreakdown };
  }>(`/hmrc/businesses/${encodeURIComponent(args.businessId)}/periods`, {
    method: "POST",
    body: JSON.stringify({
      taxYear: args.taxYear,
      periodStartDate: args.periodStartDate,
      periodEndDate: args.periodEndDate,
    }),
  });
}

export function amendPeriod(args: {
  businessId: string;
  periodId: string;
  taxYear: string;
  periodStartDate: string;
  periodEndDate: string;
}) {
  return apiRequest<{
    data: { periodId: string; breakdown: PeriodSubmissionBreakdown };
  }>(
    `/hmrc/businesses/${encodeURIComponent(args.businessId)}/periods/${encodeURIComponent(args.periodId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        taxYear: args.taxYear,
        periodStartDate: args.periodStartDate,
        periodEndDate: args.periodEndDate,
      }),
    }
  );
}

// ── Calculations ─────────────────────────────────────────────────────

export function triggerCalculation(args: {
  taxYear: string;
  calculationType?: "in-year" | "intent-to-finalise" | "intent-to-amend";
}) {
  return apiRequest<{
    data: { calculationId: string; calculationType: string };
  }>("/hmrc/calculations", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function fetchCalculations(taxYear: string) {
  return apiRequest<{ data: { calculations: HmrcCalculationListItem[] } }>(
    `/hmrc/calculations?taxYear=${encodeURIComponent(taxYear)}`
  );
}

export function fetchCalculation(calculationId: string) {
  return apiRequest<{ data: HmrcCalculationSummary }>(
    `/hmrc/calculations/${encodeURIComponent(calculationId)}`
  );
}

/**
 * Polls the calculation endpoint with exponential backoff until it
 * reports `ready: true` or maxAttempts is exhausted. Used by the
 * "calculating your tax..." screen after triggering a calc.
 *
 * Backoff schedule: 2s, 4s, 8s, 16s, 30s, 30s, 30s... (capped at 30s)
 * Default maxAttempts of 12 covers ~3 minutes — typical HMRC calc
 * completes in 10-30s, this gives ample headroom.
 */
export async function pollCalculation(
  calculationId: string,
  options: { maxAttempts?: number; signal?: AbortSignal } = {}
): Promise<HmrcCalculationSummary> {
  const maxAttempts = options.maxAttempts ?? 12;
  let delay = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options.signal?.aborted) throw new Error("Calculation polling aborted");

    if (attempt > 0) {
      await sleep(delay, options.signal);
      delay = Math.min(delay * 2, 30000);
    }

    const { data } = await fetchCalculation(calculationId);
    if (data.ready) return data;
  }

  throw new Error(
    `Calculation ${calculationId} did not complete after ${maxAttempts} polling attempts`
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new Error("aborted"));
        return;
      }
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      });
    }
  });
}

// ── BSAS ─────────────────────────────────────────────────────────────

export function triggerBsas(args: {
  taxYear: string;
  businessId: string;
  accountingPeriodStartDate: string;
  accountingPeriodEndDate: string;
  typeOfBusiness?: string;
}) {
  return apiRequest<{ data: { calculationId: string } }>("/hmrc/bsas", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function fetchBsasList(args: {
  taxYear: string;
  typeOfBusiness?: string;
  businessId?: string;
}) {
  const params = new URLSearchParams({ taxYear: args.taxYear });
  if (args.typeOfBusiness) params.set("typeOfBusiness", args.typeOfBusiness);
  if (args.businessId) params.set("businessId", args.businessId);
  return apiRequest<{ data: unknown }>(`/hmrc/bsas?${params.toString()}`);
}

export function fetchBsas(bsasId: string, taxYear: string) {
  return apiRequest<{ data: unknown }>(
    `/hmrc/bsas/${encodeURIComponent(bsasId)}?taxYear=${encodeURIComponent(taxYear)}`
  );
}
