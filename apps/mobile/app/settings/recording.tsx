import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ToggleRow } from "../../components/settings/ToggleRow";
import { CheckRowView } from "../../components/settings/CheckRowView";
import { usePhoneState, recordingMessages } from "../../components/settings/useSettingsChecks";
import {
  getJourneyEndMinutes,
  setJourneyEndMinutes,
  getStartTripUntilArrived,
  setStartTripUntilArrived,
} from "../../lib/tracking/detection";
import { PARKED_COPY } from "../../lib/tracking/parkedReminderRule";
import { readAutomaticTrips, setAutomaticTrips } from "../../lib/tracking/automaticTrips";
import { JOURNEY_END_CHOICES } from "../../lib/tracking/journeyBoundary";
import { pauseChoices, type PauseChoice } from "../../lib/tracking/pauseRule";
import {
  isBatterySaverEnabled,
  setBatterySaverEnabled,
} from "../../lib/tracking/batteryAware";
import { requestOrFixBackgroundLocation } from "../../lib/permissions/location";
import { requestMotionPermission } from "../../lib/tracking/motionPermission";
import { checkingRow, recordingCheck } from "../../lib/settings/checks";
import { phoneRows, type PhoneRow } from "../../lib/settings/phoneChecks";
import { Linking } from "react-native";
import { driveForOf } from "@mileclear/shared";
import { useUser } from "../../lib/user/context";

/**
 * Recording (was "Tracking & Locations"). Top: is it actually recording,
 * said in Home's words, and the four phone settings that decide it, each with
 * a fix. Then the driver's choices. Saved places and Work hours live on the
 * Settings page itself.
 */
export default function RecordingSettings() {
  const router = useRouter();
  const { user } = useUser();
  const driveFor = driveForOf(user);
  const [driveDetection, setDriveDetection] = useState(true);
  const [batterySaver, setBatterySaver] = useState(true);
  const [journeyEnd, setJourneyEnd] = useState(30);
  const [untilArrived, setUntilArrived] = useState(false);
  const phone = usePhoneState();
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const msgs = recordingMessages(phone);
  const now = Date.now();
  // Until the phone has answered, the inputs are optimistic defaults, so no
  // green ticks yet.
  const status = phone.loaded
    ? recordingCheck({
        blocker: msgs.blocker,
        pausedUntil: phone.pausedUntil,
        now,
        automaticOff: phone.automaticOff,
        lowPowerMode: phone.lowPower,
        platform,
        setup: msgs.setup,
        recording: null,
      })
    : checkingRow("recording");
  const paused = phone.pausedUntil !== null && phone.pausedUntil > now;

  // Automatic trips is also on Home, so re-read it every time this shows.
  useFocusEffect(
    useCallback(() => {
      readAutomaticTrips().then(setDriveDetection).catch(() => {});
    }, [])
  );

  useEffect(() => {
    isBatterySaverEnabled().then(setBatterySaver).catch(() => {});
    getJourneyEndMinutes().then(setJourneyEnd).catch(() => {});
    getStartTripUntilArrived().then(setUntilArrived).catch(() => {});
  }, []);

  const runFix = useCallback(
    async (row: PhoneRow) => {
      if (row.fix === "request_location") {
        // Asks if the phone still lets us, otherwise explains and opens Settings.
        await requestOrFixBackgroundLocation().catch(() => {});
      } else if (row.fix === "request_motion") {
        await requestMotionPermission().catch(() => {});
      } else if (row.fix === "open_phone_settings") {
        Linking.openSettings().catch(() => {});
      }
      phone.refresh();
    },
    [phone]
  );

  const onStatusPress = useCallback(async () => {
    if (status.statusKind === "cant_record") {
      if (msgs.blocker === "bg_refresh_off") Linking.openSettings().catch(() => {});
      else await requestOrFixBackgroundLocation().catch(() => {});
      phone.refresh();
    } else if (status.statusKind === "paused") {
      const m = await import("../../lib/tracking/detection");
      await m.resumeDriveDetection("manual").catch(() => {});
      phone.refresh();
    }
  }, [status.statusKind, msgs.blocker, phone]);

  const toggleUntilArrived = useCallback((next: boolean) => {
    setUntilArrived(next);
    setStartTripUntilArrived(next).catch(() => {});
  }, []);

  // How long stopped before one trip becomes the next. A visiting
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

  const choosePause = useCallback(() => {
    const m = pauseChoices(Date.now());
    Alert.alert(
      "Pause recording",
      "Recording comes back on by itself when the pause ends. You can still add trips by hand.",
      [
        ...m.map((c: PauseChoice) => ({
          text: c.label,
          onPress: async () => {
            const d = await import("../../lib/tracking/detection");
            await d.pauseDriveDetection(c.until, c.id).catch(() => {});
            phone.refresh();
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }, [phone]);

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
              setAutomaticTrips(false).then(() => phone.refresh()).catch(() => {});
            },
          },
        ]
      );
      return;
    }
    setDriveDetection(true);
    setAutomaticTrips(true).then(() => phone.refresh()).catch(() => {});
  }, [phone]);

  const toggleBatterySaver = useCallback((next: boolean) => {
    setBatterySaver(next);
    setBatterySaverEnabled(next);
  }, []);

  const sortsAutomatically = driveFor === "gig" || driveFor === "employee" || driveFor === "both";
  const journeyLabel =
    JOURNEY_END_CHOICES.find((c) => c.minutes === journeyEnd)?.label ?? `${journeyEnd} minutes`;

  return (
    <SettingsScreen>
      <SettingsGroup title="IS IT RECORDING?">
        <CheckRowView
          look={status.look}
          title={status.title}
          hint={status.hint}
          action={status.action}
          onPress={onStatusPress}
        />
      </SettingsGroup>

      <SettingsGroup title="WHAT YOUR PHONE ALLOWS">
        {!phone.loaded && (
          <CheckRowView look="neutral" title="Checking your phone's settings..." onPress={() => phone.refresh()} />
        )}
        {(phone.loaded
          ? phoneRows({
              platform,
              tier: phone.tier,
              bgRefreshOff: phone.bgRefreshOff,
              motion: phone.motion,
              lowPower: phone.lowPower,
            })
          : []
        ).map((row) => (
          <CheckRowView
            key={row.id}
            look={row.look}
            title={row.title}
            hint={row.hint}
            action={row.action}
            onPress={() => (row.fix ? runFix(row) : Linking.openSettings().catch(() => {}))}
            a11yHint={row.fix ? undefined : "Opens your phone's settings for MileClear"}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="YOUR CHOICES">
        <ToggleRow
          icon="navigate-outline"
          label="Automatic trips"
          hint={
            !driveDetection
              ? "Only shifts and Start Trip record."
              : status.look === "ok" || !phone.loaded
                ? "Drives record by themselves."
                : "On, but see the checks above."
          }
          value={driveDetection}
          onToggle={toggleDriveDetection}
        />
        <SettingsRow
          icon="pause-circle-outline"
          label="Pause recording"
          hint={paused ? "Paused. Tap Resume at the top to switch it back on" : "Until 6am tomorrow, or for a week"}
          onPress={choosePause}
        />
        <SettingsRow
          icon="timer-outline"
          label="End a trip after"
          hint={`${journeyLabel} stopped. Longer stops split your trips.`}
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
        {untilArrived && phone.notifications !== "granted" && (
          <SettingsRow
            icon="notifications-off-outline"
            label={PARKED_COPY.settingsHintNoPermission}
            onPress={() => router.push("/settings/notifications" as never)}
          />
        )}
        <ToggleRow
          icon="battery-half-outline"
          label="Save battery when it's low"
          hint="Eases off recording when the battery is low and unplugged. Won't drop trips."
          value={batterySaver}
          onToggle={toggleBatterySaver}
        />
        {sortsAutomatically && (
          <SettingsRow
            icon="filter-outline"
            label="Sort trips automatically"
            hint="Mark trips business or personal by place, time of day or platform"
            onPress={() => router.push("/classification-rules" as never)}
          />
        )}
      </SettingsGroup>

      <SettingsGroup title="STILL NOT RIGHT?">
        <SettingsRow
          icon="pulse-outline"
          label="Check recording in detail"
          hint="Your phone's settings, battery use and whether trips are saving"
          onPress={() => router.push("/drive-detection-diagnostics" as never)}
        />
        <SettingsRow
          icon="chatbubble-ellipses-outline"
          label="Not working? Tell us"
          hint="Send us a problem report"
          onPress={() => router.push("/report-problem" as never)}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
