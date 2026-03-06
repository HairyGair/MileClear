import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchTrips, type TripWithVehicle } from "../lib/api/trips";
import { fetchVehicles } from "../lib/api/vehicles";
import type { Vehicle } from "@mileclear/shared";
import { parseTaxYear, getTaxYear } from "@mileclear/shared";

interface PersonalStats {
  monthMiles: number;
  monthTrips: number;
  monthLabel: string;
  weekTrips: TripWithVehicle[];
  primaryVehicle: Vehicle | null;
  prevMonthMiles: number | null;
  prevMonthTrips: number | null;
  busiestDay: string | null;
  avgTripMiles: number;
  yearBusiestMonth: string | null;
  loading: boolean;
}

export function usePersonalStats(): PersonalStats {
  const [monthMiles, setMonthMiles] = useState(0);
  const [monthTrips, setMonthTrips] = useState(0);
  const [weekTrips, setWeekTrips] = useState<TripWithVehicle[]>([]);
  const [primaryVehicle, setPrimaryVehicle] = useState<Vehicle | null>(null);
  const [prevMonthMiles, setPrevMonthMiles] = useState<number | null>(null);
  const [prevMonthTrips, setPrevMonthTrips] = useState<number | null>(null);
  const [busiestDay, setBusiestDay] = useState<string | null>(null);
  const [avgTripMiles, setAvgTripMiles] = useState(0);
  const [yearBusiestMonth, setYearBusiestMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-GB", { month: "long" });

  const load = useCallback(async () => {
    try {
      // Month start/end
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // Previous month
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      // Week start (Monday)
      const todayDow = now.getDay();
      const mondayOffset = todayDow === 0 ? 6 : todayDow - 1;
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - mondayOffset);
      weekStart.setHours(0, 0, 0, 0);

      // Tax year range for busiest month
      const currentTaxYear = getTaxYear(now);
      const { start: taxYearStart, end: taxYearEnd } = parseTaxYear(currentTaxYear);

      const [monthRes, weekRes, vehicleRes, prevMonthRes, yearRes] = await Promise.all([
        fetchTrips({
          from: monthStart.toISOString(),
          to: monthEnd.toISOString(),
          pageSize: 100,
        }).catch(() => null),
        fetchTrips({
          from: weekStart.toISOString(),
          to: now.toISOString(),
          pageSize: 100,
        }).catch(() => null),
        fetchVehicles().catch(() => null),
        fetchTrips({
          from: prevMonthStart.toISOString(),
          to: prevMonthEnd.toISOString(),
          pageSize: 100,
        }).catch(() => null),
        fetchTrips({
          from: taxYearStart.toISOString(),
          to: taxYearEnd.toISOString(),
          pageSize: 500,
        }).catch(() => null),
      ]);

      if (!mountedRef.current) return;

      if (monthRes) {
        const trips = monthRes.data;
        const totalMiles = trips.reduce((sum, t) => sum + t.distanceMiles, 0);
        setMonthMiles(totalMiles);
        setMonthTrips(monthRes.total);
        setAvgTripMiles(monthRes.total > 0 ? totalMiles / monthRes.total : 0);

        // Find busiest day of the week
        const dayTotals: Record<string, number> = {};
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        for (const t of trips) {
          const day = dayNames[new Date(t.startedAt).getDay()];
          dayTotals[day] = (dayTotals[day] ?? 0) + t.distanceMiles;
        }
        const entries = Object.entries(dayTotals);
        if (entries.length > 0) {
          entries.sort((a, b) => b[1] - a[1]);
          setBusiestDay(entries[0][0]);
        }
      }

      if (weekRes) {
        setWeekTrips(weekRes.data);
      }

      if (vehicleRes) {
        const primary = vehicleRes.data.find((v) => v.isPrimary) ?? vehicleRes.data[0] ?? null;
        setPrimaryVehicle(primary);
      }

      if (prevMonthRes) {
        const prevMiles = prevMonthRes.data.reduce((sum, t) => sum + t.distanceMiles, 0);
        setPrevMonthMiles(prevMiles);
        setPrevMonthTrips(prevMonthRes.total);
      }

      // Busiest month of the tax year
      if (yearRes && yearRes.data.length > 0) {
        const monthNames = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December",
        ];
        const monthTotals: Record<string, number> = {};
        for (const t of yearRes.data) {
          const m = monthNames[new Date(t.startedAt).getMonth()];
          monthTotals[m] = (monthTotals[m] ?? 0) + t.distanceMiles;
        }
        const entries = Object.entries(monthTotals);
        if (entries.length > 0) {
          entries.sort((a, b) => b[1] - a[1]);
          setYearBusiestMonth(entries[0][0]);
        }
      }
    } catch {
      // Silently fail
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return {
    monthMiles,
    monthTrips,
    monthLabel,
    weekTrips,
    primaryVehicle,
    prevMonthMiles,
    prevMonthTrips,
    busiestDay,
    avgTripMiles,
    yearBusiestMonth,
    loading,
  };
}
