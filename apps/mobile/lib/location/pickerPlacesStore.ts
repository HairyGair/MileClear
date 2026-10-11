// The places the From/To pickers offer before the driver types anything:
// saved places and the ends of recent trips, read from the phone so they work
// with no signal. The choosing rules are in recentPlaces.ts (pure, tested).

import { haversineDistance } from "@mileclear/shared";
import { getDatabase } from "../db";
import { selectPickerPlaces, type PickerPlaces, type RecentTripRow, type SavedPlaceRow } from "./recentPlaces";

// Enough trips to find eight distinct places for most drivers without
// reading the whole table every time the search box opens.
const RECENT_TRIP_SCAN = 120;

export interface PickerPlaceSource {
  places: PickerPlaces;
  /** location_type by saved place id, for the chip icons. */
  types: Record<string, string>;
}

export async function loadPickerPlaceSource(): Promise<PickerPlaceSource> {
  const db = await getDatabase();
  const [savedPlaces, trips] = await Promise.all([
    db.getAllAsync<SavedPlaceRow>(
      `SELECT id, name, latitude, longitude, location_type FROM saved_locations
       ORDER BY CASE location_type WHEN 'home' THEN 0 WHEN 'work' THEN 1 ELSE 2 END,
                name COLLATE NOCASE ASC`
    ),
    db.getAllAsync<RecentTripRow>(
      `SELECT started_at, ended_at, start_lat, start_lng, start_address,
              end_lat, end_lng, end_address
       FROM trips ORDER BY started_at DESC LIMIT ?`,
      [RECENT_TRIP_SCAN]
    ),
  ]);
  const types: Record<string, string> = {};
  for (const s of savedPlaces) types[s.id] = s.location_type ?? "custom";
  return { places: selectPickerPlaces({ trips, savedPlaces, haversine: haversineDistance }), types };
}

export async function loadPickerPlaces(): Promise<PickerPlaces> {
  return (await loadPickerPlaceSource()).places;
}
