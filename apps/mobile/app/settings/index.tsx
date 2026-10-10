import { useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { getNotificationPreferences } from "../../lib/notifications/preferences";
import { getNotificationPermissionStatus } from "../../lib/notifications";
import { countNotifications } from "../../lib/settings/notificationGroups";
import { useUser } from "../../lib/user/context";

/**
 * Settings hub. Single-purpose: route the user into one of nine focused
 * sub-screens. Anthony 17 May audit:
 *   - Split "General" → "Profile" + "Preferences" (old row enumerated
 *     5 distinct concerns: name/email/password/avatar/dashboard mode)
 *   - "What you see" promoted to position 2 (was 5th — users miss it)
 *   - Notifications row now shows a live preview of how many alert
 *     categories are enabled
 */
export default function SettingsHub() {
  const router = useRouter();
  const { user } = useUser();
  const isPremium = user?.isPremium ?? false;
  const go = (path: string) => () => router.push(path as never);

  // Live notification-preference preview. Counts how many alert
  // categories the user has enabled vs the total available to them
  // (the Pro categories don't count for free users). Refreshed on
  // focus so toggles in /settings/notifications reflect immediately
  // when they back out.
  const [notifSummary, setNotifSummary] = useState<string>("Loading...");
  const [notifBlocked, setNotifBlocked] = useState(false);
  const loadNotifs = useCallback(async () => {
    try {
      const [prefs, permission] = await Promise.all([
        getNotificationPreferences(),
        getNotificationPermissionStatus(),
      ]);
      // The count only shows when the phone allows notifications at all.
      if (permission === "denied") {
        setNotifBlocked(true);
        setNotifSummary("Blocked on this phone. Tap to fix");
      } else if (permission === "undetermined") {
        setNotifBlocked(false);
        setNotifSummary("Not turned on yet. Tap to turn on");
      } else {
        setNotifBlocked(false);
        const c = countNotifications(prefs, isPremium);
        setNotifSummary(`${c.on} of ${c.total} on`);
      }
    } catch {
      setNotifSummary("Choose which ones you get");
    }
  }, [isPremium]);

  useEffect(() => {
    loadNotifs();
  }, [loadNotifs]);

  useFocusEffect(
    useCallback(() => {
      loadNotifs();
    }, [loadNotifs])
  );

  return (
    <SettingsScreen>
      <SettingsGroup>
        <SettingsRow
          icon="home-outline"
          label="Home screen"
          hint="Choose which shortcuts show on Home"
          onPress={go("/settings/home")}
        />
        <SettingsRow
          icon="options-outline"
          label="Preferences"
          hint="Dashboard mode and weekly miles goal"
          onPress={go("/settings/preferences")}
        />
        <SettingsRow
          icon="location-outline"
          label="Recording"
          hint="Automatic trips, saved places, work hours"
          onPress={go("/settings/tracking")}
        />
        <SettingsRow
          icon="briefcase-outline"
          label="Your tax details"
          hint="Work type, rates, other income"
          onPress={go("/settings/work-tax")}
        />
        <SettingsRow
          icon="business-outline"
          label="Business Profile"
          hint="Invoice branding: logo, VAT, bank details"
          onPress={go("/settings/business")}
        />
        <SettingsRow
          icon="lock-closed-outline"
          label="Security"
          hint="Lock the app with Face ID, Touch ID, or passcode"
          onPress={go("/settings/security")}
        />
        <SettingsRow
          icon="notifications-outline"
          label="Notifications"
          hint={notifSummary}
          hintTone={notifBlocked ? "bad" : undefined}
          onPress={go("/settings/notifications")}
        />
        <SettingsRow
          icon="cloud-download-outline"
          label="Downloads and your data"
          hint="Spreadsheets, PDFs, uploads, a copy of your data"
          onPress={go("/settings/data-exports")}
        />
        <SettingsRow
          icon="help-circle-outline"
          label="Help, feedback and legal"
          hint="Help, email us, community, invite a friend, terms"
          onPress={go("/settings/help")}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
