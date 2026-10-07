// EmptyState — replaces ad-hoc "Nothing here yet" blocks across screens.
//
// Centred icon + title + description + optional CTA button. Single shared
// shape so every list/section in the app communicates "empty" the same way.
//
// Usage:
//   <EmptyState
//     icon="car-outline"
//     title="No trips yet"
//     description="Tap + in the top right to add a trip manually"
//     action={<Button title="Add trip" onPress={...} />}
//   />

import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii, spacing } from "../lib/theme";

interface EmptyStateProps {
  /** Ionicons name. Single icon centered above the title. */
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  /** Optional CTA button (or any node) below the description. */
  action?: React.ReactNode;
  /** Tint colour of the icon. Defaults to text2 (muted) — pass `colors.amber`
   *  for celebratory/positive empty states (e.g. "All caught up!"). */
  iconColor?: string;
  /** "screen" (default) fills a whole empty screen; "card" sits inside a Card
   *  when one section is empty. */
  size?: "screen" | "card";
}

export function EmptyState({ icon, title, description, action, iconColor = colors.text2, size = "screen" }: EmptyStateProps) {
  const card = size === "card";
  return (
    <View
      style={card ? styles.containerCard : styles.container}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.iconWrap, card && styles.iconWrapCard, { borderColor: iconColor + "30" }]}>
        <Ionicons name={icon} size={card ? 24 : 36} color={iconColor} accessible={false} />
      </View>
      <Text style={card ? styles.titleCard : styles.title} maxFontSizeMultiplier={1.4}>{title}</Text>
      <Text style={styles.description} maxFontSizeMultiplier={1.6}>{description}</Text>
      {action ? <View style={card ? styles.actionWrapCard : styles.actionWrap}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  containerCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconWrapCard: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bg,
    marginBottom: spacing.md,
  },
  titleCard: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text1,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  actionWrapCard: {
    marginTop: spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.semibold,
    color: colors.text1,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  actionWrap: {
    marginTop: spacing.lg,
  },
});

void radii; // imported for potential future use (square icon variant)
