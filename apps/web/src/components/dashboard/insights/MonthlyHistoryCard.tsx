"use client";

import type { PeriodRecap } from "@mileclear/shared";
import { api } from "@/lib/api";
import { BarChart } from "../charts";
import { Card, useData } from "../kit";
import { CardFailed, CardLoading, Takeaway, withBoundary } from "./ui";

interface MonthBar {
  label: string;
  fullLabel: string;
  miles: number;
}

async function fetchSixMonths(now: Date = new Date()): Promise<MonthBar[]> {
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 15));
  const results = await Promise.all(
    months.map((d, i) =>
      i === months.length - 1
        ? api.get<{ data: PeriodRecap }>("/gamification/recap?period=monthly")
        : api.get<{ data: PeriodRecap }>(`/gamification/recap?period=monthly&date=${d.toISOString()}`)
    )
  );
  return months.map((d, i) => ({
    label: d.toLocaleDateString("en-GB", { month: "short" }).replace(/\bSept\b/, "Sep"),
    fullLabel: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    miles: Math.round(results[i].data.totalMiles * 10) / 10,
  }));
}

/** Miles by month for the last six months. */
function MonthlyHistoryCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement | null {
  const { data, error, loading, reload } = useData<MonthBar[]>("recap-six-months", () => fetchSixMonths());

  if (loading && !data) return <CardLoading title="Month by month" />;
  if (error) return <CardFailed title="Month by month" onRetry={reload} />;
  if (!data || data.every((m) => m.miles === 0)) return null;

  const best = data.reduce((a, b) => (b.miles > a.miles ? b : a));
  return (
    <Card title="Month by month">
      <Takeaway>Your busiest month was {best.fullLabel}.</Takeaway>
      <BarChart
        label="Miles driven each month"
        unit="mi"
        partialIndex={data.length - 1}
        data={data.map((m) => ({ label: m.label, fullLabel: m.fullLabel, value: m.miles }))}
      />
    </Card>
  );
}

export const MonthlyHistoryCard = withBoundary(MonthlyHistoryCardImpl);
