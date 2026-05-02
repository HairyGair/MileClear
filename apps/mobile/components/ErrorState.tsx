// ErrorState — replaces the "red banner with cryptic message" pattern.
//
// What happened (plain English) + what to do + retry button. Same shape
// as EmptyState so the UI language stays consistent.
//
// Usage:
//   <ErrorState
//     title="Couldn't load your trips"
//     description="Check your connection and try again."
//     onRetry={() => loadTrips()}
//   />

import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, spacing } from "../lib/theme";

interface ErrorStateProps {
  title: string;
  description: string;
  /** If provided, shows a retry button. Without it the state is purely informational. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Override the default cloud-offline icon when context fits better. */
  icon?: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Try again",
  icon = "cloud-offline-outline",
}: ErrorStateProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={colors.red} accessible={false} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {onRetry ? (
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={onRetry}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.amber} />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.redDim,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 17,
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
    maxWidth: 320,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.amberDim,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.25)",
  },
  retryText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.amber,
  },
});
