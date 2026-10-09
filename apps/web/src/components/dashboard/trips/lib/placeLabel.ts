// Short place names for the route line on a trip row ("Kenton Lane to Home").
// Ported from apps/mobile/lib/trips/placeLabel.ts so a trip reads the same on
// the website as in the app. Pure: no imports, so it can be unit tested alone.
//
// Rule, in order: a saved place the point sits inside, then the first part of
// the address that names something (house numbers and postcodes are skipped),
// then a postcode if that is all there is.

export interface PlaceCircle {
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const TRAILING_POSTCODE = /\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const LEADING_NUMBER = /^\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?\s+(?=\S)/i;
const MIN_MATCH_RADIUS_M = 100;

function truncate(s: string, maxLength: number): string {
  return s.length > maxLength ? s.slice(0, maxLength - 1).trimEnd() + "..." : s;
}

function cleanPart(part: string): string {
  return part.trim().replace(LEADING_NUMBER, "").replace(TRAILING_POSTCODE, "").trim();
}

function isPlaceName(part: string): boolean {
  if (part.length < 2) return false;
  if (!/[a-z]/i.test(part)) return false;
  if (POSTCODE.test(part)) return false;
  if (/^unnamed road$/i.test(part)) return false;
  return true;
}

// A bare town or country says nothing about where on the map: "London to London".
// Prefer a street, a venue or a postcode, and only use one of these as a last resort.
const GENERIC_AREA = /^(london|greater london|england|uk|united kingdom|great britain|scotland|wales|northern ireland)$/i;

export function shortPlaceLabel(address: string | null | undefined, maxLength = 28): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const cleaned = cleanPart(part);
    if (isPlaceName(cleaned) && !GENERIC_AREA.test(cleaned)) return truncate(cleaned, maxLength);
  }
  const postcode = parts.find((p) => POSTCODE.test(p)) ?? parts.map((p) => p.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i)?.[0]).find(Boolean);
  if (postcode) return postcode.toUpperCase();
  const area = parts.map(cleanPart).find((p) => isPlaceName(p));
  return area ? truncate(area, maxLength) : "";
}

export function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function savedPlaceAt(
  saved: PlaceCircle[],
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
  saved: PlaceCircle[] = [],
  maxLength = 28
): string {
  const name = savedPlaceAt(saved, lat, lng);
  return name ? truncate(name.trim(), maxLength) : shortPlaceLabel(address, maxLength);
}

/** "Home to Tesco Extra", falling back to what is known. */
export function routeTitle(from: string, to: string): string {
  if (from && to) return `${from} to ${to}`;
  return from || to || "Trip";
}
