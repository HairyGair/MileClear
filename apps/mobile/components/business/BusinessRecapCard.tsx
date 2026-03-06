import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Platform, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchBusinessInsights, fetchWeeklyPnL } from "../../lib/api/businessInsights";
import { formatPence } from "@mileclear/shared";
import type { BusinessInsights, WeeklyPnL } from "@mileclear/shared";
import {
  BusinessRecapShareCard,
  captureAndShareBusinessRecap,
  type BusinessRecapShareData,
} from "./BusinessShareableRecap";

const AMBER = "#f5a623";
const GREEN = "#10b981";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";

function platformLabel(tag: string): string {
  const map: Record<string, string> = {
    uber: "Uber", deliveroo: "Deliveroo", just_eat: "Just Eat",
    amazon_flex: "Amazon Flex", stuart: "Stuart", gophr: "Gophr",
    dpd: "DPD", yodel: "Yodel", evri: "Evri", other: "Other",
  };
  return map[tag] ?? tag;
}

export function BusinessRecapCard() {
  const shareCardRef = useRef<View>(null);
  const [insights, setInsights] = useState<BusinessInsights | null>(null);
  const [pnl, setPnl] = useState<WeeklyPnL | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"week" | "month">("month");

  useEffect(() => {
    async function load() {
      try {
        const [insRes, pnlRes] = await Promise.all([
          fetchBusinessInsights(),
          fetchWeeklyPnL(0),
        ]);
        setInsights(insRes.data);
        setPnl(pnlRes.data);
      } catch {
        // Silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return null;
  if (!insights || (insights.totalEarningsPence === 0 && insights.totalBusinessMiles === 0)) {
    return null;
  }

  const isWeek = view === "week";
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  // Monthly data from insights, weekly from P&L
  const displayEarnings = isWeek ? (pnl?.grossEarningsPence ?? 0) : insights.totalEarningsPence;
  const displayMiles = isWeek ? (pnl?.businessMiles ?? 0) : insights.totalBusinessMiles;
  const displayTrips = isWeek ? (pnl?.totalTrips ?? 0) : Math.round(insights.avgTripsPerShift * insights.recentShifts.length) || insights.recentShifts.reduce((sum, sh) => sum + sh.tripsCompleted, 0);
  const displayHours = isWeek
    ? (pnl ? pnl.businessMiles / (insights.earningsPerHourPence > 0 ? (pnl.grossEarningsPence / insights.earningsPerHourPence) : 1) : 0)
    : insights.totalShiftHours;
  const displayLabel = isWeek ? (pnl?.periodLabel ?? "This Week") : monthLabel;

  const shareData: BusinessRecapShareData = {
    periodLabel: displayLabel,
    grossEarningsPence: displayEarnings,
    netProfitPence: isWeek ? (pnl?.netProfitPence ?? 0) : insights.totalEarningsPence - (insights.estimatedFuelCostPence ?? 0),
    businessMiles: displayMiles,
    totalTrips: displayTrips,
    earningsPerMilePence: insights.earningsPerMilePence,
    earningsPerHourPence: insights.earningsPerHourPence,
    hmrcDeductionPence: isWeek ? (pnl?.hmrcDeductionPence ?? 0) : insights.deductionPence,
    avgShiftGrade: insights.avgShiftGrade,
    bestPlatform: insights.bestPlatform ? platformLabel(insights.bestPlatform) : null,
    totalShiftHours: isWeek ? Math.round(displayHours) : insights.totalShiftHours,
  };

  const handleShare = () => {
    captureAndShareBusinessRecap(shareCardRef, shareData);
  };

  return (
    <View>
      {/* Off-screen shareable card */}
      <View style={styles.offScreen} pointerEvents="none">
        <View ref={shareCardRef} collapsable={false}>
          <BusinessRecapShareCard {...shareData} />
        </View>
      </View>

      {/* Visible card */}
      <View style={styles.card}>
        <View style={styles.topBorder} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconWrap}>
              <Ionicons name="bar-chart" size={16} color={AMBER} />
            </View>
            <Text style={styles.heading}>{displayLabel}</Text>
          </View>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !isWeek && styles.toggleBtnActive]}
              onPress={() => setView("month")}
            >
              <Text style={[styles.toggleText, !isWeek && styles.toggleTextActive]}>Month</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, isWeek && styles.toggleBtnActive]}
              onPress={() => setView("week")}
            >
              <Text style={[styles.toggleText, isWeek && styles.toggleTextActive]}>Week</Text>
            </Pressable>
          </View>
        </View>

        {/* Hero stats */}
        <View style={styles.heroRow}>
          <View style={styles.heroStat}>
            <Text style={[styles.heroValue, { color: GREEN }]}>
              {formatPence(displayEarnings)}
            </Text>
            <Text style={styles.heroUnit}>earned</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroValue}>
              {displayMiles < 100 ? displayMiles.toFixed(1) : Math.round(displayMiles).toLocaleString("en-GB")}
            </Text>
            <Text style={styles.heroUnit}>miles</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroValue}>{displayTrips}</Text>
            <Text style={styles.heroUnit}>{displayTrips === 1 ? "trip" : "trips"}</Text>
          </View>
        </View>

        {/* Efficiency insights */}
        <View style={styles.insightList}>
          <View style={styles.insightRow}>
            <View style={[styles.insightIcon, styles.insightIconAmber]}>
              <Ionicons name="speedometer" size={12} color={AMBER} />
            </View>
            <Text style={styles.insightText}>
              {formatPence(insights.earningsPerMilePence)}/mi · {formatPence(insights.earningsPerHourPence)}/hr
            </Text>
          </View>

          {insights.avgShiftGrade && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconGreen]}>
                <Ionicons name="ribbon" size={12} color={GREEN} />
              </View>
              <Text style={styles.insightText}>
                Average shift grade: <Text style={styles.insightHighlight}>{insights.avgShiftGrade}</Text>
              </Text>
            </View>
          )}

          {insights.bestPlatform && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconAmber]}>
                <Ionicons name="trophy" size={12} color={AMBER} />
              </View>
              <Text style={styles.insightText}>
                Top platform: <Text style={styles.insightHighlight}>{platformLabel(insights.bestPlatform)}</Text>
              </Text>
            </View>
          )}

          {insights.deductionPence > 0 && !isWeek && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconGreen]}>
                <Ionicons name="cash" size={12} color={GREEN} />
              </View>
              <Text style={styles.insightText}>
                {formatPence(insights.deductionPence)} HMRC deduction this tax year
              </Text>
            </View>
          )}

          {isWeek && pnl && pnl.netProfitPence !== 0 && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, pnl.netProfitPence >= 0 ? styles.insightIconGreen : styles.insightIconRed]}>
                <Ionicons
                  name={pnl.netProfitPence >= 0 ? "trending-up" : "trending-down"}
                  size={12}
                  color={pnl.netProfitPence >= 0 ? GREEN : "#ef4444"}
                />
              </View>
              <Text style={styles.insightText}>
                Net profit: <Text style={{ color: pnl.netProfitPence >= 0 ? GREEN : "#ef4444" }}>{formatPence(pnl.netProfitPence)}</Text>
              </Text>
            </View>
          )}

          {insights.goldenHours.length > 0 && (
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, styles.insightIconAmber]}>
                <Ionicons name="time" size={12} color={AMBER} />
              </View>
              <Text style={styles.insightText}>
                Best time: <Text style={styles.insightHighlight}>{insights.goldenHours[0].label}</Text>
              </Text>
            </View>
          )}
        </View>

        <View style={styles.separator} />

        {/* Share button */}
        <Pressable
          style={({ pressed }) => [
            styles.shareButton,
            pressed && styles.shareButtonPressed,
          ]}
          onPress={handleShare}
        >
          <Ionicons name="share-outline" size={16} color={AMBER} />
          <Text style={styles.shareText}>Share Earnings Report</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offScreen: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#f5a623",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  topBorder: {
    height: 2,
    backgroundColor: AMBER,
    opacity: 0.7,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  heading: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    letterSpacing: -0.3,
    flex: 1,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
  },
  toggleText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_3,
  },
  toggleTextActive: {
    color: AMBER,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    paddingVertical: 14,
  },
  heroStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  heroValue: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_300Light",
    color: AMBER,
    letterSpacing: -0.8,
  },
  heroUnit: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    letterSpacing: 0.2,
  },
  heroDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  insightList: {
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  insightIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  insightIconAmber: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
  },
  insightIconGreen: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  insightIconRed: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  insightText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    flex: 1,
  },
  insightHighlight: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  shareButtonPressed: {
    opacity: 0.6,
  },
  shareText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
    letterSpacing: 0.1,
  },
});
