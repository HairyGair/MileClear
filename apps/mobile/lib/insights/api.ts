// Every request the Insights screen makes, behind the shared cache
// (requestCache.ts). Cards import these, never the raw api clients, so two
// cards asking for the same endpoint share one request and coming back to the
// screen inside the freshness window sends nothing.
//
// One endpoint per figure: docs/insights-oct2026/NUMBERS.md.

import { insightsCache } from "./requestCache";
import { fetchAchievements, fetchGamificationStats, fetchRecap, fetchScorecard } from "../api/gamification";
import {
  fetchActivityHeatmap,
  fetchLocalBenchmark,
  fetchPlatformLeague,
  fetchRunningCost,
} from "../api/businessInsights";
import { fetchDrivingAnalytics } from "../api/analytics";
import { fetchVehicles } from "../api/vehicles";
import { fetchEarnings } from "../api/earnings";
import { fetchFuelLogs } from "../api/fuel";
import { fetchTripSummary, fetchTrips } from "../api/trips";
import type { LocalBenchmarkMode, PlatformTag } from "@mileclear/shared";

/** YYYY-MM-DD from a local date (callers pass a noon anchor inside the period). */
export function dateParam(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const cachedStats = () => insightsCache.get("stats", () => fetchGamificationStats().then((r) => r.data));

export const cachedAchievements = () =>
  insightsCache.get("achievements", () => fetchAchievements().then((r) => r.data));

export const cachedVehicles = () => insightsCache.get("vehicles", () => fetchVehicles().then((r) => r.data));

export const cachedRecap = (period: "weekly" | "monthly", date: string, compare: boolean) =>
  insightsCache.get(`recap|${period}|${date}|${compare ? 1 : 0}`, () =>
    fetchRecap(period, date, { compare }).then((r) => r.data)
  );

export const cachedRunningCost = (period: "week" | "month", date: string) =>
  insightsCache.get(`running-cost|${period}|${date}`, () => fetchRunningCost(period, date).then((r) => r.data));

export const cachedPlatformPnL = (period: "week" | "month" | "tax_year", date: string) =>
  insightsCache.get(`platform-pnl|${period}|${date}`, () => fetchPlatformLeague(period, date).then((r) => r.data));

export const cachedTripSummary = (fromIso: string, toIso: string) =>
  insightsCache.get(`trip-summary|${fromIso}|${toIso}`, () =>
    fetchTripSummary({ from: fromIso, to: toIso }).then((r) => r.data)
  );

export const cachedBusinessTripSummary = (platform: string, fromIso: string, toIso: string) =>
  insightsCache.get(`trip-summary|business|${platform}|${fromIso}|${toIso}`, () =>
    fetchTripSummary({
      classification: "business",
      platformTag: platform as PlatformTag,
      from: fromIso,
      to: toIso,
    }).then((r) => r.data)
  );

export const cachedEarnings = (fromIso: string, toIso: string, page: number) =>
  insightsCache.get(`earnings|${fromIso}|${toIso}|${page}`, () =>
    fetchEarnings({ from: fromIso, to: toIso, page, pageSize: 100 })
  );

export const cachedTripsPage = (fromIso: string, toIso: string, page: number) =>
  insightsCache.get(`trips|${fromIso}|${toIso}|${page}`, () =>
    fetchTrips({ from: fromIso, to: toIso, page, pageSize: 200 })
  );

export const cachedHeatmap = () =>
  insightsCache.get("heatmap|12", () => fetchActivityHeatmap({ weeksBack: 12 }).then((r) => r.data));

export const cachedLocalBenchmark = (mode: LocalBenchmarkMode) =>
  insightsCache.get(`local-benchmark|${mode}`, () => fetchLocalBenchmark(mode).then((r) => r.data));

export const cachedDrivingAnalytics = () =>
  insightsCache.get("analytics", () => fetchDrivingAnalytics().then((r) => r.data));

export const cachedScorecard = () => insightsCache.get("scorecard", () => fetchScorecard().then((r) => r.data));

export const cachedFuelLogs = (fromIso: string, toIso: string) =>
  insightsCache.get(`fuel-logs|${fromIso}|${toIso}`, () => fetchFuelLogs({ from: fromIso, to: toIso, pageSize: 3 }));
