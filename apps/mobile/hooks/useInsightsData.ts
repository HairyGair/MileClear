// Data for the Insights frame, in small hooks. Every request goes through the
// shared cache in lib/insights/api.ts, so cards that need the same endpoint
// share one request and a return to the screen inside 60 s sends nothing.
// Sources: docs/insights-oct2026/NUMBERS.md.
//
//   usePeriodSummary   recap (Week/Month, compare=1 for Pro) or stats (Tax year)
//   usePeriodTrips     trips in the period, for the bars (not for Tax year)
//   useRecentTripDates trip dates for the Personal week streak
//   useInsightsProfile stats (lifetimeMiles, trips, unsorted), earned badges
//   useRunningCostInputs  the period's miles and the main vehicle
//
// Every hook takes `refreshKey`; bump it to reload (focus, pull to refresh).
// A pull to refresh calls insightsCache.invalidate() first.

import { useEffect, useRef, useState } from "react";
import type { AchievementWithMeta, GamificationStats, Vehicle } from "@mileclear/shared";
import { getLocalTrips } from "../lib/db/queries";
import {
  cachedAchievements,
  cachedRecap,
  cachedRunningCost,
  cachedStats,
  cachedTripSummary,
  cachedTripsPage,
  cachedVehicles,
  dateParam,
} from "../lib/insights/api";
import { getPeriodRange, type InsightsPeriod, type TripLike } from "../lib/insights/period";
import {
  previousFromRecap,
  totalsFromRecap,
  totalsFromStats,
  totalsFromTripSummary,
  type InsightsMode,
  type PeriodTotals,
} from "../lib/insights/periodTotals";

export type { PeriodTotals } from "../lib/insights/periodTotals";
export type Status = "loading" | "ready" | "error";

const PAGE = 200;

async function fetchTripsInRange(
  from: Date,
  to: Date,
  maxPages: number,
  businessOnly = false
): Promise<{ trips: TripLike[]; truncated: boolean }> {
  const out: TripLike[] = [];
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const res = await cachedTripsPage(from.toISOString(), to.toISOString(), page);
    for (const t of res.data) {
      if (businessOnly && t.classification !== "business") continue;
      out.push({ startedAt: t.startedAt, distanceMiles: t.distanceMiles, classification: t.classification });
    }
    if (page >= (res.totalPages ?? 1)) break;
    if (page === maxPages) truncated = true;
  }
  return { trips: out, truncated };
}

async function localTrips(from: Date, to: Date): Promise<TripLike[]> {
  const all = await getLocalTrips();
  return all
    .filter((t) => {
      const ms = new Date(t.startedAt).getTime();
      return ms >= from.getTime() && ms < to.getTime();
    })
    .map((t) => ({ startedAt: t.startedAt, distanceMiles: t.distanceMiles, classification: t.classification }));
}

function totalsFromTrips(trips: TripLike[]): PeriodTotals {
  const miles = trips.reduce((s, t) => s + t.distanceMiles, 0);
  return {
    miles,
    trips: trips.length,
    businessMiles: 0,
    claimPence: null,
    earningsPence: null,
    earningsCount: null,
    busiestDayLabel: null,
    busiestDayMiles: 0,
  };
}

interface Loaded {
  current: PeriodTotals;
  previous: PeriodTotals | null;
}

async function loadTotals(
  period: InsightsPeriod,
  offset: number,
  mode: InsightsMode,
  wantPrevious: boolean
): Promise<Loaded> {
  const range = getPeriodRange(period, offset);
  if (period === "tax_year") {
    if (offset === 0) {
      // Miles and claim from stats: the Tax year card reads the same call.
      const [stats, sum] = await Promise.all([
        cachedStats(),
        cachedTripSummary(range.start.toISOString(), range.end.toISOString()).catch(() => null),
      ]);
      const trips = sum ? (mode === "work" ? sum.businessTrips : sum.totalTrips) : 0;
      return { current: totalsFromStats(stats, trips, mode), previous: null };
    }
    const sum = await cachedTripSummary(range.start.toISOString(), range.end.toISOString());
    return { current: totalsFromTripSummary(sum, mode), previous: null };
  }
  const recap = await cachedRecap(period === "week" ? "weekly" : "monthly", dateParam(range.anchor), wantPrevious);
  return { current: totalsFromRecap(recap, mode), previous: wantPrevious ? previousFromRecap(recap, mode) : null };
}

export interface PeriodSummaryState {
  status: Status;
  current: PeriodTotals | null;
  previous: PeriodTotals | null;
  /** True when the figures came from this phone because the server was out of reach. */
  offline: boolean;
}

/** Which period the held figures belong to, so a period switch never shows the old one's. */
function periodKey(period: InsightsPeriod, offset: number, mode: string): string {
  return `${period}|${offset}|${mode}`;
}

export function usePeriodSummary(
  period: InsightsPeriod,
  offset: number,
  mode: InsightsMode,
  wantPrevious: boolean,
  refreshKey: number
): PeriodSummaryState {
  const [state, setState] = useState<PeriodSummaryState & { key: string }>({
    status: "loading",
    current: null,
    previous: null,
    offline: false,
    key: periodKey(period, offset, mode),
  });
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const key = periodKey(period, offset, mode);
    // Keep what is on screen while the SAME period reloads (focus, pull to
    // refresh). A different period starts from a skeleton: the old figures
    // under the new title would be wrong.
    setState((s) =>
      s.key === key && s.current ? s : { status: "loading", current: null, previous: null, offline: false, key }
    );
    (async () => {
      try {
        const { current, previous } = await loadTotals(period, offset, mode, wantPrevious);
        if (mine === seq.current) setState({ status: "ready", current, previous, offline: false, key });
      } catch {
        try {
          const range = getPeriodRange(period, offset);
          const local = (await localTrips(range.start, range.end)).filter(
            (t) => mode !== "work" || t.classification === "business"
          );
          if (mine === seq.current) {
            setState({ status: "ready", current: totalsFromTrips(local), previous: null, offline: true, key });
          }
        } catch {
          if (mine === seq.current) setState({ status: "error", current: null, previous: null, offline: false, key });
        }
      }
    })();
  }, [period, offset, mode, wantPrevious, refreshKey]);

  // The render straight after a switch, before the effect has run.
  if (state.key !== periodKey(period, offset, mode)) {
    return { status: "loading", current: null, previous: null, offline: false };
  }
  return state;
}

export interface PeriodTripsState {
  status: Status;
  trips: TripLike[];
  /** The bars would be wrong or too costly (more trips than we fetched, or Tax year): don't draw them. */
  truncated: boolean;
}

export function usePeriodTrips(
  period: InsightsPeriod,
  offset: number,
  mode: InsightsMode,
  refreshKey: number
): PeriodTripsState {
  const [state, setState] = useState<PeriodTripsState & { key: string }>({
    status: "loading",
    trips: [],
    truncated: false,
    key: periodKey(period, offset, mode),
  });
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const key = periodKey(period, offset, mode);
    // Same rule as the summary: old trips would be bucketed into the new period's bars.
    setState((s) => (s.key === key && s.status === "ready" ? s : { status: "loading", trips: [], truncated: false, key }));
    // Tax year: no bars. Fetching a year of trips (up to 2,000) for a chart is
    // not worth it; the figures come from stats.
    if (period === "tax_year") {
      setState({ status: "ready", trips: [], truncated: true, key });
      return;
    }
    const range = getPeriodRange(period, offset);
    const business = mode === "work";
    (async () => {
      try {
        const { trips, truncated } = await fetchTripsInRange(range.start, range.end, period === "week" ? 1 : 2, business);
        if (mine === seq.current) setState({ status: "ready", trips, truncated, key });
      } catch {
        try {
          const trips = (await localTrips(range.start, range.end)).filter((t) => !business || t.classification === "business");
          if (mine === seq.current) setState({ status: "ready", trips, truncated: false, key });
        } catch {
          if (mine === seq.current) setState({ status: "error", trips: [], truncated: false, key });
        }
      }
    })();
  }, [period, offset, mode, refreshKey]);

  if (state.key !== periodKey(period, offset, mode)) return { status: "loading", trips: [], truncated: false };
  return state;
}

/** Start times of recent trips (newest first, up to 2 pages) for the Personal week streak. */
export function useRecentTripDates(enabled: boolean, refreshKey: number): { status: Status; dates: string[] } {
  const [state, setState] = useState<{ status: Status; dates: string[] }>({ status: "loading", dates: [] });
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const mine = ++seq.current;
    const to = new Date(Date.now() + 86_400_000);
    const from = new Date(Date.now() - 30 * 7 * 86_400_000);
    (async () => {
      try {
        const { trips } = await fetchTripsInRange(from, to, 2);
        if (mine === seq.current) setState({ status: "ready", dates: trips.map((t) => t.startedAt) });
      } catch {
        try {
          const trips = await localTrips(from, to);
          if (mine === seq.current) setState({ status: "ready", dates: trips.map((t) => t.startedAt) });
        } catch {
          if (mine === seq.current) setState({ status: "error", dates: [] });
        }
      }
    })();
  }, [enabled, refreshKey]);

  return state;
}

export interface InsightsProfileState {
  status: Status;
  stats: GamificationStats | null;
  achievements: AchievementWithMeta[];
  /** Every mile ever (stats.lifetimeMiles). Not stats.totalMiles: that one is this tax year only. */
  lifetimeMiles: number | null;
  /** Every trip ever (stats.totalTrips counts all non-phantom trips). */
  lifetimeTrips: number | null;
}

export function useInsightsProfile(refreshKey: number): InsightsProfileState {
  const [state, setState] = useState<InsightsProfileState>({
    status: "loading",
    stats: null,
    achievements: [],
    lifetimeMiles: null,
    lifetimeTrips: null,
  });
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    (async () => {
      const [stats, ach] = await Promise.all([cachedStats().catch(() => null), cachedAchievements().catch(() => null)]);
      if (mine !== seq.current) return;
      setState((prev) => ({
        status: !stats && !ach ? (prev.stats ? "ready" : "error") : "ready",
        stats: stats ?? prev.stats,
        achievements: ach ?? prev.achievements,
        lifetimeMiles: stats ? (stats.lifetimeMiles ?? null) : prev.lifetimeMiles,
        lifetimeTrips: stats ? stats.totalTrips : prev.lifetimeTrips,
      }));
    })();
  }, [refreshKey]);

  return state;
}

export interface RunningCostInputs {
  /** Miles in the running-cost window (from /business-insights/running-cost). */
  miles: number;
  vehicle: Vehicle | null;
}

/** The window's miles (from the running-cost endpoint) and the main vehicle. */
export function useRunningCostInputs(
  enabled: boolean,
  costPeriod: "week" | "month",
  anchor: Date,
  refreshKey: number
): RunningCostInputs {
  const date = dateParam(anchor);
  const [state, setState] = useState<{ miles: number; vehicle: Vehicle | null; key: string }>({
    miles: 0,
    vehicle: null,
    key: "",
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const key = `${costPeriod}|${date}`;
    (async () => {
      const [cost, vehicles] = await Promise.all([
        cachedRunningCost(costPeriod, date).catch(() => null),
        cachedVehicles().catch(() => null),
      ]);
      if (cancelled) return;
      setState((prev) => ({
        miles: cost ? cost.period.miles : prev.key === key ? prev.miles : 0,
        vehicle: vehicles ? (vehicles.find((v) => v.isPrimary) ?? vehicles[0] ?? null) : prev.vehicle,
        key,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, costPeriod, date, refreshKey]);

  return { miles: state.miles, vehicle: state.vehicle };
}
