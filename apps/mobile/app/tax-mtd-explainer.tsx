// "How quarterly updates work": five short cards, one at a time (SPEC 4.7,
// mockup explainer.png). Back / Next at the bottom, dots above the words, Skip
// at the top. Words live in lib/tax/mtdHelpCopy.ts.

import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "../components/Button";
import {
  DEADLINE_DATES,
  EXPLAINER_CARDS,
  type ExplainerArt,
} from "../lib/tax/mtdHelpCopy";
import { colors, fonts, fontScaleCap, radii, spacing } from "../lib/theme";

const BARS = [
  { label: "Update 1", month: "Jul", pct: 0.25 },
  { label: "Update 2", month: "Oct", pct: 0.5 },
  { label: "Update 3", month: "Jan", pct: 0.75 },
  { label: "Update 4", month: "Apr", pct: 1 },
];

function Art({ art }: { art: ExplainerArt }) {
  if (art === "running") {
    return (
      <View style={styles.art} accessible accessibilityLabel="Four bars, each starting on 6 April and getting longer">
        <View style={styles.barHeader}>
          <Text style={styles.barHeaderText}>6 April</Text>
          <Text style={styles.barHeaderText}>5 April</Text>
        </View>
        {BARS.map((b, i) => (
          <View key={b.label} style={styles.barRow}>
            <Text style={styles.barLabel}>{b.label}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${b.pct * 100}%`, opacity: i === 1 ? 1 : 0.4 },
                ]}
              >
                <Text style={[styles.barMonth, i === 1 && { color: colors.bg }]}>{b.month}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  }
  if (art === "dates") {
    return (
      <View style={styles.art} accessible accessibilityLabel={`Deadlines: ${DEADLINE_DATES.join(", ")}`}>
        <View style={styles.dateGrid}>
          {DEADLINE_DATES.map((d) => {
            const [day, month] = d.split(" ");
            return (
              <View key={d} style={styles.dateChip}>
                <Text style={styles.dateDay}>{day}</Text>
                <Text style={styles.dateMonth}>{month}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }
  const icon: Record<"rhythm" | "free" | "sends", keyof typeof Ionicons.glyphMap> = {
    rhythm: "calendar-outline",
    free: "pricetag-outline",
    sends: "cloud-upload-outline",
  };
  return (
    <View style={[styles.art, styles.artCentre]} accessible={false}>
      <View style={styles.bigIcon}>
        <Ionicons name={icon[art]} size={56} color={colors.amber} />
      </View>
    </View>
  );
}

export default function TaxMtdExplainerScreen() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const card = EXPLAINER_CARDS[i];
  const last = i === EXPLAINER_CARDS.length - 1;
  const close = () => router.back();

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.step} accessibilityLiveRegion="polite">{`${i + 1} of ${EXPLAINER_CARDS.length}`}</Text>
        {!last && (
          <TouchableOpacity
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Skip"
            style={styles.skip}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Art art={card.art} />

        <View style={styles.dots} accessible={false}>
          {EXPLAINER_CARDS.map((c, n) => (
            <View key={c.title} style={[styles.dot, n === i && styles.dotOn]} />
          ))}
        </View>

        <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.display}>
          {card.title}
        </Text>
        <Text style={styles.text} maxFontSizeMultiplier={fontScaleCap.body}>{card.body}</Text>

        {card.tip && (
          <View style={styles.tip}>
            <Ionicons name="sparkles-outline" size={18} color={colors.amber} style={{ marginTop: 2 }} accessible={false} />
            <Text style={styles.tipText} maxFontSizeMultiplier={fontScaleCap.body}>
              <Text style={styles.tipLead}>{`${card.tip.lead} `}</Text>
              {card.tip.text}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {i > 0 && (
          <Button title="Back" variant="secondary" onPress={() => setI(i - 1)} style={{ flex: 1 }} />
        )}
        <Button
          title={last ? "Got it" : "Next"}
          variant="primary"
          onPress={last ? close : () => setI(i + 1)}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: spacing.md,
    minHeight: 44,
  },
  step: { fontFamily: fonts.medium, fontSize: 14, color: colors.text2 },
  skip: { minHeight: 44, justifyContent: "center" },
  skipText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text2 },
  body: { paddingHorizontal: 20, paddingBottom: spacing.xl },
  art: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 24,
    padding: spacing.xl,
    marginTop: spacing.sm,
    minHeight: 200,
    justifyContent: "center",
  },
  artCentre: { alignItems: "center" },
  bigIcon: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
  },
  barHeader: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 72, marginBottom: spacing.sm },
  barHeaderText: { fontFamily: fonts.regular, fontSize: 12, color: colors.text2 },
  barRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  barLabel: { width: 64, fontFamily: fonts.medium, fontSize: 12, color: colors.text2 },
  barTrack: { flex: 1, height: 26, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)" },
  barFill: {
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.amber,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 8,
  },
  barMonth: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text1 },
  dateGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "center" },
  dateChip: {
    width: "44%",
    alignItems: "center",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.amberDim,
  },
  dateDay: { fontFamily: fonts.bold, fontSize: 32, color: colors.amber },
  dateMonth: { fontFamily: fonts.medium, fontSize: 14, color: colors.text2 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginVertical: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)" },
  dotOn: { width: 24, backgroundColor: colors.amber },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, color: colors.text1 },
  text: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: colors.text2, marginTop: spacing.md },
  tip: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  tipText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text2 },
  tipLead: { fontFamily: fonts.semibold, color: colors.text1 },
  footer: { flexDirection: "row", gap: spacing.md, paddingHorizontal: 20, paddingBottom: 28, paddingTop: spacing.sm },
});
