// The Odometer card on Home (15 Oct 2026). Tom asked for the running odometer
// on the main page "rather than needing to dive into other windows".
//
// Pure and unit-tested: which vehicles show, the figure, the "est." mark and
// the small line under it. The card is hidden when no vehicle has a reading.
// The same rules are ported to apps/web odometerLogic.ts (homeOdometer*).

import type { OdometerCurrent, OdometerReadingSource, VehicleListOdometer } from "../api/odometer";
import { formatOdo, shortDate } from "../odometer/logic";

export const MAX_HOME_ODOMETER_ROWS = 3;

/** What Home needs from a vehicle in the /vehicles list. */
export interface HomeOdometerVehicle {
  id: string;
  make?: string | null;
  model?: string | null;
  registrationPlate?: string | null;
  isPrimary?: boolean | null;
  odometer?: VehicleListOdometer | null;
}

export interface HomeOdometerRow {
  vehicleId: string;
  name: string;
  miles: number;
  isEstimated: boolean;
  /** The reading the figure is built on; null when it could not be read. */
  basis: HomeOdometerBasis | null;
}

export interface HomeOdometerBasis {
  /** ISO 8601. */
  readAt: string;
  source: OdometerReadingSource;
  tripMilesSince: number;
}

export function basisOf(current: OdometerCurrent | null | undefined): HomeOdometerBasis | null {
  if (!current || !current.basis) return null;
  return {
    readAt: current.basis.readAt,
    source: current.basis.source,
    tripMilesSince: current.tripMilesSince,
  };
}

function hasFigure(v: HomeOdometerVehicle): v is HomeOdometerVehicle & { odometer: VehicleListOdometer } {
  const o = v.odometer;
  return !!o && typeof o.miles === "number" && Number.isFinite(o.miles) && o.miles >= 0;
}

export function homeVehicleName(v: Pick<HomeOdometerVehicle, "make" | "model" | "registrationPlate">): string {
  const name = [v.make, v.model].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  if (name) return name;
  const plate = (v.registrationPlate ?? "").trim();
  return plate || "Your vehicle";
}

/**
 * The vehicles with a reading, primary first, then in list order, at most
 * three. Empty means the card is hidden.
 */
export function selectHomeOdometerVehicles(
  vehicles: readonly HomeOdometerVehicle[] | null | undefined
): Array<HomeOdometerVehicle & { odometer: VehicleListOdometer }> {
  if (!vehicles) return [];
  const withFigure = vehicles.filter(hasFigure);
  const primary = withFigure.filter((v) => v.isPrimary);
  const rest = withFigure.filter((v) => !v.isPrimary);
  return [...primary, ...rest].slice(0, MAX_HOME_ODOMETER_ROWS);
}

/** "41,872 mi" (the "est." mark is drawn beside it). */
export function homeOdometerFigure(miles: number): string {
  return `${formatOdo(miles)} mi`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * The small line under the figure, from the reading it is built on:
 *   "Your reading on Wed 8 Oct, plus 72 mi of trips"
 *   "Your reading today"
 *   "From your fuel log on Mon 6 Oct, plus 140 mi of trips"
 * Null when the basis is missing or unreadable.
 */
export function homeOdometerLine(
  row: Pick<HomeOdometerRow, "isEstimated" | "basis">,
  now: Date = new Date()
): string | null {
  const basis = row.basis;
  if (!basis) return null;
  const at = new Date(basis.readAt);
  if (Number.isNaN(at.getTime())) return null;
  const when = sameDay(at, now) ? "today" : `on ${shortDate(at)}`;
  const start =
    basis.source === "fuel"
      ? `From your fuel log ${when}`
      : basis.source === "trip"
        ? `From a trip ${when}`
        : `Your reading ${when}`;
  const trips = Math.round(Number.isFinite(basis.tripMilesSince) ? basis.tripMilesSince : 0);
  if (!row.isEstimated || trips < 1) return start;
  return `${start}, plus ${formatOdo(trips)} mi of trips`;
}

export function homeOdometerA11y(row: HomeOdometerRow, now: Date = new Date()): string {
  const state = row.isEstimated ? "estimated" : "recorded";
  const text = homeOdometerLine(row, now);
  const line = text ? ` ${text}.` : "";
  return `${row.name} odometer, ${state}, ${formatOdo(row.miles)} miles.${line}`;
}

export function toHomeOdometerRows(
  vehicles: ReadonlyArray<HomeOdometerVehicle & { odometer: VehicleListOdometer }>,
  bases: ReadonlyMap<string, HomeOdometerBasis | null>
): HomeOdometerRow[] {
  return vehicles.map((v) => ({
    vehicleId: v.id,
    name: homeVehicleName(v),
    miles: v.odometer.miles,
    isEstimated: !!v.odometer.isEstimated,
    basis: bases.get(v.id) ?? null,
  }));
}

// ── Last known figure, kept on this phone for when there is no signal ──

function parseBasis(raw: unknown): HomeOdometerBasis | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.readAt !== "string" || Number.isNaN(new Date(b.readAt).getTime())) return null;
  const source: OdometerReadingSource = b.source === "fuel" || b.source === "trip" ? b.source : "user";
  const trips = typeof b.tripMilesSince === "number" && Number.isFinite(b.tripMilesSince) ? b.tripMilesSince : 0;
  return { readAt: b.readAt, source, tripMilesSince: trips };
}

/** Parse what was saved; anything unreadable is "nothing saved" (never NaN). */
export function parseHomeOdometerCache(raw: string | null | undefined): HomeOdometerRow[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const rows: HomeOdometerRow[] = [];
    for (const r of parsed) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      if (typeof o.vehicleId !== "string" || typeof o.name !== "string") continue;
      if (typeof o.miles !== "number" || !Number.isFinite(o.miles) || o.miles < 0) continue;
      rows.push({
        vehicleId: o.vehicleId,
        name: o.name,
        miles: o.miles,
        isEstimated: o.isEstimated === true,
        basis: parseBasis(o.basis),
      });
    }
    return rows.slice(0, MAX_HOME_ODOMETER_ROWS);
  } catch {
    return null;
  }
}
