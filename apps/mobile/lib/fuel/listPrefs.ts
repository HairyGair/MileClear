// Remembers the fuel tab's grade and sort on this phone (19 Oct 2026). Until
// the driver picks a grade, it follows their vehicle (mapFuelFor).

import { getDatabase } from "../db/index";
import { fuelByKey, type MapFuel } from "./mapFuel";
import type { StationSort } from "./stationList";

const KEY = "fuel_list_prefs";

export interface FuelListPrefs {
  fuel: MapFuel | null;
  sort: StationSort;
}

export async function loadFuelListPrefs(): Promise<FuelListPrefs> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [KEY]
    );
    const saved = row ? JSON.parse(row.value) : {};
    return {
      fuel: fuelByKey(saved.fuel),
      sort: saved.sort === "cheapest" ? "cheapest" : "nearest",
    };
  } catch {
    return { fuel: null, sort: "nearest" };
  }
}

export async function saveFuelListPrefs(prefs: { fuel: MapFuel | null; sort: StationSort }): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      KEY,
      JSON.stringify({ fuel: prefs.fuel?.key ?? null, sort: prefs.sort }),
    ]);
  } catch {
    /* best effort */
  }
}
