// Tax tab: "Quarterly updates" entry card (SPEC 4.1, mockup tax-tab-entry.png).
// The words come from lib/tax/quarterlyCard.ts (tested). Everything opens the
// quarterly updates screen; drivers who don't need updates yet get one short
// line instead of a card.

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  MTD_HUB_ROUTE,
  type PillTone,
  type QuarterlyCardModel,
  type SegmentState,
} from "../../lib/tax/quarterlyCard";
import { MTD_EXPLAINER_ROUTE } from "../../lib/tax/mtdHelpCopy";
import { colors, fonts, fontScaleCap, fontSizes, heroCard, radii, spacing } from "../../lib/theme";
import { taxCard } from "./cardStyles";

const PILL: Record<PillTone, { bg: string; fg: string }> = {
  amber: { bg: colors.amberDim, fg: colors.amber },
  red: { bg: colors.redDim, fg: colors.red },
  green: { bg: colors.greenDim, fg: colors.green },
};

const SEGMENT: Record<SegmentState, string> = {
  sent: colors.green,
  due: colors.amber,
  later: "rgba(255,255,255,0.08)",
};

export function QuarterlyCard({ model }: { model: QuarterlyCardModel }) {
  const router = useRouter();
  if (model.kind === "hidden") return null;
  const open = () => router.push(MTD_HUB_ROUTE as never);

  if (model.kind === "line") {
    return (
      <TouchableOpacity
        style={styles.line}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${model.text} ${model.link}`}
        activeOpacity={0.7}
      >
        <Text style={styles.lineText} maxFontSizeMultiplier={fontScaleCap.body}>
          {model.text} <Text style={taxCard.link}>{model.link}</Text>
        </Text>
      </TouchableOpacity>
    );
  }

  const urgent = model.pill?.tone === "amber" && model.title === "Quarterly update due";
  const late = model.pill?.tone === "red";
  const label = [model.title, model.sub, model.pill?.text, model.progress, model.link].filter(Boolean).join(". ");
  // A driver who hasn't started yet gets a way to learn how it works first.
  const showHelp = model.pill == null;
  return (
    <View>
    <TouchableOpacity
      style={[styles.card, (urgent || late) && { borderColor: late ? "rgba(239,68,68,0.45)" : heroCard.border }]}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.8}
    >
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="cloud-upload-outline" size={22} color={colors.amber} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title} maxFontSizeMultiplier={fontScaleCap.heading}>{model.title}</Text>
          <Text style={styles.sub} maxFontSizeMultiplier={fontScaleCap.body}>{model.sub}</Text>
        </View>
        {model.pill && (
          <View style={[taxCard.pill, { backgroundColor: PILL[model.pill.tone].bg }]}>
            <Text style={[taxCard.pillText, { color: PILL[model.pill.tone].fg }]} maxFontSizeMultiplier={fontScaleCap.body}>
              {model.pill.text}
            </Text>
          </View>
        )}
      </View>

      {model.segments.length > 0 && (
        <View style={styles.segments}>
          {model.segments.map((s, i) => (
            <View key={i} style={[styles.segment, { backgroundColor: SEGMENT[s] }]} />
          ))}
        </View>
      )}

      <View style={styles.foot}>
        <Text style={styles.progress} maxFontSizeMultiplier={fontScaleCap.body}>{model.progress ?? ""}</Text>
        <View style={styles.linkRow}>
          <Text style={taxCard.link} maxFontSizeMultiplier={fontScaleCap.body}>{model.link}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.amber} />
        </View>
      </View>
    </TouchableOpacity>
    {showHelp && (
      <TouchableOpacity
        style={styles.helpLink}
        onPress={() => router.push(MTD_EXPLAINER_ROUTE as never)}
        accessibilityRole="link"
        accessibilityLabel="How quarterly updates work"
      >
        <Text style={taxCard.link} maxFontSizeMultiplier={fontScaleCap.body}>How quarterly updates work</Text>
      </TouchableOpacity>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: heroCard.radius,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1 },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.bodyLg, color: colors.text1 },
  sub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text2, marginTop: 2 },
  segments: { flexDirection: "row", gap: 6, marginTop: spacing.md },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 24,
  },
  progress: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.text2 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  helpLink: { minHeight: 44, justifyContent: "center", marginTop: -spacing.sm, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  line: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  lineText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text2 },
});
