"use client";

import { useMemo } from "react";
import { ACHIEVEMENT_META, ACHIEVEMENT_TYPES } from "@mileclear/shared";
import type { AchievementWithMeta, GamificationStats } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Card, SectionHeader } from "@/components/dashboard/kit/Card";
import { StatTile } from "@/components/dashboard/kit/Figure";
import { Icon } from "@/components/dashboard/kit/Icon";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useData } from "@/lib/dashboard/useData";
import { formatDay } from "@/lib/dashboard/dates";
import { noDashes } from "@/components/dashboard/driving/api";
import styles from "@/components/dashboard/driving/driving.module.css";

/** "168.9": the number only, the tile adds the unit. */
const miles1 = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 1 });

type Kind = "miles" | "trips" | "shifts" | "streak" | "earned" | "first";

const GROUPS: { kind: Kind; title: string }[] = [
  { kind: "first", title: "Firsts" },
  { kind: "miles", title: "Miles" },
  { kind: "trips", title: "Trips" },
  { kind: "shifts", title: "Shifts" },
  { kind: "streak", title: "Streaks" },
  { kind: "earned", title: "Earnings" },
];

function kindOf(type: string): Kind {
  if (type.startsWith("miles_")) return "miles";
  if (type.startsWith("trips_")) return "trips";
  if (type.startsWith("shifts_")) return "shifts";
  if (type.startsWith("streak_")) return "streak";
  if (type.startsWith("earned_")) return "earned";
  return "first";
}

/** "620 of 1,000 miles", or null when the numbers for this badge aren't kept (earnings, firsts). */
function progressFor(type: string, stats: GamificationStats | null): { have: number; need: number; text: string } | null {
  if (!stats) return null;
  const need = Number(type.split("_")[1]);
  if (!Number.isFinite(need)) return null;
  const n = (v: number) => Math.floor(v).toLocaleString("en-GB");
  switch (kindOf(type)) {
    case "miles":
      return { have: stats.totalMiles, need, text: `${n(stats.totalMiles)} of ${n(need)} miles` };
    case "trips":
      return { have: stats.totalTrips, need, text: `${n(stats.totalTrips)} of ${n(need)} trips` };
    case "shifts":
      return { have: stats.totalShifts, need, text: `${n(stats.totalShifts)} of ${n(need)} shifts` };
    case "streak":
      return { have: stats.longestStreakDays, need, text: `${n(stats.longestStreakDays)} of ${n(need)} days` };
    default:
      return null;
  }
}

export default function AchievementsPage() {
  const earned = useData("achievements", () => api.get<{ data: AchievementWithMeta[] }>("/gamification/achievements"));
  const stats = useData("gamification-stats", () => api.get<{ data: GamificationStats }>("/gamification/stats").then((r) => r.data).catch(() => null));

  const earnedByType = useMemo(() => new Map((earned.data?.data ?? []).map((a) => [a.type, a])), [earned.data]);
  // Same count as the app: earned badges that are still in the list, out of the whole list.
  const count = ACHIEVEMENT_TYPES.filter((t) => earnedByType.has(t)).length;
  const total = ACHIEVEMENT_TYPES.length;
  const records = stats.data?.personalRecords;

  return (
    <>
      <PageHeader title="Achievements" back={{ href: "/dashboard/more", label: "More" }} />
      {earned.loading && !earned.data ? (
        <Skeleton variant="card" count={3} />
      ) : earned.error && !earned.data ? (
        <ErrorState title="Couldn't load your badges" onRetry={earned.reload} />
      ) : (
        <div className={styles.stack}>
          <Card>
            <p className={styles.bold}>{count} of {total} unlocked</p>
            <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={count} aria-label="Badges unlocked">
              <div className={styles.barFill} style={{ width: `${(count / total) * 100}%` }} />
            </div>
          </Card>

          {stats.data && (
            <div className={`${styles.statGrid} ${styles.statGrid4}`}>
              <StatTile label="Current streak" value={`${stats.data.currentStreakDays}`} unit={stats.data.currentStreakDays === 1 ? "day" : "days"} />
              <StatTile label="Best streak" value={`${records?.longestStreakDays ?? stats.data.longestStreakDays}`} unit="days" />
              <StatTile label="Best day" value={records && records.mostMilesInDay > 0 ? miles1(records.mostMilesInDay) : null} unit="mi" note={records?.mostMilesInDayDate ? formatDay(records.mostMilesInDayDate) : undefined} />
              <StatTile label="Longest trip" value={records && records.longestSingleTrip > 0 ? miles1(records.longestSingleTrip) : null} unit="mi" note={records?.longestSingleTripDate ? formatDay(records.longestSingleTripDate) : undefined} />
            </div>
          )}

          {GROUPS.map((g) => {
            const types = ACHIEVEMENT_TYPES.filter((t) => kindOf(t) === g.kind);
            if (types.length === 0) return null;
            return (
              <section key={g.kind} aria-label={g.title} className={styles.stack}>
                <SectionHeader title={g.title} />
                <div className={styles.badgeGrid}>
                  {types.map((type) => {
                    const meta = ACHIEVEMENT_META[type];
                    const got = earnedByType.get(type);
                    const prog = got ? null : progressFor(type, stats.data);
                    return (
                      <div key={type} className={`mc-card ${styles.badge} ${got ? "" : styles.badgeLocked}`} data-testid="badge" data-earned={got ? "true" : "false"}>
                        <span aria-hidden="true">
                          <Icon name={got ? "trophy-outline" : "lock-closed-outline"} size={22} />
                        </span>
                        <p className={styles.badgeLabel}>
                          {noDashes(meta.label)}
                          <span className="mc-sr-only">{got ? ", earned" : ", not earned yet"}</span>
                        </p>
                        <p className={styles.badgeDesc}>{noDashes(meta.description)}</p>
                        {got ? (
                          <p className={styles.hint}>Earned {formatDay(got.achievedAt)}</p>
                        ) : prog ? (
                          <>
                            <div className={styles.bar} aria-hidden="true">
                              <div className={styles.barFill} style={{ width: `${Math.min(100, (prog.have / prog.need) * 100)}%` }} />
                            </div>
                            <p className={styles.hint}>{prog.text}</p>
                          </>
                        ) : (
                          <p className={styles.hint}>Not yet</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
