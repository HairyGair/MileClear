// Saved places ("Home", "Depot") from this phone's database, for naming the
// ends of a trip. The Trips list and the trip screen both read them here, so
// a trip has the same names on both (PROPOSALS T-B4).

import { getDatabase } from "../db";
import type { SavedPlace } from "./placeLabel";

export async function loadSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ name: string; latitude: number; longitude: number; radius_meters: number }>(
      "SELECT name, latitude, longitude, radius_meters FROM saved_locations"
    );
    return rows.map((r) => ({ name: r.name, lat: r.latitude, lng: r.longitude, radiusMeters: r.radius_meters }));
  } catch {
    return [];
  }
}
