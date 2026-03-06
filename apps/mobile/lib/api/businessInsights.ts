import { apiRequest } from "./index";
import type { BusinessInsights, WeeklyPnL } from "@mileclear/shared";

export function fetchBusinessInsights() {
  return apiRequest<{ data: BusinessInsights }>("/business-insights");
}

export function fetchWeeklyPnL(weeksBack: number = 0) {
  return apiRequest<{ data: WeeklyPnL }>(
    `/business-insights/pnl?weeksBack=${weeksBack}`
  );
}
