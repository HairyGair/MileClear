import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { syncStartShift } from "../sync/actions";
import {
  requestLocationPermissions,
  startShiftTracking,
} from "../tracking/index";
import { getAndClearBufferedCoordinates } from "../tracking/detection";
import { getDatabase } from "../db/index";

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
        identifier: "track_trip",
        buttonTitle: "Track Trip",
        options: { opensAppToForeground: false },
      },
      {
        identifier: "not_driving",
        buttonTitle: "Not Driving",
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
      title: "Looks like you're driving",
      body: "Tap 'Track Trip' to record your mileage from when you set off.",
      data: { action: "start_shift" },
      categoryIdentifier: "driving_detected",
    },
    trigger: null,
  });
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

async function startShiftWithBufferedCoords(): Promise<void> {
  const res = await syncStartShift();
  const shift = res.data;

  const hasPermission = await requestLocationPermissions();
  if (hasPermission) {
    await startShiftTracking(shift.id);
  }

  // Transfer buffered detection coordinates into shift_coordinates
  // so the trip starts from where driving actually began
  const buffered = await getAndClearBufferedCoordinates();
  if (buffered.length > 0) {
    const db = await getDatabase();
    for (const coord of buffered) {
      await db.runAsync(
        `INSERT INTO shift_coordinates (shift_id, lat, lng, speed, accuracy, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [shift.id, coord.lat, coord.lng, coord.speed, coord.accuracy, coord.recorded_at]
      );
    }
  }
}

export function setupNotificationResponseHandler(): void {
  Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data;
    const action = data?.action as string | undefined;
    const actionId = response.actionIdentifier;

    // Handle action buttons pressed from lock screen / notification banner
    if (action === "start_shift" && actionId === "not_driving") {
      // User confirmed they're not driving — clear buffered coords
      await getAndClearBufferedCoordinates();
      return;
    }

    if (action === "start_shift" && (actionId === "track_trip" || actionId === Notifications.DEFAULT_ACTION_IDENTIFIER)) {
      // "Track Trip" button or regular tap — start shift with buffered coords
      try {
        await startShiftWithBufferedCoords();
      } catch (err) {
        console.error("Auto-start shift failed:", err);
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

      case "billing":
        router.navigate("/(tabs)/profile");
        break;

      default:
        router.navigate("/(tabs)/dashboard");
        break;
    }
  });
}
