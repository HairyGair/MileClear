// Places offered in the From/To picker before the driver types anything.
//
// Chris Saunders, 17 Sep 2026: adding a trip by hand he typed "304 West
// Wycombe Road" and the address search could only offer 307. He had driven
// to 304 before, so the address was already on the phone in his own trips.
// This picks the places worth offering: the driver's saved places first,
// then the ends of recent trips, one row per spot.
//
// Pure so it can be tested without SQLite or React.

/** Two points closer than this count as the same place. */
export const SAME_PLACE_METRES = 75;
export const SAVED_PLACES_LIMIT = 6;
export const RECENT_PLACES_LIMIT = 8;

const METRES_PER_MILE = 1609.344;

export interface RecentTripRow {
  started_at: string;
  ended_at: string | null;
  start_lat: number | null;
  start_lng: number | null;
  start_address: string | null;
  end_lat: number | null;
  end_lng: number | null;
  end_address: string | null;
}

export interface SavedPlaceRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface PickerPlace {
  key: string;
  label: string;
  lat: number;
  lng: number;
}

/** Distance in miles between two points, as `haversineDistance` returns. */
export type HaversineMiles = (lat1: number, lng1: number, lat2: number, lng2: number) => number;

export interface PickerPlaces {
  saved: PickerPlace[];
  recent: PickerPlace[];
}

function usable(lat: number | null, lng: number | null, address: string | null): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    typeof address === "string" &&
    address.trim().length > 0
  );
}

function timeOf(iso: string | null): number {
  if (!iso) return Number.NaN;
  return new Date(iso).getTime();
}

export function selectPickerPlaces(args: {
  trips: RecentTripRow[];
  savedPlaces: SavedPlaceRow[];
  haversine: HaversineMiles;
}): PickerPlaces {
  const { trips, savedPlaces, haversine } = args;

  const saved: PickerPlace[] = savedPlaces
    .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude) && s.name.trim().length > 0)
    .slice(0, SAVED_PLACES_LIMIT)
    .map((s) => ({ key: `saved:${s.id}`, label: s.name.trim(), lat: s.latitude, lng: s.longitude }));

  // Every trip end, stamped with the moment the driver was there.
  const points: Array<PickerPlace & { at: number }> = [];
  trips.forEach((t, i) => {
    const startAt = timeOf(t.started_at);
    if (usable(t.start_lat, t.start_lng, t.start_address)) {
      points.push({
        key: `trip:${i}:start`,
        label: t.start_address!.trim(),
        lat: t.start_lat!,
        lng: t.start_lng!,
        at: Number.isFinite(startAt) ? startAt : 0,
      });
    }
    if (usable(t.end_lat, t.end_lng, t.end_address)) {
      const endAt = timeOf(t.ended_at);
      points.push({
        key: `trip:${i}:end`,
        label: t.end_address!.trim(),
        lat: t.end_lat!,
        lng: t.end_lng!,
        at: Number.isFinite(endAt) ? endAt : Number.isFinite(startAt) ? startAt : 0,
      });
    }
  });

  // Newest first. Sort is stable, so equal times keep their input order.
  points.sort((a, b) => b.at - a.at);

  const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    haversine(a.lat, a.lng, b.lat, b.lng) * METRES_PER_MILE < SAME_PLACE_METRES;

  const recent: PickerPlace[] = [];
  for (const p of points) {
    if (recent.length >= RECENT_PLACES_LIMIT) break;
    if (saved.some((s) => near(s, p))) continue;
    // The newest visit to a spot has already been kept, with its label.
    if (recent.some((r) => near(r, p))) continue;
    recent.push({ key: p.key, label: p.label, lat: p.lat, lng: p.lng });
  }

  return { saved, recent };
}
