import { apiRequest } from "./index";
import type {
  GamificationStats,
  AchievementWithMeta,
  ShiftScorecard,
  PeriodRecap,
} from "@mileclear/shared";

export function fetchGamificationStats() {
  return apiRequest<{ data: GamificationStats }>("/gamification/stats");
}

export function fetchAchievements() {
  return apiRequest<{ data: AchievementWithMeta[] }>("/gamification/achievements");
}

export function fetchScorecard(shiftId?: string) {
  const query = shiftId ? `?shiftId=${shiftId}` : "";
  return apiRequest<{ data: ShiftScorecard }>(`/gamification/scorecard${query}`);
}

/** The one source for a period's miles, trips, claim and earnings
 *  (docs/insights-oct2026/NUMBERS.md). `compare` adds `previous` and
 *  `change` (vs the period before) from the same calculation. */
export function fetchRecap(
  period: "daily" | "weekly" | "monthly",
  date?: string,
  opts?: { compare?: boolean },
) {
  const params = new URLSearchParams({ period });
  if (date) params.set("date", date);
  if (opts?.compare) params.set("compare", "1");
  return apiRequest<{ data: PeriodRecap }>(
    `/gamification/recap?${params.toString()}`
  );
}
