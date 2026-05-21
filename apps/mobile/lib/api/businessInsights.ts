import { apiRequest } from "./index";
import type {
  BusinessInsights,
  WeeklyPnL,
  TaxSnapshot,
  ActivityHeatmap,
  BenchmarkSnapshot,
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

// Free for all users - anonymous benchmarking vs other UK drivers.
export function fetchBenchmarks() {
  return apiRequest<{ data: BenchmarkSnapshot }>("/business-insights/benchmarks");
}

// Phase 3 of the Money Picture stack (22 May 2026). Pro-only.
export interface PnlRow {
  grossEarningsPence: number;
  expensesPence: number;
  fuelPence: number;
  netPence: number;
  trips: number;
  businessMiles: number;
}
export interface PlatformPnLRow extends PnlRow {
  platform: string;
}
export interface ProjectPnLRow extends PnlRow {
  projectLabel: string;
}
export interface ShiftPnLRow extends PnlRow {
  shiftId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
}

export function fetchPlatformPnL(days: number = 30) {
  return apiRequest<{ data: PlatformPnLRow[] }>(
    `/business-insights/platform-pnl?days=${days}`
  );
}
export function fetchProjectPnL(days: number = 90) {
  return apiRequest<{ data: ProjectPnLRow[] }>(
    `/business-insights/project-pnl?days=${days}`
  );
}
export function fetchShiftPnL(shiftId: string) {
  return apiRequest<{ data: ShiftPnLRow }>(
    `/business-insights/shift-pnl/${shiftId}`
  );
}
