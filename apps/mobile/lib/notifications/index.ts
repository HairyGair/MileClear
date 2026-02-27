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
      body: "Start recording your mileage?",
      data: { action: "start_shift" },
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

export function setupNotificationResponseHandler(): void {
  Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data;
    const action = data?.action as string | undefined;

    switch (action) {
      case "start_shift": {
        try {
          const res = await syncStartShift();
          const shift = res.data;

          const hasPermission = await requestLocationPermissions();
          if (hasPermission) {
            await startShiftTracking(shift.id);
          }

          // Transfer buffered detection coordinates into shift_coordinates
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
        } catch (err) {
          console.error("Auto-start shift failed:", err);
        }

        router.navigate("/(tabs)/dashboard");
        break;
      }

      case "open_dashboard":
        router.navigate("/(tabs)/dashboard");
        break;

      case "open_trips":
        router.navigate("/(tabs)/trips");
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
