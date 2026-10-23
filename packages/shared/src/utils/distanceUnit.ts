// Miles or kilometres on screen (Simon, 23 Oct 2026). Display only: every
// stored distance is miles, and tax figures, the 10,000-mile threshold and
// every download stay in miles because HMRC rates are per mile. Callers pass
// miles in and get the driver's unit out.
import type { DistanceUnit } from "../types/index.js";

export const KM_PER_MILE = 1.609344;

export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE;
}

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

/** Anything that isn't exactly "km" (missing, old server, junk) is miles. */
export function distanceUnitOf(raw: unknown): DistanceUnit {
  return raw === "km" ? "km" : "miles";
}

/** A distance stored in miles, in the driver's unit. */
export function distanceIn(miles: number, unit: DistanceUnit): number {
  return unit === "km" ? milesToKm(miles) : miles;
}

/** A figure typed in the driver's unit, back to miles for storing. */
export function distanceToMiles(value: number, unit: DistanceUnit): number {
  return unit === "km" ? kmToMiles(value) : value;
}

/**
 * "short" is "mi" / "km" (beside a number), "word" is "miles" / "km" (where
 * the screen spells out miles), "spoken" is "miles" / "kilometres" (screen
 * reader labels).
 */
export type DistanceUnitStyle = "short" | "word" | "spoken";

export function distanceUnitLabel(unit: DistanceUnit, style: DistanceUnitStyle = "short"): string {
  if (unit === "km") return style === "spoken" ? "kilometres" : "km";
  return style === "short" ? "mi" : "miles";
}

export interface FormatDistanceOptions {
  /** Decimal places. Default 1. */
  decimals?: number;
  /** Always show `decimals` places (like toFixed). Default: up to `decimals`. */
  fixed?: boolean;
  /** Label style. Default "short". */
  style?: DistanceUnitStyle;
  /** Join number and unit with a non-breaking space. */
  nbsp?: boolean;
  /** Number only, no unit. */
  bare?: boolean;
}

/** The number alone, en-GB grouped ("1,234.5"). */
export function formatDistanceNumber(miles: number, unit: DistanceUnit, opts: FormatDistanceOptions = {}): string {
  const decimals = opts.decimals ?? 1;
  return distanceIn(miles, unit).toLocaleString("en-GB", {
    minimumFractionDigits: opts.fixed ? decimals : 0,
    maximumFractionDigits: decimals,
  });
}

/** Miles in, "12.3 mi" or "19.8 km" out. Same shape as formatMiles for miles. */
export function formatDistance(miles: number, unit: DistanceUnit, opts: FormatDistanceOptions = {}): string {
  const n = formatDistanceNumber(miles, unit, opts);
  if (opts.bare) return n;
  return `${n}${opts.nbsp ? " " : " "}${distanceUnitLabel(unit, opts.style)}`;
}
