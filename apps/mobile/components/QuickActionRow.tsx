// QuickActionRow: the row of small icon shortcuts under Start Trip on both
// home screens (Work and Personal). Amber icons in both modes: amber is the
// one action colour, green only ever means live or done.
//
// Usage:
//   <QuickActionRow actions={[{ key: "shifts", icon: "time-outline", label: "Shifts", a11yLabel: "View shifts", onPress }]} />

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap } from "../lib/theme";

export interface QuickAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  a11yLabel: string;
  onPress: () => void;
}

export function QuickActionRow({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={styles.row}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.key}
          style={styles.item}
          onPress={a.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={a.a11yLabel}
        >
          <Ionicons name={a.icon} size={20} color={colors.amber} accessible={false} />
          <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.heading} numberOfLines={1}>
            {a.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  item: {
    flex: 1,
    minHeight: 56,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.text2,
    letterSpacing: 0.2,
  },
});
