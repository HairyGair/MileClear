// The Work-mode Share on Insights: the period's business mileage picture.
// Earnings are left out unless the driver switches "Include earnings" on
// (off by default, SPEC-UX 3.1). Places are never part of a share.

import type { BusinessRecapShareData } from "../../components/business/BusinessShareableRecap";
import type { PeriodTotals } from "./periodTotals";

export function buildBusinessShareData(
  label: string,
  current: Pick<PeriodTotals, "businessMiles" | "trips" | "claimPence" | "earningsPence">,
  includeEarnings: boolean
): BusinessRecapShareData {
  const earnings = includeEarnings ? Math.max(0, current.earningsPence ?? 0) : 0;
  return {
    variant: "mileage",
    periodLabel: label,
    grossEarningsPence: earnings,
    netProfitPence: 0,
    businessMiles: current.businessMiles,
    totalTrips: current.trips,
    earningsPerMilePence: 0,
    earningsPerHourPence: 0,
    hmrcDeductionPence: Math.max(0, current.claimPence ?? 0),
    avgShiftGrade: null,
    bestPlatform: null,
    totalShiftHours: 0,
  };
}

/** The switch only matters when there are earnings to include. */
export function canIncludeEarnings(current: Pick<PeriodTotals, "earningsPence">): boolean {
  return (current.earningsPence ?? 0) > 0;
}
