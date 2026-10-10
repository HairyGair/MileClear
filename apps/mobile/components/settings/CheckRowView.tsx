import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, spacing } from "../../lib/theme";
import type { CheckLook } from "../../lib/settings/checks";

// One "is it working?" row: a status icon (tick, alert, ring), what is true
// now, a hint, and the fix word on the right when something needs doing. Shape
// as well as colour carries the state, so it reads in greyscale. `border` is
// injected by SettingsGroup.

const ICONS: Record<CheckLook, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  ok: { name: "checkmark-circle", color: colors.green },
  warn: { name: "alert-circle", color: colors.amber },
  bad: { name: "alert-circle", color: colors.red },
  neutral: { name: "ellipse-outline", color: colors.text2 },
};

export function CheckRowView({
  look,
  title,
  hint,
  action,
  onPress,
  border,
  a11yHint,
}: {
  look: CheckLook;
  title: string;
  hint?: string | null;
  action?: string | null;
  onPress: () => void;
  border?: boolean;
  a11yHint?: string;
}) {
  const icon = ICONS[look];
  const actionColor = look === "bad" ? colors.red : colors.amber;
  return (
    <TouchableOpacity
      style={[s.row, border && s.border]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${title}${hint ? `. ${hint}` : ""}${action ? `. ${action}` : ""}`}
      accessibilityHint={a11yHint}
    >
      <Ionicons name={icon.name} size={22} color={icon.color} accessible={false} />
      <View style={s.body}>
        <Text style={s.title} maxFontSizeMultiplier={fontScaleCap.body}>
          {title}
        </Text>
        {hint ? (
          <Text style={s.hint} maxFontSizeMultiplier={fontScaleCap.body}>
            {hint}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Text style={[s.action, { color: actionColor }]} maxFontSizeMultiplier={fontScaleCap.body}>
          {action}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: spacing.md,
    minHeight: 56,
  },
  border: { borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  body: { flex: 1 },
  title: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1 },
  hint: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  action: { fontSize: 14, fontFamily: fonts.bold },
});
