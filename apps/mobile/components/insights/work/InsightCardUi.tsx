// Shared pieces for the Insights work cards: the standard card tier from
// SPEC-VISUAL 4, a loading skeleton, a one-card error line and the shared
// props every card takes.

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Skeleton } from "../../Skeleton";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../../lib/theme";

export interface InsightCardProps {
  period: "week" | "month" | "tax_year";
  /** 0 = current period, -1 = previous. */
  offset: number;
  mode: "work" | "personal";
  isPro: boolean;
  /** Optional: bump to reload (pull to refresh). */
  refreshToken?: number;
}

export function InsightCard({
  title,
  meta,
  children,
  accessibilityLabel,
}: {
  title?: string;
  meta?: string;
  children: React.ReactNode;
  /** When set the whole card reads as one element. */
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={styles.card}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
    >
      {title ? (
        <View style={styles.titleRow}>
          <Text style={styles.title} maxFontSizeMultiplier={fontScaleCap.heading} accessibilityRole="header">
            {title}
          </Text>
          {meta ? (
            <Text style={styles.meta} maxFontSizeMultiplier={fontScaleCap.display}>
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.card} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Skeleton width="45%" height={16} />
      <View style={{ height: spacing.md }} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "70%" : "100%"} height={14} style={{ marginBottom: spacing.sm }} />
      ))}
    </View>
  );
}

export function CardError({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.errorText} maxFontSizeMultiplier={fontScaleCap.body}>
        Couldn&apos;t load this. Pull down to try again.
      </Text>
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          style={styles.retry}
          accessibilityRole="button"
          accessibilityLabel="Try loading this card again"
        >
          <Text style={styles.retryText} maxFontSizeMultiplier={fontScaleCap.body}>
            Try again
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export const insightCardStyles = {
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
} as const;

const styles = StyleSheet.create({
  card: insightCardStyles.card,
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { flexShrink: 1, fontSize: 16, fontFamily: fonts.bold, color: colors.text1 },
  meta: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2 },
  errorText: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, lineHeight: 20 },
  retry: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  retryText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
});
