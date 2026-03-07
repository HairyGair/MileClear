import { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { fetchFuelLogs } from "../../lib/api/fuel";
import { formatPence } from "@mileclear/shared";
import type { FuelLogWithVehicle } from "@mileclear/shared";

interface FuelSummaryCardProps {
  monthMiles: number;
  estimatedMpg: number | null;
  fuelType: "petrol" | "diesel" | "electric" | "hybrid" | null;
}

const LITRES_PER_GALLON = 4.54609;
const FALLBACK_MPG = 35;
const FALLBACK_PPL = { petrol: 138, diesel: 145, electric: 0, hybrid: 138 };

export function FuelSummaryCard({ monthMiles, estimatedMpg, fuelType }: FuelSummaryCardProps) {
  const router = useRouter();
  const [logs, setLogs] = useState<FuelLogWithVehicle[]>([]);
  const [totalSpend, setTotalSpend] = useState(0);
  const [totalLitres, setTotalLitres] = useState(0);
  const [fillUpCount, setFillUpCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      fetchFuelLogs({
        from: monthStart.toISOString(),
        to: monthEnd.toISOString(),
        pageSize: 3,
      })
        .then((res) => {
          setLogs(res.data);
          setFillUpCount(res.total);
          // Use total from all pages, but compute spend from what we have
          // For accurate total, we'd need all pages — use total count as indicator
          const spend = res.data.reduce((s, l) => s + l.costPence, 0);
          const litres = res.data.reduce((s, l) => s + l.litres, 0);
          setTotalSpend(spend);
          setTotalLitres(litres);
        })
        .catch(() => {});
    }, [])
  );

  if (fuelType === "electric") return null;

  const mpg = estimatedMpg || FALLBACK_MPG;
  const hasRealData = logs.length > 0;
  const ppl = totalLitres > 0
    ? Math.round(totalSpend / totalLitres)
    : FALLBACK_PPL[fuelType || "petrol"];

  // Cost display: use real data if available, otherwise estimate
  let displayCost: number;
  let isEstimate: boolean;
  if (hasRealData) {
    displayCost = totalSpend;
    isEstimate = false;
  } else if (monthMiles > 0) {
    const gallons = monthMiles / mpg;
    const litres = gallons * LITRES_PER_GALLON;
    displayCost = Math.round(litres * ppl);
    isEstimate = true;
  } else {
    displayCost = 0;
    isEstimate = true;
  }

  const costPerMile = monthMiles > 0 && displayCost > 0
    ? (displayCost / monthMiles / 100).toFixed(2)
    : null;

  if (monthMiles < 1 && !hasRealData) return null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push("/(tabs)/fuel")}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Fuel and running costs. ${isEstimate ? "Estimated" : `${fillUpCount} fill-up${fillUpCount !== 1 ? "s" : ""}`} this month. Tap to view fuel logs`}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="water" size={16} color="#f5a623" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fuel & Running Costs</Text>
          <Text style={styles.subtitle}>
            {isEstimate ? "Estimated this month" : `${fillUpCount} fill-up${fillUpCount !== 1 ? "s" : ""} this month`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#64748b" />
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {isEstimate ? "~" : ""}{formatPence(displayCost)}
          </Text>
          <Text style={styles.statLabel}>
            {isEstimate ? "est. cost" : "spent"}
          </Text>
        </View>
        <View style={styles.statDot} />
        {costPerMile && (
          <>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{"\u00A3"}{costPerMile}</Text>
              <Text style={styles.statLabel}>per mile</Text>
            </View>
            <View style={styles.statDot} />
          </>
        )}
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{mpg}</Text>
          <Text style={styles.statLabel}>MPG</Text>
        </View>
        {hasRealData && (
          <>
            <View style={styles.statDot} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{(ppl / 100).toFixed(1)}p</Text>
              <Text style={styles.statLabel}>per litre</Text>
            </View>
          </>
        )}
      </View>

      {/* Recent fill-ups */}
      {logs.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent fill-ups</Text>
          {logs.map((log, idx) => (
            <View key={log.id} style={[styles.logRow, idx < logs.length - 1 && styles.logRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.logStation}>{log.stationName || "Unknown"}</Text>
                <Text style={styles.logDetail}>
                  {log.litres.toFixed(1)}L · {(log.costPence / log.litres / 100).toFixed(1)}p/L
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.logCost}>{formatPence(log.costPence)}</Text>
                <Text style={styles.logDate}>
                  {new Date(log.loggedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Hint for no data */}
      {!hasRealData && monthMiles > 0 && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            Log a fill-up for accurate fuel costs
          </Text>
          <Ionicons name="add-circle-outline" size={14} color="#f5a623" />
        </View>
      )}
    </TouchableOpacity>
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
    gap: 10,
    marginBottom: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    marginTop: 1,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 10,
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    marginTop: 2,
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  recentSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  recentTitle: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  logRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  logStation: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  logDetail: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    marginTop: 2,
  },
  logCost: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#10b981",
  },
  logDate: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    marginTop: 2,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  hintText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#f5a623",
  },
});
