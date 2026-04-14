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
  // SA103 box values
  sa103Values: Record<string, number>;
}

export async function fetchSelfAssessmentSummary(
  taxYear: string
): Promise<{ data: SelfAssessmentSummary }> {
  return apiRequest<{ data: SelfAssessmentSummary }>(
    `/self-assessment/summary?taxYear=${encodeURIComponent(taxYear)}`
  );
}
