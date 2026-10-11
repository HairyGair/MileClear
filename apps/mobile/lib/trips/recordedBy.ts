/**
 * How the phone says it recorded a trip, sent with every new trip (decision
 * T-F, Oct 2026) so the Trips tab can label it. A fact only: nothing in
 * recording or sync reads it. Older servers drop the field.
 */
import type { TripRecordedBy } from "@mileclear/shared";

/** The shift_coordinates lock ids a Start Trip trail is stored under. */
const START_TRIP_TRAIL_IDS = new Set(["__quick_trip__", "__arrived_pending__"]);

/**
 * Trips cut from a shift_coordinates trail: a Start Trip trail (live, or kept
 * after "I've Arrived") or a real shift's.
 */
export function recordedByForTrail(shiftId: string): TripRecordedBy {
  return START_TRIP_TRAIL_IDS.has(shiftId) ? "start_trip" : "shift";
}

/** The trip form: the past-trip form is typed in; anything else is Start Trip. */
export function recordedByForForm(mode: string): TripRecordedBy {
  return mode === "manual" ? "added_by_hand" : "start_trip";
}
