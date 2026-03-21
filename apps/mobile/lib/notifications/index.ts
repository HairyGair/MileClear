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

    if (action === "start_shift" && (actionId === "driver" || actionId === Notifications.DEFAULT_ACTION_IDENTIFIER)) {
      // "Driver" button or regular tap — upgrade GPS accuracy for active recording
      try {
        await startTripFromDetection();
      } catch (err) {
        console.error("Track trip from notification failed:", err);
      }

      // Only navigate to dashboard if app was opened (regular tap)
      if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        router.navigate("/(tabs)/dashboard");
      }
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

      case "open_insights":
        router.navigate("/insights" as any);
        break;

      case "open_achievements":
        router.navigate("/achievements" as any);
        break;

      case "open_settings":
        Linking.openSettings();
        return;

      case "billing":
        router.navigate("/(tabs)/profile");
        break;

      default:
        router.navigate("/(tabs)/dashboard");
        break;
    }
  });
}
