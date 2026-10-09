"use client";

import type { GamificationStats } from "@mileclear/shared";
import { BarChart } from "../charts";
import { JourneyMapCard } from "../trips/JourneyMapCard";
import { Card, Figure, useData } from "../kit";
import { getData } from "./data";
import { fetchFuelMonth, type FuelMonth } from "./fuel";
import { MilestoneCard } from "./MilestoneCard";
import { PersonalSummaryCard } from "./PersonalSummaryCard";
import { CardFailed, CardLoading, Takeaway, DAYS_LONG, DAYS_MON_FIRST, pounds, withBoundary } from "./ui";
import s from "./insights.module.css";

function WeeklyActivity() {
  const { data, error, loading, reload } = useData<GamificationStats>("gamification-stats", () => getData("/gamification/stats"));
  if (loading && !data) return <CardLoading title="Weekly activity" />;
  if (error) return <CardFailed title="Weekly activity" onRetry={reload} />;
  const days = data?.drivingPatterns?.dayOfWeek;
  if (!days || days.every((d) => d === 0)) return null;
  const bestIdx = days.indexOf(Math.max(...days));
  return (
    <Card title="Weekly activity">
      <Takeaway>You drive most on a {DAYS_LONG[bestIdx]}.</Takeaway>
      <BarChart
        label="Trips by day of the week"
        unit="trips"
        highlightIndex={bestIdx}
        data={days.map((v, i) => ({ label: DAYS_MON_FIRST[i], fullLabel: DAYS_LONG[i], value: v }))}
      />
    </Card>
  );
}

function FuelAndCharging() {
  const { data, error, loading, reload } = useData<FuelMonth>("fuel-month", () => fetchFuelMonth());
  if (loading && !data) return <CardLoading title="Fuel and running costs" />;
  if (error) return <CardFailed title="Fuel and running costs" onRetry={reload} />;
  if (!data || (data.fuelFills === 0 && data.chargeSessions === 0)) return null;
  return (
    <>
      {data.fuelFills > 0 && (
        <Card title="Fuel this month" action={{ label: "Fuel log", href: "/dashboard/fuel" }}>
          <div className={s.figures}>
            <Figure label="Spent" value={pounds(data.fuelPence)} />
            <Figure label={data.fuelFills === 1 ? "Fill-up" : "Fill-ups"} value={String(data.fuelFills)} />
          </div>
        </Card>
      )}
      {data.chargeSessions > 0 && (
        <Card title="Charging this month" action={{ label: "Fuel log", href: "/dashboard/fuel" }}>
          <div className={`${s.figures} ${s.three}`}>
            <Figure label="Spent" value={pounds(data.chargePence)} />
            <Figure label={data.chargeSessions === 1 ? "Session" : "Sessions"} value={String(data.chargeSessions)} />
            <Figure label="Energy" value={`${Math.round(data.chargeKwh * 10) / 10} kWh`} />
          </div>
        </Card>
      )}
    </>
  );
}

/** The Personal block on Insights. */
function PersonalInsightsImpl(): React.ReactElement {
  return (
    <div className={s.grid}>
      <PersonalSummaryCard mode="personal" />
      <WeeklyActivity />
      <MilestoneCard mode="personal" />
      <FuelAndCharging />
      <JourneyMapCard mode="personal" />
    </div>
  );
}

export const PersonalInsights = withBoundary(PersonalInsightsImpl);
