import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Stack } from "expo-router";
import { fetchAchievements, fetchGamificationStats } from "../lib/api/gamification";
import {
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_META,
  type AchievementType,
} from "@mileclear/shared";
import type { AchievementWithMeta, GamificationStats } from "@mileclear/shared";

const AMBER = "#f5a623";
const CARD_BG = "#0a1120";
const BORDER = "rgba(255,255,255,0.05)";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";

export default function AchievementsScreen() {
  const [earned, setEarned] = useState<AchievementWithMeta[]>([]);
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [achRes, statsRes] = await Promise.all([
        fetchAchievements(),
        fetchGamificationStats(),
      ]);
      setEarned(achRes.data);
      setStats(statsRes.data);
    } catch {}
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Achievements",
            headerStyle: { backgroundColor: "#030712" },
            headerTintColor: "#fff",
            headerTitleStyle: { fontWeight: "300" },
          }}
        />
        <ActivityIndicator size="large" color={AMBER} />
      </View>
    );
  }

  const earnedTypes = new Set(earned.map((a) => a.type));

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Achievements",
          headerStyle: { backgroundColor: "#030712" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "300" },
        }}
      />

      {/* Progress bar */}
      <View style={s.progressWrap}>
        <View style={s.progressTrack}>
          <View
            style={[
              s.progressFill,
              { width: `${(earned.length / ACHIEVEMENT_TYPES.length) * 100}%` },
            ]}
          />
        </View>
        <Text style={s.progressText}>
          {earned.length} of {ACHIEVEMENT_TYPES.length} unlocked
        </Text>
      </View>

      {/* Badge grid */}
      <View style={s.grid}>
        {ACHIEVEMENT_TYPES.map((type) => {
          const meta = ACHIEVEMENT_META[type];
          const isEarned = earnedTypes.has(type);
          const ach = earned.find((a) => a.type === type);

          return (
            <View
              key={type}
              style={[
                s.badgeCard,
                isEarned && s.badgeEarned,
              ]}
            >
              <Text style={[s.badgeEmoji, !isEarned && s.emojiLocked]}>
                {meta.emoji}
              </Text>
              <Text
                style={[s.badgeLabel, !isEarned && s.textLocked]}
                numberOfLines={1}
              >
                {meta.label}
              </Text>
              <Text
                style={[s.badgeDesc, !isEarned && s.textLockedSoft]}
                numberOfLines={2}
              >
                {meta.description}
              </Text>
              {isEarned && ach && (
                <Text style={s.badgeDate}>
                  {new Date(ach.achievedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Personal Records */}
      {stats && (
        <View style={s.recordsSection}>
          <Text style={s.sectionTitle}>Personal Records</Text>
          <View style={s.recordGrid}>
            {[
              { v: `${stats.personalRecords.mostMilesInDay.toFixed(1)} mi`, l: "Best day" },
              { v: `${stats.personalRecords.mostTripsInShift}`, l: "Trips / shift" },
              { v: `${stats.personalRecords.longestSingleTrip.toFixed(1)} mi`, l: "Longest trip" },
              { v: `${stats.personalRecords.longestStreakDays}d`, l: "Best streak" },
            ].map((r) => (
              <View key={r.l} style={s.recordCell}>
                <Text style={s.recordValue}>{r.v}</Text>
                <Text style={s.recordLabel}>{r.l}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 20,
  },

  // Progress
  progressWrap: {
    marginBottom: 24,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 1.5,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: 3,
    backgroundColor: AMBER,
    borderRadius: 1.5,
  },
  progressText: {
    fontSize: 12,
    color: TEXT_2,
    letterSpacing: 0.3,
  },

  // Grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badgeCard: {
    width: "31%" as any,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    minHeight: 120,
    borderWidth: 1,
    borderColor: BORDER,
    opacity: 0.35,
  },
  badgeEarned: {
    opacity: 1,
    borderColor: "rgba(245, 166, 35, 0.12)",
  },
  badgeEmoji: {
    fontSize: 30,
    marginBottom: 6,
  },
  emojiLocked: {
    opacity: 0.5,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  textLocked: {
    color: TEXT_3,
  },
  badgeDesc: {
    fontSize: 9,
    color: TEXT_2,
    textAlign: "center",
    lineHeight: 12,
  },
  textLockedSoft: {
    color: "#374151",
  },
  badgeDate: {
    fontSize: 9,
    color: AMBER,
    marginTop: 4,
    fontWeight: "500",
  },

  // Records
  recordsSection: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_1,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  recordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recordCell: {
    width: "47%" as any,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  recordValue: {
    fontSize: 20,
    fontWeight: "600",
    color: TEXT_1,
    marginBottom: 2,
  },
  recordLabel: {
    fontSize: 11,
    color: TEXT_3,
    letterSpacing: 0.2,
  },
});
