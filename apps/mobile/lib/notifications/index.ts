import * as Notifications from "expo-notifications";
import { router } from "expo-router";

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
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.action === "start_shift") {
      router.navigate("/(tabs)/dashboard");
    }
  });
}
