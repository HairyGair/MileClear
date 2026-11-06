import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, Switch, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { colors, fonts, fontSizes, radii, shared, spacing } from "../../lib/theme";
import { getNotificationPreferences } from "../../lib/notifications/preferences";
import { setTaxDeadlinePref } from "../../lib/notifications/taxDeadlinePref";
import { MTD_EXPLAINER_ROUTE, MTD_LATE_ROUTE } from "../../lib/tax/mtdHelpCopy";
import {
  HUB_HELP_HEADING,
  HUB_HELP_ROWS,
  MTD_HISTORY_ROUTE,
  REMINDERS_TITLE,
  REMINDERS_SAVE_FAILED,
  remindersSub,
} from "../../lib/tax/mtdTaxSoFar";

const ROUTES: Record<(typeof HUB_HELP_ROWS)[number]["key"], string> = {
  explainer: MTD_EXPLAINER_ROUTE,
  late: MTD_LATE_ROUTE,
  history: MTD_HISTORY_ROUTE,
};

const ICONS: Record<(typeof HUB_HELP_ROWS)[number]["key"], keyof typeof Ionicons.glyphMap> = {
  explainer: "book-outline",
  late: "alert-circle-outline",
  history: "time-outline",
};

/**
 * The hub's Help list: three help screens and the Reminders switch. The
 * switch is the driver's existing "Tax deadlines" push setting (the same one
 * in Settings > Notifications); the server's quarterly reminder job reads it
 * before sending a push.
 */
export function HubHelpList() {
  const [on, setOn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // Re-read on focus: the same switch lives in Settings > Notifications.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getNotificationPreferences()
        .then((p) => !cancelled && setOn(p.taxDeadline))
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const toggle = (value: boolean) => {
    setOn(value);
    setSaveFailed(false);
    setSaving(true);
    setTaxDeadlinePref(value)
      .catch(() => {
        setOn(!value);
        setSaveFailed(true);
      })
      .finally(() => setSaving(false));
  };

  return (
    <View>
      <Text style={styles.heading} accessibilityRole="header">{HUB_HELP_HEADING.toUpperCase()}</Text>
      <View style={styles.card}>
        {HUB_HELP_ROWS.map((r, i) => (
          <TouchableOpacity
            key={r.key}
            style={[styles.row, i > 0 && styles.rowBorder]}
            onPress={() => router.push(ROUTES[r.key] as never)}
            accessibilityRole="button"
            accessibilityLabel={`${r.title}. ${r.sub}`}
          >
            <View style={styles.tile}>
              <Ionicons name={ICONS[r.key]} size={20} color={colors.amber} accessible={false} />
            </View>
            <View style={styles.texts}>
              <Text style={styles.title}>{r.title}</Text>
              <Text style={styles.sub}>{r.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text3} accessible={false} />
          </TouchableOpacity>
        ))}
        <View style={[styles.row, styles.rowBorder]}>
          <View style={styles.tile}>
            <Ionicons name="notifications-outline" size={20} color={colors.amber} accessible={false} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.title}>{REMINDERS_TITLE}</Text>
            {on !== null && <Text style={styles.sub}>{remindersSub(on)}</Text>}
            {saveFailed && (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {REMINDERS_SAVE_FAILED}
              </Text>
            )}
          </View>
          {on !== null && (
            <Switch
              value={on}
              onValueChange={toggle}
              disabled={saving}
              trackColor={{ false: "#708096", true: colors.green }}
              thumbColor="#fff"
              ios_backgroundColor="#374151"
              accessibilityRole="switch"
              accessibilityLabel={REMINDERS_TITLE}
              accessibilityHint={remindersSub(on)}
              accessibilityState={{ checked: on, disabled: saving }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: 0.8,
    color: colors.text2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  card: { ...shared.card, paddingVertical: 0, paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, minHeight: 64 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: { flex: 1 },
  title: { fontFamily: fonts.semibold, fontSize: fontSizes.bodyLg, color: colors.text1 },
  sub: { fontFamily: fonts.regular, fontSize: fontSizes.caption + 1, color: colors.text2, marginTop: 2 },
  error: { fontFamily: fonts.semibold, fontSize: fontSizes.caption + 1, color: colors.red, marginTop: 4 },
});
