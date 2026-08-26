import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ToggleRow } from "../../components/settings/ToggleRow";
import {
  isDriveDetectionEnabled,
  setDriveDetectionEnabled,
  getJourneyEndMinutes,
  setJourneyEndMinutes,
} from "../../lib/tracking/detection";
import { JOURNEY_END_CHOICES } from "../../lib/tracking/journeyBoundary";
import {
  isBatterySaverEnabled,
  setBatterySaverEnabled,
} from "../../lib/tracking/batteryAware";

/**
 * Tracking & Locations settings: drive detection, classification rules,
 * saved locations, work schedule, diagnostics. Mostly chevrons that hand
 * off to existing screens; only "Drive detection" changes state inline.
 */
export default function TrackingSettings() {
  const router = useRouter();
  const [driveDetection, setDriveDetection] = useState(true);
  const [batterySaver, setBatterySaver] = useState(true);
  const [journeyEnd, setJourneyEnd] = useState(30);

  useEffect(() => {
    isDriveDetectionEnabled().then(setDriveDetection).catch(() => {});
    isBatterySaverEnabled().then(setBatterySaver).catch(() => {});
    getJourneyEndMinutes().then(setJourneyEnd).catch(() => {});
  }, []);

  // How long stopped before one journey becomes the next. A visiting
  // professional stopping 20 minutes at each call needs a shorter answer than
  // a long-distance driver taking a break; there is no single right number,
  // which is why it is asked rather than assumed.
  const chooseJourneyEnd = useCallback(() => {
    Alert.alert(
      "End a journey after",
      "How long do you usually stop before the next drive is a separate journey? Stops longer than this split your trips; shorter ones stay as one.",
      [
        ...JOURNEY_END_CHOICES.map((c) => ({
          text: `${c.label} - ${c.hint}`,
          onPress: () => {
            setJourneyEnd(c.minutes);
            setJourneyEndMinutes(c.minutes).catch(() => {});
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }, []);

  const toggleDriveDetection = useCallback((next: boolean) => {
    // Confirm before switching OFF — silently disabling capture is how drives
    // go missing without the user realising. Turning ON is friction-free.
    if (!next) {
      Alert.alert(
        "Turn off auto-tracking?",
        "New drives won't be recorded automatically while it's off. You can still add trips by hand with + on the Trips screen.",
        [
          { text: "Keep it on", style: "cancel" },
          {
            text: "Turn off",
            style: "destructive",
            onPress: () => {
              setDriveDetection(false);
              setDriveDetectionEnabled(false);
            },
          },
        ]
      );
      return;
    }
    setDriveDetection(true);
    setDriveDetectionEnabled(true);
  }, []);

  const toggleBatterySaver = useCallback((next: boolean) => {
    setBatterySaver(next);
    setBatterySaverEnabled(next);
  }, []);

  return (
    <SettingsScreen>
      <SettingsGroup title="DETECTION">
        <ToggleRow
          icon="navigate-outline"
          label="Drive detection"
          hint="Auto-detect drives outside shifts and prompt to track"
          value={driveDetection}
          onToggle={toggleDriveDetection}
        />
        <ToggleRow
          icon="battery-half-outline"
          label="Battery saver"
          hint="Ease off background tracking when the battery is low and unplugged. Won't drop trips."
          value={batterySaver}
          onToggle={toggleBatterySaver}
        />
        <SettingsRow
          icon="timer-outline"
          label="End a journey after"
          hint={`${
            JOURNEY_END_CHOICES.find((c) => c.minutes === journeyEnd)?.label ??
            `${journeyEnd} minutes`
          } stopped. Longer stops split your trips.`}
          onPress={chooseJourneyEnd}
        />
        <SettingsRow
          icon="battery-charging-outline"
          label="Battery & low-power"
          hint="How MileClear keeps tracking light on battery"
          onPress={() => router.push("/drive-detection-diagnostics" as never)}
        />
        <SettingsRow
          icon="pulse-outline"
          label="Diagnostics"
          hint="GPS quality, permissions, sync state"
          onPress={() => router.push("/drive-detection-diagnostics" as never)}
        />
      </SettingsGroup>

      <SettingsGroup title="LOCATIONS & SCHEDULE">
        <SettingsRow
          icon="bookmark-outline"
          label="Saved locations"
          hint="Home, work, depot, custom geofences"
          onPress={() => router.push("/saved-locations" as never)}
        />
        <SettingsRow
          icon="filter-outline"
          label="Classification rules"
          hint="Auto-tag trips by location, time of day, or platform"
          onPress={() => router.push("/classification-rules" as never)}
        />
        <SettingsRow
          icon="calendar-outline"
          label="Work schedule"
          badge="Pro"
          hint="Auto-switch to Work mode during your working hours"
          onPress={() => router.push("/work-schedule" as never)}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
