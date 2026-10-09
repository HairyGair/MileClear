// Badge icons and "next badge" progress for Insights. Badges are drawn with
// Ionicons medals because the emoji in ACHIEVEMENT_META showed as "?" boxes
// on some phones. The emoji stay in share text only.

import type { Ionicons } from "@expo/vector-icons";

export type IconName = keyof typeof Ionicons.glyphMap;

const EXACT: Record<string, IconName> = {
  first_trip: "key",
  first_shift: "flag",
  miles_50: "speedometer",
  miles_100: "ribbon",
  miles_250: "car",
  miles_500: "map",
  miles_1000: "medal",
  miles_2500: "rocket",
  miles_5000: "flash",
  miles_10000: "trophy",
  miles_25000: "planet",
  miles_50000: "star",
  miles_100000: "diamond",
  trips_1: "car",
  trips_10: "location",
  trips_25: "clipboard",
  trips_50: "pin",
  trips_100: "ribbon",
  trips_250: "navigate",
  trips_500: "school",
  trips_1000: "podium",
  shifts_1: "time",
  shifts_10: "repeat",
  shifts_50: "rainy",
  shifts_100: "moon",
  shifts_500: "barbell",
  streak_3: "flame",
  streak_7: "calendar",
  streak_14: "shield",
  streak_30: "shield-checkmark",
  streak_60: "thunderstorm",
  streak_90: "star",
  streak_365: "trophy",
  earned_100: "cash",
  earned_500: "cash",
  earned_1000: "trending-up",
  earned_5000: "trending-up",
  earned_10000: "trending-up",
  earned_50000: "diamond",
};

export function badgeIcon(type: string): IconName {
  if (EXACT[type]) return EXACT[type];
  if (type.startsWith("miles_")) return "speedometer";
  if (type.startsWith("trips_")) return "location";
  if (type.startsWith("shifts_")) return "time";
  if (type.startsWith("streak_")) return "flame";
  if (type.startsWith("earned_")) return "cash";
  return "ribbon";
}

export interface BadgeStats {
  totalMiles: number;
  totalTrips: number;
  totalShifts: number;
  longestStreakDays: number;
}

export interface NextBadge {
  type: string;
  /** 0 to 1. */
  progress: number;
  /** "40 mi to go", "2 more trips". */
  progressText: string;
}

type Kind = "miles" | "trips" | "shifts" | "streak";

function parseType(type: string): { kind: Kind; threshold: number } | null {
  const m = /^(miles|trips|shifts|streak)_(\d+)$/.exec(type);
  if (!m) return null;
  return { kind: m[1] as Kind, threshold: Number(m[2]) };
}

function valueFor(kind: Kind, s: BadgeStats): number {
  return kind === "miles" ? s.totalMiles : kind === "trips" ? s.totalTrips : kind === "shifts" ? s.totalShifts : s.longestStreakDays;
}

function progressText(kind: Kind, remaining: number): string {
  const n = Math.max(1, Math.ceil(remaining));
  if (kind === "miles") return `${n.toLocaleString("en-GB")} mi to go`;
  if (kind === "trips") return `${n} more ${n === 1 ? "trip" : "trips"}`;
  if (kind === "shifts") return `${n} more ${n === 1 ? "shift" : "shifts"}`;
  return `${n} more ${n === 1 ? "day" : "days"} in a row`;
}

/**
 * The closest badges not yet earned, nearest first. Personal mode leaves out
 * shift and streak badges: they are Work ideas and the Personal streak counts
 * weeks. Earnings badges are never listed (no figure here to measure them).
 */
export function nextBadges(
  allTypes: readonly string[],
  earned: ReadonlySet<string>,
  stats: BadgeStats,
  mode: "work" | "personal",
  count = 3
): NextBadge[] {
  const out: Array<NextBadge & { threshold: number }> = [];
  for (const type of allTypes) {
    if (earned.has(type)) continue;
    const parsed = parseType(type);
    if (!parsed) {
      // first_trip / first_shift: next up only when nothing at all yet.
      if (type === "first_trip" && stats.totalTrips === 0) {
        out.push({ type, progress: 0, progressText: "Record your first trip", threshold: 0 });
      }
      continue;
    }
    if (mode === "personal" && (parsed.kind === "shifts" || parsed.kind === "streak")) continue;
    const value = valueFor(parsed.kind, stats);
    if (value >= parsed.threshold) continue; // earned server-side but not listed yet
    out.push({
      type,
      progress: Math.max(0, Math.min(1, value / parsed.threshold)),
      progressText: progressText(parsed.kind, parsed.threshold - value),
      threshold: parsed.threshold,
    });
  }
  out.sort((a, b) => b.progress - a.progress || a.threshold - b.threshold);
  return out.slice(0, count).map(({ threshold: _t, ...rest }) => rest);
}
