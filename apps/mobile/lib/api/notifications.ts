import { apiRequest } from "./index";

export function registerPushToken(pushToken: string) {
  return apiRequest<{ data: { message: string } }>("/notifications/push-token", {
    method: "POST",
    body: JSON.stringify({ pushToken }),
  });
}

export function deregisterPushToken() {
  return apiRequest<{ data: { message: string } }>("/notifications/push-token", {
    method: "DELETE",
  });
}

// Per-device push-to-start token for Live Activities (iOS 17.2+). Lets the
// server start the Dynamic Island on a background-detected drive.
export function registerLiveActivityToken(token: string) {
  return apiRequest<{ data: { registered: boolean } }>("/notifications/la-token", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function deregisterLiveActivityToken() {
  return apiRequest<{ data: { deregistered: boolean } }>("/notifications/la-token", {
    method: "DELETE",
  });
}
