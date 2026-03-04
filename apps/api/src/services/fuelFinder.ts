// UK Government Fuel Finder API client
// OAuth 2.0 client credentials + station/price data fetching
// Covers all 8,300+ UK fuel stations (mandatory reporting since Feb 2026)

// Token endpoint: https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_secret_token
// API base: https://api.fuelfinder.service.gov.uk
// Known endpoints: GET /v1/prices?fuel_type=unleaded, GET /v1/prices/{site_id}

const FUEL_FINDER_CLIENT_ID = process.env.FUEL_FINDER_CLIENT_ID || "";
const FUEL_FINDER_CLIENT_SECRET = process.env.FUEL_FINDER_CLIENT_SECRET || "";
const FUEL_FINDER_TOKEN_URL = process.env.FUEL_FINDER_TOKEN_URL || "https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_secret_token";
const FUEL_FINDER_API_BASE_URL = process.env.FUEL_FINDER_API_BASE_URL || "https://api.fuelfinder.service.gov.uk";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const REQUEST_TIMEOUT_MS = 15_000;

// --- Token management ---

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
}

let cachedToken: TokenData | null = null;

export function isFuelFinderConfigured(): boolean {
  return !!(FUEL_FINDER_CLIENT_ID && FUEL_FINDER_CLIENT_SECRET);
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken.accessToken;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Token endpoint uses JSON body with client_id + client_secret
    const res = await fetch(FUEL_FINDER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: FUEL_FINDER_CLIENT_ID,
        client_secret: FUEL_FINDER_CLIENT_SECRET,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Token request failed: HTTP ${res.status} — ${text}`);
    }

    const json = (await res.json()) as {
      success: boolean;
      data?: {
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token: string;
      };
      message?: string;
    };

    if (!json.success || !json.data?.access_token) {
      throw new Error(`Token request failed: ${json.message || "No access token in response"}`);
    }

    cachedToken = {
      accessToken: json.data.access_token,
      refreshToken: json.data.refresh_token,
      expiresAt: Date.now() + json.data.expires_in * 1000,
    };

    return cachedToken.accessToken;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Station/price fetching ---

// The internal station format used by fuel.ts
interface InternalStation {
  siteId: string;
  brand: string;
  address: string;
  postcode: string;
  latitude: number;
  longitude: number;
  prices: {
    E10?: number;
    E5?: number;
    B7?: number;
    SDV?: number;
  };
}

// Fuel Finder API response shapes — handles multiple possible formats
interface FuelFinderStation {
  id?: string;
  site_id?: string;
  brand?: string;
  name?: string;
  address?: string;
  postcode?: string;
  location?: { latitude?: number; longitude?: number };
  latitude?: number;
  longitude?: number;
  prices?: Record<string, number | string | null>;
  fuel_prices?: Array<{
    fuel_type?: string;
    price?: number;
  }>;
}

const VALID_FUEL_TYPES = new Set(["E10", "E5", "B7", "SDV"]);

// Map Fuel Finder fuel type names to our standard codes
const FUEL_TYPE_MAP: Record<string, string> = {
  E10: "E10",
  E5: "E5",
  B7: "B7",
  SDV: "SDV",
  UNLEADED: "E10",   // E10 is standard unleaded since 2021
  SUPER: "E5",       // E5 = super unleaded / premium
  DIESEL: "B7",      // B7 = standard diesel
  PREMIUM_DIESEL: "SDV",
};

function normaliseStation(raw: FuelFinderStation): InternalStation | null {
  const lat = raw.location?.latitude ?? raw.latitude;
  const lng = raw.location?.longitude ?? raw.longitude;
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  const prices: InternalStation["prices"] = {};

  // Handle object-style prices { "E10": 132.9, "B7": 139.9 }
  if (raw.prices && typeof raw.prices === "object" && !Array.isArray(raw.prices)) {
    for (const [key, rawVal] of Object.entries(raw.prices)) {
      const mapped = FUEL_TYPE_MAP[key.toUpperCase()] || key.toUpperCase();
      if (!VALID_FUEL_TYPES.has(mapped)) continue;
      const val = typeof rawVal === "string" ? parseFloat(rawVal) : rawVal;
      if (val == null || isNaN(val) || val <= 0) continue;
      (prices as Record<string, number>)[mapped] = val;
    }
  }

  // Handle array-style fuel_prices [{ fuel_type: "unleaded", price: 132.9 }]
  if (Array.isArray(raw.fuel_prices)) {
    for (const fp of raw.fuel_prices) {
      const mapped = FUEL_TYPE_MAP[fp.fuel_type?.toUpperCase() || ""];
      if (!mapped || !VALID_FUEL_TYPES.has(mapped)) continue;
      const val = fp.price;
      if (val == null || isNaN(val) || val <= 0) continue;
      (prices as Record<string, number>)[mapped] = val;
    }
  }

  if (!prices.E10 && !prices.E5 && !prices.B7 && !prices.SDV) return null;

  return {
    siteId: String(raw.id || raw.site_id || `ff-${lat}-${lng}`),
    brand: raw.brand || raw.name || "Unknown",
    address: raw.address || "",
    postcode: raw.postcode || "",
    latitude: lat,
    longitude: lng,
    prices,
  };
}

/**
 * Fetch a single fuel type's prices from the Fuel Finder API.
 * Known endpoint: GET /v1/prices?fuel_type=unleaded
 */
async function fetchPricesByFuelType(
  token: string,
  fuelType: string
): Promise<FuelFinderStation[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${FUEL_FINDER_API_BASE_URL}/v1/prices?fuel_type=${encodeURIComponent(fuelType)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "MileClear/1.0",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Fuel Finder /v1/prices?fuel_type=${fuelType} failed: HTTP ${res.status} — ${text}`);
    }

    const json = (await res.json()) as {
      success?: boolean;
      data?: FuelFinderStation[] | { stations?: FuelFinderStation[] };
      stations?: FuelFinderStation[];
      results?: FuelFinderStation[];
    };

    // Handle wrapped response { success, data: [...] } or { data: { stations: [...] } }
    if (Array.isArray(json.data)) return json.data;
    if (json.data && "stations" in json.data && Array.isArray(json.data.stations)) return json.data.stations;
    if (Array.isArray(json.stations)) return json.stations;
    if (Array.isArray(json.results)) return json.results;

    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch all stations from the Fuel Finder API.
 * Queries each fuel type and merges results (deduped by site ID).
 * Returns normalised stations in the same format as CMA retailer feeds.
 */
export async function fetchFuelFinderStations(): Promise<{
  stations: InternalStation[];
  lastUpdated: string;
}> {
  const token = await getToken();

  // Fetch all fuel types in parallel — rate limit is 30 RPM so 4 concurrent is fine
  const fuelTypes = ["unleaded", "super_unleaded", "diesel", "premium_diesel"];
  const results = await Promise.allSettled(
    fuelTypes.map((ft) => fetchPricesByFuelType(token, ft))
  );

  const seen = new Map<string, FuelFinderStation>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      for (const station of result.value) {
        const id = String(station.id || station.site_id || "");
        if (!id) continue;

        // Merge prices from different fuel type queries into one station
        const existing = seen.get(id);
        if (existing) {
          // Merge prices
          if (station.prices) {
            existing.prices = { ...existing.prices, ...station.prices };
          }
          if (station.fuel_prices) {
            existing.fuel_prices = [
              ...(existing.fuel_prices || []),
              ...station.fuel_prices,
            ];
          }
        } else {
          seen.set(id, { ...station });
        }
      }
    } else {
      console.warn(`[fuel-finder] ${fuelTypes[i]} query failed:`, result.reason?.message || result.reason);
    }
  }

  const stations: InternalStation[] = [];
  for (const raw of seen.values()) {
    const normalised = normaliseStation(raw);
    if (normalised) stations.push(normalised);
  }

  return {
    stations,
    lastUpdated: new Date().toISOString(),
  };
}
