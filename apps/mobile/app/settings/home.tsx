import { useCallback, useState } from "react";
import { Text, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { ToggleRow } from "../../components/settings/ToggleRow";
import { Button } from "../../components/Button";
import { getHiddenDoorRows, setDoorRowHidden, showAllDoorRows, type DoorRowId } from "../../lib/home/doorPrefs";
import { doorSwitches, hiddenSummary } from "../../lib/home/doorSettings";
import { availableDoorRows } from "../../lib/home/doors";
import { homePersona } from "../../lib/home/persona";
import { useMode } from "../../lib/mode/context";
import { useUser } from "../../lib/user/context";
import { colors, fonts, spacing } from "../../lib/theme";

/**
 * Settings > Home screen. One switch per shortcut row on Home. Switching a
 * row off only hides it on this phone; the same row can also be hidden by
 * pressing and holding it on Home. "Show all again" turns every row back on.
 */
export default function HomeScreenSettings() {
  const [hidden, setHidden] = useState<DoorRowId[]>([]);
  const { mode, isPersonal } = useMode();
  const { user, isCompanyDriver } = useUser();
  const available = availableDoorRows({
    mode,
    persona: homePersona({ isPersonal, isCompanyDriver, workType: user?.workType }),
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getHiddenDoorRows().then((ids) => {
        if (!cancelled) setHidden(ids);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const toggle = useCallback(async (id: DoorRowId, shown: boolean) => {
    const next = await setDoorRowHidden(id, !shown);
    setHidden(next);
  }, []);

  const showAll = useCallback(async () => {
    await showAllDoorRows();
    setHidden([]);
  }, []);

  return (
    <SettingsScreen>
      <Text style={styles.intro}>
        Home shows up to three shortcuts under your last trip. Switch off the ones you don&apos;t want. A shortcut only appears
        when it has something to tell you.
      </Text>
      <SettingsGroup title="SHORTCUTS ON HOME">
        {doorSwitches(hidden, available).map((row) => (
          <ToggleRow
            key={row.id}
            icon={row.icon}
            label={row.label}
            hint={row.hint}
            value={row.shown}
            onToggle={(next) => toggle(row.id, next)}
          />
        ))}
      </SettingsGroup>
      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {hiddenSummary(hidden)}
      </Text>
      <Button
        title="Show all again"
        variant="secondary"
        onPress={showAll}
        disabled={hidden.length === 0}
        accessibilityLabel="Show all shortcuts on Home again"
      />
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 20,
    marginBottom: spacing.md,
    paddingHorizontal: 4,
  },
  summary: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: 4,
  },
});
