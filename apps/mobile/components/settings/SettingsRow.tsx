import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, radii, spacing } from "../../lib/theme";

/**
 * Tappable row for settings sub-screens. Icon + label, optional hint,
 * optional badge (e.g. "Pro" or "2 / Free"), trailing chevron.
 *
 * `border` is auto-injected by SettingsGroup so callers usually don't
 * need to pass it. Pass `iconColor` to override the default amber.
 */
export function SettingsRow({
  icon,
  label,
  hint,
  badge,
  badgeColor,
  iconColor,
  onPress,
  border,
  destructive,
  accessibilityHint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  badge?: string;
  badgeColor?: string;
  iconColor?: string;
  onPress: () => void;
  border?: boolean;
  destructive?: boolean;
  accessibilityHint?: string;
}) {
  const labelColor = destructive ? colors.red : colors.text1;
  const iconHue = iconColor ?? (destructive ? colors.red : colors.amber);

  return (
    <TouchableOpacity
      style={[styles.row, border && styles.border]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      accessibilityHint={accessibilityHint ?? hint}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={18} color={iconHue} accessible={false} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      {badge && (
        <View
          style={[
            styles.badge,
            badgeColor ? { backgroundColor: badgeColor } : null,
          ]}
        >
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: spacing.md,
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
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
  },
  hint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.amberDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.amber,
  },
});
