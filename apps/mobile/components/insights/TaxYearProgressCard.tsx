// "Tax year so far" (Work). Business miles this tax year as a bar to 10,000
// with the claim built so far. The claim is the Tax tab's own figure
// (GET /business-insights/tax-snapshot, mileageDeductionPence), so the two
// screens agree. The tax year is always the current one; when the period is
// "Tax year" and the driver steps back to last year there is no source for
// it yet, so the card stays out of the way.
//
// Usage:
//   <TaxYearProgressCard period="week" offset={0} mode="work" isPro={isPro} />

import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { formatPence, resolveMileageRates } from "@mileclear/shared";
import { fetchGamificationStats } from "../../lib/api/gamification";
import { fetchTaxSnapshot } from "../../lib/api/businessInsights";
import { fetchVehicles } from "../../lib/api/vehicles";
import { useUser } from "../../lib/user/context";
import { useAsyncData } from "../../lib/insights/useAsyncData";
import {
  computeTaxYearProgress,
  boundaryLine,
  progressA11yLabel,
  type ClaimVehicleType,
} from "../../lib/insights/taxYearProgress";
import { chart, colors, fonts, fontScaleCap, numberSizes, spacing } from "../../lib/theme";
import { InsightCard, CardSkeleton, CardError, type InsightCardProps } from "./work/InsightCardUi";

interface Loaded {
  taxYear: string;
  businessMiles: number;
  claimPence: number | null;
  vehicleType: ClaimVehicleType | null;
}

async function loadTaxYear(): Promise<Loaded> {
  const [stats, snap, vehicles] = await Promise.all([
    fetchGamificationStats(),
    fetchTaxSnapshot().catch(() => null),
    fetchVehicles().catch(() => null),
  ]);
  const list = vehicles?.data ?? [];
  const primary = list.find((v) => v.isPrimary) ?? list[0] ?? null;
  return {
    taxYear: stats.data.taxYear,
    businessMiles: stats.data.businessMiles,
    claimPence: snap ? snap.data.ytd.mileageDeductionPence : null,
    vehicleType: primary?.vehicleType ?? null,
  };
}

export default function TaxYearProgressCard({ period, offset, mode, refreshToken }: InsightCardProps) {
  const router = useRouter();
  const { user } = useUser();
  const hidden = mode === "personal" || (period === "tax_year" && offset < 0);
  const { data, loading, failed, reload } = useAsyncData(loadTaxYear, "tax-year-progress", refreshToken, !hidden);

  const progress = useMemo(() => {
    if (!data) return null;
    const employerRate = user ? (resolveMileageRates(user).customRateFirst10kPence ?? null) : null;
    return computeTaxYearProgress({
      businessMiles: data.businessMiles,
      taxYear: data.taxYear,
      vehicleType: data.vehicleType,
      employerRatePence: employerRate,
    });
  }, [data, user]);

  if (hidden) return null;
  if (loading && !data) return <CardSkeleton lines={3} />;
  if (failed && !data) return <CardError onRetry={reload} />;
  if (!data || !progress) return null;

  const claimText = data.claimPence != null && data.claimPence > 0 ? formatPence(data.claimPence) : null;
  const boundary = boundaryLine(progress);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push("/(tabs)/tax" as never)}
      accessibilityRole="button"
      accessibilityLabel={progressA11yLabel(progress, claimText)}
      accessibilityHint="Opens the Tax tab"
    >
      <InsightCard title="Tax year so far" meta={progress.taxYear}>
        <View style={styles.headRow}>
          <Text style={styles.big} maxFontSizeMultiplier={fontScaleCap.display}>
            {Math.round(progress.miles).toLocaleString("en-GB")}
          </Text>
          <Text style={styles.unit} maxFontSizeMultiplier={fontScaleCap.display}>
            business miles
          </Text>
        </View>

        {progress.showBar && (
          <View style={styles.trackWrap} accessible={false} importantForAccessibility="no-hide-descendants">
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(2, Math.round(progress.fraction * 100))}%` }]} />
            </View>
            <View style={styles.scale}>
              <Text style={styles.scaleText} maxFontSizeMultiplier={fontScaleCap.none}>
                0
              </Text>
              <Text style={styles.scaleText} maxFontSizeMultiplier={fontScaleCap.none}>
                10,000
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.body} maxFontSizeMultiplier={fontScaleCap.body}>
          {claimText ? `${claimText} claim so far, since 6 April.` : "Since 6 April."}
        </Text>
        {boundary && (
          <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
            {boundary}
          </Text>
        )}

        <View style={styles.linkRow}>
          <Text style={styles.link} maxFontSizeMultiplier={fontScaleCap.body}>
            See your tax
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.text2} accessible={false} />
        </View>
      </InsightCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: spacing.sm },
  big: { fontSize: numberSizes.stat, fontFamily: fonts.bold, color: colors.text1 },
  unit: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
  trackWrap: { marginTop: spacing.md },
  track: { height: 8, borderRadius: 4, backgroundColor: chart.track, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: chart.current },
  scale: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  scaleText: { fontSize: 12, fontFamily: fonts.medium, color: colors.text3 },
  body: { marginTop: spacing.md, fontSize: 14, fontFamily: fonts.regular, color: colors.text1, lineHeight: 20 },
  note: { marginTop: spacing.xs, fontSize: 14, fontFamily: fonts.medium, color: colors.text2, lineHeight: 20 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: spacing.md, minHeight: 28 },
  link: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text2 },
});
