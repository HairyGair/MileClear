import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { startShift } from "../api/shifts";
import {
  requestLocationPermissions,
  startShiftTracking,
} from "../tracking/index";
import { getAndClearBufferedCoordinates } from "../tracking/detection";
import { getDatabase } from "../db/index";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

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

export function setupNotificationResponseHandler(): void {
  Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data;
    if (data?.action === "start_shift") {
      try {
        const res = await startShift();
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
    }
  });
}
