// The practice's mark wherever a practice is named to a driver
// (SPEC-VISUAL 4.14). Its logo once an admin has checked it, otherwise an
// initials tile. Never amber, so it cannot pass for a button or for
// MileClear's own mark.

import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, fonts, fontScaleCap } from "../../lib/theme";
import { practiceLogoUri, type PracticeForDriver } from "../../lib/api/practice";

export function PracticeMark({
  practice,
  size = 52,
}: {
  practice: Pick<PracticeForDriver, "initials" | "logoPath" | "name">;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const radius = size >= 52 ? 14 : size >= 48 ? 12 : 8;
  const uri = practiceLogoUri(practice.logoPath);
  const box = { width: size, height: size, borderRadius: radius };

  if (uri && !failed) {
    return (
      <View style={[s.tile, box, s.logoTile]} accessibilityLabel={`${practice.name} logo`} accessible>
        <Image
          source={{ uri }}
          style={{ width: size - 8, height: size - 8 }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }
  return (
    <View style={[s.tile, box]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text
        style={[s.initials, { fontSize: Math.round(size * (practice.initials.length > 2 ? 0.3 : 0.36)) }]}
        maxFontSizeMultiplier={fontScaleCap.none}
      >
        {practice.initials}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    backgroundColor: colors.practiceMark,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoTile: { backgroundColor: "#ffffff" },
  initials: { fontFamily: fonts.bold, color: colors.text1 },
});
