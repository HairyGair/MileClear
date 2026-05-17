import { useCallback, useEffect, useState } from "react";
import { Alert, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { fetchProfile, updateProfile } from "../../lib/api/user";
import { useUser } from "../../lib/user/context";
import { colors, fonts, radii, spacing } from "../../lib/theme";
import type { User } from "@mileclear/shared";

type DashboardMode = "both" | "work" | "personal";

const MODE_OPTIONS: { value: DashboardMode; label: string; hint: string }[] = [
  { value: "both", label: "Both", hint: "Work + personal" },
  { value: "work", label: "Work only", hint: "Tax, shifts, exports" },
  { value: "personal", label: "Personal", hint: "Goals, achievements" },
];

/**
 * App preferences — currently just dashboard mode, with room reserved
 * for future settings like units (mi/km), language, currency display
 * format, etc. Split from /settings/general so the hub-level row
 * doesn't enumerate every category in its hint. Anthony 17 May audit.
 */
export default function PreferencesSettings() {
  const { refreshUser } = useUser();
  const [user, setLocalUser] = useState<User | null>(null);
  const [savingMode, setSavingMode] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((res) => setLocalUser(res.data))
      .catch((e) => console.warn("[settings/preferences] profile load failed:", e));
  }, []);

  const setMode = useCallback(
    async (mode: DashboardMode) => {
      if (!user || user.dashboardMode === mode || savingMode) return;
      setSavingMode(true);
      const previous = user.dashboardMode;
      setLocalUser({ ...user, dashboardMode: mode });
      try {
        await updateProfile({ dashboardMode: mode });
        refreshUser();
      } catch {
        setLocalUser({ ...user, dashboardMode: previous });
        Alert.alert("Couldn't update mode", "Try again in a moment.");
      } finally {
        setSavingMode(false);
      }
    },
    [user, savingMode, refreshUser]
  );

  const currentMode = user?.dashboardMode ?? "both";

  return (
    <SettingsScreen>
      <SettingsGroup title="DASHBOARD MODE">
        <View style={styles.modeRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="apps-outline" size={18} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>What MileClear shows you</Text>
            <Text style={styles.hint}>
              Choose which dashboards are available. The toggle on the dashboard switches between them.
            </Text>
          </View>
        </View>
        <View style={styles.pillRow}>
          {MODE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.pill, currentMode === opt.value && styles.pillActive]}
              onPress={() => setMode(opt.value)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${opt.label}, ${opt.hint}`}
              accessibilityState={{ selected: currentMode === opt.value }}
            >
              <Text style={[styles.pillText, currentMode === opt.value && styles.pillTextActive]}>
                {opt.label}
              </Text>
              <Text style={styles.pillHint}>{opt.hint}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SettingsGroup>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: spacing.md,
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
  label: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.text1,
  },
  hint: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.text3,
    marginTop: 2,
    lineHeight: 15,
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  pillActive: {
    backgroundColor: colors.amberDim,
    borderColor: colors.amber,
  },
  pillText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  pillTextActive: {
    color: colors.amber,
  },
  pillHint: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: colors.text3,
    marginTop: 2,
    textAlign: "center",
  },
});
