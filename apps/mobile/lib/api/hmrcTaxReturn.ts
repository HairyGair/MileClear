// Mobile client for the end-of-year tax return routes (/hmrc/tax-return/*).
// Types mirror apps/api/src/services/hmrc/{taxReturn,annualMapping,annualSubmission}.ts.
// Kept apart from hmrc.ts so the quarterly update client stays untouched.

import { apiRequest } from "./index";

export interface TaxReturnQuarter {
  start: string;
  end: string;
  due: string;
  sent: boolean;
  received?: string;
}

export interface TaxReturnStatus {
  taxYear: string;
  environment: "sandbox" | "production";
  yearEnded: boolean;
  quarterly: { quarters: TaxReturnQuarter[]; sentCount: number; allSent: boolean };
  submitted: { calculationId: string; submittedAt?: string } | null;
}

export interface AnnualMappingItem {
  key: string;
  label: string;
  sent: boolean;
  reason: string;
}

export interface AnnualReview {
  /** What HMRC already holds for the year (sent by other software), or null. */
  held: Record<string, unknown> | null;
  proposal: {
    body: Record<string, unknown> | null;
    items: AnnualMappingItem[];
    notes: string[];
  };
}

export interface CalcMessage {
  id: string;
  text: string;
}

export interface TaxReturnCalculation {
  ready: boolean;
  calculationId: string;
  taxYear: string;
  calculationType?: string;
  periodFrom?: string;
  periodTo?: string;
  totalIncomeReceived?: number;
  personalAllowance?: number;
  totalAllowancesAndDeductions?: number;
  totalTaxableIncome?: number;
  incomeTax?: number;
  class2Nics?: number;
  class4Nics?: number;
  totalTaxDeducted?: number;
  totalIncomeTaxAndNicsDue?: number;
  incomeSources: Array<{ label: string; amount: number }>;
  taxBands: Array<{ name: string; rate: number; income: number; taxAmount: number }>;
  errors: CalcMessage[];
  warnings: CalcMessage[];
  info: CalcMessage[];
  /** Why this calculation can't be used for a tax return, or null. */
  blocker: string | null;
}

export interface TaxReturnSubmitted {
  taxYear: string;
  calculationId: string;
  correlationId: string | null;
  submittedAt: string;
  environment: "sandbox" | "production";
  totalIncomeTaxAndNicsDue: number | null;
}

const base = (taxYear: string) => `/hmrc/tax-return/${encodeURIComponent(taxYear)}`;

export function fetchTaxReturnStatus(taxYear: string) {
  return apiRequest<{ data: TaxReturnStatus }>(`${base(taxYear)}/status`);
}

export function fetchAnnualReview(taxYear: string) {
  return apiRequest<{ data: AnnualReview }>(`${base(taxYear)}/annual`);
}

export function triggerTaxReturnCalculation(taxYear: string) {
  return apiRequest<{ data: { calculationId: string } }>(`${base(taxYear)}/calculation`, {
    method: "POST",
    body: JSON.stringify({ otherIncomeConfirmed: true }),
  });
}

export function fetchTaxReturnCalculation(taxYear: string, calculationId: string) {
  return apiRequest<{ data: TaxReturnCalculation }>(
    `${base(taxYear)}/calculation/${encodeURIComponent(calculationId)}`
  );
}

export function submitTaxReturn(args: {
  taxYear: string;
  calculationId: string;
  declarationVersion: string;
}) {
  return apiRequest<{ data: TaxReturnSubmitted }>(`${base(args.taxYear)}/submit`, {
    method: "POST",
    body: JSON.stringify({
      calculationId: args.calculationId,
      declarationAccepted: true,
      otherIncomeConfirmed: true,
      declarationVersion: args.declarationVersion,
    }),
  });
}

/**
 * Poll until HMRC has finished the calculation. HMRC usually takes 10 to 30
 * seconds. Backoff 2s, 4s, 8s, then every 15s, about 3 minutes in all.
 */
export async function pollTaxReturnCalculation(
  taxYear: string,
  calculationId: string,
  options: { maxAttempts?: number; signal?: AbortSignal } = {}
): Promise<TaxReturnCalculation> {
  const maxAttempts = options.maxAttempts ?? 14;
  let delay = 2000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options.signal?.aborted) throw new Error("aborted");
    if (attempt > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, delay);
        options.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        });
      });
      delay = Math.min(delay * 2, 15000);
    }
    const { data } = await fetchTaxReturnCalculation(taxYear, calculationId);
    if (data.ready) return data;
  }
  throw new Error("HMRC is taking longer than usual to work out your tax. Try again in a few minutes.");
}
