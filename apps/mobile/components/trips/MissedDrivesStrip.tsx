// The one-line strip at the top of Trips when we may have missed drives:
// Home's warning look (soft amber, an icon, the words, "Check" on the right).
// It opens To sort. Nothing is drawn when there is nothing to check, so the
// list starts straight away (PROPOSALS 6.1, T-B5).

import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

interface Props {
  /** Drives to check, or null while not known (then nothing shows). */
  count: number | null;
  onPress: () => void;
}

export function missedDrivesText(count: number): string {
  return count === 1 ? "We may have missed a drive" : `We may have missed ${count} drives`;
}

export function MissedDrivesStrip({ count, onPress }: Props) {
  if (!count || count <= 0) return null;
  const text = missedDrivesText(count);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`${text}. Check`}
      accessibilityHint="Opens To sort"
    >
      <Ionicons name="git-compare-outline" size={18} color={colors.amber} accessible={false} />
      <View style={s.textWrap}>
        <Text style={s.title} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.body}>
          {text}
        </Text>
      </View>
      <Text style={s.action} maxFontSizeMultiplier={fontScaleCap.body}>
        Check
      </Text>
      <Ionicons name="chevron-forward" size={14} color={colors.text3} accessible={false} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.amberDim,
    marginBottom: 12,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  action: { fontSize: 14, fontFamily: fonts.bold, color: colors.amber },
});
