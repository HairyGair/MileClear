import { ReactNode } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { colors, spacing } from "../../lib/theme";

/**
 * Standard container for any /settings/* sub-screen. Background, padding,
 * and scroll behaviour all live here so individual screens stay focused
 * on their content.
 */
export function SettingsScreen({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>{children}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
});
