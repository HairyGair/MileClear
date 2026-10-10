import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ToggleRow } from "../../components/settings/ToggleRow";
import {
  getJourneyEndMinutes,
  setJourneyEndMinutes,
  getStartTripUntilArrived,
  setStartTripUntilArrived,
} from "../../lib/tracking/detection";
import {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
} from "../../lib/notifications";
import { PARKED_COPY } from "../../lib/tracking/parkedReminderRule";
import { readAutomaticTrips, setAutomaticTrips } from "../../lib/tracking/automaticTrips";
import { JOURNEY_END_CHOICES } from "../../lib/tracking/journeyBoundary";
import {
  isBatterySaverEnabled,
  setBatterySaverEnabled,
} from "../../lib/tracking/batteryAware";
import { usePhoneState, recordingMessages } from "../../components/settings/useSettingsChecks";
import { recordingCheck } from "../../lib/settings/checks";
import { Platform } from "react-native";

/**
 * Recording settings (was "Tracking & Locations"): automatic trips, saved
 * places, sort-automatically rules, work hours, the technical check. Mostly
 * chevrons that hand off to existing screens; the toggles change state inline.
 */
export default function TrackingSettings() {
  const router = useRouter();
  const [driveDetection, setDriveDetection] = useState(true);
  const [batterySaver, setBatterySaver] = useState(true);
  const [journeyEnd, setJourneyEnd] = useState(30);
  const [untilArrived, setUntilArrived] = useState(false);
  const [notifState, setNotifState] = useState<"granted" | "denied" | "undetermined">("granted");
  // Home's answer to "is it actually recording?", so the switch below can
  // never say "on" while location is not Always or Background App Refresh is off.
  const phone = usePhoneState();
  const msgs = recordingMessages(phone);
  const recCheck = recordingCheck({
    blocker: msgs.blocker,
    pausedUntil: phone.pausedUntil,
    now: Date.now(),
    automaticOff: phone.automaticOff,
    lowPowerMode: phone.lowPower,
    platform: Platform.OS === "ios" ? "ios" : "android",
    setup: msgs.setup,
    recording: null,
  });

  // Automatic trips is also on the dashboard (28 Sep 2026), so re-read it
  // every time this screen shows rather than once.
  useFocusEffect(
    useCallback(() => {
      readAutomaticTrips().then(setDriveDetection).catch(() => {});
      getNotificationPermissionStatus().then(setNotifState).catch(() => {});
      // The notifications row sends the driver to iOS Settings; coming back
      // does not refocus this screen, so re-read the permission on return.
      const sub = AppState.addEventListener("change", (next) => {
        if (next === "active") {
          getNotificationPermissionStatus().then(setNotifState).catch(() => {});
        }
      });
      return () => sub.remove();
    }, [])
  );

  useEffect(() => {
    isBatterySaverEnabled().then(setBatterySaver).catch(() => {});
    getJourneyEndMinutes().then(setJourneyEnd).catch(() => {});
    getStartTripUntilArrived().then(setUntilArrived).catch(() => {});
  }, []);

  // Asks if the system prompt is still available, otherwise opens iOS Settings.
  const fixNotifications = useCallback(async () => {
    if (notifState === "undetermined") {
      const ok = await requestNotificationPermissions().catch(() => false);
      setNotifState(ok ? "granted" : "denied");
    } else {
      Linking.openSettings().catch(() => {});
    }
  }, [notifState]);

  const toggleUntilArrived = useCallback((next: boolean) => {
    setUntilArrived(next);
    setStartTripUntilArrived(next).catch(() => {});
  }, []);

  // How long stopped before one journey becomes the next. A visiting
  // professional stopping 20 minutes at each call needs a shorter answer than
  // a long-distance driver taking a break; there is no single right number,
  // which is why it is asked rather than assumed.
  const chooseJourneyEnd = useCallback(() => {
    Alert.alert(
      "End a trip after",
      "How long do you usually stop before the next drive is a separate trip? Stops longer than this split your trips; shorter ones stay as one.",
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
    // Confirm before switching OFF: silently disabling capture is how drives
    // go missing without the user realising. Turning ON asks for "Always"
    // location first if it is missing (setAutomaticTrips).
    if (!next) {
      Alert.alert(
        "Turn off automatic trips?",
        "Only shifts and Start Trip will record. Drives outside those won't be kept. You can still add trips by hand with + on the Trips screen.",
        [
          { text: "Keep it on", style: "cancel" },
          {
            text: "Turn off",
            style: "destructive",
            onPress: () => {
              setDriveDetection(false);
              setAutomaticTrips(false).catch(() => {});
            },
          },
        ]
      );
      return;
    }
    setDriveDetection(true);
    setAutomaticTrips(true).catch(() => {});
  }, []);

  const toggleBatterySaver = useCallback((next: boolean) => {
    setBatterySaver(next);
    setBatterySaverEnabled(next);
  }, []);

  return (
    <SettingsScreen>
      <SettingsGroup title="RECORDING">
        <ToggleRow
          icon="navigate-outline"
          label="Automatic trips"
          hint={
            !driveDetection
              ? "Only shifts and Start Trip record."
              : phone.loaded && recCheck.look !== "ok"
                ? `${recCheck.title}. Tap Check recording in detail.`
                : "Drives record by themselves."
          }
          value={driveDetection}
          onToggle={toggleDriveDetection}
        />
        <ToggleRow
          icon="battery-half-outline"
          label="Save battery when it's low"
          hint="Eases off recording when the battery is low and unplugged. Won't drop trips."
          value={batterySaver}
          onToggle={toggleBatterySaver}
        />
        <SettingsRow
          icon="timer-outline"
          label="End a trip after"
          hint={`${
            JOURNEY_END_CHOICES.find((c) => c.minutes === journeyEnd)?.label ??
            `${journeyEnd} minutes`
          } stopped. Longer stops split your trips.`}
          onPress={chooseJourneyEnd}
        />
        <ToggleRow
          icon="flag-outline"
          label="Start Trip runs until I tap Arrived"
          hint={
            untilArrived
              ? PARKED_COPY.settingsHintOn
              : "Start Trip saves by itself after 15 minutes parked."
          }
          value={untilArrived}
          onToggle={toggleUntilArrived}
        />
        {untilArrived && notifState !== "granted" && (
          <SettingsRow
            icon="notifications-off-outline"
            label={PARKED_COPY.settingsHintNoPermission}
            onPress={fixNotifications}
          />
        )}
        <SettingsRow
          icon="pulse-outline"
          label="Check recording in detail"
          hint="Your phone's settings, battery use and whether trips are saving"
          onPress={() => router.push("/drive-detection-diagnostics" as never)}
        />
      </SettingsGroup>

      <SettingsGroup title="PLACES AND HOURS">
        <SettingsRow
          icon="bookmark-outline"
          label="Saved places"
          hint="Name the places your trips start and end"
          onPress={() => router.push("/saved-locations" as never)}
        />
        <SettingsRow
          icon="filter-outline"
          label="Sort trips automatically"
          hint="Mark trips business or personal by place, time of day or platform"
          onPress={() => router.push("/classification-rules" as never)}
        />
        <SettingsRow
          icon="calendar-outline"
          label="Work hours"
          hint="Your working days and hours"
          onPress={() => router.push("/work-schedule" as never)}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
