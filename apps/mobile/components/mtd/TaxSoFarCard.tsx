import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontSizes, numberSizes, shared, spacing } from "../../lib/theme";
import type { HmrcEnv } from "../../lib/tax/mtdCopy";
import type { HmrcObligation } from "../../lib/api/hmrc";
import { useMtdTaxSoFar } from "../../lib/tax/useMtdTaxSoFar";
import { figuresUpTo, taxSoFarView, TAX_SO_FAR_HEADING, SEE_HOW_WORKED_OUT } from "../../lib/tax/mtdTaxSoFar";
import { EstimateExplained } from "./EstimateExplained";
import { MtdSheet } from "./MtdSheet";

/**
 * "Your tax so far" on the hub: HMRC's newest in-year estimate for the tax
 * year, with HMRC's figure leading. Hidden until HMRC has worked one out.
 * "See how it's worked out" opens the same explanation the sent screen shows.
 */
export function TaxSoFarCard({
  userId,
  taxYear,
  env,
  enabled,
  refreshKey,
  fulfilled,
}: {
  userId: string | null;
  /** Null while the hub doesn't know the year yet. */
  taxYear: string | null;
  env: HmrcEnv;
  /** False when HMRC can't be asked (connection expired, not signed up). */
  enabled: boolean;
  refreshKey: number;
  /** Quarters HMRC has, to say which date the figures run to. Null when unknown. */
  fulfilled: HmrcObligation[] | null;
}) {
  const result = useMtdTaxSoFar(userId, taxYear, enabled, refreshKey);
  const [open, setOpen] = useState(false);
  // 460 on a tall phone; shorter when held sideways so the sheet still fits.
  const { height: winH } = useWindowDimensions();
  const explainMax = Math.min(460, Math.round(winH * 0.55));
  if (!result) return null;
  const view = taxSoFarView(result.summary, {
    env,
    upTo: figuresUpTo(fulfilled, result.calculationTimestamp),
    newestPending: result.newestPending,
  });
  if (!view) return null;

  return (
    <View>
      <Text style={styles.heading} accessibilityRole="header">{TAX_SO_FAR_HEADING.toUpperCase()}</Text>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <Text style={styles.big} accessibilityLabel={`${view.pill}: ${view.totalText}`}>
            {view.totalText}
          </Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{view.pill}</Text>
          </View>
        </View>
        <Text style={styles.body}>{view.sentence}</Text>
        {view.pendingLine && <Text style={styles.pending}>{view.pendingLine}</Text>}
        {view.canExplain && (
          <Text
            style={styles.link}
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={SEE_HOW_WORKED_OUT}
            suppressHighlighting
          >
            {SEE_HOW_WORKED_OUT} <Ionicons name="chevron-forward" size={13} color={colors.amber} />
          </Text>
        )}
      </View>

      <MtdSheet visible={open} title="How it's worked out" onClose={() => setOpen(false)}>
        <ScrollView style={{ maxHeight: explainMax }}>
          <EstimateExplained summary={result.summary} env={env} />
        </ScrollView>
      </MtdSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: 0.8,
    color: colors.text2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  card: { ...shared.card, paddingVertical: spacing.lg },
  topRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  big: {
    fontFamily: fonts.bold,
    fontSize: numberSizes.stat + 4,
    color: colors.text1,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  pill: { backgroundColor: "rgba(148,163,184,0.16)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text3 },
  body: { fontFamily: fonts.regular, fontSize: fontSizes.body, lineHeight: 21, color: colors.text2, marginTop: spacing.sm },
  pending: { fontFamily: fonts.regular, fontSize: fontSizes.caption + 1, lineHeight: 18, color: colors.text3, marginTop: spacing.sm },
  link: { fontFamily: fonts.semibold, fontSize: fontSizes.body, color: colors.amber, marginTop: spacing.md },
});
