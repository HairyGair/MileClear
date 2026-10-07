// Per-platform profit & loss card — Phase 3 of the "Money Picture"
// stack (22 May 2026). Sits on the Insights screen alongside the
// existing BusinessInsightsCard. Where BusinessInsightsCard shows
// "earnings per mile" (a productivity metric), this card shows the
// FULL net P&L per platform — gross earnings minus a proportional
// share of allowable expenses and fuel.
//
// The cost-allocation is heuristic (split by earnings share within
// the window). For dedicated platform-tied costs the per-project
// view does the same arithmetic with exact attribution.

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { EmptyState } from "../EmptyState";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchPlatformPnL,
  type PlatformPnLRow,
} from "../../lib/api/businessInsights";
import { formatPence, GIG_PLATFORMS } from "@mileclear/shared";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const GREEN = colors.green;
const RED = colors.red;
const BORDER = "rgba(255,255,255,0.06)";

const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

function labelFor(platform: string): string {
  return PLATFORM_LABEL[platform] ?? platform;
}

export function PlatformPnLCard({ days = 30 }: { days?: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<PlatformPnLRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlatformPnL(days)
      .then((res) => setRows(res.data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Profit by platform</Text>
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={AMBER} />
        </View>
      </View>
    );
  }

  if (error || !rows) {
    return null;
  }

  const earningRows = rows.filter((r) => r.grossEarningsPence > 0);

  if (earningRows.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Profit by platform</Text>
          </View>
        <EmptyState
          size="card"
          icon="cash-outline"
          title={`No earnings in the last ${days} days`}
          description="Add earnings and tag trips with the app you drove for to compare them."
          action={
            <TouchableOpacity
              onPress={() => router.push("/earning-form")}
              hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44 }}
              accessibilityRole="button"
              accessibilityLabel="Add earnings"
            >
              <Text style={{ fontSize: 14, fontFamily: fonts.semibold, color: AMBER }} maxFontSizeMultiplier={fontScaleCap.body}>
                Add earnings
              </Text>
              <Ionicons name="chevron-forward" size={14} color={AMBER} accessible={false} />
            </TouchableOpacity>
          }
        />
      </View>
    );
  }

  const topNet = earningRows[0]?.netPence ?? 0;
  const topPlatform = earningRows[0];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Profit by platform</Text>
        <Text style={styles.windowLabel}>Last {days} days</Text>
      </View>

      {topPlatform ? (
        <View style={styles.summaryRow}>
          <Ionicons name="trophy-outline" size={16} color={AMBER} />
          <Text style={styles.summaryText}>
            Best:{" "}
            <Text style={styles.summaryEmphasis}>{labelFor(topPlatform.platform)}</Text>{" "}
            netted <Text style={styles.summaryEmphasis}>{formatPence(topNet)}</Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.headers}>
        <Text style={[styles.headerCell, styles.headerCellLabel]}>Platform</Text>
        <Text style={[styles.headerCell, styles.headerCellNum]}>Gross</Text>
        <Text style={[styles.headerCell, styles.headerCellNum]}>Costs</Text>
        <Text style={[styles.headerCell, styles.headerCellNum]}>Net</Text>
      </View>

      {earningRows.slice(0, 6).map((r) => {
        const costPence = r.fuelPence + r.expensesPence;
        const netColor = r.netPence >= 0 ? GREEN : RED;
        return (
          <View key={r.platform} style={styles.dataRow}>
            <View style={styles.platformCell}>
              <Text style={styles.platformText} numberOfLines={1}>
                {labelFor(r.platform)}
              </Text>
              <Text style={styles.subText}>
                {r.trips} trip{r.trips === 1 ? "" : "s"} ·{" "}
                {r.businessMiles.toFixed(0)} mi
              </Text>
            </View>
            <Text style={[styles.numCell, styles.grossText]}>
              {formatPence(r.grossEarningsPence)}
            </Text>
            <Text style={styles.numCell}>{formatPence(costPence)}</Text>
            <Text style={[styles.numCell, styles.netText, { color: netColor }]}>
              {formatPence(r.netPence)}
            </Text>
          </View>
        );
      })}

      <Text style={styles.footnote}>
        Costs split by earnings share. Mileage allowance not subtracted —
        that's a tax-line item, not a real cash cost.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: TEXT_1,
  },
  windowLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadingBox: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${AMBER}10`,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  summaryText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  summaryEmphasis: {
    fontFamily: fonts.bold,
    color: TEXT_1,
  },
  headers: {
    flexDirection: "row",
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerCell: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerCellLabel: { flex: 2 },
  headerCellNum: { flex: 1, textAlign: "right" },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  platformCell: { flex: 2, gap: 2 },
  platformText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  subText: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  numCell: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "right",
  },
  grossText: { color: TEXT_1, fontFamily: fonts.semibold },
  netText: { fontFamily: fonts.bold },
  footnote: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 15,
    fontStyle: "italic",
  },
});
