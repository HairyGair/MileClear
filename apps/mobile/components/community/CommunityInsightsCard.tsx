import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import type { CommunityInsights, AreaEarnings, NearbyAnomaly, AreaPeakHour } from "@mileclear/shared";
import { fetchCommunityInsights } from "../../lib/api/communityInsights";

const GIG_LABELS: Record<string, string> = {
  uber: "Uber",
  uber_eats: "Uber Eats",
  deliveroo: "Deliveroo",
  just_eat: "Just Eat",
  amazon_flex: "Amazon Flex",
  stuart: "Stuart",
  gophr: "Gophr",
  dpd: "DPD",
  yodel: "Yodel",
  evri: "Evri",
};

function platformLabel(key: string): string {
  return GIG_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function anomalyIcon(type: string): string {
  switch (type) {
    case "indirect_route": return "git-branch-outline";
    case "many_stops": return "ellipsis-horizontal-circle-outline";
    case "long_idle": return "time-outline";
    case "very_short": return "resize-outline";
    case "very_long": return "trail-sign-outline";
    default: return "alert-circle-outline";
  }
}

function anomalyLabel(type: string): string {
  switch (type) {
    case "indirect_route": return "Detour reported";
    case "many_stops": return "Heavy traffic";
    case "long_idle": return "Long wait";
    case "very_short": return "Short trip area";
    case "very_long": return "Long haul route";
    default: return "Road issue";
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface CommunityInsightsCardProps {
  isWork?: boolean;
}

export function CommunityInsightsCard({ isWork = true }: CommunityInsightsCardProps) {
  const [data, setData] = useState<CommunityInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const loc = await Location.getLastKnownPositionAsync();
        if (!loc) {
          setLoading(false);
          return;
        }
        const res = await fetchCommunityInsights(
          loc.coords.latitude,
          loc.coords.longitude
        );
        setData(res.data);
      } catch {
        // Silently fail — community data is optional
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="people-outline" size={18} color="#f5a623" />
          <Text style={styles.title}>Community Intelligence</Text>
        </View>
        <ActivityIndicator size="small" color="#f5a623" style={{ paddingVertical: 20 }} />
      </View>
    );
  }

  if (!data) return null;

  const { stats, areaEarnings, peakHours, nearbyAnomalies, bestPlatformNearby, bestTimeNearby, fuelTipNearby } = data;

  // Build headline insights
  const headlines: { icon: string; text: string; color: string }[] = [];

  if (bestPlatformNearby && isWork) {
    const best = areaEarnings.find((e) => e.platform === bestPlatformNearby);
    if (best) {
      headlines.push({
        icon: "trending-up-outline",
        text: `${platformLabel(best.platform)} pays best nearby: ${formatPence(best.earningsPerMilePence)}/mi`,
        color: "#10b981",
      });
    }
  }

  if (bestTimeNearby && isWork) {
    headlines.push({
      icon: "time-outline",
      text: `Busiest time nearby: ${bestTimeNearby}`,
      color: "#3b82f6",
    });
  }

  if (nearbyAnomalies.length > 0) {
    const a = nearbyAnomalies[0];
    headlines.push({
      icon: anomalyIcon(a.type),
      text: `${anomalyLabel(a.type)} — ${a.distanceMiles} mi away (${timeAgo(a.reportedAt)})`,
      color: "#ef4444",
    });
  }

  if (fuelTipNearby) {
    headlines.push({
      icon: "speedometer-outline",
      text: `Cheapest fuel: ${fuelTipNearby}`,
      color: "#8b5cf6",
    });
  }

  if (headlines.length === 0 && areaEarnings.length === 0 && peakHours.length === 0) {
    return null; // Nothing useful to show
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((p) => !p)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="people-outline" size={18} color="#f5a623" />
          <Text style={styles.title}>Community Intelligence</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.driverCount}>
            {stats.driversNearby} driver{stats.driversNearby !== 1 ? "s" : ""} nearby
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color="#6b7280"
          />
        </View>
      </TouchableOpacity>

      {/* Quick headlines */}
      {headlines.map((h, i) => (
        <View key={i} style={styles.headlineRow}>
          <Ionicons name={h.icon as any} size={15} color={h.color} />
          <Text style={styles.headlineText}>{h.text}</Text>
        </View>
      ))}

      {/* Expanded details */}
      {expanded && (
        <View style={styles.expandedSection}>
          {/* Community totals */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalDrivers.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Drivers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalMilesTracked.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Miles</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalTripsLogged.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Trips</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatPence(stats.totalTaxSavedPence)}</Text>
              <Text style={styles.statLabel}>Tax Saved</Text>
            </View>
          </View>

          {/* Area Earnings (work mode only) */}
          {isWork && areaEarnings.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Earnings by Platform (Nearby)</Text>
              {areaEarnings.map((ae) => (
                <View key={ae.platform} style={styles.earningRow}>
                  <Text style={styles.earningPlatform}>{platformLabel(ae.platform)}</Text>
                  <View style={styles.earningRight}>
                    <Text style={styles.earningRate}>{formatPence(ae.earningsPerMilePence)}/mi</Text>
                    <Text style={styles.earningMeta}>
                      {ae.tripCount} trips {"\u00B7"} {ae.driverCount} drivers
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Peak Hours */}
          {peakHours.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Busiest Times Nearby</Text>
              {peakHours.slice(0, 3).map((ph, i) => (
                <View key={i} style={styles.peakRow}>
                  <Text style={styles.peakLabel}>{ph.label}</Text>
                  <View style={styles.peakRight}>
                    <Text style={styles.peakTrips}>{ph.tripCount} trips</Text>
                    {ph.avgSpeedMph > 0 && (
                      <Text style={styles.peakSpeed}>{ph.avgSpeedMph} mph avg</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Nearby Road Conditions */}
          {nearbyAnomalies.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Road Conditions</Text>
              {nearbyAnomalies.slice(0, 5).map((a, i) => (
                <View key={i} style={styles.anomalyRow}>
                  <Ionicons name={anomalyIcon(a.type) as any} size={14} color="#ef4444" />
                  <View style={styles.anomalyInfo}>
                    <Text style={styles.anomalyText}>
                      {anomalyLabel(a.type)} — {a.response}
                    </Text>
                    <Text style={styles.anomalyMeta}>
                      {a.distanceMiles} mi away {"\u00B7"} {timeAgo(a.reportedAt)}
                      {a.reportCount > 1 ? ` \u00B7 ${a.reportCount} reports` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
  },
  driverCount: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#6b7280",
  },
  // Headlines
  headlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },
  headlineText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#c9d1d9",
    flex: 1,
  },
  // Expanded
  expandedSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 12,
  },
  // Community stats bar
  statsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderRadius: 12,
    padding: 12,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  // Sections
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // Earnings
  earningRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  earningPlatform: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  earningRight: {
    alignItems: "flex-end",
  },
  earningRate: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#10b981",
  },
  earningMeta: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    marginTop: 1,
  },
  // Peak hours
  peakRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  peakLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#c9d1d9",
  },
  peakRight: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  peakTrips: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#3b82f6",
  },
  peakSpeed: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  // Anomalies
  anomalyRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    paddingVertical: 5,
  },
  anomalyInfo: {
    flex: 1,
  },
  anomalyText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#c9d1d9",
  },
  anomalyMeta: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    marginTop: 1,
  },
});
