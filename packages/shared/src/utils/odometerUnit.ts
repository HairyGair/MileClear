// A car's odometer can read in km (Vehicle.odometerUnit, 23 Oct 2026, New
// Zealand first). Readings are always stored in miles. The update-reading
// sheet and dialog work in the car's unit: the stored figures are turned into
// km to check and show, the typed km reading is turned into miles once, as it
// is saved, and the check wording says km. Miles cars are untouched: every
// function here returns its input for anything but "km".
import { kmToMiles, milesToKm } from "./distanceUnit.js";

export type OdometerUnit = "miles" | "km";

/** "km" when the vehicle says so; anything else (miles, null, missing) is miles. */
export function odometerUnitOf(raw: unknown): OdometerUnit {
  return raw === "km" ? "km" : "miles";
}

/** A stored miles figure in the car's unit. */
export function odometerMilesToUnit(miles: number, unit: OdometerUnit): number {
  return unit === "km" ? milesToKm(miles) : miles;
}

/** A figure typed in the car's unit, as miles to store. Two decimals keep the
 *  round trip exact to the whole km shown (45,123 km -> 28,038.13 miles -> 45,123 km). */
export function odometerUnitToMiles(value: number, unit: OdometerUnit): number {
  return unit === "km" ? Math.round(kmToMiles(value) * 100) / 100 : value;
}

/** Check and outcome wording in the car's unit ("miles" / "mile" / "mi" -> "km"). */
export function odometerUnitWords(text: string, unit: OdometerUnit): string {
  if (unit !== "km") return text;
  return text.replace(/\bmiles\b/g, "km").replace(/\bmile\b/g, "km").replace(/\bmi\b/g, "km");
}

/** "km" or "miles", for labels and suffixes. */
export function odometerUnitWord(unit: OdometerUnit): string {
  return unit === "km" ? "km" : "miles";
}

/** "km" or "mi", for short suffixes. */
export function odometerUnitShort(unit: OdometerUnit): string {
  return unit === "km" ? "km" : "mi";
}
