// Which car a trip the app records on its own goes on (Colin Mercer, 24 Oct
// 2026). It used to copy the car from the most recent trip, so one trip moved
// to a second car dragged every trip after it there, whatever the primary
// car was. Now: the primary car, else the only car, the same rule the server
// uses for a trip that arrives without one (services/vehicleDefaults.ts).
//
// Detection runs in the background with no network to rely on, so the answer
// is remembered on the phone (tracking_state) each time the car list loads.
// A stale id is harmless: the server strips a car that isn't the driver's
// and falls back to its own default.

import { getDatabase } from "../db/index";
import { cacheCarLinks, forgetCarBluetooth } from "./carBluetooth";

const KEY = "default_vehicle";

interface CarLike {
  id: string;
  isPrimary?: boolean | null;
  bluetoothName?: string | null;
  bluetoothId?: string | null;
}

/** The primary car, else the only car, else null (2+ cars, none primary). */
export function pickDefaultCar(cars: CarLike[]): string | null {
  const primary = cars.find((c) => c.isPrimary);
  if (primary) return primary.id;
  return cars.length === 1 ? cars[0].id : null;
}

/** Called with every car list the app loads. Best effort. */
export async function rememberCars(cars: CarLike[]): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      KEY,
      JSON.stringify({ id: pickDefaultCar(cars) }),
    ]);
  } catch {
    /* best effort */
  }
  // The car Bluetooth links, read at finalize the same way (carBluetooth.ts).
  await cacheCarLinks(cars);
}

/** On sign out, so the next driver on the phone never gets this one's car. */
export async function forgetCars(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [KEY]);
  } catch {
    /* best effort */
  }
  await forgetCarBluetooth();
}

/**
 * The car for a recorded trip. Falls back to the last trip's car only when
 * the phone has no remembered default (car list never loaded on this build,
 * or 2+ cars with none primary), which is what happened before.
 */
export async function carForRecordedTrip(): Promise<string | undefined> {
  let db: Awaited<ReturnType<typeof getDatabase>>;
  try {
    db = await getDatabase();
  } catch {
    return undefined; // the trip just has no car; the server adds its default
  }
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [KEY]
    );
    const id = row ? (JSON.parse(row.value) as { id?: unknown }).id : null;
    if (typeof id === "string" && id) return id;
  } catch {
    /* fall through to the last trip's car */
  }
  try {
    const lastTrip = await db.getFirstAsync<{ vehicle_id: string | null }>(
      "SELECT vehicle_id FROM trips WHERE vehicle_id IS NOT NULL ORDER BY started_at DESC LIMIT 1"
    );
    return lastTrip?.vehicle_id ?? undefined;
  } catch {
    return undefined;
  }
}
