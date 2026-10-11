import type { SaChecklist } from "@mileclear/shared";
import { apiRequest } from "./index";

export interface SelfAssessmentPlatformRow {
  platform: string;
  totalPence: number;
  count: number;
}

export interface SelfAssessmentVehicleRow {
  vehicleId: string;
  make: string;
  model: string;
  vehicleType: string;
  businessMiles: number;
  personalMiles: number;
  totalMiles: number;
  deductionPence: number;
}

export interface SelfAssessmentExpenseRow {
  category: string;
  label: string;
  totalPence: number;
  deductibleWithMileage: boolean;
}

export interface TaxBandBreakdown {
  band: string;
  type: string;
  ratePct: number | null;
  amountPence: number;
  description: string;
}

export interface SelfAssessmentSummary {
  taxYear: string;
  // Step 2 - Income
  totalEarningsPence: number;
  platformBreakdown: SelfAssessmentPlatformRow[];
  // Step 3 - Mileage
  totalMiles: number;
  businessMiles: number;
  personalMiles: number;
  mileageDeductionPence: number;
  vehicleBreakdown: SelfAssessmentVehicleRow[];
  // Step 4 - Expenses
  expenseBreakdown: SelfAssessmentExpenseRow[];
  allowableExpensesPence: number;
  nonMileageExpensesPence: number;
  // Step 5 - Tax estimate
  taxableProfitPence: number;
  taxBandBreakdown: TaxBandBreakdown[];
  totalTaxPence: number;
  effectiveRatePercent: number;
  /** The driver's "pays Scottish income tax" answer; null = not answered
   *  (worked out on the England, Wales and NI rates, and the wizard asks).
   *  Missing from servers before 11 Oct 2026. */
  scottishTaxpayer?: boolean | null;
  incomeTaxRegion?: "rUK" | "scotland";
  /** True when this year's rates are not published yet and the latest stand in. */
  taxRatesProvisional?: boolean;
  // SA103 box values
  sa103Values: Record<string, number>;
}

/**
 * "Ready for 31 January?" checklist for the tax year the next 31 January
 * deadline is for. `preview` forces `inSeason` on, and the API only honours
 * it for admins (see lib/saCountdown.ts).
 */
export async function fetchSaChecklist(
  opts: { preview?: boolean } = {}
): Promise<{ data: SaChecklist }> {
  return apiRequest<{ data: SaChecklist }>(
    `/self-assessment/checklist${opts.preview ? "?preview=1" : ""}`
  );
}

export async function fetchSelfAssessmentSummary(
  taxYear: string
): Promise<{ data: SelfAssessmentSummary }> {
  return apiRequest<{ data: SelfAssessmentSummary }>(
    `/self-assessment/summary?taxYear=${encodeURIComponent(taxYear)}`
  );
}
