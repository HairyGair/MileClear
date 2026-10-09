// "Drivers near you" (both modes, free) restyled for Insights: two bars on the
// same scale, You and Typical, no winner colouring (more miles is not better).
// Same data as LocalBenchmarkCard (GET /business-insights/benchmarks/local,
// groups of fewer than 5 drivers are never returned), so the privacy floor is
// the server's. Renders nothing when there is no group to compare with or the
// driver has not driven enough to have a figure.
//
// Usage:
//   <DriversNearYouCard period="week" offset={0} mode="work" isPro={isPro} />

import { View, Text, StyleSheet } from "react-native";
import type { LocalBenchmark } from "@mileclear/shared";
import { cachedLocalBenchmark } from "../../lib/insights/api";
import { useAsyncData } from "../../lib/insights/useAsyncData";
import { chart, colors, fonts, fontScaleCap, spacing } from "../../lib/theme";
import { InsightCard, CardSkeleton, CardError, type InsightCardProps } from "./work/InsightCardUi";

function withCommas(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function groupLabel(d: LocalBenchmark): string {
  if (d.level === "area" && d.scopeLabel) return `Typical in ${d.scopeLabel}`;
  if (d.level === "region" && d.scopeLabel) return `Typical in ${d.scopeLabel}`;
  return "Typical in the UK";
}

export default function DriversNearYouCard({ mode, refreshToken }: InsightCardProps) {
  const { data, loading, failed, reload } = useAsyncData(
    () => cachedLocalBenchmark(mode),
    `near-${mode}`,
    refreshToken
  );

  if (loading && !data) return <CardSkeleton lines={3} />;
  if (failed && !data) return <CardError onRetry={reload} />;
  if (!data || !data.available) return null;
  const miles = data.weeklyMiles;
  if (!miles || miles.you == null || miles.you <= 0 || miles.median <= 0) return null;

  const scale = Math.max(miles.you, miles.median);
  const youPct = Math.max(3, Math.round((miles.you / scale) * 100));
  const typPct = Math.max(3, Math.round((miles.median / scale) * 100));
  const unit = mode === "work" ? "business miles a week" : "miles a week";
  const typicalLabel = groupLabel(data);
  const ahead = miles.youAheadOfPerTen;
  const rank =
    ahead == null
      ? null
      : ahead === 0
        ? "Fewer miles than most drivers here"
        : `Busier than ${ahead} in 10 drivers`;

  const a11y =
    `Drivers near you. You: ${withCommas(miles.you)} ${unit}. ${typicalLabel}: ${withCommas(miles.median)} ${unit}.` +
    (rank ? ` ${rank}.` : "");

  return (
    <InsightCard title="Drivers near you" meta="Last 4 weeks" accessibilityLabel={a11y}>
      <Bar label="You" value={`${withCommas(miles.you)} mi`} pct={youPct} color={chart.current} />
      <Bar label={typicalLabel} value={`${withCommas(miles.median)} mi`} pct={typPct} color={chart.comparison} />
      <Text style={styles.caption} maxFontSizeMultiplier={fontScaleCap.body}>
        {mode === "work" ? "Business miles" : "Miles"} a week.{rank ? ` ${rank}.` : ""}
      </Text>
      <Text style={styles.footnote} maxFontSizeMultiplier={fontScaleCap.body}>
        Based on {data.peerCount ?? "at least 5"} drivers. Nobody sees your trips.
      </Text>
    </InsightCard>
  );
}

function Bar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <View style={styles.barBlock}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.heading}>
          {label}
        </Text>
        <Text style={styles.barValue} maxFontSizeMultiplier={fontScaleCap.display}>
          {value}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barBlock: { marginBottom: spacing.md },
  barHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.sm, marginBottom: 6 },
  barLabel: { flexShrink: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  barValue: { fontSize: 14, fontFamily: fonts.bold, color: colors.text1 },
  track: { height: 12, borderRadius: 6, backgroundColor: chart.track, overflow: "hidden" },
  fill: { height: 12, borderRadius: 6 },
  caption: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2, lineHeight: 20 },
  footnote: { marginTop: spacing.xs, fontSize: 12, fontFamily: fonts.regular, color: colors.text3, lineHeight: 17 },
});
