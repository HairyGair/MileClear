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

// ── Google Places Autocomplete (primary path) ─────────────────────
//
// Type-ahead: the user picks a real, disambiguated place instead of us
// geocoding a full string and guessing. Removes the wrong-pin failure at
// the source. Uses the existing GOOGLE_MAPS_API_KEY (also drives routing).
// Requires "Places API (New)" enabled on that Google Cloud project.
//
// Billing is per session: the client mints a session token, reuses it
// across keystrokes, and passes it to the final Place Details call which
// closes the session. If the key is absent or Google errors, callers get
// [] / null and fall back to the Nominatim/Apple search path.

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACES_DETAILS_BASE = "https://places.googleapis.com/v1/places/";

export interface PlacePrediction {
  placeId: string;
  primary: string; // e.g. "Watford Grammar School for Boys"
  secondary: string; // e.g. "Shepherds Road, Watford"
}

export async function placesAutocomplete(
  input: string,
  sessionToken: string,
  near?: { lat: number; lng: number }
): Promise<PlacePrediction[]> {
  const q = input.trim();
  if (!GOOGLE_KEY || q.length < 2) return [];

  const body: Record<string, unknown> = {
    input: q,
    sessionToken,
    includedRegionCodes: ["gb"],
    regionCode: "GB",
  };
  if (near) {
    body.locationBias = {
      circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        };
      }>;
    };
    return (json.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .map((p) => ({
        placeId: p.placeId!,
        primary: p.structuredFormat?.mainText?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
      }))
      .filter((p) => p.primary.length > 0);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function placeDetails(
  placeId: string,
  sessionToken: string
): Promise<GeocodeSuggestion | null> {
  if (!GOOGLE_KEY || !placeId) return null;

  const cacheKey = `place:v1:${placeId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as GeocodeSuggestion;
    } catch {
      // re-fetch
    }
  }

  const url = new URL(PLACES_DETAILS_BASE + encodeURIComponent(placeId));
  url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("regionCode", "GB");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": "location,formattedAddress,displayName",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      location?: { latitude?: number; longitude?: number };
      formattedAddress?: string;
      displayName?: { text?: string };
    };
    const lat = json.location?.latitude;
    const lng = json.location?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Prefer the place name + a trimmed address (drop trailing ", UK").
    const addr = (json.formattedAddress ?? "").replace(/,?\s*UK$/i, "").trim();
    const name = json.displayName?.text;
    const address = name && addr && !addr.startsWith(name) ? `${name}, ${addr}` : addr || name || "";
    const result: GeocodeSuggestion = { lat: lat!, lng: lng!, address };
    await cacheSet(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
