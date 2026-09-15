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

// ── Reverse geocoding (coordinates → a name a driver recognises) ──
//
// Addresses are normally reverse-geocoded on the device and sent up with the
// trip. When that fails the client sends null, and a trip with BOTH addresses
// null renders in the trips list with no route line at all (trips.tsx:878 only
// draws it when at least one is present) — so a perfectly captured drive shows
// as a bare distance and time. Users read that as a missing trip and report it:
// 96 such trips in the week to 15 Aug 2026 across 33 users, including six of
// the people who filed missing-trip reports that week (Hanson reported his
// twice, then tried to re-enter it by hand while it was already saved).
//
// Nominatim rather than Google: it is already this file's provider, it is free
// and keyless, and its UK coverage is good — it resolves a bare coordinate to
// "McDonald's, Tyldesley Road, Atherton, M46 9AT". Its usage policy asks for
// an identifying User-Agent, at most one request a second, and that results be
// cached. Volume (15 Sep 2026): the device fails to name one side of roughly
// 600 of the 1,900 auto-recorded trips a day, so the create path and the
// backfill job together make on the order of 1,000 lookups a day before the
// cache — about a quarter of an hour at one a second, inside the policy but no
// longer the "56 a day" it was in August. A paid or self-hosted instance is the
// next step if that grows.
//
// Cached on coordinates rounded to 4dp (~11 m, the same precision RouteCache
// uses) because drivers return to the same places constantly — a depot, a
// customer, home — so the same handful of points recur for weeks.
const REVERSE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // addresses do not move

function roundCoord(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Why a lookup produced no address. The distinction matters to the backfill
 * job: "nowhere" is Nominatim saying there is nothing to name at that point
 * (a coordinate in the Channel from a GPS glitch) and will never change, while
 * "unavailable" is a timeout, a 429 or a 5xx that a retry will fix. The job
 * stopped filling anything for ten days in September 2026 because five
 * offshore trips sat at the head of its queue and each "nowhere" counted as a
 * provider failure, tripping its dead-provider cut-off before it reached a
 * single real trip.
 */
export type ReverseGeocodeOutcome = "found" | "nowhere" | "unavailable";

export interface ReverseGeocodeResult {
  address: string | null;
  outcome: ReverseGeocodeOutcome;
  /** True when no provider request was made, so callers need not pace. */
  cached: boolean;
}

// The service swallows every failure so a trip save never sees an exception,
// which also meant ten days of an empty error log while the backfill job filled
// nothing. One line a minute is enough to show a 429 storm or an outage
// without letting a storm write a line per lookup.
const WARN_INTERVAL_MS = 60_000;
let lastWarnAt = 0;
let suppressedWarnings = 0;
function warnThrottled(message: string): void {
  const now = Date.now();
  if (now - lastWarnAt < WARN_INTERVAL_MS) {
    suppressedWarnings += 1;
    return;
  }
  const suffix = suppressedWarnings > 0 ? ` (+${suppressedWarnings} more in the last minute)` : "";
  suppressedWarnings = 0;
  lastWarnAt = now;
  console.warn(`[reverseGeocode] ${message}${suffix}`);
}

export async function reverseGeocodeDetailed(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { address: null, outcome: "nowhere", cached: true };
  }
  // 0,0 is the established "no coordinates" sentinel — reverse-geocoding it
  // returns a point in the Atlantic, which is worse than showing nothing.
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) {
    return { address: null, outcome: "nowhere", cached: true };
  }

  const key = `revgeo:v1:${roundCoord(lat)},${roundCoord(lng)}`;
  const cached = await cacheGet(key);
  if (cached !== null && cached !== undefined) {
    return cached === ""
      ? { address: null, outcome: "nowhere", cached: true }
      : { address: cached, outcome: "found", cached: true };
  }

  const url = new URL("/reverse", NOMINATIM_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18"); // building / street level

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      warnThrottled(`Nominatim answered HTTP ${res.status}`);
      return { address: null, outcome: "unavailable", cached: false };
    }
    const row = (await res.json()) as NominatimResult & { error?: string };
    if (row.error) {
      // Nothing to name here and nothing will change that: remember it as
      // long as a real address so the point is not asked about again.
      await cacheSet(key, "", REVERSE_CACHE_TTL_SECONDS);
      return { address: null, outcome: "nowhere", cached: false };
    }
    const address = conciseAddress(row);
    if (!address) return { address: null, outcome: "nowhere", cached: false };
    await cacheSet(key, address, REVERSE_CACHE_TTL_SECONDS);
    return { address, outcome: "found", cached: false };
  } catch (err) {
    // Timeout or network failure: return null and leave the trip as it was.
    // A missing label is a nuisance; a failed trip save is not acceptable.
    warnThrottled(
      controller.signal.aborted
        ? `Nominatim timed out after ${TIMEOUT_MS} ms`
        : `Nominatim request failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { address: null, outcome: "unavailable", cached: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  return (await reverseGeocodeDetailed(lat, lng)).address;
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
