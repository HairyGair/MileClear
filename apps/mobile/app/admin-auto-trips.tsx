import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { fetchAdminAutoTripHealth } from "../lib/api/admin";
import type { AdminAutoTripHealth } from "@mileclear/shared";

function classificationColor(percent: number): string {
  if (percent >= 70) return EMERALD;
  if (percent >= 40) return AMBER;
  return RED;
}

export default function AdminAutoTripsScreen() {
  const [autoTrips, setAutoTrips] = useState<AdminAutoTripHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchAdminAutoTripHealth();
      setAutoTrips(res.data);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading auto-trip data" />
      </View>
    );
  }

  if (!autoTrips) {
    return (
      <View style={[s.container, s.centered]}>
        <Text style={s.emptyText}>Failed to load auto-trip data</Text>
      </View>
    );
  }

  const primaryStats = [
    {
      label: "Auto Trips 30d",
      value: autoTrips.autoTripsTotal.toLocaleString(),
      color: AMBER,
    },
    {
      label: "Classification Rate",
      value: `${autoTrips.classificationRatePercent.toFixed(1)}%`,
      color: classificationColor(autoTrips.classificationRatePercent),
    },
    {
      label: "Detection Adoption",
      value: `${autoTrips.detectionAdoptionPercent.toFixed(1)}%`,
      color: TEXT_1,
    },
    {
      label: "Manual Trips 30d",
      value: autoTrips.manualTripsTotal.toLocaleString(),
      color: TEXT_1,
    },
  ];

  const secondaryStats = [
    {
      label: "Avg Duration",
      value: `${autoTrips.avgTripDurationMinutes.toFixed(1)} min`,
      color: TEXT_1,
    },
    {
      label: "Avg Distance",
      value: `${autoTrips.avgAutoTripDistanceMiles.toFixed(1)} mi`,
      color: TEXT_1,
    },
  ];

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />
      }
    >
      {/* Primary Stats Grid (2x2) */}
      <View style={s.grid}>
        {primaryStats.map((stat) => (
          <View key={stat.label} style={s.statCard}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Secondary Stats Grid (1x2) */}
      <View style={s.grid}>
        {secondaryStats.map((stat) => (
          <View key={stat.label} style={[s.statCard, s.statCardWide]}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Daily Breakdown (7d) */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Daily Breakdown (7d)</Text>
        {autoTrips.dailyAutoTrips.length === 0 ? (
          <Text style={s.emptyText}>No daily data yet</Text>
        ) : (
          autoTrips.dailyAutoTrips.map((day, index) => {
            const total = day.autoCount + day.manualCount;
            return (
              <View
                key={day.date}
                style={[s.dayRow, index < autoTrips.dailyAutoTrips.length - 1 && s.rowBorder]}
              >
                <Text style={s.dayDate}>{day.date}</Text>
                <View style={s.dayRight}>
                  <View style={s.dayCount}>
                    <Text style={s.dayCountValue} accessibilityLabel={`${day.autoCount} auto trips`}>
                      {day.autoCount}
                    </Text>
                    <Text style={s.dayCountAuto}>auto</Text>
                  </View>
                  <View style={s.daySeparator} />
                  <View style={s.dayCount}>
                    <Text style={[s.dayCountValue, { color: TEXT_2 }]}>{day.manualCount}</Text>
                    <Text style={s.dayCountManual}>manual</Text>
                  </View>
                  <Text style={s.dayTotal}>{total} total</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const AMBER = "#f5a623";
const EMERALD = "#10b981";
const RED = "#ef4444";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  emptyText: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", color: TEXT_3 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: "47%" as any,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  statCardWide: {
    flex: 1,
    width: undefined as any,
  },
  statValue: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 4,
  },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },

  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 8,
  },
  dayDate: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
    flex: 1,
  },
  dayRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayCount: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  dayCountValue: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },
  dayCountAuto: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: AMBER,
    opacity: 0.7,
  },
  daySeparator: {
    width: 1,
    height: 12,
    backgroundColor: CARD_BORDER,
  },
  dayCountManual: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  dayTotal: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    minWidth: 48,
    textAlign: "right",
  },
});
