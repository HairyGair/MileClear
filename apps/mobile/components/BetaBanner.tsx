import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../lib/theme";

interface BetaBannerProps {
  /** Label shown in the pill — short. E.g. "Beta", "Sandbox", "Coming soon". */
  label?: string;
  /** Headline above the body. E.g. "HMRC sandbox only". */
  title: string;
  /** Plain text explaining what's not fully wired and what the user
   *  can / can't do with the feature in its current state. */
  body: string;
  /** Visual variant. "beta" = amber (functional but limited),
   *  "soon" = grey (not yet usable). Defaults to "beta". */
  variant?: "beta" | "soon";
}

/**
 * Banner shown at the top of features that are functional but not fully
 * connected to production yet (sandbox-only) OR not yet wired at all.
 * Sets honest expectations so testers don't think they've found a bug
 * when their HMRC submission "doesn't reach HMRC" — that's the design,
 * because we're sandbox-mode until production accreditation lands.
 *
 * Two visual variants:
 *   - beta: amber, "functional but limited" tone
 *   - soon: grey, "not yet ready" tone
 */
export function BetaBanner({
  label,
  title,
  body,
  variant = "beta",
}: BetaBannerProps) {
  const styles = variant === "soon" ? soonStyles : betaStyles;
  const defaultLabel = variant === "soon" ? "Coming soon" : "Beta";
  return (
    <View style={styles.banner}>
      <View style={styles.header}>
        <Ionicons name={variant === "soon" ? "time-outline" : "flask-outline"} size={16} color={styles.icon.color} />
        <Text style={[styles.pill, { backgroundColor: styles.pillBg.color, color: styles.pillText.color }]}>
          {label ?? defaultLabel}
        </Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const betaStyles = StyleSheet.create({
  banner: {
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.amber,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  icon: { color: colors.amber },
  pill: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  pillBg: { color: "rgba(245, 166, 35, 0.22)" },
  pillText: { color: colors.amber },
  title: { flex: 1, color: colors.text1, fontSize: 13, fontFamily: fonts.semibold },
  body: { color: colors.text2, fontSize: 12, fontFamily: fonts.regular, lineHeight: 17 },
});

const soonStyles = StyleSheet.create({
  banner: {
    backgroundColor: "rgba(132, 148, 167, 0.08)",
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.text3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  icon: { color: colors.text3 },
  pill: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  pillBg: { color: "rgba(132, 148, 167, 0.22)" },
  pillText: { color: colors.text2 },
  title: { flex: 1, color: colors.text1, fontSize: 13, fontFamily: fonts.semibold },
  body: { color: colors.text2, fontSize: 12, fontFamily: fonts.regular, lineHeight: 17 },
});
