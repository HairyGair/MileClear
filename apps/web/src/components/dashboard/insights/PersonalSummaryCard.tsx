"use client";

import type { GamificationStats } from "@mileclear/shared";
import { Card, Figure, useData } from "../kit";
import { getData } from "./data";
import { fetchFuelMonth, type FuelMonth } from "./fuel";
import { CardFailed, CardLoading, miles, pounds, withBoundary } from "./ui";
import s from "./insights.module.css";

/** Personal view: today, this week and what fuel has cost this month. */
function PersonalSummaryCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement | null {
  const stats = useData<GamificationStats>("gamification-stats", () => getData("/gamification/stats"));
  const fuel = useData<FuelMonth>("fuel-month", () => fetchFuelMonth());

  if (stats.loading && !stats.data) return <CardLoading title="Your driving" />;
  if (stats.error) return <CardFailed title="Your driving" onRetry={stats.reload} />;
  if (!stats.data || stats.data.totalTrips === 0) return null;

  const f = fuel.data;
  const spend = f ? f.fuelPence + f.chargePence : 0;
  return (
    <Card title="Your driving">
      <div className={`${s.figures} ${s.three}`}>
        <Figure label="Today" value={miles(stats.data.todayMiles)} sub={`${stats.data.todayTrips} ${stats.data.todayTrips === 1 ? "trip" : "trips"}`} />
        <Figure label="This week" value={miles(stats.data.weekMiles)} />
        {f && spend > 0 ? (
          <Figure label="Fuel this month" value={pounds(spend)} />
        ) : (
          <Figure label="Streak" value={`${stats.data.currentStreakDays} ${stats.data.currentStreakDays === 1 ? "day" : "days"}`} />
        )}
      </div>
    </Card>
  );
}

export const PersonalSummaryCard = withBoundary(PersonalSummaryCardImpl);
