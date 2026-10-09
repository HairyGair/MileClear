// The "Odometer 45,210 to 45,262 est." line under a day header on the Trips list.
// Copy comes from the odometer spec: " est." when either figure is estimated,
// "(recorded)" when both are real readings. Shown only when the day's trips
// are all in one vehicle and that vehicle has a figure for the day.

export interface OdometerDayRow {
  date: string;
  vehicleId: string;
  opening: number | null;
  openingRecorded: boolean;
  closing: number | null;
  closingRecorded: boolean;
}

export interface OdometerLine {
  text: string;
  vehicleId: string;
  date: string;
  label: string;
}

const NUM = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function odometerLineFor(
  dayKey: string,
  dayTrips: { vehicleId: string | null }[],
  rows: OdometerDayRow[]
): OdometerLine | null {
  const forDay = rows.filter((r) => r.date === dayKey && r.opening != null && r.closing != null);
  if (forDay.length === 0) return null;
  const ids = new Set(dayTrips.map((t) => t.vehicleId));
  let row: OdometerDayRow | undefined;
  if (ids.size === 1) {
    const only = [...ids][0];
    row = only ? forDay.find((r) => r.vehicleId === only) : forDay.length === 1 ? forDay[0] : undefined;
  }
  if (!row || row.opening == null || row.closing == null) return null;
  const estimated = !(row.openingRecorded && row.closingRecorded);
  const base = `Odometer ${NUM.format(row.opening)} to ${NUM.format(row.closing)}`;
  const text = estimated ? `${base} est.` : `${base} (recorded)`;
  const label = `Odometer at the start of the day ${NUM.format(row.opening)}, at the end ${NUM.format(row.closing)}${
    estimated ? ", estimated" : ""
  }. Opens the odometer log.`;
  return { text, vehicleId: row.vehicleId, date: dayKey, label };
}
