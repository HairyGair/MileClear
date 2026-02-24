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
import { Ionicons } from "@expo/vector-icons";
import { fetchAdminHealth } from "../lib/api/admin";
import type { AdminHealthStatus } from "@mileclear/shared";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

export default function AdminHealthScreen() {
  const [health, setHealth] = useState<AdminHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchAdminHealth();
      setHealth(res.data);
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

  if (!health) {
    return (
      <View style={[s.container, s.centered]}>
        <Text style={s.emptyText}>Failed to load health data</Text>
      </View>
    );
  }

  const statusItems = [
    { label: "API", status: health.api },
    { label: "Database", status: health.database },
  ];

  const recordCounts = [
    { label: "Users", value: health.recordCounts.users },
    { label: "Trips", value: health.recordCounts.trips },
    { label: "Shifts", value: health.recordCounts.shifts },
    { label: "Vehicles", value: health.recordCounts.vehicles },
    { label: "Fuel Logs", value: health.recordCounts.fuelLogs },
    { label: "Earnings", value: health.recordCounts.earnings },
    { label: "Achievements", value: health.recordCounts.achievements },
  ];

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />
      }
    >
      {/* Status Indicators */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Status</Text>
        {statusItems.map((item) => (
          <View key={item.label} style={s.statusRow}>
            <View style={s.statusLeft}>
              <View style={[s.statusDot, item.status === "ok" ? s.dotOk : s.dotError]} />
              <Text style={s.statusLabel}>{item.label}</Text>
            </View>
            <Text style={[s.statusValue, item.status === "ok" ? s.textOk : s.textError]}>
              {item.status === "ok" ? "Healthy" : "Error"}
            </Text>
          </View>
        ))}
        <View style={s.statusRow}>
          <Text style={s.statusLabel}>DB Latency</Text>
          <Text style={s.statusValue}>{health.databaseLatencyMs}ms</Text>
        </View>
      </View>

      {/* Record Counts */}
      <Text style={s.sectionTitle}>Record Counts</Text>
      <View style={s.grid}>
        {recordCounts.map((item) => (
          <View key={item.label} style={s.countCard}>
            <Text style={s.countValue}>{item.value.toLocaleString()}</Text>
            <Text style={s.countLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* System Info */}
      <View style={s.card}>
        <Text style={s.cardTitle}>System</Text>
        <View style={s.statusRow}>
          <Text style={s.statusLabel}>Uptime</Text>
          <Text style={s.statusValue}>{formatUptime(health.uptime)}</Text>
        </View>
        <View style={s.statusRow}>
          <Text style={s.statusLabel}>Memory</Text>
          <Text style={s.statusValue}>{health.memoryUsageMb} MB</Text>
        </View>
        <View style={s.statusRow}>
          <Text style={s.statusLabel}>Node.js</Text>
          <Text style={s.statusValue}>{health.nodeVersion}</Text>
        </View>
      </View>

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
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  emptyText: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", color: TEXT_3 },

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
  sectionTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOk: { backgroundColor: "#34c759" },
  dotError: { backgroundColor: "#ef4444" },
  statusLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  statusValue: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
  },
  textOk: { color: "#34c759" },
  textError: { color: "#ef4444" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  countCard: {
    width: "47%" as any,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  countValue: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    letterSpacing: -0.5,
  },
  countLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 4,
  },
});
