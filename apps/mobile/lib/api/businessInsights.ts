import { apiRequest } from "./index";
import type {
  BusinessInsights,
  WeeklyPnL,
  TaxSnapshot,
  ActivityHeatmap,
} from "@mileclear/shared";

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

// Free for all users - drives the dashboard activity heatmap.
// platform=null returns the unfiltered view across all platforms.
export function fetchActivityHeatmap(opts?: {
  weeksBack?: number;
  platform?: string | null;
}) {
  const params = new URLSearchParams();
  if (opts?.weeksBack) params.set("weeksBack", String(opts.weeksBack));
  if (opts?.platform) params.set("platform", opts.platform);
  const qs = params.toString();
  return apiRequest<{ data: ActivityHeatmap }>(
    `/business-insights/heatmap${qs ? `?${qs}` : ""}`
  );
}
