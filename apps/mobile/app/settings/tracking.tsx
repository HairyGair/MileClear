import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ToggleRow } from "../../components/settings/ToggleRow";
import {
  isDriveDetectionEnabled,
  setDriveDetectionEnabled,
} from "../../lib/tracking/detection";
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

  useEffect(() => {
    isDriveDetectionEnabled().then(setDriveDetection).catch(() => {});
    isBatterySaverEnabled().then(setBatterySaver).catch(() => {});
  }, []);

  const toggleDriveDetection = useCallback((next: boolean) => {
    setDriveDetection(next);
    setDriveDetectionEnabled(next);
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
