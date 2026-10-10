// The numbers Home's hero and door rows read, from the same endpoints (and the
// same request cache) the Insights screen uses, so Home can never disagree with
// the screen behind a door.
//
//  - this Monday-to-Sunday week and, in the end-of-week window, last week;
//  - the calendar month (Personal hero), with the month before for a quiet one;
//  - the next badge, cheapest fuel today, road alerts, and the tax line.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ACHIEVEMENT_META, formatPence, isSaCountdownSeason } from "@mileclear/shared";
import type { GamificationStats, PeriodRecap } from "@mileclear/shared";
import { cachedAchievements, cachedRecap, dateParam } from "../../lib/insights/api";
import { insightsCache } from "../../lib/insights/requestCache";
import { getPeriodRange } from "../../lib/insights/period";
import { nextBadges } from "../../lib/insights/badges";
import { fetchCheapestToday } from "../../lib/api/fuel";
import { fetchRoadAlerts } from "../../lib/api/roadAlerts";
import { getDatabase } from "../../lib/db/index";
import { useTaxOverview } from "../../lib/tax/useTaxOverview";
import { useMarRelief } from "../../lib/mileageRelief/useMarRelief";
import { homeLineText, isSelfEmployedPersona } from "../../lib/tax/persona";
import { badgesDoorText, earningsDoorText, fuelDoorText, insightsDoorText, saSeasonText } from "../../lib/home/doorText";
import { isEndOfWeek, type DoorTexts } from "../../lib/home/doors";
import type { HeroRecapTotals } from "../../lib/home/hero";
import type { HomePersona } from "../../lib/home/persona";

interface Args {
  mode: "work" | "personal";
  persona: HomePersona;
  stats: GamificationStats | null;
  isPro: boolean;
  userId: string | null | undefined;
  /** Bumped by pull to refresh. */
  refreshKey: number;
}

export interface HomeData {
  week: HeroRecapTotals | null;
  month: (HeroRecapTotals & { previousMiles: number | null }) | null;
  texts: DoorTexts;
  hasFuelLogs: boolean;
  endOfWeek: boolean;
}

function totals(r: PeriodRecap): HeroRecapTotals {
  return { totalMiles: r.totalMiles, businessMiles: r.businessMiles, totalTrips: r.totalTrips };
}

export function useHomeData(a: Args): HomeData {
  const { mode, persona, stats, isPro, userId, refreshKey } = a;
  const totalTrips = stats?.totalTrips ?? 0;
  const [weekRecap, setWeekRecap] = useState<PeriodRecap | null>(null);
  const [lastWeekRecap, setLastWeekRecap] = useState<PeriodRecap | null>(null);
  const [monthRecap, setMonthRecap] = useState<PeriodRecap | null>(null);
  const [achievedTypes, setAchievedTypes] = useState<string[] | null>(null);
  const [fuelData, setFuelData] = useState<Parameters<typeof fuelDoorText>[0]>(null);
  const [roadText, setRoadText] = useState<string | null>(null);
  const [hasFuelLogs, setHasFuelLogs] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const endOfWeek = isEndOfWeek(new Date());

  useEffect(() => {
    insightsCache.setScope(userId ?? null);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      setFocusTick((n) => n + 1);
    }, [])
  );

  // Recaps: this week (with the comparison for Pro), last week at the turn of
  // the week, and the month for Personal mode.
  useEffect(() => {
    if (totalTrips === 0) {
      setWeekRecap(null);
      setLastWeekRecap(null);
      setMonthRecap(null);
      return;
    }
    let cancelled = false;
    const now = new Date();
    const week = getPeriodRange("week", 0, now);
    cachedRecap("weekly", dateParam(week.anchor), isPro)
      .then((r) => !cancelled && setWeekRecap(r))
      .catch(() => {});
    if (endOfWeek) {
      const last = getPeriodRange("week", -1, now);
      cachedRecap("weekly", dateParam(last.anchor), false)
        .then((r) => !cancelled && setLastWeekRecap(r))
        .catch(() => {});
    } else {
      setLastWeekRecap(null);
    }
    if (mode === "personal") {
      const month = getPeriodRange("month", 0, now);
      cachedRecap("monthly", dateParam(month.anchor), true)
        .then((r) => !cancelled && setMonthRecap(r))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [totalTrips, isPro, endOfWeek, mode, refreshKey, focusTick]);

  // Badges.
  useEffect(() => {
    if (totalTrips === 0) return;
    let cancelled = false;
    cachedAchievements()
      .then((list) => !cancelled && setAchievedTypes(list.map((x) => x.type)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [totalTrips, refreshKey, focusTick]);

  // Fuel logged by this driver (decides whether Work mode may show the Fuel row).
  useEffect(() => {
    let cancelled = false;
    getDatabase()
      .then((db) => db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM fuel_logs"))
      .then((row) => !cancelled && setHasFuelLogs((row?.n ?? 0) > 0))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [focusTick]);

  // Cheapest fuel, only when a Fuel row could show.
  const wantsFuel = totalTrips > 0 && (mode === "personal" || hasFuelLogs);
  useEffect(() => {
    if (!wantsFuel) {
      setFuelData(null);
      return;
    }
    let cancelled = false;
    fetchCheapestToday()
      .then((res) => !cancelled && setFuelData(res.data ?? null))
      .catch(() => !cancelled && setFuelData(null));
    return () => {
      cancelled = true;
    };
  }, [wantsFuel, refreshKey, focusTick]);

  // Road alerts: the worst current one, else the next planned one.
  useEffect(() => {
    let cancelled = false;
    fetchRoadAlerts()
      .then((res) => {
        if (cancelled) return;
        const d = res.data;
        const top = d.enabled && d.available ? (d.current[0] ?? d.upcoming[0]) : null;
        setRoadText(top ? top.headline : null);
      })
      .catch(() => !cancelled && setRoadText(null));
    return () => {
      cancelled = true;
    };
  }, [refreshKey, focusTick]);

  // Tax line, shared with the Tax tab through the same overview cache.
  const { data: overview, refresh: refreshOverview } = useTaxOverview();
  const { totalReliefPence } = useMarRelief(overview?.relief ?? null);
  useEffect(() => {
    if (mode === "work") void refreshOverview();
  }, [mode, refreshOverview, focusTick]);

  const texts = useMemo<DoorTexts>(() => {
    // Tax: January season for self-employed drivers, else today's one-line summary.
    let tax: DoorTexts["tax"] = null;
    if (mode === "work") {
      const ret = overview?.return;
      if (isSelfEmployedPersona(persona) && ret && isSaCountdownSeason(new Date())) {
        const sa = saSeasonText({ attentionCount: ret.attentionCount, daysToDeadline: ret.daysToDeadline });
        if (sa) tax = { text: sa, route: "/sa-checklist" };
      }
      if (!tax) {
        const line = homeLineText(persona, overview ?? null, totalReliefPence, formatPence);
        if (line) tax = { text: line, route: "/(tabs)/tax" };
      }
    }

    const insightsText = insightsDoorText({
      mode,
      persona,
      endOfWeek,
      lastWeek: lastWeekRecap,
      thisWeek: weekRecap,
      isPro,
      totalTrips,
    });
    const monday = endOfWeek && lastWeekRecap && lastWeekRecap.totalTrips > 0;
    const insights: DoorTexts["insights"] = insightsText
      ? {
          text: insightsText,
          route: monday ? "/insights?period=week&offset=-1" : "/insights?period=week",
        }
      : null;

    let badges: string | null = null;
    if (stats && achievedTypes) {
      const next = nextBadges(
        Object.keys(ACHIEVEMENT_META),
        new Set(achievedTypes),
        {
          totalMiles: stats.totalMiles,
          totalTrips: stats.totalTrips,
          totalShifts: stats.totalShifts,
          longestStreakDays: stats.longestStreakDays,
        },
        mode,
        1
      )[0];
      const label = next ? (ACHIEVEMENT_META as Record<string, { label: string }>)[next.type]?.label : null;
      badges = next && label ? badgesDoorText({ label, progressText: next.progressText }) : null;
    }

    return {
      road: roadText ? { text: roadText } : null,
      tax,
      insights,
      earnings: mode === "work" ? earningsDoorText(weekRecap) : null,
      badges,
      fuel: fuelDoorText(fuelData),
    };
  }, [
    mode, persona, overview, totalReliefPence, endOfWeek, lastWeekRecap, weekRecap, isPro,
    totalTrips, stats, achievedTypes, roadText, fuelData,
  ]);

  const week = useMemo(() => (weekRecap ? totals(weekRecap) : null), [weekRecap]);
  const month = useMemo(
    () => (monthRecap ? { ...totals(monthRecap), previousMiles: monthRecap.previous?.totalMiles ?? null } : null),
    [monthRecap]
  );

  return { week, month, texts, hasFuelLogs, endOfWeek };
}
