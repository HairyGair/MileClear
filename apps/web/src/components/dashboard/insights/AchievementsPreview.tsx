"use client";

import type { AchievementWithMeta, GamificationStats } from "@mileclear/shared";
import { Card, useData } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Row, miles, withBoundary } from "./ui";
import s from "./insights.module.css";

/** Six latest badges and your personal records. */
function AchievementsPreviewImpl(): React.ReactElement | null {
  const ach = useData<AchievementWithMeta[]>("achievements", () => getData("/gamification/achievements"));
  const stats = useData<GamificationStats>("gamification-stats", () => getData("/gamification/stats"));

  const earned = (ach.data ?? []).slice().sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)).slice(0, 6);
  const rec = stats.data?.personalRecords;

  return (
    <>
      {ach.loading && !ach.data ? (
        <CardLoading title="Achievements" />
      ) : ach.error ? (
        <CardFailed title="Achievements" onRetry={ach.reload} />
      ) : (
        <Card title="Achievements" action={{ label: "See all", href: "/dashboard/achievements" }}>
          {earned.length === 0 ? (
            <p className={s.note}>Your first badge is on its way. Keep driving.</p>
          ) : (
            <ul className={s.badges}>
              {earned.map((a) => (
                <li key={a.id} className={s.badge}>
                  <span className={s.badgeEmoji} aria-hidden="true">
                    {a.emoji}
                  </span>
                  {a.label}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {stats.error ? (
        <CardFailed title="Personal records" onRetry={stats.reload} />
      ) : rec && (rec.mostMilesInDay > 0 || rec.longestSingleTrip > 0) ? (
        <Card title="Personal records">
          {rec.mostMilesInDay > 0 && <Row main="Most miles in a day" sub={rec.mostMilesInDayDate ? new Date(rec.mostMilesInDayDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : undefined} figure={miles(rec.mostMilesInDay)} />}
          {rec.longestSingleTrip > 0 && <Row main="Longest trip" sub={rec.longestSingleTripDate ? new Date(rec.longestSingleTripDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : undefined} figure={miles(rec.longestSingleTrip)} />}
          {rec.longestStreakDays > 0 && <Row main="Longest streak" figure={`${rec.longestStreakDays} ${rec.longestStreakDays === 1 ? "day" : "days"}`} />}
        </Card>
      ) : null}
    </>
  );
}

export const AchievementsPreview = withBoundary(AchievementsPreviewImpl);
