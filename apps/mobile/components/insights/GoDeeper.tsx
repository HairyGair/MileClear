// "Go deeper" (Pro): one inline group holding the Pro cards from the old
// Trends tab that survive, each folded to a one-line row with its headline
// figure; tap a row to open the full card in place. Free drivers see ONE
// compact teaser row instead of locked cards.
//
// Kept: Your routes, Commute times, Running costs (fuel economy), and for
// Work: Best shift length, Best earning days (gig drivers only).
// Dropped (merged into the summary card / platform league, or replaced):
// Business Intelligence, Weekly P&L, Platform Performance, Profit by
// platform, the weekly report and its Business/Personal columns.
//
// Usage:
//   <GoDeeper period="week" offset={0} mode="work" isPro={isPro} />

import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../../lib/user/context";
import { usePaywall } from "../paywall";
import {
  useDrivingAnalytics,
  FrequentRoutesCard,
  CommuteTimingCard,
  FuelCostCard,
  ShiftSweetSpotsCard,
  EarningsByDayCard,
} from "./TrendsView";
import { CardSkeleton, CardError, type InsightCardProps } from "./work/InsightCardUi";
import { colors, fonts, fontScaleCap, radii, shared, spacing } from "../../lib/theme";

type RowKey = "routes" | "commute" | "fuel" | "shift" | "days";

interface DeepRow {
  key: RowKey;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  headline: string;
  card: React.ReactNode;
}

function pluralise(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function GoDeeper({ mode, isPro, refreshToken }: InsightCardProps) {
  const { user, isCompanyDriver } = useUser();
  const { showPaywall } = usePaywall();
  const [open, setOpen] = useState<RowKey | null>(null);
  const { analytics, loading, failed, reload } = useDrivingAnalytics(isPro, refreshToken ?? 0);

  const isWork = mode === "work";
  const workType = user?.workType ?? "gig";
  const isGig = (workType === "gig" || workType === "both") && !isCompanyDriver;

  if (!isPro) {
    return (
      <TouchableOpacity
        style={styles.teaser}
        onPress={() => showPaywall("go_deeper")}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Go deeper, Pro. ${
          isWork && isGig
            ? "Your regular routes, commute times, fuel costs and best earning days."
            : "Your regular routes, commute times and fuel costs."
        }`}
      >
        <View style={styles.teaserText}>
          <View style={styles.headRow}>
            <Text style={styles.heading} maxFontSizeMultiplier={fontScaleCap.heading}>
              Go deeper
            </Text>
            <View style={shared.proBadge}>
              <Text style={shared.proBadgeText} maxFontSizeMultiplier={fontScaleCap.none}>
                PRO
              </Text>
            </View>
          </View>
          <Text style={styles.teaserBody} maxFontSizeMultiplier={fontScaleCap.body}>
            {isWork && isGig
              ? "Your regular routes, commute times, fuel costs and best earning days."
              : "Your regular routes, commute times and fuel costs."}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.text2} accessible={false} />
      </TouchableOpacity>
    );
  }

  if (loading && !analytics) return <CardSkeleton lines={3} />;
  if (failed && !analytics) return <CardError onRetry={reload} />;
  if (!analytics) return null;

  const rows: DeepRow[] = [];
  if (analytics.frequentRoutes.length > 0) {
    rows.push({
      key: "routes",
      icon: "navigate-outline",
      title: "Your routes",
      headline: pluralise(analytics.frequentRoutes.length, "regular route", "regular routes"),
      card: <FrequentRoutesCard routes={analytics.frequentRoutes} />,
    });
  }
  if (analytics.commuteTiming.length > 0) {
    const first = analytics.commuteTiming[0];
    rows.push({
      key: "commute",
      icon: "time-outline",
      title: "Commute times",
      headline: first.bestDepartureLabel || pluralise(analytics.commuteTiming.length, "commute", "commutes"),
      card: <CommuteTimingCard commutes={analytics.commuteTiming} />,
    });
  }
  const fuel = analytics.fuelCost;
  if (fuel.fuelCostPerMilePence != null || fuel.recentFillUps.length > 0) {
    rows.push({
      key: "fuel",
      icon: "speedometer-outline",
      title: "Running costs",
      headline:
        fuel.fuelCostPerMilePence != null ? `${fuel.fuelCostPerMilePence.toFixed(1)}p a mile` : "Recent fill-ups",
      card: <FuelCostCard fuel={fuel} />,
    });
  }
  if (isWork && analytics.shiftSweetSpots.length > 0) {
    const best = [...analytics.shiftSweetSpots].sort((a, b) => b.avgEarningsPerHourPence - a.avgEarningsPerHourPence)[0];
    const hasPay = best.avgEarningsPerHourPence > 0;
    rows.push({
      key: "shift",
      icon: "hourglass-outline",
      title: "Best shift length",
      headline: hasPay ? best.durationBucket : pluralise(analytics.shiftSweetSpots.length, "shift length", "shift lengths"),
      card: <ShiftSweetSpotsCard spots={analytics.shiftSweetSpots} />,
    });
  }
  if (isWork && isGig && analytics.earningsByDay.some((d) => d.totalEarningsPence > 0)) {
    const best = [...analytics.earningsByDay].sort((a, b) => b.avgEarningsPence - a.avgEarningsPence)[0];
    rows.push({
      key: "days",
      icon: "calendar-outline",
      title: "Best earning days",
      headline: best.day,
      card: <EarningsByDayCard patterns={analytics.earningsByDay} />,
    });
  }

  if (rows.length === 0) return null;

  return (
    <View>
      <View style={[styles.headRow, styles.sectionHead]}>
        <Text style={styles.heading} maxFontSizeMultiplier={fontScaleCap.heading} accessibilityRole="header">
          Go deeper
        </Text>
        <View style={shared.proBadge}>
          <Text style={shared.proBadgeText} maxFontSizeMultiplier={fontScaleCap.none}>
            PRO
          </Text>
        </View>
      </View>
      {rows.map((r) => {
        const expanded = open === r.key;
        return (
          <View key={r.key}>
            <TouchableOpacity
              style={[styles.row, expanded && styles.rowOpen]}
              onPress={() => setOpen(expanded ? null : r.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${r.title}, ${r.headline}`}
              accessibilityHint={expanded ? "Closes the details" : "Opens the details"}
            >
              <Ionicons name={r.icon} size={20} color={colors.text2} accessible={false} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} maxFontSizeMultiplier={fontScaleCap.heading}>
                  {r.title}
                </Text>
                <Text style={styles.rowHeadline} maxFontSizeMultiplier={fontScaleCap.body}>
                  {r.headline}
                </Text>
              </View>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.text2} accessible={false} />
            </TouchableOpacity>
            {expanded && <View style={styles.expanded}>{r.card}</View>}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionHead: { marginBottom: spacing.sm, marginTop: spacing.xs },
  heading: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  rowOpen: { borderColor: colors.hairline },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  rowHeadline: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2, marginTop: 2 },
  expanded: { marginBottom: spacing.xs },
  teaser: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  teaserText: { flex: 1 },
  teaserBody: { marginTop: 4, fontSize: 14, fontFamily: fonts.regular, color: colors.text2, lineHeight: 20 },
});
