import { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { fetchFuelLogs } from "../../lib/api/fuel";
import { fetchRunningCost } from "../../lib/api/businessInsights";
import { formatPence } from "@mileclear/shared";
import type { FuelLogWithVehicle, RunningCostSummary } from "@mileclear/shared";
import { colors, fonts, fontScaleCap } from "../../lib/theme";
import { cachedFuelLogs, cachedRunningCost } from "../../lib/insights/api";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const GREEN = colors.green;

/** Insights passes the window it is showing; Home leaves it out and gets this month. */
export interface FuelWindow {
  period: "week" | "month";
  start: Date;
  end: Date;
  /** "this week", "this month", "September 2026". */
  label: string;
  /** YYYY-MM-DD inside the window, for the running-cost endpoint. */
  date: string;
}

interface FuelSummaryCardProps {
  window?: FuelWindow;
  monthMiles: number;
  estimatedMpg: number | null;
  fuelType: "petrol" | "diesel" | "electric" | "hybrid" | null;
}

export function FuelSummaryCard({ window: win, monthMiles, estimatedMpg, fuelType }: FuelSummaryCardProps) {
  const when = win ? win.label : "this month";
  const router = useRouter();
  const [logs, setLogs] = useState<FuelLogWithVehicle[]>([]);
  const [cost, setCost] = useState<RunningCostSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      const now = new Date();
      const monthStart = win ? win.start : new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = win ? new Date(win.end.getTime() - 1000) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // The three most recent fill-ups, for the list only.
      // On Insights both calls go through the shared cache (one request each,
      // reused for 60 s); Home keeps asking fresh.
      const logsPromise = win
        ? cachedFuelLogs(monthStart.toISOString(), monthEnd.toISOString())
        : fetchFuelLogs({ from: monthStart.toISOString(), to: monthEnd.toISOString(), pageSize: 3 });
      logsPromise
        .then((res) => setLogs(res.data))
        .catch(() => {});
      // Spend, cost per mile and MPG: the one running cost
      // (docs/insights-oct2026/NUMBERS.md). Before 9 Oct 2026 this card
      // added up only the first page (3) of the month's fill-ups and
      // divided by the month's miles, so it disagreed with Trends.
      const costPromise = win
        ? cachedRunningCost(win.period, win.date)
        : fetchRunningCost("month").then((res) => res.data);
      costPromise
        .then((data) => setCost(data))
        .catch(() => {});
    }, [win?.period, win?.date, win?.start.getTime()])
  );

  if (fuelType === "electric") return null;

  const fillUpCount = cost?.period.fillUps ?? logs.length;
  const hasRealData = fillUpCount > 0;
  const mpg = cost?.mpg ?? estimatedMpg ?? null;
  const ppl = cost?.pencePerLitre ?? null;

  // Spend: what the fill-ups in the window cost; with none, miles x rate.
  let displayCost: number;
  let isEstimate: boolean;
  if (hasRealData && cost) {
    displayCost = cost.period.fillUpSpendPence;
    isEstimate = false;
  } else {
    displayCost = cost?.period.estimatedCostPence ?? 0;
    isEstimate = true;
  }

  const costPerMile = cost?.pencePerMile != null && cost.pencePerMile > 0
    ? `${cost.pencePerMile.toFixed(1)}p`
    : null;

  if (monthMiles < 1 && !hasRealData) return null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push("/(tabs)/fuel")}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Fuel and running costs. ${isEstimate ? "Estimated" : `${fillUpCount} fill-up${fillUpCount !== 1 ? "s" : ""}`} ${when}. Tap to view fuel logs`}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="water" size={16} color={AMBER} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fuel & Running Costs</Text>
          <Text style={styles.subtitle}>
            {isEstimate ? `Estimated ${when}` : `${fillUpCount} fill-up${fillUpCount !== 1 ? "s" : ""} ${when}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue} maxFontSizeMultiplier={fontScaleCap.display}>
            {isEstimate ? "~" : ""}{formatPence(displayCost)}
          </Text>
          <Text style={styles.statLabel} maxFontSizeMultiplier={fontScaleCap.display}>
            {isEstimate ? "est. cost" : "spent"}
          </Text>
        </View>
        <View style={styles.statDot} />
        {costPerMile && (
          <>
            <View style={styles.statItem}>
              <Text style={styles.statValue} maxFontSizeMultiplier={fontScaleCap.display}>{costPerMile}</Text>
              <Text style={styles.statLabel} maxFontSizeMultiplier={fontScaleCap.display}>{cost?.source === "estimate" ? "per mile, estimate" : "per mile"}</Text>
            </View>
            <View style={styles.statDot} />
          </>
        )}
        <View style={styles.statItem}>
          <Text style={styles.statValue} maxFontSizeMultiplier={fontScaleCap.display}>{mpg ?? "-"}</Text>
          <Text style={styles.statLabel} maxFontSizeMultiplier={fontScaleCap.display}>MPG</Text>
        </View>
        {hasRealData && ppl != null && (
          <>
            <View style={styles.statDot} />
            <View style={styles.statItem}>
              <Text style={styles.statValue} maxFontSizeMultiplier={fontScaleCap.display}>{ppl.toFixed(1)}p</Text>
              <Text style={styles.statLabel} maxFontSizeMultiplier={fontScaleCap.display}>per litre</Text>
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
          <Ionicons name="add-circle-outline" size={14} color={AMBER} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
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
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
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
    flexShrink: 1,
  },
  statValue: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 2,
    textAlign: "center",
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
    fontFamily: fonts.semibold,
    color: TEXT_2,
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
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  logDetail: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 2,
  },
  logCost: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: GREEN,
  },
  logDate: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
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
    fontFamily: fonts.medium,
    color: AMBER,
  },
});
