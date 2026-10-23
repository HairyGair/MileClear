// A car's odometer can read in km (Vehicle.odometerUnit, 23 Oct 2026, New
// Zealand first). Readings are always stored in miles, so a km car's reading
// is converted to miles once as it's saved and back to km to show. The rules
// live in shared (utils/odometerUnit.ts); these are the app's helpers on top.
// Miles cars are untouched: every function here returns its input for "miles".
import {
  odometerMilesToUnit,
  odometerUnitOf as sharedUnitOf,
  odometerUnitShort,
  odometerUnitToMiles,
  odometerUnitWord,
  type OdometerUnit,
} from "@mileclear/shared";
import type { VehicleOdometer } from "../api/odometer";
import { parseReadingInput, sanitiseReadingInput } from "./logic";

export type { OdometerUnit };

export function odometerUnitOf(raw: unknown): OdometerUnit {
  return sharedUnitOf(raw);
}

/** The typed reading as miles text, for a check or save that works in miles. */
export function readingTextToMilesText(text: string, unit: OdometerUnit): string {
  if (unit !== "km") return text;
  const cleaned = sanitiseReadingInput(text.trim());
  if (cleaned === "" || cleaned === ".") return cleaned;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return cleaned;
  return String(odometerUnitToMiles(n, unit));
}

/** A stored miles figure in the car's unit. */
export function milesInUnit(miles: number, unit: OdometerUnit): number {
  return odometerMilesToUnit(miles, unit);
}

/** "km" or "miles", for labels. */
export function unitWord(unit: OdometerUnit): string {
  return odometerUnitWord(unit);
}

/** "km" or "mi", for the short suffix. */
export function unitShort(unit: OdometerUnit): string {
  return odometerUnitShort(unit);
}

/** The vehicle's odometer with every stored figure in the car's unit, so the
 *  checks and their wording work in km for a km car. Miles: the same object. */
export function odometerInUnit(odo: VehicleOdometer | null, unit: OdometerUnit): VehicleOdometer | null {
  if (!odo || unit !== "km") return odo;
  const c = odo.current;
  return {
    ...odo,
    current: c
      ? {
          ...c,
          miles: milesInUnit(c.miles, unit),
          basis: { ...c.basis, readingMiles: milesInUnit(c.basis.readingMiles, unit) },
          tripMilesSince: milesInUnit(c.tripMilesSince, unit),
        }
      : c,
    readings: odo.readings.map((r) => ({ ...r, readingMiles: milesInUnit(r.readingMiles, unit) })),
  };
}

/** The figure to store for a typed reading: miles, converted once for a km
 *  car. Null when the text isn't a reading. Every update sheet saves through this. */
export function readingForSave(text: string, unit: OdometerUnit): number | null {
  const parsed = parseReadingInput(text);
  if (parsed.kind !== "ok") return null;
  return odometerUnitToMiles(parsed.miles, unit);
}
