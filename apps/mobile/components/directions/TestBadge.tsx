// "Test" next to "Directions" on every entry point while every Pro driver
// tries it (Anthony, 18 Oct 2026).

import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

export function TestBadge() {
  return (
    <View style={s.badge} accessibilityLabel="Test">
      <Text style={s.text} maxFontSizeMultiplier={fontScaleCap.none}>
        Test
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.amberDim,
    borderWidth: 1,
    borderColor: colors.amberGlow,
  },
  text: { fontFamily: fonts.semibold, fontSize: 11, color: colors.amber, letterSpacing: 0.3 },
});
