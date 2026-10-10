// The one ask at the bottom of Home (SPEC-VISUAL 5.7): a slim dismissible row
// on the screen background, quieter than the door rows on purpose. Icon, a
// title, one line, and an X. The Pro ask puts the word Pro in amber.

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

export interface AskView {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Title split so one word can be amber ("Upgrade to " + "Pro"). */
  title: string;
  amberWord?: string;
  line: string;
  dismissLabel: string;
  busy?: boolean;
  onPress: () => void;
  onDismiss: () => void;
}

export function AskRow({ ask }: { ask: AskView }) {
  const parts = ask.amberWord && ask.title.includes(ask.amberWord) ? ask.title.split(ask.amberWord) : null;

  return (
    <View style={s.row}>
      <Pressable
        onPress={ask.onPress}
        disabled={ask.busy}
        style={({ pressed }) => [s.main, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`${ask.title}. ${ask.line}`}
      >
        {ask.busy ? (
          <ActivityIndicator size="small" color={colors.text2} />
        ) : (
          <Ionicons name={ask.icon} size={20} color={colors.text2} accessible={false} />
        )}
        <View style={s.text}>
          <Text style={s.title} maxFontSizeMultiplier={fontScaleCap.body}>
            {parts ? (
              <>
                {parts[0]}
                <Text style={s.amber}>{ask.amberWord}</Text>
                {parts[1]}
              </>
            ) : (
              ask.title
            )}
          </Text>
          <Text style={s.line} maxFontSizeMultiplier={fontScaleCap.body}>{ask.line}</Text>
        </View>
      </Pressable>
      <Pressable
        onPress={ask.onDismiss}
        style={s.close}
        accessibilityRole="button"
        accessibilityLabel={ask.dismissLabel}
      >
        <Ionicons name="close" size={18} color={colors.text3} accessible={false} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
  text: { flex: 1 },
  title: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  amber: { color: colors.amber },
  line: { marginTop: 2, fontSize: 13, fontFamily: fonts.regular, color: colors.text2, lineHeight: 18 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
