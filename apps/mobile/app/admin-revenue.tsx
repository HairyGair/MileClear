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
import { fetchAdminRevenue } from "../lib/api/admin";
import type { AdminRevenue } from "@mileclear/shared";
import { formatPence } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const BG = colors.bg;
const GREEN = colors.green;

export default function AdminRevenueScreen() {
  const [revenue, setRevenue] = useState<AdminRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetchAdminRevenue();
      setRevenue(res.data);
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
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading revenue data" />
      </View>
    );
  }

  if (!revenue) {
    return (
      <View style={[s.container, s.centered]}>
        <Text style={s.emptyText}>Failed to load revenue data</Text>
      </View>
    );
  }

  // Paying only. Comp, referral and sandbox Pro are listed but never priced -
  // see services/subscriptionTruth.ts on the API.
  const b = revenue.breakdown;
  const stats = [
    { label: "MRR (paying)", value: formatPence(revenue.mrrPence), color: EMERALD },
    { label: "Paying subscribers", value: revenue.payingSubscribers.toLocaleString(), color: AMBER },
    { label: "Churn (30d)", value: `${revenue.churnRatePercent.toFixed(1)}%`, color: TEXT_1 },
    { label: "ARPPU", value: formatPence(revenue.arppuPence), color: TEXT_1 },
  ];

  const platformRows = [
    { label: "Apple monthly", count: b.appleMonthly },
    { label: "Apple annual (£3.75/mo)", count: b.appleAnnual },
    { label: "Stripe monthly", count: b.stripeMonthly },
    ...(b.stripeAnnual > 0 ? [{ label: "Stripe annual", count: b.stripeAnnual }] : []),
    { label: "Comp (not revenue)", count: b.comp },
    { label: "Referral Pro (not revenue)", count: b.referral },
    { label: "Sandbox (not revenue)", count: b.appleSandbox },
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
          </View>
        ))}
      </View>

      {/* Platform Split */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Who has Pro</Text>
        {platformRows.map((row, index) => (
          <View
            key={row.label}
            style={[s.row, index < platformRows.length - 1 && s.rowBorder]}
          >
            <Text style={s.rowLabel}>{row.label}</Text>
            <Text style={s.rowValue}>{row.count.toLocaleString()}</Text>
          </View>
        ))}
      </View>

      {/* Monthly Trend */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Paying by month</Text>
        {revenue.monthlyTrend.length === 0 ? (
          <Text style={s.emptyText}>No trend data yet</Text>
        ) : (
          revenue.monthlyTrend.map((item, index) => (
            <View
              key={item.month}
              style={[s.trendRow, index < revenue.monthlyTrend.length - 1 && s.rowBorder]}
            >
              <Text style={s.trendMonth}>{item.month}</Text>
              <View style={s.trendRight}>
                <Text style={s.trendCount}>{item.payingAtMonthEnd.toLocaleString()}</Text>
                {item.newPaid > 0 && (
                  <Text style={s.trendNew}>+{item.newPaid}</Text>
                )}
                {item.churned > 0 && (
                  <Text style={s.trendChurned}>-{item.churned}</Text>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const AMBER = colors.amber;
const EMERALD = GREEN;
const RED = colors.red;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const CARD_BG = colors.surface;
const CARD_BORDER = "rgba(255,255,255,0.05)";

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_3 },

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
    fontFamily: fonts.bold,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.semibold,
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  rowLabel: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  rowValue: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },

  trendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  trendMonth: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_1,
    flex: 1,
  },
  trendRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trendCount: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    minWidth: 32,
    textAlign: "right",
  },
  trendNew: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: EMERALD,
    minWidth: 28,
    textAlign: "right",
  },
  trendChurned: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: RED,
    minWidth: 28,
    textAlign: "right",
  },
});
