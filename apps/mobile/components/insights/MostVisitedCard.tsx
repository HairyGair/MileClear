// "Places you go most" (Personal, free): the top destinations from the
// driving patterns, moved here from the old Driving Patterns card on Home.
// Renders nothing until there are at least two places to rank.
//
// Usage:
//   <MostVisitedCard places={stats?.drivingPatterns?.topPlaces} />

import { View, Text, StyleSheet } from "react-native";
import { placeLabel, placesToShow, type VisitedPlace } from "../../lib/insights/mostVisited";
import { colors, fonts, fontScaleCap, spacing } from "../../lib/theme";
import { InsightCard } from "./work/InsightCardUi";

export default function MostVisitedCard({ places }: { places: readonly VisitedPlace[] | null | undefined }) {
  const rows = placesToShow(places);
  if (rows.length < 2) return null;
  return (
    <InsightCard
      title="Places you go most"
      accessibilityLabel={`Places you go most. ${rows.map((r, i) => `${i + 1}, ${placeLabel(r)}`).join(". ")}`}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        {rows.map((r, i) => (
          <View key={`${r.name}-${i}`} style={styles.row}>
            <Text style={styles.rank} maxFontSizeMultiplier={fontScaleCap.body}>
              {i + 1}
            </Text>
            <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
              {r.name}
            </Text>
            <Text style={styles.count} maxFontSizeMultiplier={fontScaleCap.body}>
              {r.count} {r.count === 1 ? "visit" : "visits"}
            </Text>
          </View>
        ))}
      </View>
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 36 },
  rank: { width: 20, fontSize: 14, fontFamily: fonts.semibold, color: colors.text3 },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: colors.text1 },
  count: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2 },
});
