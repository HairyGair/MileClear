// Events from the "Add a past shift" screen (Oct 2026), the same way the trip
// form logs its own (lib/events/tripForm.ts). The save itself is logged by
// the server as shift.past_added. Fire-and-forget: never throws, never waits.

import { apiRequest } from "../api/index";

export type PastShiftEvent =
  | "past_shift.opened"
  | "past_shift.next_trip_tapped"
  | "past_shift.mode_changed"
  | "past_shift.overlap_warned"
  | "past_shift.overlap_answered"
  | "past_shift.offline_blocked"
  | "past_shift.save_unconfirmed"
  | "past_shift.left";

export function trackPastShift(type: PastShiftEvent, metadata?: Record<string, unknown>): void {
  try {
    apiRequest("/user/event", {
      method: "POST",
      body: JSON.stringify({ type, metadata }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}
