import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { ToggleRow } from "../../components/settings/ToggleRow";
import {
  adoptServerOptIns,
  setNotificationPreferences,
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
} from "../../lib/notifications/preferences";
import { useUser } from "../../lib/user/context";
import { PremiumTeaser } from "../../components/PremiumGate";

const DEFAULTS: NotificationPreferences = DEFAULT_PREFERENCES;

export default function NotificationsSettings() {
  const { user } = useUser();
  const isPremium = user?.isPremium ?? false;
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULTS);

  useEffect(() => {
    adoptServerOptIns()
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
          label="Cheapest fuel near me each morning"
          hint="Only when a station near where you set off is at least 3p a litre under the local average"
          value={prefs.cheapestFuelDaily}
          onToggle={(v) => toggle("cheapestFuelDaily", v)}
        />
        <ToggleRow
          icon="flash-outline"
          label="EV running costs each Monday"
          hint="For electric cars: last week's miles costed at your home rate and on public rapid chargers"
          value={prefs.evWeeklySummary}
          onToggle={(v) => toggle("evWeeklySummary", v)}
        />
        <ToggleRow
          icon="warning-outline"
          label="Road alerts on my usual roads (trial)"
          hint="A heads-up before you usually set off if a road you use often is closed or badly delayed. At most one a day."
          value={prefs.roadAlerts}
          onToggle={(v) => toggle("roadAlerts", v)}
        />
        <ToggleRow
          icon="sunny-outline"
          label="Morning briefing"
          hint="Yesterday's miles and today's outlook, around 8am"
          value={prefs.morningBriefing}
          onToggle={(v) => toggle("morningBriefing", v)}
        />
      </SettingsGroup>

      {/* Free for everyone (4 Oct 2026): the tax payment reminders from the
          free tax bill planner go to free drivers too, so they need the off
          switch. It sat in the Pro-only group before. */}
      <SettingsGroup title="TAX">
        <ToggleRow
          icon="receipt-outline"
          label="Tax deadline"
          hint="Tax year end, 31 January and tax payment reminders"
          value={prefs.taxDeadline}
          onToggle={(v) => toggle("taxDeadline", v)}
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
          </SettingsGroup>
        </>
      ) : (
        <View style={{ marginTop: 16 }}>
          <PremiumTeaser feature="4 more notification types" compact />
        </View>
      )}
    </SettingsScreen>
  );
}
