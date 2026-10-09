// "Last shift" (Work, gig drivers): the latest completed shift from
// GET /gamification/scorecard (free). The scorecard carries duration, trips,
// miles and the mileage claim but no A to F grade (grades only exist in the
// Pro Business insights response), so this card shows those figures and no
// grade letter. A driver who has never finished a shift sees nothing.
//
// Usage:
//   <LastShiftCard period="week" offset={0} mode="work" isPro={isPro} />

import { View, Text, StyleSheet } from "react-native";
import { formatPence } from "@mileclear/shared";
import { useUser } from "../../lib/user/context";
import { cachedScorecard } from "../../lib/insights/api";
import { useAsyncData } from "../../lib/insights/useAsyncData";
import { shiftSummary } from "../../lib/insights/lastShift";
import { colors, fonts, fontScaleCap, spacing } from "../../lib/theme";
import { InsightCard, CardSkeleton, type InsightCardProps } from "./work/InsightCardUi";

export default function LastShiftCard({ mode, refreshToken }: InsightCardProps) {
  const { user, isCompanyDriver } = useUser();
  const workType = user?.workType ?? "gig";
  const isGig = (workType === "gig" || workType === "both") && !isCompanyDriver;
  const hidden = mode !== "work" || !isGig;
  const { data, loading } = useAsyncData(cachedScorecard, "last-shift", refreshToken, !hidden);

  if (hidden) return null;
  if (loading && !data) return <CardSkeleton lines={2} />;
  // No finished shift (the endpoint says so with an error) or offline: say nothing.
  if (!data) return null;
  const s = shiftSummary(data);
  if (!s) return null;

  return (
    <InsightCard title="Last shift" meta={s.dateLabel} accessibilityLabel={s.spoken(formatPence)}>
      <View style={styles.row}>
        {s.figures(formatPence).map((f) => (
          <View key={f.label} style={styles.fig}>
            <Text style={styles.value} maxFontSizeMultiplier={fontScaleCap.display}>
              {f.value}
            </Text>
            <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.display}>
              {f.label}
            </Text>
          </View>
        ))}
      </View>
      {s.badge && (
        <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
          {s.badge}
        </Text>
      )}
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  fig: { flex: 1 },
  value: { fontSize: 20, fontFamily: fonts.bold, color: colors.text1 },
  label: { fontSize: 12, fontFamily: fonts.medium, color: colors.text2, marginTop: 2 },
  note: { marginTop: spacing.md, fontSize: 14, fontFamily: fonts.medium, color: colors.text2 },
});
