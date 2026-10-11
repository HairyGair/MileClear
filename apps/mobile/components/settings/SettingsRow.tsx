import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import { ContextualHelp } from "../ContextualHelp";

/**
 * Tappable row for settings sub-screens. Icon + label, optional hint,
 * optional badge (e.g. "Pro" or "2 / Free"), trailing chevron.
 *
 * `border` is auto-injected by SettingsGroup so callers usually don't
 * need to pass it. Icons are plain grey with no tile (the house style: one
 * amber thing per view). Pass `iconColor` only for a row that is that thing.
 *
 * Pass `helpTopicId` to surface a (i) info button next to the label
 * that opens a contextual help sheet. Tapping the (i) explicitly does
 * NOT trigger the row's onPress (the help button captures the tap).
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
  helpTopicId,
  hintTone,
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
  helpTopicId?: string;
  /** "bad" draws the hint in red (a problem, always with words like Fix);
   *  "add" draws it in amber (the one thing to add, e.g. "Add your car"). */
  hintTone?: "bad" | "add";
}) {
  const labelColor = destructive ? colors.red : colors.text1;
  const iconHue = iconColor ?? (destructive ? colors.red : colors.text2);

  return (
    <TouchableOpacity
      style={[styles.row, border && styles.border]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      accessibilityHint={accessibilityHint ?? hint}
    >
      <View style={styles.iconSlot}>
        <Ionicons name={icon} size={20} color={iconHue} accessible={false} />
      </View>
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: labelColor }]} maxFontSizeMultiplier={fontScaleCap.body}>{label}</Text>
          {helpTopicId ? (
            <ContextualHelp topicId={helpTopicId} size={14} color={colors.text3} />
          ) : null}
        </View>
        {hint && (
          <Text
            style={[
              styles.hint,
              hintTone === "bad" && { color: colors.red },
              hintTone === "add" && { color: colors.amber },
            ]} maxFontSizeMultiplier={fontScaleCap.body}>{hint}</Text>
        )}
      </View>
      {badge && (
        <View
          style={[
            styles.badge,
            badgeColor ? { backgroundColor: badgeColor } : null,
          ]}
        >
          <Text style={styles.badgeText} maxFontSizeMultiplier={fontScaleCap.body}>{badge}</Text>
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
    gap: 14,
    minHeight: 56,
  },
  border: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  iconSlot: {
    width: 24,
    alignItems: "center",
  },
  body: {
    flex: 1,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
