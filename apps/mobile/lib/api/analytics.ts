import { apiRequest } from "./index";
import type {
  DrivingAnalytics,
  WeeklyReport,
  FrequentRoute,
  ShiftSweetSpot,
  FuelCostBreakdown,
  EarningsDayPattern,
  CommuteTiming,
} from "@mileclear/shared";

export function fetchDrivingAnalytics() {
  return apiRequest<{ data: DrivingAnalytics }>("/analytics");
}

export function fetchWeeklyReport(weeksBack = 0) {
  return apiRequest<{ data: WeeklyReport }>(
    `/analytics/weekly-report?weeksBack=${weeksBack}`
  );
}

export function fetchFrequentRoutes() {
  return apiRequest<{ data: FrequentRoute[] }>("/analytics/routes");
}

export function fetchShiftSweetSpots() {
  return apiRequest<{ data: ShiftSweetSpot[] }>("/analytics/shift-sweet-spots");
}

export function fetchFuelCostBreakdown() {
  return apiRequest<{ data: FuelCostBreakdown }>("/analytics/fuel-cost");
}

export function fetchEarningsByDay() {
  return apiRequest<{ data: EarningsDayPattern[] }>("/analytics/earnings-by-day");
}

export function fetchCommuteTiming() {
  return apiRequest<{ data: CommuteTiming[] }>("/analytics/commute-timing");
}
