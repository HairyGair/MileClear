// A car's odometer can read in km (Vehicle.odometerUnit, 23 Oct 2026, New
// Zealand first). Readings are always stored in miles, so a km car's reading
// is converted to miles as it's saved and back to km to show. Miles cars are
// untouched: every function here returns its input for "miles".
import { kmToMiles, milesToKm } from "@mileclear/shared";
import { sanitiseReadingInput } from "./logic";

export type OdometerUnit = "miles" | "km";

export function odometerUnitOf(raw: unknown): OdometerUnit {
  return raw === "km" ? "km" : "miles";
}

/** The typed reading as miles text, for the checks and the save (which work in miles). */
export function readingTextToMilesText(text: string, unit: OdometerUnit): string {
  if (unit !== "km") return text;
  const cleaned = sanitiseReadingInput(text.trim());
  if (cleaned === "" || cleaned === ".") return cleaned;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return cleaned;
  // Two decimals keep the round trip exact to the km shown (45,123 km -> 28,038.13 miles -> 45,123 km).
  return String(Math.round(kmToMiles(n) * 100) / 100);
}

/** A stored miles figure in the car's unit. */
export function milesInUnit(miles: number, unit: OdometerUnit): number {
  return unit === "km" ? milesToKm(miles) : miles;
}

/** "km" or "miles", for labels. */
export function unitWord(unit: OdometerUnit): string {
  return unit === "km" ? "km" : "miles";
}

/** "km" or "mi", for the short suffix. */
export function unitShort(unit: OdometerUnit): string {
  return unit === "km" ? "km" : "mi";
}
