import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetchAdminAnalytics } from "../../lib/api/admin";
import { formatPence } from "@mileclear/shared";
import type { AdminAnalytics } from "@mileclear/shared";

export default function AdminDashboardScreen() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchAdminAnalytics();
      setAnalytics(res.data);
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
        <ActivityIndicator size="large" color={AMBER} />
      </View>
    );
  }

  const stats = [
    { label: "Total Users", value: analytics?.totalUsers ?? 0 },
    { label: "Active (30d)", value: analytics?.activeUsers30d ?? 0 },
    { label: "Premium", value: analytics?.premiumUsers ?? 0 },
    { label: "Total Trips", value: analytics?.totalTrips ?? 0 },
    { label: "Total Miles", value: (analytics?.totalMiles ?? 0).toFixed(1) },
    { label: "Revenue", value: formatPence(analytics?.totalEarningsPence ?? 0) },
    { label: "New This Month", value: analytics?.usersThisMonth ?? 0 },
    { label: "Trips This Month", value: analytics?.tripsThisMonth ?? 0 },
  ];

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />
      }
    >
      <View style={s.headerRow}>
        <Ionicons name="shield-outline" size={22} color={AMBER} />
        <Text style={s.headerTitle}>Admin Dashboard</Text>
      </View>

      {/* Analytics Grid */}
      <View style={s.grid}>
        {stats.map((stat) => (
          <View key={stat.label} style={s.statCard}>
            <Text style={s.statValue}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Navigation Cards */}
      <TouchableOpacity
        style={s.navCard}
        onPress={() => router.push("/admin-users")}
        activeOpacity={0.7}
      >
        <View style={s.navCardLeft}>
          <Ionicons name="people-outline" size={22} color={AMBER} />
          <Text style={s.navCardLabel}>User Management</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={TEXT_3} />
      </TouchableOpacity>

      <TouchableOpacity
        style={s.navCard}
        onPress={() => router.push("/admin-health")}
        activeOpacity={0.7}
      >
        <View style={s.navCardLeft}>
          <Ionicons name="pulse-outline" size={22} color={AMBER} />
          <Text style={s.navCardLabel}>System Health</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={TEXT_3} />
      </TouchableOpacity>

      <TouchableOpacity
        style={s.navCard}
        onPress={() => router.push("/admin-feedback")}
        activeOpacity={0.7}
      >
        <View style={s.navCardLeft}>
          <Ionicons name="chatbox-ellipses-outline" size={22} color={AMBER} />
          <Text style={s.navCardLabel}>Community Feedback</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={TEXT_3} />
      </TouchableOpacity>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  centered: { justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: "47%" as any,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  statValue: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 4,
  },
  navCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  navCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navCardLabel: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
  },
});
