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
