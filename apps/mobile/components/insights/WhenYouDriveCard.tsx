// "When you drive" (both modes, free): a 7 x 6 grid of days by four-hour
// blocks, and one plain line under it. Work mode reads the free heatmap
// endpoint (business trips); Personal mode counts every trip on the phone, in
// local time. Deliberately no "best paid hours" line: those are wrong for
// date-only earnings until the calculation fix lands.
//
// Usage:
//   <WhenYouDriveCard period="week" offset={0} mode="personal" isPro={isPro} />
// Always uses the last 12 weeks, whatever the period; hidden under 10 trips.

import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { cachedHeatmap } from "../../lib/insights/api";
import { useAsyncData } from "../../lib/insights/useAsyncData";
import { loadLocalPatternCells } from "../../lib/insights/localPatternCells";
import {
  buildDrivePattern,
  DAY_LETTERS,
  ROW_DAYS,
  BLOCK_COUNT,
  type PatternCell,
} from "../../lib/insights/drivePattern";
import { chart, colors, fonts, fontScaleCap, spacing } from "../../lib/theme";
import { InsightCard, CardSkeleton, CardError, type InsightCardProps } from "./work/InsightCardUi";

const BLOCK_HEADERS = ["12am", "4am", "8am", "12pm", "4pm", "8pm"];

async function loadCells(mode: "work" | "personal"): Promise<PatternCell[]> {
  if (mode === "personal") return loadLocalPatternCells(12, false);
  const res = await cachedHeatmap();
  return res.cells.map((c) => ({ dayOfWeek: c.dayOfWeek, hour: c.hour, tripCount: c.tripCount }));
}

export default function WhenYouDriveCard({ mode, refreshToken }: InsightCardProps) {
  const { data, loading, failed, reload } = useAsyncData(() => loadCells(mode), `when-${mode}`, refreshToken);
  const pattern = useMemo(() => (data ? buildDrivePattern(data) : null), [data]);

  if (loading && !data) return <CardSkeleton lines={4} />;
  if (failed && !data) return <CardError onRetry={reload} />;
  if (!pattern) return null;

  const now = new Date();
  const nowRow = (ROW_DAYS as readonly number[]).indexOf(now.getDay());
  const nowBlock = Math.floor(now.getHours() / 4);

  return (
    <InsightCard title="When you drive" meta="Last 12 weeks" accessibilityLabel={pattern.a11yLabel}>
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        {pattern.levels.map((levels, row) => (
          <View key={row} style={styles.gridRow}>
            <Text style={styles.dayLetter} maxFontSizeMultiplier={fontScaleCap.display}>
              {DAY_LETTERS[row]}
            </Text>
            {Array.from({ length: BLOCK_COUNT }, (_, block) => (
              <View
                key={block}
                style={[
                  styles.cell,
                  { backgroundColor: chart.heat[levels[block]] },
                  row === nowRow && block === nowBlock && styles.cellNow,
                ]}
              />
            ))}
          </View>
        ))}
        <View style={styles.gridRow}>
          <View style={styles.dayLetter} />
          {BLOCK_HEADERS.map((h) => (
            <Text key={h} style={styles.blockLabel} maxFontSizeMultiplier={fontScaleCap.display} numberOfLines={1}>
              {h}
            </Text>
          ))}
        </View>
        <View style={styles.legend}>
          <Text style={styles.legendText} maxFontSizeMultiplier={fontScaleCap.display}>
            Less
          </Text>
          {chart.heat.map((c) => (
            <View key={c} style={[styles.legendSwatch, { backgroundColor: c }]} />
          ))}
          <Text style={styles.legendText} maxFontSizeMultiplier={fontScaleCap.display}>
            More
          </Text>
        </View>
      </View>
      <Text style={styles.line} maxFontSizeMultiplier={fontScaleCap.body}>
        {pattern.line}
      </Text>
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  gridRow: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 4 },
  dayLetter: { width: 20, fontSize: 12, fontFamily: fonts.semibold, color: colors.text2 },
  cell: { flex: 1, height: 20, borderRadius: 4 },
  cellNow: { borderWidth: 1.5, borderColor: colors.text1 },
  blockLabel: { flex: 1, fontSize: 12, fontFamily: fonts.medium, color: colors.text3, textAlign: "left" },
  legend: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: spacing.xs },
  legendText: { fontSize: 12, fontFamily: fonts.medium, color: colors.text3 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  line: { marginTop: spacing.md, fontSize: 14, fontFamily: fonts.medium, color: colors.text1, lineHeight: 20 },
});
