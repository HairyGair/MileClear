import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { fetchAchievements, fetchGamificationStats } from "../lib/api/gamification";
import {
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_META,
  type AchievementType,
} from "@mileclear/shared";
import type { AchievementWithMeta, GamificationStats } from "@mileclear/shared";

export default function AchievementsScreen() {
  const router = useRouter();
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
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Achievements",
            headerStyle: { backgroundColor: "#030712" },
            headerTintColor: "#fff",
          }}
        />
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  const earnedTypes = new Set(earned.map((a) => a.type));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Achievements",
          headerStyle: { backgroundColor: "#030712" },
          headerTintColor: "#fff",
        }}
      />

      <Text style={styles.subtitle}>
        {earned.length} of {ACHIEVEMENT_TYPES.length} unlocked
      </Text>

      {/* Badges grid */}
      <View style={styles.grid}>
        {ACHIEVEMENT_TYPES.map((type) => {
          const meta = ACHIEVEMENT_META[type];
          const isEarned = earnedTypes.has(type);
          const achievement = earned.find((a) => a.type === type);

          return (
            <View
              key={type}
              style={[styles.badgeCard, !isEarned && styles.badgeLocked]}
            >
              <Text style={[styles.badgeEmoji, !isEarned && styles.emojiLocked]}>
                {meta.emoji}
              </Text>
              <Text
                style={[styles.badgeLabel, !isEarned && styles.labelLocked]}
                numberOfLines={1}
              >
                {meta.label}
              </Text>
              <Text
                style={[styles.badgeDesc, !isEarned && styles.descLocked]}
                numberOfLines={2}
              >
                {meta.description}
              </Text>
              {isEarned && achievement && (
                <Text style={styles.badgeDate}>
                  {new Date(achievement.achievedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Personal Records */}
      {stats && (
        <View style={styles.recordsSection}>
          <Text style={styles.sectionTitle}>Personal Records</Text>
          <View style={styles.recordsGrid}>
            <View style={styles.recordCard}>
              <Text style={styles.recordValue}>
                {stats.personalRecords.mostMilesInDay.toFixed(1)} mi
              </Text>
              <Text style={styles.recordLabel}>Best Day</Text>
            </View>
            <View style={styles.recordCard}>
              <Text style={styles.recordValue}>
                {stats.personalRecords.mostTripsInShift}
              </Text>
              <Text style={styles.recordLabel}>Most Trips/Shift</Text>
            </View>
            <View style={styles.recordCard}>
              <Text style={styles.recordValue}>
                {stats.personalRecords.longestSingleTrip.toFixed(1)} mi
              </Text>
              <Text style={styles.recordLabel}>Longest Trip</Text>
            </View>
            <View style={styles.recordCard}>
              <Text style={styles.recordValue}>
                {stats.personalRecords.longestStreakDays}d
              </Text>
              <Text style={styles.recordLabel}>Best Streak</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  subtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  badgeCard: {
    width: "31%",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    minHeight: 120,
  },
  badgeLocked: {
    opacity: 0.4,
  },
  badgeEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  emojiLocked: {
    opacity: 0.5,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    marginBottom: 2,
  },
  labelLocked: {
    color: "#6b7280",
  },
  badgeDesc: {
    fontSize: 10,
    color: "#9ca3af",
    textAlign: "center",
  },
  descLocked: {
    color: "#4b5563",
  },
  badgeDate: {
    fontSize: 9,
    color: "#f59e0b",
    marginTop: 4,
  },
  recordsSection: {
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  recordsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recordCard: {
    width: "47%",
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  recordValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  recordLabel: {
    fontSize: 12,
    color: "#9ca3af",
  },
});
