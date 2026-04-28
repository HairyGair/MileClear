import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Linking } from "react-native";
import { cancelAutoRecording, upgradeDetectionAccuracy } from "../tracking/detection";

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch (err) {
  console.warn("Notifications.setNotificationHandler failed:", err);
}

// Register notification categories with action buttons (lock-screen actions)
export async function registerNotificationCategories(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync("driving_detected", [
      {
        identifier: "driver",
        buttonTitle: "Driver",
        options: { opensAppToForeground: false },
      },
      {
        identifier: "passenger",
        buttonTitle: "Passenger",
        options: { isDestructive: true, opensAppToForeground: false },
      },
    ]);
    await Notifications.setNotificationCategoryAsync("trip_recorded", [
      {
        identifier: "classify_business",
        buttonTitle: "Business",
        options: { opensAppToForeground: false },
      },
      {
        identifier: "classify_personal",
        buttonTitle: "Personal",
        options: { opensAppToForeground: false },
      },
      {
        identifier: "delete_trip",
        buttonTitle: "Delete",
        options: { isDestructive: true, opensAppToForeground: false },
      },
    ]);
  } catch (err) {
    console.warn("Failed to register notification categories:", err);
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function sendDrivingDetectedNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Are you driving?",
      body: "We detected a journey. Tap Driver to record your mileage, or Passenger to ignore.",
      data: { action: "start_shift" },
      categoryIdentifier: "driving_detected",
    },
    trigger: null,
  });
}

// Stable identifier so we can update / dismiss the in-progress notification
// when a recording finalises.
const RECORDING_ACTIVE_NOTIFICATION_ID = "mileclear-recording-active";

/**
 * Show a passive ongoing notification while an auto-detected trip is being
 * recorded. This is the safety net for when the Live Activity fails to
 * present (we've seen this in the wild on iOS 26.5). Stays on the lock
 * screen and notification centre until the trip finalises.
 *
 * Uses interruptionLevel "passive" so it doesn't make sound or vibrate -
 * just sits there silently, the way Apple Maps and Strava signal an
 * in-progress activity.
 *
 * Tapping the notification routes to /active-recording.
 */
export async function showRecordingActiveNotification(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: RECORDING_ACTIVE_NOTIFICATION_ID,
      content: {
        title: "Recording trip",
        body: "MileClear is tracking your journey. Tap to view or end.",
        data: { action: "open_active_recording" },
        sound: false,
        // iOS 15+: passive interruption level - silent, no haptic, but persists
        // on lock screen until manually dismissed or programmatically cleared.
        interruptionLevel: "passive",
      },
      trigger: null,
    });
  } catch (err) {
    console.warn("showRecordingActiveNotification failed:", err);
  }
}

export async function dismissRecordingActiveNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(RECORDING_ACTIVE_NOTIFICATION_ID);
  } catch {
    // Notification may already be dismissed by user or never presented
  }
}

/**
 * Schedule daily shift reminder notifications based on work schedule.
 * Cancels existing reminders and reschedules for the next 7 days.
 * Called when the schedule changes or app starts.
 */
export async function scheduleShiftReminders(): Promise<void> {
  try {
    const { getSchedule, getScheduleSetting } = await import("../schedule/index");
    const reminderEnabled = await getScheduleSetting("schedule_reminder");
    if (!reminderEnabled) {
      // Cancel any existing shift reminders
      const all = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of all) {
        if (n.content.data?.type === "shift_reminder") {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        }
      }
      return;
    }

    const schedule = await getSchedule();
    const enabled = schedule.filter((s) => s.enabled);
    if (enabled.length === 0) return;

    // Cancel existing shift reminders
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.content.data?.type === "shift_reminder") {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    // Schedule for each enabled day, 10 minutes before start time
    for (const slot of enabled) {
      const [h, m] = slot.startTime.split(":").map(Number);
      let reminderH = h;
      let reminderM = m - 10;
      if (reminderM < 0) {
        reminderM += 60;
        reminderH -= 1;
        if (reminderH < 0) reminderH = 23;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Work hours starting soon",
          body: `Your shift starts at ${slot.startTime}. Ready to track?`,
          data: { type: "shift_reminder", action: "open_dashboard" },
          sound: "default",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: slot.dayOfWeek === 0 ? 1 : slot.dayOfWeek + 1, // expo uses 1=Sunday
          hour: reminderH,
          minute: reminderM,
        },
      });
    }
  } catch (err) {
    console.warn("Failed to schedule shift reminders:", err);
  }
}

/**
 * Registers the device for Expo push notifications and returns the push token
 * string, or null if registration fails (e.g. simulator, Expo Go without a
 * real device, or permission denied).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn("registerForPushNotifications: no EAS project ID found");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (err) {
    // Silently swallow — Expo Go on simulator throws here, physical device may
    // also fail in some environments. Callers should treat null as non-fatal.
    console.warn("registerForPushNotifications failed:", err);
    return null;
  }
}

/**
 * Upgrade detection accuracy when user confirms driving via "Track Trip".
 * The auto-recording is already active — this just improves GPS quality
 * and shows the blue background indicator. Trip auto-finalizes when stopped.
 */
async function startTripFromDetection(): Promise<void> {
  try {
    await upgradeDetectionAccuracy();
  } catch (err) {
    console.error("Failed to upgrade detection accuracy:", err);
  }
}

export function setupNotificationResponseHandler(): void {
  Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data;
    const action = data?.action as string | undefined;
    const actionId = response.actionIdentifier;

    // Handle action buttons pressed from lock screen / notification banner
    if (action === "start_shift" && actionId === "passenger") {
      // User is a passenger — clear buffered coords + auto-recording state
      await cancelAutoRecording(true);
      return;
    }

    if (action === "start_shift" && actionId === "driver") {
      // "Driver" button (background) — just upgrade GPS accuracy for active recording
      try {
        await startTripFromDetection();
      } catch (err) {
        console.error("Track trip from notification failed:", err);
      }
      return;
    }

    if (action === "start_shift" && actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      // Notification body tap — just upgrade GPS accuracy for the active
      // auto-detection recording (same as the "Driver" button). Don't
      // promote to Quick Trip: that starts indefinite background tracking
      // with no auto-timeout, and an accidental tap can produce hours of
      // garbage data. Auto-detection handles trip finalization on its own.
      try {
        await startTripFromDetection();
      } catch (err) {
        console.error("Track trip from notification failed:", err);
      }
      return;
    }

    // Handle trip classification from lock screen
    if (action === "classify_trip" && actionId !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      const tripId = data?.tripId as string | undefined;
      if (tripId && (actionId === "classify_business" || actionId === "classify_personal")) {
        const classification = actionId === "classify_business" ? "business" : "personal";
        try {
          const { syncUpdateTrip } = await import("../sync/actions");
          await syncUpdateTrip(tripId, { classification });
          // Learn from this classification for future auto-classification
          const startLat = data?.startLat as number | undefined;
          const startLng = data?.startLng as number | undefined;
          const endLat = data?.endLat as number | undefined;
          const endLng = data?.endLng as number | undefined;
          if (startLat != null && startLng != null && endLat != null && endLng != null) {
            const { learnFromClassification } = await import("../classification");
            await learnFromClassification({
              startLat, startLng, endLat, endLng,
              classification,
              platformTag: null,
            });
          }
        } catch (err) {
          console.error("Lock screen classification failed:", err);
        }
        return;
      }
      if (tripId && actionId === "delete_trip") {
        try {
          const { syncDeleteTrip } = await import("../sync/actions");
          await syncDeleteTrip(tripId);
        } catch (err) {
          console.error("Lock screen trip delete failed:", err);
        }
        return;
      }
      // Default tap on classify_trip notification — open trips screen
      router.navigate("/(tabs)/trips");
      return;
    }

    // Other notification types — deep link to relevant screen
    switch (action) {
      case "open_dashboard":
        router.navigate("/(tabs)/dashboard");
        break;

      case "open_trips":
        router.navigate("/(tabs)/trips");
        break;

      case "open_unclassified_trips":
        // Trips list filtered to unclassified - the dashboard nudge
        // notification when there are trips waiting for review.
        router.navigate("/(tabs)/trips?filter=unclassified" as any);
        break;

      case "open_trip": {
        // Specific trip needing review (e.g. low GPS quality, possible split).
        const tripId = data?.tripId as string | undefined;
        if (tripId) {
          router.navigate(`/trip-form?id=${tripId}` as any);
        } else {
          router.navigate("/(tabs)/trips");
        }
        break;
      }

      case "open_active_recording":
        // Persistent recording notification + diagnostic stuck-recording alert.
        router.navigate("/active-recording" as any);
        break;

      case "open_insights":
        router.navigate("/insights" as any);
        break;

      case "open_achievements":
        router.navigate("/achievements" as any);
        break;

      case "open_fuel":
        router.navigate("/(tabs)/fuel");
        break;

      case "open_exports":
        router.navigate("/exports" as any);
        break;

      case "open_self_assessment":
        router.navigate("/self-assessment" as any);
        break;

      case "open_settings":
        Linking.openSettings();
        return;

      case "open_billing":
      case "billing":
        router.navigate("/(tabs)/profile");
        break;

      case "open_admin_health":
        router.navigate("/admin-health" as any);
        break;

      case "open_vehicle": {
        // Vehicle expiry reminder (MOT / tax). Opens the vehicle edit form
        // so the driver can mark renewal complete or jump to gov.uk.
        const vehicleId = data?.vehicleId as string | undefined;
        if (vehicleId) {
          router.navigate(`/vehicle-form?id=${vehicleId}` as any);
        } else {
          router.navigate("/(tabs)/profile");
        }
        break;
      }

      default:
        router.navigate("/(tabs)/dashboard");
        break;
    }
  });
}
