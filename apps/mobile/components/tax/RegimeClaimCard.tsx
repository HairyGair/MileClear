// The mileage claim under the driver's country's rules, for drivers outside
// the UK (New Zealand first, 23 Oct 2026): "Your claim at IRD kilometre rates:
// $X this tax year", with each vehicle's tiers on tap. Renders nothing for UK
// drivers (they keep the HMRC hero and Tax year so far) and for countries with
// no rules yet. Used on Home (Work) and Insights (Work).
//
// Usage:
//   <RegimeClaimCard refreshToken={n} />

import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { regimeFor } from "@mileclear/shared";
import { fetchRegimeSummary } from "../../lib/api/tax";
import { useCountry } from "../../lib/country/country";
import { useAsyncData } from "../../lib/insights/useAsyncData";
import { regimeClaimView } from "../../lib/tax/regimeClaim";
import { colors, fonts, fontScaleCap, numberSizes, spacing } from "../../lib/theme";
import { InsightCard, CardSkeleton, CardError } from "../insights/work/InsightCardUi";

/** True when this country has its own claim rules here (not the UK, not none). */
export function hasRegimeClaim(country: string): boolean {
  const r = regimeFor(country);
  return !!r && r.id !== "uk-hmrc";
}

export default function RegimeClaimCard({ refreshToken }: { refreshToken?: number }) {
  const country = useCountry();
  const enabled = hasRegimeClaim(country);
  const { data, loading, failed, reload } = useAsyncData(
    () => fetchRegimeSummary().then((r) => r.data),
    `regime-summary-${country}`,
    refreshToken,
    enabled
  );
  const [open, setOpen] = useState(false);
  const view = useMemo(() => (data ? regimeClaimView(data) : null), [data]);

  if (!enabled) return null;
  if (loading && !data) return <CardSkeleton lines={2} />;
  if (failed && !data) return <CardError onRetry={reload} />;
  if (!data || !view) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityLabel={view.a11yLabel}
      accessibilityHint={open ? "Hides how it's worked out" : "Shows how it's worked out"}
      accessibilityState={{ expanded: open }}
    >
      <InsightCard title={view.title} meta={data.taxYear}>
        {view.amount ? (
          <Text style={styles.big} maxFontSizeMultiplier={fontScaleCap.display}>
            {view.amount}
          </Text>
        ) : null}
        <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>
          {view.subline}
        </Text>
        {view.ratesNote ? (
          <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
            {view.ratesNote}
          </Text>
        ) : null}

        {open ? (
          <View style={styles.breakdown}>
            {view.vehicles.map((v, i) => (
              <View key={`${v.name}-${i}`} style={i > 0 ? styles.vehicleGap : undefined}>
                <Text style={styles.vehicle} maxFontSizeMultiplier={fontScaleCap.body}>
                  {v.name}
                </Text>
                {v.lines.map((l, j) => (
                  <Text key={j} style={styles.line} maxFontSizeMultiplier={fontScaleCap.body}>
                    {l}
                  </Text>
                ))}
              </View>
            ))}
            {view.footnote ? (
              <Text style={styles.footnote} maxFontSizeMultiplier={fontScaleCap.body}>
                {view.footnote}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.linkRow}>
          <Text style={styles.link} maxFontSizeMultiplier={fontScaleCap.body}>
            {open ? "Hide how it's worked out" : "How it's worked out"}
          </Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.text2} accessible={false} />
        </View>
      </InsightCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: numberSizes.stat, fontFamily: fonts.bold, color: colors.text1 },
  body: { marginTop: spacing.sm, fontSize: 14, fontFamily: fonts.regular, color: colors.text1, lineHeight: 20 },
  note: { marginTop: spacing.xs, fontSize: 14, fontFamily: fonts.medium, color: colors.text2, lineHeight: 20 },
  breakdown: { marginTop: spacing.md },
  vehicleGap: { marginTop: spacing.md },
  vehicle: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1, lineHeight: 20 },
  line: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, lineHeight: 20 },
  footnote: { marginTop: spacing.md, fontSize: 13, fontFamily: fonts.regular, color: colors.text3, lineHeight: 18 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: spacing.md, minHeight: 28 },
  link: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
});
