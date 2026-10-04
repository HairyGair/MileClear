/**
 * Short place names for the route line on a trip row ("Kenton Lane → Home").
 *
 * Reverse-geocoded addresses arrive in several shapes:
 *   "121, Kenton Lane, Newcastle Upon Tyne, NE3 4LD"
 *   "1-12, Something Road, Gosforth, NE3 1AA"
 *   "Pepe's, 129-131 High St, Gosforth, Newcastle upon Tyne NE3 1HA"
 *   "NE3 2JA, Grasmere Pl, Newcastle upon Tyne NE3 2JA"
 * Until 4 Oct 2026 the row took the first part longer than two characters,
 * so a house-number range ("1-12") or a postcode could become the place.
 *
 * The rule, in order:
 *   1. A saved place the trip end sits inside ("Home", "Depot").
 *   2. The first part of the address that names something: a business,
 *      street or area. House numbers and ranges are dropped, whether they
 *      are their own part ("121") or lead a street ("129-131 High St").
 *      Postcodes and "Unnamed Road" are skipped.
 *   3. A postcode, if that is all there is.
 *   4. Nothing (the row then shows the other end only).
 *
 * Pure: no React, no database.
 */

export interface SavedPlace {
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

/** Full UK postcode, e.g. "NE3 2JA", "SW1A 1AA", "M1 1AE". */
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
/** The same postcode at the end of a part ("Newcastle upon Tyne NE3 1HA"). */
const TRAILING_POSTCODE = /\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
/** A leading house number or range: "121 ", "12a ", "129-131 ", "4/6 ". */
const LEADING_NUMBER = /^\d+[a-z]?(?:\s*[-–/]\s*\d+[a-z]?)?\s+(?=\S)/i;
/** Saved-place matching: a trip end recorded a little outside a small
 *  saved radius still counts, because GPS settles late at the kerb. */
const MIN_MATCH_RADIUS_M = 100;

function truncate(s: string, maxLength: number): string {
  return s.length > maxLength ? s.slice(0, maxLength - 1).trimEnd() + "…" : s;
}

/** Strips a leading house number and a trailing postcode from one part. */
function cleanPart(part: string): string {
  return part.trim().replace(LEADING_NUMBER, "").replace(TRAILING_POSTCODE, "").trim();
}

/** True when a cleaned part names a place rather than a number or code. */
function isPlaceName(part: string): boolean {
  if (part.length < 2) return false;
  if (!/[a-z]/i.test(part)) return false; // "121", "1-12"
  if (POSTCODE.test(part)) return false;
  if (/^unnamed road$/i.test(part)) return false;
  return true;
}

/** Short label for one end of a trip from its stored address. */
export function shortPlaceLabel(address: string | null | undefined, maxLength = 22): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const cleaned = cleanPart(part);
    if (isPlaceName(cleaned)) return truncate(cleaned, maxLength);
  }
  const postcode = parts.find((p) => POSTCODE.test(p));
  return postcode ? postcode.toUpperCase() : "";
}

function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Name of the nearest saved place whose radius contains the point, if any. */
export function savedPlaceAt(
  saved: SavedPlace[],
  lat: number | null | undefined,
  lng: number | null | undefined
): string | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  let best: { name: string; d: number } | null = null;
  for (const p of saved) {
    const d = metresBetween(lat, lng, p.lat, p.lng);
    if (d <= Math.max(p.radiusMeters, MIN_MATCH_RADIUS_M) && (!best || d < best.d)) {
      best = { name: p.name, d };
    }
  }
  return best ? best.name : null;
}

/** Label for one end of a trip: saved place first, then the address. */
export function tripEndLabel(
  address: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  saved: SavedPlace[] = [],
  maxLength = 22
): string {
  const name = savedPlaceAt(saved, lat, lng);
  return name ? truncate(name.trim(), maxLength) : shortPlaceLabel(address, maxLength);
}
