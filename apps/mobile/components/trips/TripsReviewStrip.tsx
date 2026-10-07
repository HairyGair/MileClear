// The steady card at the top of the Trips list. Always rendered, always two
// rows, always the same height: row 1 says what needs sorting (trips to
// classify, journeys to check) and opens the Inbox; row 2 is "Missing a trip
// you made?". Because it never appears or disappears, the list below never
// jumps when a count changes.
import type React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Skeleton } from "../Skeleton";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

interface Props {
  /** Trips still to classify. */
  unclassifiedCount: number;
  /** Journeys to check, or null while unknown (not fetched yet, or the fetch failed). */
  missedCount: number | null;
  /** True until the first counts are in. */
  loading: boolean;
  offline: boolean;
  /** The Inbox view is already showing, so row 1 has nowhere to go. */
  inInbox: boolean;
  onOpenInbox: () => void;
  /** Row 2: the "Missing a trip you made?" trigger (MissingTripReporter variant="row"). */
  reporter: React.ReactNode;
}

export function TripsReviewStrip({
  unclassifiedCount: n,
  missedCount,
  loading,
  offline,
  inInbox,
  onOpenInbox,
  reporter,
}: Props) {
  const m = missedCount ?? 0;
  const journeys = `${m} journey${m === 1 ? "" : "s"} to check`;

  let icon: keyof typeof Ionicons.glyphMap = "checkmark-circle";
  let line1 = "All sorted";
  let line2 = "Every trip is classified";
  const needsAction = n > 0 || m > 0;
  if (n > 0) {
    icon = "file-tray";
    line1 = `${n} trip${n === 1 ? "" : "s"} to classify`;
    line2 = m > 0 ? journeys : "Sort them in one go";
  } else if (m > 0) {
    icon = "git-compare-outline";
    line1 = journeys;
    line2 = "Drives we might have missed";
  }
  if (offline) line2 = "Offline. Showing trips saved on this phone.";

  const tappable = needsAction && !inInbox;
  const accent = needsAction ? colors.amber : colors.green;

  const body = loading ? (
    <View style={styles.statusRow}>
      <View style={styles.skeletonWrap}>
        <Skeleton height={14} width="55%" radius={6} />
        <Skeleton height={12} width="40%" radius={6} style={{ marginTop: 8 }} />
      </View>
    </View>
  ) : (
    <View style={styles.statusRow}>
      <Ionicons name={icon} size={22} color={accent} accessible={false} />
      <View style={styles.statusText}>
        <Text
          style={[styles.line1, needsAction && styles.line1Action]}
          numberOfLines={2}
          maxFontSizeMultiplier={fontScaleCap.body}
        >
          {line1}
        </Text>
        <Text style={styles.line2} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.body}>
          {line2}
        </Text>
      </View>
      {tappable && <Ionicons name="chevron-forward" size={18} color={colors.text3} accessible={false} />}
    </View>
  );

  return (
    <View style={styles.card}>
      {tappable ? (
        <TouchableOpacity
          onPress={onOpenInbox}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${line1}. ${line2}`}
          accessibilityHint="Opens your Inbox"
        >
          {body}
        </TouchableOpacity>
      ) : (
        <View accessible={!loading} accessibilityLabel={loading ? undefined : `${line1}. ${line2}`}>
          {body}
        </View>
      )}
      <View style={styles.divider} />
      {reporter}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radii.md,
    marginBottom: 16,
    overflow: "hidden",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusText: { flex: 1 },
  skeletonWrap: { flex: 1 },
  line1: {
    color: colors.text1,
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  line1Action: { color: colors.amber },
  line2: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
});
