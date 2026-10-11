import { View, Text, Switch, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

/**
 * Settings row with a Switch on the right. Used for booleans where the
 * user toggles on/off without leaving the screen (notification prefs,
 * feature visibility, etc.).
 */
export function ToggleRow({
  icon,
  label,
  hint,
  value,
  onToggle,
  border,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  value: boolean;
  onToggle: (next: boolean) => void;
  border?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.row, border && styles.border, disabled && styles.disabled]}>
      <View style={styles.iconSlot}>
        <Ionicons name={icon} size={20} color={colors.text2} accessible={false} />
      </View>
      <View style={styles.body}>
        <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.body}>{label}</Text>
        {hint && <Text style={styles.hint} maxFontSizeMultiplier={fontScaleCap.body}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: "#374151", true: colors.amber }}
        thumbColor="#fff"
        ios_backgroundColor="#374151"
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ checked: value, disabled }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 14,
    minHeight: 56,
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  disabled: {
    opacity: 0.5,
  },
  iconSlot: {
    width: 24,
    alignItems: "center",
  },
  body: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.text1,
  },
  hint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
});
