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

// ── Odometer boxes on the fuel and trip forms ────────────────────────
// Each box remembers the unit its text is in (boxUnit) and whether the driver
// has typed in it. Miles: the forms keep their old parsing exactly (a stored
// figure prefills as String(miles), parseFloat reads it back). A km car: the
// untouched box is prefilled in km and re-prefilled when the car (unit)
// changes; untouched, the stored figure goes back unchanged; typed, it is
// read in the unit it was typed in and converted to miles once.

/** The box's text for a stored miles figure, in `unit` (miles: String(miles), as before). */
export function odometerBoxText(miles: number | null | undefined, unit: OdometerUnit): string {
  if (miles == null || !Number.isFinite(miles)) return "";
  return unit === "km" ? String(Math.round(milesToKm(miles))) : String(miles);
}

/**
 * The number a box stands for, in miles, where the old code called
 * parseFloat(text). Miles: exactly parseFloat(text) (0, negatives and NaN
 * pass through as before). km: the stored figure when untouched, otherwise
 * parseFloat(text) converted once (non-numbers pass through unchanged).
 */
export function odometerBoxValue(
  text: string,
  box: { unit: OdometerUnit; touched: boolean; loadedMiles?: number | null }
): number {
  if (box.unit !== "km") return parseFloat(text);
  if (!box.touched && box.loadedMiles != null) return box.loadedMiles;
  const n = parseFloat(text);
  return Number.isFinite(n) ? odometerUnitToMiles(n, "km") : n;
}

/** One odometer box on a form: its text, the stored figure it was filled
 *  from, the unit its text is in, and whether the driver typed in it. */
export interface OdometerBoxState {
  text: string;
  loadedMiles: number | null;
  unit: OdometerUnit;
  touched: boolean;
}

export type OdometerBoxEvent =
  /** A stored figure arrives (edit): filled in the car's unit if known (miles: String(miles), as before). */
  | { type: "load"; miles: number | null | undefined; unit?: OdometerUnit }
  /** The driver typed: the text wins from now on, in the unit it's in. */
  | { type: "type"; text: string }
  /** The form set the text itself (a restored draft): not a typed change. */
  | { type: "set"; text: string }
  /** The car's unit is known or changed (cars loaded, another car picked). */
  | { type: "carUnit"; unit: OdometerUnit };

export const ODOMETER_BOX_EMPTY: OdometerBoxState = { text: "", loadedMiles: null, unit: "miles", touched: false };

/**
 * The box's next state. Miles cars never see a "carUnit" change, so they keep
 * the old text exactly. An untouched box follows the car's unit (re-filled
 * from the stored miles, so switching miles <-> km never misreads it); a
 * typed box keeps its text and the unit it was typed in.
 */
export function odometerBoxReduce(s: OdometerBoxState, e: OdometerBoxEvent): OdometerBoxState {
  switch (e.type) {
    case "load": {
      const miles = e.miles ?? null;
      const unit = e.unit ?? "miles";
      return { text: miles == null ? "" : odometerBoxText(miles, unit), loadedMiles: miles, unit, touched: false };
    }
    case "type":
      return { ...s, text: e.text, touched: true };
    case "set":
      return { ...s, text: e.text };
    case "carUnit":
      if (s.touched || e.unit === s.unit) return s;
      return { ...s, unit: e.unit, text: s.loadedMiles != null ? odometerBoxText(s.loadedMiles, e.unit) : s.text };
  }
}

/** The box as miles, where the old code called parseFloat(text). */
export function odometerBoxMiles(s: OdometerBoxState, text: string = s.text): number {
  return odometerBoxValue(text, { unit: s.unit, touched: s.touched, loadedMiles: s.loadedMiles });
}
