import { StyleSheet } from "react-native";
import { colors, fonts, fontSizes, heroCard, numberSizes, radii, shared, spacing } from "../../lib/theme";

/** Shared look for the Tax tab cards (SPEC 9). `hero` leads the page, `plain` sits second. */
export const taxCard = StyleSheet.create({
  hero: {
    backgroundColor: heroCard.tint,
    borderWidth: 1,
    borderColor: heroCard.border,
    borderRadius: heroCard.radius,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  plain: {
    ...shared.card,
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.text2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  headline: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.title,
    color: colors.text1,
    marginTop: spacing.sm,
  },
  figure: {
    fontFamily: fonts.bold,
    fontSize: numberSizes.stat,
    color: colors.text1,
    marginTop: spacing.xs,
    fontVariant: ["tabular-nums"],
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
    lineHeight: 20,
    color: colors.text2,
    marginTop: spacing.sm,
  },
  muted: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text2,
    marginTop: spacing.sm,
  },
  link: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.body,
    color: colors.amber,
  },
  linkRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  kvLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
    color: colors.text2,
    flexShrink: 1,
  },
  kvValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.bodyLg,
    color: colors.text1,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
});
