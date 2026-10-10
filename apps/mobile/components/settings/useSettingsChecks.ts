// The live inputs behind the "Is MileClear working?" checks, read the way
// Home reads them (same permission helpers, same selectDashboardMessages,
// same pause and Low Power reads), so the two screens give one answer.
//
//   const phone = usePhoneState();
//   const rows = useSettingsChecks();   // four CheckRows
//
// Re-reads on focus and when the app comes back from the phone's Settings.

import { useCallback, useMemo, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useEffect } from "react";
import { getLocationPermissionStatus, requestOrFixBackgroundLocation, type LocationPermissionTier } from "../../lib/permissions/location";
import { getNotificationPermissionStatus, requestNotificationPermissions } from "../../lib/notifications";
import { watchLowPowerMode } from "../../lib/tracking/batteryAware";
import { getDatabase } from "../../lib/db";
import { selectDashboardMessages, type BlockerId } from "../../lib/dashboardMessages";
import { useFailedSyncCount, useLastTrip, useRecordingNow } from "../home/useHomeSignals";
import { getNotificationPreferences, type NotificationPreferences } from "../../lib/notifications/preferences";
import { useUser } from "../../lib/user/context";
import {
  lastTripCheck,
  notificationsCheck,
  recordingCheck,
  uploadsCheck,
  type CheckRow,
  type NotificationPermission,
} from "../../lib/settings/checks";
import { countNotifications } from "../../lib/settings/notificationGroups";

export interface PhoneState {
  loaded: boolean;
  tier: LocationPermissionTier;
  /** iOS Background App Refresh is off. */
  bgRefreshOff: boolean;
  bgPermissionLost: boolean;
  motion: "granted" | "denied" | "undetermined" | "unavailable";
  notifications: NotificationPermission;
  lowPower: boolean;
  pausedUntil: number | null;
  /** The permanent Automatic trips switch is off and there is no pause. */
  automaticOff: boolean;
  /** Re-read everything now. */
  refresh: () => void;
}

export function usePhoneState(): PhoneState {
  const [loaded, setLoaded] = useState(false);
  const [tier, setTier] = useState<LocationPermissionTier>("always");
  const [bgRefreshOff, setBgRefreshOff] = useState(false);
  const [bgPermissionLost, setBgPermissionLost] = useState(false);
  const [motion, setMotion] = useState<PhoneState["motion"]>("granted");
  const [notifications, setNotifications] = useState<NotificationPermission>("granted");
  const [lowPower, setLowPower] = useState(false);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const [automaticOff, setAutomaticOff] = useState(false);

  useEffect(() => watchLowPowerMode(setLowPower), []);

  const refresh = useCallback(() => {
    const jobs: Promise<unknown>[] = [];
    jobs.push(
      getLocationPermissionStatus()
        .then(async ({ tier: t }) => {
          setTier(t);
          if (t === "always") {
            setBgPermissionLost(false);
          } else {
            const db = await getDatabase();
            const lost = await db
              .getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = 'bg_permission_lost'")
              .catch(() => null);
            setBgPermissionLost(lost?.value === "1");
          }
        })
        .catch(() => {})
    );
    jobs.push(
      import("../../lib/permissions/backgroundRefresh")
        .then(({ getBackgroundRefreshStatus, isBackgroundRefreshBlocked }) =>
          getBackgroundRefreshStatus().then((s) => setBgRefreshOff(Platform.OS === "ios" && isBackgroundRefreshBlocked(s)))
        )
        .catch(() => {})
    );
    jobs.push(
      import("../../lib/tracking/motionPermission")
        .then(({ getMotionPermission }) => getMotionPermission().then(setMotion))
        .catch(() => {})
    );
    jobs.push(getNotificationPermissionStatus().then(setNotifications).catch(() => {}));
    jobs.push(
      import("../../lib/tracking/detection")
        .then(async (m) => {
          const until = await m.getDrivePauseUntil();
          setPausedUntil(until);
          const enabled = await m.isDriveDetectionEnabled();
          setAutomaticOff(!enabled && until === null);
        })
        .catch(() => {})
    );
    Promise.all(jobs).finally(() => setLoaded(true));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") refresh();
      });
      return () => sub.remove();
    }, [refresh])
  );

  return { loaded, tier, bgRefreshOff, bgPermissionLost, motion, notifications, lowPower, pausedUntil, automaticOff, refresh };
}

/** Home's blocker and setup rules, run on this phone's state. */
export function recordingMessages(p: PhoneState): { blocker: BlockerId | null; setup: { done: number; total: number } | null } {
  const m = selectDashboardMessages({
    activeShift: false,
    loading: !p.loaded,
    locationTier: p.tier,
    bgRefreshOff: p.bgRefreshOff,
    bgPermissionLost: p.bgPermissionLost,
    motionStatus: p.motion,
    chaseUndeterminedMotion: Platform.OS === "android",
    notifPermission: p.notifications,
    // Battery is an Android nudge Home snoozes; Settings leaves it to the
    // Recording screen so one phone setting cannot colour the whole page.
    batteryApplicable: false,
    batteryIgnoring: null,
    batteryDismissedAt: null,
    now: Date.now(),
    // Settings shows the truth whether or not Home's nudges are snoozed.
    bgLocNudgeSilenced: false,
    motionNudgeSilenced: false,
    notifDeniedNudgeSilenced: false,
    notifPrimerSilenced: false,
    detectionOffSince: p.automaticOff ? 1 : null,
    lowPowerMode: p.lowPower,
  });
  return { blocker: m.blocker, setup: m.setup ? { done: m.setup.done, total: m.setup.total } : null };
}

export interface SettingsChecks {
  rows: CheckRow[];
  phone: PhoneState;
  /** Run the action a row's tap asks for (fixes and navigation hooks). */
  fixLocation: () => Promise<void>;
  openPhoneSettings: () => void;
  fixNotifications: () => Promise<void>;
}

export function useSettingsChecks(): SettingsChecks {
  const phone = usePhoneState();
  const { user } = useUser();
  const isPremium = user?.isPremium ?? false;
  const recording = useRecordingNow();
  const failed = useFailedSyncCount();
  const last = useLastTrip();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  useFocusEffect(
    useCallback(() => {
      getNotificationPreferences().then(setPrefs).catch(() => {});
    }, [])
  );

  const now = Date.now();
  const rows = useMemo(() => {
    const msgs = recordingMessages(phone);
    return [
      recordingCheck({
        blocker: msgs.blocker,
        pausedUntil: phone.pausedUntil,
        now,
        automaticOff: phone.automaticOff,
        lowPowerMode: phone.lowPower,
        platform: Platform.OS === "ios" ? "ios" : "android",
        setup: msgs.setup,
        recording,
      }),
      lastTripCheck({ trip: last.trip, totalTrips: last.trip ? 1 : 0, loading: last.loading, now }),
      notificationsCheck({
        permission: phone.notifications,
        counts: prefs ? countNotifications(prefs, isPremium) : null,
      }),
      uploadsCheck({ failedCount: failed.count, allTrips: failed.allTrips }),
    ];
    // `now` read once per render on purpose, like Home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, recording, last.trip, last.loading, prefs, isPremium, failed.count, failed.allTrips, Math.floor(now / 60000)]);

  const fixLocation = useCallback(async () => {
    await requestOrFixBackgroundLocation();
    phone.refresh();
  }, [phone]);

  const openPhoneSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const fixNotifications = useCallback(async () => {
    if (phone.notifications === "undetermined") {
      await requestNotificationPermissions().catch(() => false);
      phone.refresh();
    } else {
      Linking.openSettings().catch(() => {});
    }
  }, [phone]);

  return { rows, phone, fixLocation, openPhoneSettings, fixNotifications };
}
