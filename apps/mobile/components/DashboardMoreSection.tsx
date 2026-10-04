import { useState, type ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii, spacing } from "../lib/theme";

/**
 * "More" at the bottom of the Work and Personal dashboards (4 Oct 2026).
 *
 * The calmer home screen keeps one hero, the trip buttons and at most four
 * cards; every other section the driver hasn't switched on lives here,
 * collapsed. Nothing is deleted, and Customise brings any of it back up.
 *
 * `renderContent` only runs while open, so the cards inside (heatmaps,
 * benchmarks, community numbers) don't fetch anything until the driver
 * actually asks to see them.
 */
export function DashboardMoreSection({
  summary,
  renderContent,
}: {
  /** One plain line under the title, e.g. "Business Mileage, Shortcuts and 6 more". */
  summary: string;
  renderContent: () => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={s.wrap}>
      <TouchableOpacity
        style={s.header}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((v) => !v);
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`More. ${summary}`}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? "Hides these cards" : "Shows the rest of your dashboard cards"}
      >
        <Ionicons name="albums-outline" size={18} color={colors.amber} accessible={false} />
        <View style={s.headerText}>
          <Text style={s.title}>More</Text>
          {summary ? (
            <Text style={s.summary} numberOfLines={2}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.text2}
          accessible={false}
        />
      </TouchableOpacity>
      {open && <View style={s.content}>{renderContent()}</View>}
    </View>
  );
}

/** "A, B and 3 more" from the labels of the sections under More. */
export function moreSummary(labels: string[], show = 2): string {
  if (labels.length === 0) return "";
  if (labels.length <= show + 1) {
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  }
  return `${labels.slice(0, show).join(", ")} and ${labels.length - show} more`;
}

const s = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  summary: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
  content: {
    paddingTop: spacing.xs,
  },
});
