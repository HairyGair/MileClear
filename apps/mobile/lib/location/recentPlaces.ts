// Places offered in the From/To picker before the driver types anything.
//
// Chris Saunders, 17 Sep 2026: adding a trip by hand he typed "304 West
// Wycombe Road" and the address search could only offer 307. He had driven
// to 304 before, so the address was already on the phone in his own trips.
// This picks the places worth offering: the driver's saved places first,
// then the ends of recent trips, one row per spot.
//
// Pure so it can be tested without SQLite or React.
//
// Chris again, 22 Sep 2026: the list stopped at six saved places, alphabetical
// after Home, and typing a saved place's name only searched Google, so any
// saved place past the first six could not be picked at all. Every saved place
// now comes back, the ones he actually goes to first, and the picker shows the
// rest behind "Show all" and matches them by name as he types.

/** Two points closer than this count as the same place. */
export const SAME_PLACE_METRES = 75;
/** A trip end this close to a saved place counts as a visit to it (the default geofence radius). */
export const SAVED_VISIT_METRES = 150;
/** Saved places shown before the driver asks for the rest. */
export const SAVED_PLACES_LIMIT = 6;
export const RECENT_PLACES_LIMIT = 8;
/** Saved places offered while typing, above the address search. */
export const SAVED_MATCH_LIMIT = 5;

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
  location_type?: string | null;
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

function typeRank(type: string | null | undefined): number {
  if (type === "home") return 0;
  if (type === "work") return 1;
  return 2;
}

export function selectPickerPlaces(args: {
  trips: RecentTripRow[];
  savedPlaces: SavedPlaceRow[];
  haversine: HaversineMiles;
}): PickerPlaces {
  const { trips, savedPlaces, haversine } = args;

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

  const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    haversine(a.lat, a.lng, b.lat, b.lng) * METRES_PER_MILE;
  const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    metres(a, b) < SAME_PLACE_METRES;

  // Home and work first, then the places visited most recently, then the ones
  // not seen in recent trips. Input order (alphabetical from SQLite) breaks ties.
  const saved: PickerPlace[] = savedPlaces
    .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude) && s.name.trim().length > 0)
    .map((s, index) => {
      const place = { key: `saved:${s.id}`, label: s.name.trim(), lat: s.latitude, lng: s.longitude };
      const visit = points.find((p) => metres(place, p) < SAVED_VISIT_METRES);
      return { place, index, rank: typeRank(s.location_type), lastVisit: visit ? visit.at : -1 };
    })
    .sort((a, b) => a.rank - b.rank || b.lastVisit - a.lastVisit || a.index - b.index)
    .map((s) => s.place);

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

/**
 * Saved places whose name matches what the driver has typed. A name that
 * starts with it, or has a word that does, comes before one that merely
 * contains it; otherwise the order of `saved` is kept.
 */
export function matchSavedPlaces(saved: PickerPlace[], query: string): PickerPlace[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ place: PickerPlace; score: number }> = [];
  for (const place of saved) {
    const name = place.label.toLowerCase();
    if (name.startsWith(q)) scored.push({ place, score: 0 });
    else if (name.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) scored.push({ place, score: 1 });
    else if (name.includes(q)) scored.push({ place, score: 2 });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, SAVED_MATCH_LIMIT)
    .map((s) => s.place);
}
