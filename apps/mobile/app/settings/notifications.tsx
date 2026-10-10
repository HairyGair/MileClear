import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { Ionicons } from "@expo/vector-icons";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { ToggleRow } from "../../components/settings/ToggleRow";
import { CheckRowView } from "../../components/settings/CheckRowView";
import {
  adoptServerOptIns,
  setNotificationPreferences,
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
} from "../../lib/notifications/preferences";
import {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
} from "../../lib/notifications";
import { hiddenProCount, visibleNotificationGroups } from "../../lib/settings/notificationGroups";
import { useUser } from "../../lib/user/context";
import { PremiumTeaser } from "../../components/PremiumGate";

const DEFAULTS: NotificationPreferences = DEFAULT_PREFERENCES;

/**
 * Notifications, grouped by what they are about. The first thing on the screen
 * is the phone's own answer: switches here do nothing while the phone blocks
 * MileClear, and until 10 Oct 2026 this screen said "10 of 10 on" regardless.
 */
export default function NotificationsSettings() {
  const { user } = useUser();
  const isPremium = user?.isPremium ?? false;
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULTS);
  const [permission, setPermission] = useState<"granted" | "denied" | "undetermined">("granted");

  useEffect(() => {
    adoptServerOptIns()
      .then(setPrefs)
      .catch((e: unknown) => console.warn("[settings/notifications] load failed:", e));
  }, []);

  // The fix sends the driver to the phone's Settings; coming back does not
  // refocus this screen, so re-read the permission when the app wakes.
  useFocusEffect(
    useCallback(() => {
      const read = () => getNotificationPermissionStatus().then(setPermission).catch(() => {});
      read();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") read();
      });
      return () => sub.remove();
    }, [])
  );

  const fix = useCallback(async () => {
    if (permission === "undetermined") {
      const ok = await requestNotificationPermissions().catch(() => false);
      setPermission(ok ? "granted" : "denied");
    } else {
      Linking.openSettings().catch(() => {});
    }
  }, [permission]);

  const toggle = useCallback(
    (key: keyof NotificationPreferences, value: boolean) => {
      setPrefs((p: NotificationPreferences) => ({ ...p, [key]: value }));
      setNotificationPreferences({ [key]: value }).catch(console.error);
    },
    []
  );

  const blocked = permission !== "granted";
  const more = hiddenProCount(isPremium);

  return (
    <SettingsScreen>
      <SettingsGroup>
        {permission === "granted" ? (
          <CheckRowView
            look="ok"
            title="Your phone lets MileClear send notifications"
            onPress={() => Linking.openSettings().catch(() => {})}
            a11yHint="Opens your phone's settings for MileClear"
          />
        ) : permission === "denied" ? (
          <CheckRowView
            look="bad"
            title="Your phone is blocking MileClear"
            hint="Nothing below will reach you until you allow it"
            action="Open phone settings"
            onPress={fix}
          />
        ) : (
          <CheckRowView
            look="warn"
            title="Notifications aren't turned on yet"
            hint="Allow them to get trip, tax and car reminders"
            action="Turn on"
            onPress={fix}
          />
        )}
      </SettingsGroup>

      {visibleNotificationGroups(isPremium).map((group) => (
        <View key={group.title} style={blocked ? { opacity: 0.5 } : undefined}>
          <SettingsGroup title={group.title.toUpperCase()}>
            {group.items.map((item) => (
              <ToggleRow
                key={item.key}
                icon={item.icon as keyof typeof Ionicons.glyphMap}
                label={item.label}
                hint={item.hint}
                value={prefs[item.key]}
                onToggle={(v) => toggle(item.key, v)}
              />
            ))}
          </SettingsGroup>
        </View>
      ))}

      {more > 0 ? (
        <View style={{ marginTop: 16 }}>
          <PremiumTeaser feature={`${more} more notification types`} compact />
        </View>
      ) : null}
    </SettingsScreen>
  );
}
