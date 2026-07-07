import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { ToggleRow } from "../../components/settings/ToggleRow";
import {
  getNotificationPreferences,
  setNotificationPreferences,
  type NotificationPreferences,
} from "../../lib/notifications/preferences";
import { useUser } from "../../lib/user/context";
import { PremiumTeaser } from "../../components/PremiumGate";

const DEFAULTS: NotificationPreferences = {
  weeklySummary: true,
  unclassifiedNudge: true,
  shiftReminder: true,
  streakReminder: true,
  taxDeadline: true,
  milestoneAlerts: true,
  shiftSummary: true,
  monthlyRecap: true,
  autoTripLiveActivity: true,
  fuelAlert: true,
  morningBriefing: true,
};

export default function NotificationsSettings() {
  const { user } = useUser();
  const isPremium = user?.isPremium ?? false;
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULTS);

  useEffect(() => {
    getNotificationPreferences()
      .then(setPrefs)
      .catch((e: unknown) => console.warn("[settings/notifications] load failed:", e));
  }, []);

  const toggle = useCallback(
    (key: keyof NotificationPreferences, value: boolean) => {
      setPrefs((p: NotificationPreferences) => ({ ...p, [key]: value }));
      setNotificationPreferences({ [key]: value }).catch(console.error);
    },
    []
  );

  return (
    <SettingsScreen>
      <SettingsGroup title="AUTO-TRIP">
        <ToggleRow
          icon="alert-circle-outline"
          label="Trip reminders"
          hint="Nudge to classify unreviewed trips"
          value={prefs.unclassifiedNudge}
          onToggle={(v) => toggle("unclassifiedNudge", v)}
        />
        <ToggleRow
          icon="radio-button-on-outline"
          label="Live Activity for auto-trips"
          hint="Lock-screen indicator while a drive is being detected"
          value={prefs.autoTripLiveActivity}
          onToggle={(v) => toggle("autoTripLiveActivity", v)}
        />
      </SettingsGroup>

      <SettingsGroup title="DAILY">
        <ToggleRow
          icon="time-outline"
          label="Shift alerts"
          hint="Warn if a shift runs over 12 hours"
          value={prefs.shiftReminder}
          onToggle={(v) => toggle("shiftReminder", v)}
        />
        <ToggleRow
          icon="flame-outline"
          label="Streak reminders"
          hint="Nudge to keep your driving streak alive"
          value={prefs.streakReminder}
          onToggle={(v) => toggle("streakReminder", v)}
        />
        <ToggleRow
          icon="water-outline"
          label="Fuel price alerts"
          hint="Cheapest fuel near your saved locations, each morning"
          value={prefs.fuelAlert}
          onToggle={(v) => toggle("fuelAlert", v)}
        />
        <ToggleRow
          icon="sunny-outline"
          label="Morning briefing"
          hint="Yesterday's miles and today's outlook, around 8am"
          value={prefs.morningBriefing}
          onToggle={(v) => toggle("morningBriefing", v)}
        />
      </SettingsGroup>

      {isPremium ? (
        <>
          <SettingsGroup title="WEEKLY">
            <ToggleRow
              icon="calendar-outline"
              label="Weekly summary"
              hint="Mileage recap every Monday morning"
              value={prefs.weeklySummary}
              onToggle={(v) => toggle("weeklySummary", v)}
            />
            <ToggleRow
              icon="clipboard-outline"
              label="End-of-shift summary"
              hint="Stats notification when you end a shift"
              value={prefs.shiftSummary}
              onToggle={(v) => toggle("shiftSummary", v)}
            />
          </SettingsGroup>

          <SettingsGroup title="MONTHLY & YEARLY">
            <ToggleRow
              icon="stats-chart-outline"
              label="Monthly recap"
              hint="Your month in review on the 1st"
              value={prefs.monthlyRecap}
              onToggle={(v) => toggle("monthlyRecap", v)}
            />
            <ToggleRow
              icon="trophy-outline"
              label="Milestone alerts"
              hint="Celebrate when you hit mileage milestones"
              value={prefs.milestoneAlerts}
              onToggle={(v) => toggle("milestoneAlerts", v)}
            />
            <ToggleRow
              icon="receipt-outline"
              label="Tax deadline"
              hint="Reminder before 5 April tax year end"
              value={prefs.taxDeadline}
              onToggle={(v) => toggle("taxDeadline", v)}
            />
          </SettingsGroup>
        </>
      ) : (
        <View style={{ marginTop: 16 }}>
          <PremiumTeaser feature="5 more notification types" compact />
        </View>
      )}
    </SettingsScreen>
  );
}
