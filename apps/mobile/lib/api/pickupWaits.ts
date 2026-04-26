import { apiRequest } from "./index";
import type { PickupWait } from "@mileclear/shared";

export function startPickupWait(input?: {
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  platform?: string;
}) {
  return apiRequest<{ data: PickupWait }>("/pickup-waits/start", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export function endPickupWait(id: string) {
  return apiRequest<{ data: PickupWait }>(`/pickup-waits/${id}/end`, {
    method: "POST",
  });
}

// Returns null if the user has no in-flight wait. Used on launch to restore
// timer state after app suspension.
export function fetchActivePickupWait() {
  return apiRequest<{ data: PickupWait | null }>("/pickup-waits/active");
}
