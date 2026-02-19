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

export function fetchRecap(period: "weekly" | "monthly", date?: string) {
  const params = new URLSearchParams({ period });
  if (date) params.set("date", date);
  return apiRequest<{ data: PeriodRecap }>(
    `/gamification/recap?${params.toString()}`
  );
}
