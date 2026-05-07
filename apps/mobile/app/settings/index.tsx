import { useRouter } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";

/**
 * Settings hub. Single-purpose: route the user into one of eight focused
 * sub-screens. Replaces the previous monolithic profile-tab settings list.
 */
export default function SettingsHub() {
  const router = useRouter();
  const go = (path: string) => () => router.push(path as never);

  return (
    <SettingsScreen>
      <SettingsGroup>
        <SettingsRow
          icon="person-outline"
          label="General"
          hint="Name, email, password, avatar, dashboard mode"
          onPress={go("/settings/general")}
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
          hint="Trip reminders, weekly summary, milestones, tax deadline"
          onPress={go("/settings/notifications")}
        />
        <SettingsRow
          icon="apps-outline"
          label="What you see"
          hint="Hide dashboard cards you don't use"
          onPress={go("/settings/visibility")}
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
