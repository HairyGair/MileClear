// Small status chips for practice screens. Words always carry the meaning;
// colour only backs them up.

import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

type Tone = "neutral" | "green" | "outline" | "amber";

export function PracticeChip({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const color =
    tone === "green" ? colors.green : tone === "amber" ? colors.amber : colors.text2;
  return (
    <View
      style={[
        s.chip,
        tone === "green" && { backgroundColor: colors.greenDim },
        tone === "amber" && { backgroundColor: colors.amberDim },
        tone === "neutral" && { backgroundColor: "rgba(255,255,255,0.06)" },
        tone === "outline" && s.outline,
      ]}
    >
      {icon ? <Ionicons name={icon} size={12} color={color} accessible={false} /> : null}
      <Text style={[s.text, { color }]} maxFontSizeMultiplier={fontScaleCap.none}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  outline: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.text2 },
  text: { fontSize: 12, fontFamily: fonts.semibold },
});
