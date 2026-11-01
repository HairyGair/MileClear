import { View, Text, StyleSheet } from "react-native";
import { chart, colors, fonts, heroCard, numberSizes } from "../../lib/theme";
import { explainEstimate, taxFreeShare } from "../../lib/tax/mtdEstimate";
import { estimateDisclaimer, estimateEyebrow, estimateSourcePill, type HmrcEnv } from "../../lib/tax/mtdCopy";
import type { HmrcCalculationSummary } from "../../lib/api/hmrc";

function gbp(v: number): string {
  return `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * HMRC's estimate for the year, led by HMRC's figure and explained line by
 * line from what HMRC returned. We never show our own estimate here.
 *
 * Usage: <EstimateExplained summary={calc} env={env} />
 */
export function EstimateExplained({ summary, env }: { summary: HmrcCalculationSummary; env: HmrcEnv }) {
  const e = explainEstimate(summary);
  const share = taxFreeShare(e);

  return (
    <View style={styles.hero}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>{estimateEyebrow(summary.taxYear, env)}</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{estimateSourcePill(env)}</Text>
        </View>
      </View>

      <Text style={styles.big} accessibilityLabel={e.total === undefined ? "No figure yet" : `${gbp(e.total)} tax and National Insurance so far`}>
        {e.total === undefined ? "Not set" : gbp(e.total)}
      </Text>
      <Text style={styles.body}>{estimateDisclaimer(env)}</Text>

      {share !== null && e.taxFree !== undefined && e.taxed !== undefined && (
        <View style={{ marginTop: 14 }}>
          <View style={styles.bar} accessibilityRole="image" accessibilityLabel={`${gbp(e.taxFree)} tax-free, ${gbp(e.taxed)} taxed`}>
            <View style={[styles.barFree, { flex: Math.max(share, 0.001) }]} />
            <View style={[styles.barTaxed, { flex: Math.max(1 - share, 0.001) }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barFreeText}>{gbp(e.taxFree)} tax-free</Text>
            <Text style={styles.barTaxedText}>{gbp(e.taxed)} taxed</Text>
          </View>
        </View>
      )}

      {e.lines.length > 0 && (
        <View style={{ marginTop: 6 }}>
          {e.lines.map((l, i) => (
            <View key={`${l.label}-${i}`} style={[styles.line, i > 0 && styles.lineBorder]}>
              <View style={[styles.dot, l.kind === "free" ? styles.dotFree : styles.dotTaxed]} />
              <Text style={styles.lineLabel}>{l.label}</Text>
              <Text style={styles.lineValue}>{gbp(l.amount)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: heroCard.tint,
    borderWidth: 1,
    borderColor: heroCard.border,
    borderRadius: heroCard.radius,
    padding: 18,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: colors.text2, flexShrink: 1 },
  pill: { backgroundColor: "rgba(148,163,184,0.16)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text3 },
  big: {
    fontFamily: fonts.bold,
    fontSize: numberSizes.hero,
    color: colors.text1,
    marginTop: 8,
    fontVariant: ["tabular-nums"],
  },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text2, marginTop: 6 },
  bar: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: chart.track },
  barFree: { backgroundColor: "#334155" },
  barTaxed: { backgroundColor: colors.amber },
  barLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, gap: 8 },
  barFreeText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text3 },
  barTaxedText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.amber },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12 },
  lineBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  dot: { width: 10, height: 10, borderRadius: 3, marginTop: 5 },
  dotFree: { backgroundColor: "#334155" },
  dotTaxed: { backgroundColor: colors.amber },
  lineLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text2 },
  lineValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.text1, fontVariant: ["tabular-nums"] },
});
