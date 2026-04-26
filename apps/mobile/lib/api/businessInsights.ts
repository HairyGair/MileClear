import { apiRequest } from "./index";
import type { BusinessInsights, WeeklyPnL, TaxSnapshot } from "@mileclear/shared";

export function fetchBusinessInsights() {
  return apiRequest<{ data: BusinessInsights }>("/business-insights");
}

export function fetchWeeklyPnL(weeksBack: number = 0) {
  return apiRequest<{ data: WeeklyPnL }>(
    `/business-insights/pnl?weeksBack=${weeksBack}`
  );
}

// Free for all users - drives the dashboard tax-readiness card.
export function fetchTaxSnapshot() {
  return apiRequest<{ data: TaxSnapshot }>("/business-insights/tax-snapshot");
}
