import { View, Text, Switch, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii, spacing } from "../../lib/theme";

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
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={18} color={colors.amber} accessible={false} />
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
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
    gap: spacing.md,
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  disabled: {
    opacity: 0.5,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
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
