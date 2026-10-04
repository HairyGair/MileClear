import type { TaxPlan, TaxPlannerSettings } from "@mileclear/shared";
import { apiRequest } from "./index";

// Free for all users: the tax bill planner (app/tax-planner.tsx).
export function fetchTaxPlan() {
  return apiRequest<{ data: TaxPlan }>("/tax-planner");
}

/** firstSelfEmployedTaxYear: a tax year, "earlier", or null (not said).
 *  bills: pence by tax year; null clears one back to MileClear's estimate. */
export function updateTaxPlannerSettings(patch: {
  firstSelfEmployedTaxYear?: string | null;
  bills?: Record<string, number | null>;
}) {
  return apiRequest<{ data: TaxPlannerSettings }>("/tax-planner/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
