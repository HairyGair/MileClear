import type { GamificationStats, Vehicle } from "@mileclear/shared";
import { HMRC_THRESHOLD_MILES, MILESTONE_MILES } from "@mileclear/shared";
import { getDatabase } from "../db/index";

// ── Types ──────────────────────────────────────────────────────────

export type InsightPriority = "urgent" | "actionable" | "nudge" | "positive";

export interface Insight {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  body: string;
  priority: InsightPriority;
  actionLabel?: string;
  actionRoute?: string;
}

interface InsightInput {
  stats: GamificationStats | null;
  vehicles: Vehicle[];
  isPremium: boolean;
  isWork: boolean;
  unclassifiedCount?: number;
}

// ── Priority order ─────────────────────────────────────────────────

const PRIORITY_ORDER: Record<InsightPriority, number> = {
  urgent: 0,
  actionable: 1,
  nudge: 2,
  positive: 3,
};

// ── Dismiss tracking (SQLite) ──────────────────────────────────────

const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function dismissInsight(insightId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
    [`insight_dismissed_${insightId}`, String(Date.now())]
  );
}

export async function getDismissedInsights(): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM tracking_state WHERE key LIKE 'insight_dismissed_%'"
  );
  const now = Date.now();
  const dismissed = new Set<string>();
  for (const row of rows) {
    const ts = parseInt(row.value, 10);
    if (now - ts < DISMISS_COOLDOWN_MS) {
      dismissed.add(row.key.replace("insight_dismissed_", ""));
    } else {
      // Expired — clean up
      const db2 = await getDatabase();
      await db2.runAsync("DELETE FROM tracking_state WHERE key = ?", [row.key]);
    }
  }
  return dismissed;
}

// ── Insight generators ─────────────────────────────────────────────

function generateInsights(input: InsightInput): Insight[] {
  const { stats, vehicles, isPremium, isWork, unclassifiedCount } = input;
  const insights: Insight[] = [];

  if (!stats) return insights;

  // ─── Urgent ───────────────────────────────────────────────

  // Unclassified trips
  if (unclassifiedCount && unclassifiedCount > 0) {
    insights.push({
      id: "unclassified_trips",
      icon: "alert-circle-outline",
      iconColor: "#ef4444",
      title: `${unclassifiedCount} trip${unclassifiedCount === 1 ? "" : "s"} need classifying`,
      body: "Business trips are tax deductible. Classify them so you don't miss out.",
      priority: "urgent",
      actionLabel: "Review trips",
      actionRoute: "/(tabs)/trips",
    });
  }

  // HMRC 10k threshold approaching (work mode only)
  if (isWork && stats.businessMiles >= 8000 && stats.businessMiles < HMRC_THRESHOLD_MILES) {
    const remaining = HMRC_THRESHOLD_MILES - stats.businessMiles;
    insights.push({
      id: "hmrc_threshold_approaching",
      icon: "trending-up-outline",
      iconColor: "#f59e0b",
      title: `${remaining.toFixed(0)} miles to the HMRC threshold`,
      body: "After 10,000 business miles the rate drops from 45p to 25p per mile. Plan ahead.",
      priority: "urgent",
    });
  }

  // Passed HMRC threshold
  if (isWork && stats.businessMiles >= HMRC_THRESHOLD_MILES && stats.businessMiles < HMRC_THRESHOLD_MILES + 500) {
    insights.push({
      id: "hmrc_threshold_passed",
      icon: "checkmark-circle-outline",
      iconColor: "#10b981",
      title: "You've passed 10,000 business miles",
      body: "The HMRC rate is now 25p per mile. Well done — your deduction keeps growing.",
      priority: "positive",
    });
  }

  // Streak at risk (had a streak but no trips today)
  if (stats.currentStreakDays >= 3 && stats.todayMiles === 0) {
    insights.push({
      id: "streak_at_risk",
      icon: "flame-outline",
      iconColor: "#f97316",
      title: `Your ${stats.currentStreakDays}-day streak is at risk`,
      body: "Log or track a trip today to keep it going.",
      priority: "actionable",
      actionLabel: "Start trip",
      actionRoute: "/trip-form",
    });
  }

  // ─── Actionable ───────────────────────────────────────────

  // No vehicle added
  if (vehicles.length === 0) {
    insights.push({
      id: "no_vehicle",
      icon: "car-outline",
      iconColor: "#f5a623",
      title: "Add your vehicle",
      body: "Cars, vans, and motorbikes have different HMRC mileage rates. Add yours for accurate deductions.",
      priority: "actionable",
      actionLabel: "Add vehicle",
      actionRoute: "/vehicle-form",
    });
  }

  // Week is stronger than last (positive)
  if (stats.weekMiles > 0 && stats.drivingPatterns?.avgTripsPerWeek) {
    const avgWeekMiles = stats.totalMiles / Math.max(1, stats.totalShifts > 0 ? Math.ceil(stats.totalShifts / 5) : 4);
    if (stats.weekMiles > avgWeekMiles * 1.2 && stats.weekMiles > 10) {
      insights.push({
        id: "strong_week",
        icon: "trending-up-outline",
        iconColor: "#10b981",
        title: "Great week so far",
        body: `You've driven ${stats.weekMiles.toFixed(1)} miles this week — that's above your usual pace.`,
        priority: "positive",
      });
    }
  }

  // Milestone approaching
  const nextMilestone = MILESTONE_MILES.find((m) => m > stats.totalMiles);
  if (nextMilestone) {
    const remaining = nextMilestone - stats.totalMiles;
    const pct = stats.totalMiles / nextMilestone;
    if (pct >= 0.85 && remaining <= 500) {
      insights.push({
        id: `milestone_${nextMilestone}`,
        icon: "flag-outline",
        iconColor: "#8b5cf6",
        title: `${remaining.toFixed(0)} miles to ${nextMilestone.toLocaleString()}`,
        body: "You're closing in on your next milestone. Keep going!",
        priority: "positive",
      });
    }
  }

  // Personal best today
  if (stats.todayMiles > 0 && stats.todayMiles >= stats.personalRecords.mostMilesInDay * 0.9 && stats.personalRecords.mostMilesInDay > 5) {
    if (stats.todayMiles >= stats.personalRecords.mostMilesInDay) {
      insights.push({
        id: "new_daily_record",
        icon: "trophy-outline",
        iconColor: "#f5a623",
        title: "New daily record!",
        body: `${stats.todayMiles.toFixed(1)} miles today beats your previous best of ${stats.personalRecords.mostMilesInDay.toFixed(1)}.`,
        priority: "positive",
      });
    } else {
      insights.push({
        id: "close_to_daily_record",
        icon: "trophy-outline",
        iconColor: "#f5a623",
        title: "Near your daily record",
        body: `${(stats.personalRecords.mostMilesInDay - stats.todayMiles).toFixed(1)} more miles to beat your best day of ${stats.personalRecords.mostMilesInDay.toFixed(1)} miles.`,
        priority: "positive",
      });
    }
  }

  // ─── Nudges (feature discovery) ───────────────────────────

  // Haven't used exports (work mode, premium)
  if (isWork && isPremium && stats.totalTrips >= 10 && stats.businessMiles > 50) {
    insights.push({
      id: "try_exports",
      icon: "download-outline",
      iconColor: "#6366f1",
      title: "Export your trips for tax",
      body: "You've got enough data for a proper HMRC report. Download CSV or PDF now.",
      priority: "nudge",
      actionLabel: "View exports",
      actionRoute: "/exports",
    });
  }

  // Suggest premium for non-premium users with data
  if (!isPremium && isWork && stats.businessMiles > 100) {
    insights.push({
      id: "upgrade_prompt",
      icon: "diamond-outline",
      iconColor: "#f5a623",
      title: "Unlock HMRC tax exports",
      body: "You've logged enough miles to make premium pay for itself. Export CSV and PDF reports for self-assessment.",
      priority: "nudge",
    });
  }

  // Long streak — positive reinforcement
  if (stats.currentStreakDays >= 7) {
    insights.push({
      id: "streak_praise",
      icon: "flame",
      iconColor: "#f97316",
      title: `${stats.currentStreakDays}-day driving streak`,
      body: stats.currentStreakDays >= 30
        ? "Incredible consistency. You're making every mile count."
        : stats.currentStreakDays >= 14
          ? "Two weeks strong. Your tracking habit is locked in."
          : "A full week of tracking. You're building a great habit.",
      priority: "positive",
    });
  }

  // First trip celebration
  if (stats.totalTrips === 1) {
    insights.push({
      id: "first_trip",
      icon: "sparkles",
      iconColor: "#f5a623",
      title: "First trip logged!",
      body: "You're on your way. Every mile tracked is money saved at tax time.",
      priority: "positive",
    });
  }

  // Achievements unlocked nudge
  if (stats.totalTrips >= 5 && stats.totalTrips <= 15) {
    insights.push({
      id: "check_achievements",
      icon: "trophy-outline",
      iconColor: "#f5a623",
      title: "Check your achievements",
      body: "You might have unlocked some badges. See how you're progressing.",
      priority: "nudge",
      actionLabel: "View badges",
      actionRoute: "/achievements",
    });
  }

  return insights;
}

// ── Main export ────────────────────────────────────────────────────

export async function getTopInsights(
  input: InsightInput,
  maxCount: number = 3
): Promise<Insight[]> {
  const all = generateInsights(input);
  const dismissed = await getDismissedInsights();
  const filtered = all.filter((i) => !dismissed.has(i.id));
  filtered.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  return filtered.slice(0, maxCount);
}
