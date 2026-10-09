"use client";

import { useState } from "react";
import { Button, useMe } from "../kit";
import { AchievementsPreview } from "./AchievementsPreview";
import { BenchmarkCard } from "./BenchmarkCard";
import { CommunityInsightsCard } from "./CommunityInsightsCard";
import { CommunityMonthCard } from "./CommunityMonthCard";
import { HeatmapCard } from "./HeatmapCard";
import { LocalBenchmarkCard } from "./LocalBenchmarkCard";
import { PersonalInsights } from "./PersonalInsights";
import { RECAP_BUTTONS, RecapDialog, type RecapPeriod } from "./RecapDialog";
import { WeeklyGoalCard } from "./WeeklyGoalCard";
import { WorkCalendarCard } from "./WorkCalendarCard";
import { WorkInsights } from "./WorkInsights";
import s from "./insights.module.css";

/** Insights > Overview. Recaps, then the Work or Personal block, then the cards both modes share. */
export function Overview(): React.ReactElement {
  const { mode, isGigDriver } = useMe();
  const [recap, setRecap] = useState<{ period: RecapPeriod; title: string } | null>(null);

  return (
    <div className={s.stack}>
      <section className={s.recapRow} aria-label="Recaps">
        {RECAP_BUTTONS.map((r) => (
          <Button key={r.period} variant="secondary" size="sm" onClick={() => setRecap({ period: r.period, title: r.title })}>
            {r.label}
          </Button>
        ))}
      </section>
      {recap && <RecapDialog period={recap.period} title={recap.title} open onClose={() => setRecap(null)} />}

      {mode === "work" && isGigDriver && <WorkInsights />}
      {mode === "personal" && <PersonalInsights />}

      <div className={s.grid}>
        <WorkCalendarCard mode={mode} />
        <HeatmapCard mode={mode} />
        <WeeklyGoalCard mode={mode} />
        <BenchmarkCard mode={mode} />
        <LocalBenchmarkCard mode={mode} />
        <CommunityMonthCard mode={mode} always />
        <CommunityInsightsCard mode={mode} />
        <AchievementsPreview />
      </div>
    </div>
  );
}
