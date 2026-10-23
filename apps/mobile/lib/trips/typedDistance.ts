// A distance typed into a trip's box, in the driver's unit (Distances in
// Settings), to the miles the trip saves with. The 1,000-mile cap applies
// after converting, so "1200" in a km box (746 mi) is fine and "1200" in a
// miles box is not, and a km driver can't slip past it with a bigger number.
//
// Pure.

import { distanceToMiles, type DistanceUnit } from "@mileclear/shared";
import { parseTypedMilesText } from "./typedMiles";

/** No single trip is longer than this; a bigger figure is a typo. */
export const MAX_TYPED_TRIP_MILES = 1000;

/**
 * "12.4", "12,4", "1,000", "12 km", "12 mi" in `unit` -> miles to 2 places,
 * or null when it isn't a number above 0 and up to MAX_TYPED_TRIP_MILES.
 */
export function typedTripMiles(text: string, unit: DistanceUnit = "miles"): number | null {
  const bare = text.trim().replace(/\s*(km|kms|kilomet(?:re|er)s?)$/i, "");
  const n = parseTypedMilesText(bare);
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  const miles = distanceToMiles(n, unit);
  if (miles > MAX_TYPED_TRIP_MILES) return null;
  return Math.round(miles * 100) / 100;
}

/**
 * The driver typed in a distance box and what's there can't be saved (0,
 * junk, or over the cap). Saving is refused until it's fixed, so a figure
 * the box shows is never swapped for an older one behind the scenes.
 */
export function typedDistanceRejected(args: { typed: boolean; text: string; unit: DistanceUnit }): boolean {
  if (!args.typed || args.text.trim() === "") return false;
  return typedTripMiles(args.text, args.unit) == null;
}

/** The line under a refused box. */
export function typedDistanceProblem(unit: DistanceUnit): string {
  return unit === "km"
    ? "Type a distance above 0 and up to 1,609 km."
    : "Type a distance above 0 and up to 1,000 miles.";
}
