import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchBusinessInsights, fetchWeeklyPnL } from "../../lib/api/businessInsights";
import { formatPence, BUSINESS_PURPOSES } from "@mileclear/shared";
import type { BusinessInsights, WeeklyPnL } from "@mileclear/shared";
import { useUser } from "../../lib/user/context";

const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const GREEN = "#10b981";
const RED = "#ef4444";
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

function purposeLabel(value: string): string {
  const found = BUSINESS_PURPOSES.find((bp) => bp.value === value);
  return found?.label ?? value.replace(/_/g, " ");
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return GREEN;
    case "B": return "#fbbf24";
    case "C": return "#f59e0b";
    case "D": return RED;
    case "F": return RED;
    default: return TEXT_3;
  }
}

type Section = "efficiency" | "platforms" | "shifts" | "pnl" | "fuel";

export function BusinessInsightsCard() {
  const { user } = useUser();
  const workType = user?.workType ?? "gig";
  const isGigDriver = workType === "gig" || workType === "both";
  const [insights, setInsights] = useState<BusinessInsights | null>(null);
  const [pnl, setPnl] = useState<WeeklyPnL | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Section | null>(null);
  const [pnlWeek, setPnlWeek] = useState(0);

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

  useEffect(() => {
    if (pnlWeek === 0) return;
    fetchWeeklyPnL(pnlWeek)
      .then((res) => setPnl(res.data))
      .catch(() => {});
  }, [pnlWeek]);

  if (loading) {
    return (
      <View style={[s.card, { paddingVertical: 24, alignItems: "center" }]}>
        <ActivityIndicator size="small" color={AMBER} />
        <Text style={[s.label, { marginTop: 8 }]}>Loading insights...</Text>
      </View>
    );
  }

  if (!insights || (insights.totalEarningsPence === 0 && insights.totalBusinessMiles === 0)) {
    return null; // No data yet
  }

  const toggle = (section: Section) => {
    setExpanded((prev) => (prev === section ? null : section));
  };

  return (
    <View style={{ gap: 12, marginBottom: 16 }}>
      {/* Efficiency Overview */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Business Intelligence</Text>
        <View style={s.metricsRow}>
          <View style={s.metric}>
            <Text style={s.metricValue}>{formatPence(insights.earningsPerMilePence)}</Text>
            <Text style={s.metricLabel}>per mile</Text>
          </View>
          <View style={s.divider} />
          <View style={s.metric}>
            <Text style={s.metricValue}>{formatPence(insights.earningsPerHourPence)}</Text>
            <Text style={s.metricLabel}>per hour</Text>
          </View>
          <View style={s.divider} />
          <View style={s.metric}>
            <Text style={s.metricValue}>{insights.avgTripsPerShift}</Text>
            <Text style={s.metricLabel}>trips/shift</Text>
          </View>
        </View>
        {/* Trends */}
        {(insights.earningsTrendPercent !== null || insights.mileTrendPercent !== null) && (
          <View style={s.trendsRow}>
            {insights.earningsTrendPercent !== null && (
              <View style={s.trendChip}>
                <Ionicons
                  name={insights.earningsTrendPercent >= 0 ? "trending-up" : "trending-down"}
                  size={14}
                  color={insights.earningsTrendPercent >= 0 ? GREEN : RED}
                />
                <Text style={[s.trendText, { color: insights.earningsTrendPercent >= 0 ? GREEN : RED }]}>
                  {insights.earningsTrendPercent > 0 ? "+" : ""}{insights.earningsTrendPercent}% earnings
                </Text>
              </View>
            )}
            {insights.mileTrendPercent !== null && (
              <View style={s.trendChip}>
                <Ionicons
                  name={insights.mileTrendPercent >= 0 ? "trending-up" : "trending-down"}
                  size={14}
                  color={insights.mileTrendPercent >= 0 ? GREEN : RED}
                />
                <Text style={[s.trendText, { color: insights.mileTrendPercent >= 0 ? GREEN : RED }]}>
                  {insights.mileTrendPercent > 0 ? "+" : ""}{insights.mileTrendPercent}% miles
                </Text>
              </View>
            )}
            <Text style={s.trendLabel}>vs last week</Text>
          </View>
        )}
      </View>

      {/* Platform / Purpose Performance */}
      {insights.platformPerformance.length > 0 && (
        <TouchableOpacity style={s.card} onPress={() => toggle("platforms")} activeOpacity={0.7}>
          <View style={s.expandHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionLabel}>{isGigDriver ? "Platform Performance" : "Trip Breakdown"}</Text>
              {insights.bestPlatform && (
                <Text style={s.bestLabel}>
                  Best: {isGigDriver ? platformLabel(insights.bestPlatform) : purposeLabel(insights.bestPlatform)} ({formatPence(insights.platformPerformance[0]?.earningsPerMilePence ?? 0)}/mi)
                </Text>
              )}
            </View>
            <Ionicons
              name={expanded === "platforms" ? "chevron-up" : "chevron-down"}
              size={18}
              color={TEXT_3}
            />
          </View>
          {expanded === "platforms" && (
            <View style={s.platformList}>
              {insights.platformPerformance.map((p) => (
                <View key={p.platform} style={s.platformRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.platformName}>{isGigDriver ? platformLabel(p.platform) : purposeLabel(p.platform)}</Text>
                    <Text style={s.platformMeta}>
                      {p.tripCount} trips · {p.totalMiles.toFixed(1)} mi
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.platformEarnings}>{formatPence(p.totalEarningsPence)}</Text>
                    <Text style={s.platformRate}>{formatPence(p.earningsPerMilePence)}/mi</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Shift Grades */}
      {insights.recentShifts.length > 0 && (
        <TouchableOpacity style={s.card} onPress={() => toggle("shifts")} activeOpacity={0.7}>
          <View style={s.expandHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionLabel}>Shift Grades</Text>
              {insights.avgShiftGrade && (
                <Text style={s.bestLabel}>
                  Average: <Text style={{ color: gradeColor(insights.avgShiftGrade), fontWeight: "700" }}>{insights.avgShiftGrade}</Text>
                </Text>
              )}
            </View>
            <Ionicons
              name={expanded === "shifts" ? "chevron-up" : "chevron-down"}
              size={18}
              color={TEXT_3}
            />
          </View>
          {expanded === "shifts" && (
            <View style={s.shiftList}>
              {insights.recentShifts.slice(0, 5).map((shift) => (
                <View key={shift.shiftId} style={s.shiftRow}>
                  <View style={[s.gradeBadge, { backgroundColor: gradeColor(shift.grade) }]}>
                    <Text style={s.gradeText}>{shift.grade}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.shiftDate}>
                      {new Date(shift.startedAt).toLocaleDateString("en-GB", {
                        weekday: "short", day: "numeric", month: "short",
                      })}
                    </Text>
                    <Text style={s.shiftMeta}>
                      {shift.tripsCompleted} trips · {shift.totalMiles.toFixed(1)} mi · {Math.round(shift.durationSeconds / 60)}m
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={s.shiftEarnings}>{formatPence(shift.earningsPerHourPence)}/hr</Text>
                    <Text style={s.shiftRate}>{shift.utilisationPercent}% active</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Golden Hours */}
      {insights.goldenHours.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionLabel}>Golden Hours</Text>
          <Text style={[s.label, { marginBottom: 10 }]}>Your most profitable time slots</Text>
          {insights.goldenHours.map((gh, i) => (
            <View key={gh.label} style={s.goldenRow}>
              <View style={s.goldenRank}>
                <Text style={s.goldenRankText}>#{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.goldenLabel}>{gh.label}</Text>
                <Text style={s.goldenMeta}>
                  {gh.tripCount} {gh.tripCount === 1 ? "session" : "sessions"} · avg {formatPence(gh.avgEarningsPence)}
                </Text>
              </View>
            </View>
          ))}
          {insights.busiestDay && (
            <Text style={[s.label, { marginTop: 8 }]}>
              Busiest day: {insights.busiestDay}
            </Text>
          )}
        </View>
      )}

      {/* Weekly P&L */}
      {pnl && (
        <View style={s.card}>
          <View style={s.expandHeader}>
            <Text style={s.sectionLabel}>Weekly P&L</Text>
            <View style={s.pnlNav}>
              <TouchableOpacity onPress={() => setPnlWeek((w) => w + 1)} disabled={pnlWeek >= 12}>
                <Ionicons name="chevron-back" size={18} color={pnlWeek >= 12 ? TEXT_3 : TEXT_2} />
              </TouchableOpacity>
              <Text style={s.pnlPeriod}>{pnl.periodLabel}</Text>
              <TouchableOpacity onPress={() => setPnlWeek((w) => Math.max(0, w - 1))} disabled={pnlWeek === 0}>
                <Ionicons name="chevron-forward" size={18} color={pnlWeek === 0 ? TEXT_3 : TEXT_2} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.pnlRows}>
            <View style={s.pnlRow}>
              <Text style={s.pnlLabel}>Gross Earnings</Text>
              <Text style={[s.pnlValue, { color: GREEN }]}>{formatPence(pnl.grossEarningsPence)}</Text>
            </View>
            <View style={s.pnlRow}>
              <Text style={s.pnlLabel}>Fuel Cost</Text>
              <Text style={[s.pnlValue, { color: pnl.estimatedFuelCostPence > 0 ? RED : TEXT_3 }]}>
                {pnl.estimatedFuelCostPence > 0 ? `- ${formatPence(pnl.estimatedFuelCostPence)}` : "\u2014"}
              </Text>
            </View>
            <View style={s.pnlRow}>
              <Text style={s.pnlLabel}>Vehicle Wear (est.)</Text>
              <Text style={[s.pnlValue, { color: pnl.estimatedWearCostPence > 0 ? RED : TEXT_3 }]}>
                {pnl.estimatedWearCostPence > 0 ? `- ${formatPence(pnl.estimatedWearCostPence)}` : "\u2014"}
              </Text>
            </View>
            <View style={s.pnlDivider} />
            <View style={s.pnlRow}>
              <Text style={[s.pnlLabel, { color: TEXT_1, fontWeight: "700" }]}>Net Profit</Text>
              <Text style={[s.pnlValue, { color: pnl.netProfitPence >= 0 ? GREEN : RED, fontWeight: "700", fontSize: 16 }]}>
                {formatPence(pnl.netProfitPence)}
              </Text>
            </View>
            <View style={s.pnlRow}>
              <Text style={[s.pnlLabel, { color: TEXT_3 }]}>HMRC Deduction</Text>
              <Text style={[s.pnlValue, { color: TEXT_3 }]}>{formatPence(pnl.hmrcDeductionPence)}</Text>
            </View>
          </View>
          <Text style={s.pnlMeta}>
            {pnl.businessMiles} mi · {pnl.totalTrips} trips
          </Text>
        </View>
      )}

      {/* Fuel Economy */}
      {(insights.actualMpg !== null || insights.fuelCostPerMilePence !== null) && (
        <View style={s.card}>
          <Text style={s.sectionLabel}>Fuel Economy</Text>
          <View style={s.fuelRow}>
            {insights.actualMpg !== null && (
              <View style={s.fuelStat}>
                <Text style={s.fuelValue}>{insights.actualMpg}</Text>
                <Text style={s.fuelLabel}>Actual MPG</Text>
              </View>
            )}
            {insights.fuelCostPerMilePence !== null && (
              <View style={s.fuelStat}>
                <Text style={s.fuelValue}>{insights.fuelCostPerMilePence}p</Text>
                <Text style={s.fuelLabel}>Cost/Mile</Text>
              </View>
            )}
            {insights.estimatedFuelCostPence !== null && (
              <View style={s.fuelStat}>
                <Text style={s.fuelValue}>{formatPence(insights.estimatedFuelCostPence)}</Text>
                <Text style={s.fuelLabel}>Est. Total</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    letterSpacing: -0.2,
  },
  label: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  bestLabel: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
  },

  // Metrics
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  metric: { alignItems: "center" },
  metricValue: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
    letterSpacing: -0.5,
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  // Trends
  trendsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    gap: 8,
    flexWrap: "wrap",
  },
  trendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trendText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  trendLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },

  // Expandable
  expandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  // Platforms
  platformList: { marginTop: 12, gap: 10 },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  platformName: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  platformMeta: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 1,
  },
  platformEarnings: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  platformRate: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: GREEN,
    marginTop: 1,
  },

  // Shifts
  shiftList: { marginTop: 12, gap: 10 },
  shiftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  gradeBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_800ExtraBold",
    color: "#030712",
  },
  shiftDate: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
  },
  shiftMeta: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 1,
  },
  shiftEarnings: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },
  shiftRate: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 1,
  },

  // Golden hours
  goldenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  goldenRank: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: AMBER,
    alignItems: "center",
    justifyContent: "center",
  },
  goldenRankText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_800ExtraBold",
    color: "#030712",
  },
  goldenLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  goldenMeta: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 1,
  },

  // P&L
  pnlNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pnlPeriod: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    minWidth: 100,
    textAlign: "center",
  },
  pnlRows: { marginTop: 12, gap: 6 },
  pnlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  pnlLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  pnlValue: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  pnlDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    marginVertical: 4,
  },
  pnlMeta: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textAlign: "right",
    marginTop: 6,
  },

  // Fuel
  fuelRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  fuelStat: { alignItems: "center" },
  fuelValue: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
  },
  fuelLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
  },
});
