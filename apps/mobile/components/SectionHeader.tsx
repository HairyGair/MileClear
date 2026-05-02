// SectionHeader — consistent title + optional right-action layout used across
// every screen for "Section name" + "See all >" pattern.
//
// Usage:
//   <SectionHeader title="Recent trips" />
//   <SectionHeader title="Trips" action={{ label: "See all", onPress: ... }} />

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, spacing } from "../lib/theme";

interface SectionHeaderProps {
  title: string;
  /** Optional right-side action ("See all", "Edit", etc). */
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
          style={styles.actionRow}
        >
          <Text style={styles.actionLabel}>{action.label}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.amber} accessible={false} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text1,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.amber,
  },
});
