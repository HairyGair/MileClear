"use client";

import type { GamificationStats } from "@mileclear/shared";
import { MILESTONE_MILES } from "@mileclear/shared";
import { Card, useData } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Progress, miles, withBoundary } from "./ui";
import s from "./insights.module.css";

/** The next round number of lifetime miles. */
function MilestoneCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement | null {
  const { data, error, loading, reload } = useData<GamificationStats>("gamification-stats", () => getData("/gamification/stats"));

  if (loading && !data) return <CardLoading title="Next milestone" />;
  if (error) return <CardFailed title="Next milestone" onRetry={reload} />;
  if (!data || data.totalMiles <= 0) return null;

  const next = MILESTONE_MILES.find((m) => m > data.totalMiles);
  if (!next) return null;
  const prev = [...MILESTONE_MILES].reverse().find((m) => m <= data.totalMiles) ?? 0;
  const pct = ((data.totalMiles - prev) / (next - prev)) * 100;

  return (
    <Card title="Next milestone">
      <p className={s.rowFig}>{miles(next)}</p>
      <Progress percent={pct} label={`Progress towards ${next} miles`} />
      <p className={s.note}>
        {miles(next - data.totalMiles)} to go. You have driven {miles(data.totalMiles)} so far.
      </p>
    </Card>
  );
}

export const MilestoneCard = withBoundary(MilestoneCardImpl);
