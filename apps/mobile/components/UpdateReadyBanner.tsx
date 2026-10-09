// Small banner above the tab bar once a new version has downloaded
// (lib/updates/updateReady.ts). Restart is the one action; the cross hides it
// until the app next comes back to the screen.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, fontScaleCap, tabBar } from "../lib/theme";
import { useUpdateReady } from "../lib/updates/updateReady";

export function UpdateReadyBanner() {
  const { visible, restart, later } = useUpdateReady();
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <View
      style={[styles.wrap, { bottom: tabBar.contentHeight + insets.bottom + 8 }]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="sparkles-outline" size={18} color={colors.amber} accessible={false} />
      <Text style={styles.text} maxFontSizeMultiplier={fontScaleCap.body} numberOfLines={2}>
        A new version of MileClear is ready
      </Text>
      <Pressable
        onPress={restart}
        accessibilityRole="button"
        accessibilityLabel="Restart MileClear to use the new version"
        hitSlop={8}
        style={styles.restart}
      >
        <Text style={styles.restartText} maxFontSizeMultiplier={fontScaleCap.body}>
          Restart
        </Text>
      </Pressable>
      <Pressable
        onPress={later}
        accessibilityRole="button"
        accessibilityLabel="Not now"
        hitSlop={10}
        style={styles.close}
      >
        <Ionicons name="close" size={18} color={colors.text2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: { flex: 1, color: colors.text1, fontFamily: fonts.medium, fontSize: 14 },
  restart: {
    backgroundColor: colors.amber,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  restartText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 14 },
  close: { padding: 6, minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },
});
