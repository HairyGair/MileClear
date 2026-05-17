import { useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import {
  getNotificationPreferences,
  type NotificationPreferences,
} from "../../lib/notifications/preferences";
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
  const [notifSummary, setNotifSummary] = useState<string>("Loading…");
  const loadNotifs = useCallback(async () => {
    try {
      const prefs = await getNotificationPreferences();
      setNotifSummary(formatNotifSummary(prefs, isPremium));
    } catch {
      setNotifSummary("Trip reminders, weekly summary, milestones");
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
          icon="person-outline"
          label="Profile"
          hint="Name, avatar, email, password"
          onPress={go("/settings/profile")}
        />
        <SettingsRow
          icon="apps-outline"
          label="What you see"
          hint="Hide dashboard cards you don't use"
          onPress={go("/settings/visibility")}
        />
        <SettingsRow
          icon="options-outline"
          label="Preferences"
          hint="Dashboard mode — Work, Personal, or Both"
          onPress={go("/settings/preferences")}
        />
        <SettingsRow
          icon="location-outline"
          label="Tracking & Locations"
          hint="GPS detection, geofences, classification, schedule"
          onPress={go("/settings/tracking")}
        />
        <SettingsRow
          icon="briefcase-outline"
          label="Work & Tax"
          hint="Work type, mileage rates, tax bracket, goal"
          onPress={go("/settings/work-tax")}
        />
        <SettingsRow
          icon="notifications-outline"
          label="Notifications"
          hint={notifSummary}
          onPress={go("/settings/notifications")}
        />
        <SettingsRow
          icon="cloud-download-outline"
          label="Data & Exports"
          hint="Tax exports, sync status, GDPR data export"
          onPress={go("/settings/data-exports")}
        />
        <SettingsRow
          icon="help-circle-outline"
          label="Help & Feedback"
          hint="Rate, suggest, contact, FAQ"
          onPress={go("/settings/help")}
        />
        <SettingsRow
          icon="document-text-outline"
          label="Legal"
          hint="Terms of Use, Privacy Policy"
          onPress={go("/settings/legal")}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}

/**
 * Render a one-line summary of which notifications the user has on,
 * e.g. "3 of 4 enabled · trip reminders, streaks, summary".
 * Free users see only the 4 free categories; Pro users see all 9.
 */
function formatNotifSummary(
  prefs: NotificationPreferences,
  isPremium: boolean
): string {
  // Free-tier categories (always available)
  const freeCategories: { key: keyof NotificationPreferences; short: string }[] = [
    { key: "unclassifiedNudge", short: "trip reminders" },
    { key: "autoTripLiveActivity", short: "Live Activity" },
    { key: "shiftReminder", short: "shift alerts" },
    { key: "streakReminder", short: "streaks" },
  ];
  // Pro-tier categories
  const proCategories: { key: keyof NotificationPreferences; short: string }[] = [
    { key: "weeklySummary", short: "weekly summary" },
    { key: "shiftSummary", short: "shift summary" },
    { key: "monthlyRecap", short: "monthly recap" },
    { key: "milestoneAlerts", short: "milestones" },
    { key: "taxDeadline", short: "tax deadline" },
  ];

  const all = isPremium ? [...freeCategories, ...proCategories] : freeCategories;
  const enabled = all.filter((c) => prefs[c.key]);

  if (enabled.length === 0) {
    return "All alerts off — tap to enable";
  }

  // Show a count + the first couple of enabled names
  const sampleNames = enabled.slice(0, 2).map((c) => c.short).join(", ");
  const more = enabled.length - 2;
  const tail = more > 0 ? `, +${more} more` : "";
  return `${enabled.length} of ${all.length} on — ${sampleNames}${tail}`;
}
