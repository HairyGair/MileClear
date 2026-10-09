"use client";

import type { WeeklyProgress } from "@mileclear/shared";
import { Card, Figure, useData, useMe } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Progress, pounds, withBoundary } from "./ui";
import s from "./insights.module.css";

/** Weekly earnings goal. Gig drivers only. */
function WeeklyGoalCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement | null {
  const { isGigDriver } = useMe();
  const { data, error, loading, reload } = useData<WeeklyProgress>(isGigDriver ? "weekly-progress" : null, () => getData("/user/weekly-progress"));

  if (!isGigDriver) return null;
  if (loading && !data) return <CardLoading title="Weekly goal" />;
  if (error) return <CardFailed title="Weekly goal" onRetry={reload} />;
  if (!data) return null;

  if (data.goalPence === null) {
    return (
      <Card title="Weekly goal" action={{ label: "Set a weekly goal", href: "/dashboard/settings/work-tax" }}>
        <p className={s.note}>Set what you want to earn each week and see how you are getting on.</p>
      </Card>
    );
  }
  const pct = data.progressPercent ?? Math.round((data.currentWeekEarningsPence / data.goalPence) * 100);
  return (
    <Card title="Weekly goal" action={{ label: "Change goal", href: "/dashboard/settings/work-tax" }}>
      <Figure
        label="Earned this week"
        value={pounds(data.currentWeekEarningsPence)}
        sub={`${Math.min(pct, 999)}% of your ${pounds(data.goalPence)} goal`}
        size="lg"
      />
      <Progress percent={pct} label="Progress towards your weekly goal" />
    </Card>
  );
}

export const WeeklyGoalCard = withBoundary(WeeklyGoalCardImpl);
