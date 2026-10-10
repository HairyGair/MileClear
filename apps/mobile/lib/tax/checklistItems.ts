import type { SaChecklistItem } from "@mileclear/shared";

/**
 * The checklist as shown. When "Trips logged" needs attention (no trips at
 * all for the year) the mileage item says the same thing ("Add a past
 * trip"), so it is left out. Harmless if the server already omits it.
 */
export function visibleChecklistItems(items: SaChecklistItem[]): SaChecklistItem[] {
  const noTrips = items.some(
    (i) => i.id === "trips_sorted" && i.status === "attention" && i.action === "add_trip",
  );
  return noTrips ? items.filter((i) => i.id !== "mileage_claim") : items;
}
