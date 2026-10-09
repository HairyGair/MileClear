// Data for the Insights frame, in small hooks so each source is easy to swap
// when docs/insights-oct2026/NUMBERS.md names the one source per figure.
//
//   usePeriodSummary   miles, trips, claim for the shown period (+ previous)
//   usePeriodTrips     trips in the shown period, for the bars
//   useRecentTripDates trip dates over ~30 weeks, for the Personal week streak
//   useInsightsProfile stats, earned badges, lifetime miles
//
// Every hook takes `refreshKey`; bump it to reload (focus, pull to refresh).
// Pages stay at 200 trips or fewer: the API rejects bigger pageSizes and the
// old 500 silently returned nothing.

import { useEffect, useRef, useState } from "react";
import type { AchievementWithMeta, GamificationStats, Vehicle } from "@mileclear/shared";
import { fetchVehicles } from "../lib/api/vehicles";
import { fetchAchievements, fetchGamificationStats, fetchRecap } from "../lib/api/gamification";
import { fetchTripSummary, fetchTrips } from "../lib/api/trips";
import { getLocalTrips } from "../lib/db/queries";
import { getPeriodRange, type InsightsPeriod, type TripLike } from "../lib/insights/period";

export type Status = "loading" | "ready" | "error";

export interface PeriodTotals {
  miles: number;
  trips: number;
  businessMiles: number;
  /** Mileage claim in pence, or null when this source can't say. */
  claimPence: number | null;
  busiestDayLabel: string | null;
  busiestDayMiles: number;
}

const PAGE = 200;

async function fetchAllTrips(from: Date, to: Date, maxPages: number): Promise<{ trips: TripLike[]; truncated: boolean }> {
  const out: TripLike[] = [];
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchTrips({ from: from.toISOString(), to: to.toISOString(), page, pageSize: PAGE });
    for (const t of res.data) out.push({ startedAt: t.startedAt, distanceMiles: t.distanceMiles });
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
    .map((t) => ({ startedAt: t.startedAt, distanceMiles: t.distanceMiles }));
}

function totalsFromTrips(trips: TripLike[]): PeriodTotals {
  const miles = trips.reduce((s, t) => s + t.distanceMiles, 0);
  return { miles, trips: trips.length, businessMiles: 0, claimPence: null, busiestDayLabel: null, busiestDayMiles: 0 };
}

async function loadTotals(period: InsightsPeriod, offset: number): Promise<PeriodTotals> {
  const range = getPeriodRange(period, offset);
  if (period === "tax_year") {
    const [sum, stats] = await Promise.all([
      fetchTripSummary({ from: range.start.toISOString(), to: range.end.toISOString() }),
      offset === 0 ? fetchGamificationStats().catch(() => null) : Promise.resolve(null),
    ]);
    return {
      miles: sum.data.totalMiles,
      trips: sum.data.totalTrips,
      businessMiles: sum.data.businessMiles,
      claimPence: stats ? stats.data.deductionPence : null,
      busiestDayLabel: null,
      busiestDayMiles: 0,
    };
  }
  const res = await fetchRecap(period === "week" ? "weekly" : "monthly", range.anchor.toISOString());
  const r = res.data;
  return {
    miles: r.totalMiles,
    trips: r.totalTrips,
    businessMiles: r.businessMiles,
    claimPence: r.deductionPence,
    busiestDayLabel: r.busiestDayLabel,
    busiestDayMiles: r.busiestDayMiles,
  };
}

export interface PeriodSummaryState {
  status: Status;
  current: PeriodTotals | null;
  previous: PeriodTotals | null;
  /** True when the figures came from this phone because the server was out of reach. */
  offline: boolean;
}

export function usePeriodSummary(
  period: InsightsPeriod,
  offset: number,
  wantPrevious: boolean,
  refreshKey: number
): PeriodSummaryState {
  const [state, setState] = useState<PeriodSummaryState>({ status: "loading", current: null, previous: null, offline: false });
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    // Keep what is on screen while reloading; only the first load shows skeletons.
    setState((s) => (s.current ? s : { ...s, status: "loading" }));
    (async () => {
      try {
        const [current, previous] = await Promise.all([
          loadTotals(period, offset),
          wantPrevious && period !== "tax_year" ? loadTotals(period, offset - 1).catch(() => null) : Promise.resolve(null),
        ]);
        if (mine === seq.current) setState({ status: "ready", current, previous, offline: false });
      } catch {
        try {
          const range = getPeriodRange(period, offset);
          const local = await localTrips(range.start, range.end);
          if (mine === seq.current) setState({ status: "ready", current: totalsFromTrips(local), previous: null, offline: true });
        } catch {
          if (mine === seq.current) setState({ status: "error", current: null, previous: null, offline: false });
        }
      }
    })();
  }, [period, offset, wantPrevious, refreshKey]);

  return state;
}

export interface PeriodTripsState {
  status: Status;
  trips: TripLike[];
  /** More trips than we fetched; the bars would be wrong, so don't draw them. */
  truncated: boolean;
}

export function usePeriodTrips(period: InsightsPeriod, offset: number, refreshKey: number): PeriodTripsState {
  const [state, setState] = useState<PeriodTripsState>({ status: "loading", trips: [], truncated: false });
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setState((s) => (s.status === "ready" ? s : { ...s, status: "loading" }));
    const range = getPeriodRange(period, offset);
    (async () => {
      try {
        const { trips, truncated } = await fetchAllTrips(range.start, range.end, period === "tax_year" ? 10 : 3);
        if (mine === seq.current) setState({ status: "ready", trips, truncated });
      } catch {
        try {
          const trips = await localTrips(range.start, range.end);
          if (mine === seq.current) setState({ status: "ready", trips, truncated: false });
        } catch {
          if (mine === seq.current) setState({ status: "error", trips: [], truncated: false });
        }
      }
    })();
  }, [period, offset, refreshKey]);

  return state;
}

/** Start times of trips over the last ~30 weeks, newest data included. */
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
        const { trips } = await fetchAllTrips(from, to, 5);
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
  /** Lifetime miles and trips. Not stats.totalMiles: that one is this tax year only. */
  lifetimeMiles: number | null;
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
      const [stats, ach, life] = await Promise.all([
        fetchGamificationStats().catch(() => null),
        fetchAchievements().catch(() => null),
        fetchTripSummary().catch(() => null),
      ]);
      if (mine !== seq.current) return;
      setState((prev) => ({
        status: !stats && !ach && !life ? (prev.stats ? "ready" : "error") : "ready",
        stats: stats ? stats.data : prev.stats,
        achievements: ach ? ach.data : prev.achievements,
        lifetimeMiles: life ? life.data.totalMiles : prev.lifetimeMiles,
        lifetimeTrips: life ? life.data.totalTrips : prev.lifetimeTrips,
      }));
    })();
  }, [refreshKey]);

  return state;
}

/** What the fuel and charging cards need: this month's miles and the main vehicle. */
export function useRunningCostInputs(
  enabled: boolean,
  refreshKey: number
): { monthMiles: number; vehicle: Vehicle | null } {
  const [state, setState] = useState<{ monthMiles: number; vehicle: Vehicle | null }>({ monthMiles: 0, vehicle: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    (async () => {
      const [sum, vehicles] = await Promise.all([
        fetchTripSummary({ from: from.toISOString(), to: now.toISOString() }).catch(() => null),
        fetchVehicles().catch(() => null),
      ]);
      if (cancelled) return;
      setState((prev) => ({
        monthMiles: sum ? sum.data.totalMiles : prev.monthMiles,
        vehicle: vehicles ? (vehicles.data.find((v) => v.isPrimary) ?? vehicles.data[0] ?? null) : prev.vehicle,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return state;
}
