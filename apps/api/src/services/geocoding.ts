import { cacheGet, cacheSet } from "../lib/redis.js";

// Server-side forward geocoding for free-text place / POI queries.
//
// The mobile app previously geocoded with Apple's on-device CLGeocoder,
// which has no region bias and is poor at place/POI names — a search for
// "Watford boys grammar school" from Bedfordshire resolved to a point 4
// miles away instead of the real school 31 miles south. We route free-text
// queries through a UK-biased geocoder instead. Postcodes still use the
// dedicated Postcodes.io fast-path on the client.
//
// Nominatim (OpenStreetMap) is the default provider: free, no key, good UK
// POI coverage. Its usage policy requires an identifying User-Agent, asks
// for <=1 req/sec, and expects results to be cached — we cache every query
// for 24h. Point NOMINATIM_URL at a self-hosted instance to lift the limit.

const NOMINATIM_URL = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const USER_AGENT = "MileClear/1.0 (mileage tracker; support@mileclear.com)";
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const TIMEOUT_MS = 4000;

export interface GeocodeSuggestion {
  lat: number;
  lng: number;
  address: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  address?: Record<string, string>;
}

// Build a concise, readable UK address from a Nominatim result instead of
// the full "…, England, WD18 7JF, United Kingdom" display_name.
function conciseAddress(r: NominatimResult): string {
  const a = r.address ?? {};
  const road = a.road ?? a.pedestrian ?? a.footway ?? null;
  const place =
    a.city ?? a.town ?? a.village ?? a.suburb ?? a.hamlet ?? a.county ?? null;
  const parts: string[] = [];
  if (r.name && r.name !== road) parts.push(r.name);
  if (road) parts.push(road);
  if (place) parts.push(place);
  if (a.postcode) parts.push(a.postcode);
  if (parts.length > 0) return parts.join(", ");
  // Fallback: trim the country suffix off display_name.
  return (r.display_name ?? "").replace(/,?\s*United Kingdom$/i, "").trim();
}

export async function searchGeocode(query: string, limit = 6): Promise<GeocodeSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const cacheKey = `geo:v1:${q.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as GeocodeSuggestion[];
    } catch {
      // fall through and re-fetch
    }
  }

  const url = new URL("/search", NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("countrycodes", "gb");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 10)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as NominatimResult[];
    const suggestions: GeocodeSuggestion[] = rows
      .map((r) => {
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng, address: conciseAddress(r) };
      })
      .filter((s): s is GeocodeSuggestion => s !== null);

    // Cache even an empty result briefly-ish (24h) — a query that returns
    // nothing today almost certainly returns nothing on a retry.
    await cacheSet(cacheKey, JSON.stringify(suggestions), CACHE_TTL_SECONDS);
    return suggestions;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
