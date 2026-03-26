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
import { fetchAdminEngagement } from "../lib/api/admin";
import type { AdminEngagement } from "@mileclear/shared";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function retentionColor(percent: number): string {
  if (percent >= 50) return EMERALD;
  if (percent >= 25) return AMBER;
  return RED;
}

export default function AdminEngagementScreen() {
  const [engagement, setEngagement] = useState<AdminEngagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchAdminEngagement();
      setEngagement(res.data);
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
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading engagement data" />
      </View>
    );
  }

  if (!engagement) {
    return (
      <View style={[s.container, s.centered]}>
        <Text style={s.emptyText}>Failed to load engagement data</Text>
      </View>
    );
  }

  const stats = [
    { label: "DAU", value: engagement.dau.toLocaleString(), color: EMERALD },
    { label: "WAU", value: engagement.wau.toLocaleString(), color: TEXT_1 },
    { label: "MAU", value: engagement.mau.toLocaleString(), color: TEXT_1 },
    {
      label: "Zero Trips",
      value: engagement.usersWithZeroTrips.toLocaleString(),
      subtitle: `of ${engagement.totalUsers.toLocaleString()} users`,
      color: engagement.usersWithZeroTrips > 0 ? RED : TEXT_1,
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
      {/* Stats Grid */}
      <View style={s.grid}>
        {stats.map((stat) => (
          <View key={stat.label} style={s.statCard}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
            {stat.subtitle ? (
              <Text style={s.statSubtitle}>{stat.subtitle}</Text>
            ) : null}
          </View>
        ))}
      </View>

      {/* Retention by Cohort */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Retention by Cohort</Text>
        {engagement.retentionCurve.length === 0 ? (
          <Text style={s.emptyText}>No cohort data yet</Text>
        ) : (
          engagement.retentionCurve.map((cohort, index) => (
            <View
              key={cohort.month}
              style={[s.cohortRow, index < engagement.retentionCurve.length - 1 && s.rowBorder]}
            >
              <Text style={s.cohortMonth}>{cohort.month}</Text>
              <Text style={s.cohortSignups}>{cohort.signups} signups</Text>
              <View style={s.cohortRight}>
                <Text style={s.cohortRetained}>{cohort.retainedCount}</Text>
                <Text style={[s.cohortPercent, { color: retentionColor(cohort.retentionPercent) }]}>
                  {cohort.retentionPercent.toFixed(0)}%
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Recently Active */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Recently Active</Text>
        {engagement.recentlyActive.length === 0 ? (
          <Text style={s.emptyText}>No recent activity</Text>
        ) : (
          engagement.recentlyActive.map((user, index) => (
            <View
              key={user.userId}
              style={[s.activeRow, index < engagement.recentlyActive.length - 1 && s.rowBorder]}
            >
              <Text style={s.activeEmail} numberOfLines={1} ellipsizeMode="middle">
                {user.email}
              </Text>
              <View style={s.activeRight}>
                <Text style={s.activeTripCount}>{user.tripCount} trips</Text>
                <Text style={s.activeDate}>{formatDate(user.lastTripAt)}</Text>
              </View>
            </View>
          ))
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
  statSubtitle: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 2,
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

  cohortRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 8,
  },
  cohortMonth: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
    width: 64,
  },
  cohortSignups: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    flex: 1,
  },
  cohortRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cohortRetained: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    minWidth: 24,
    textAlign: "right",
  },
  cohortPercent: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_700Bold",
    minWidth: 40,
    textAlign: "right",
  },

  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 8,
  },
  activeEmail: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    flex: 1,
  },
  activeRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activeTripCount: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
  },
  activeDate: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    minWidth: 52,
    textAlign: "right",
  },
});
