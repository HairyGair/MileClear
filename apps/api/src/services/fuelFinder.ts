// UK Government Fuel Finder API client (Information Recipient)
// OAuth 2.0 client credentials + station/price data fetching
// Covers all 8,300+ UK fuel stations (mandatory reporting since Feb 2026)
//
// Token:    POST https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_access_token
// Stations: GET  https://www.developer.fuel-finder.service.gov.uk/api/v1/pfs?batch-number=N
// Prices:   GET  https://www.developer.fuel-finder.service.gov.uk/api/v1/pfs/fuel-prices?batch-number=N

const FUEL_FINDER_CLIENT_ID = process.env.FUEL_FINDER_CLIENT_ID || "";
const FUEL_FINDER_CLIENT_SECRET = process.env.FUEL_FINDER_CLIENT_SECRET || "";
const FUEL_FINDER_TOKEN_BASE = "https://www.fuel-finder.service.gov.uk/api";
const FUEL_FINDER_DATA_BASE = "https://www.developer.fuel-finder.service.gov.uk/api";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BATCHES = 200; // Safety limit to prevent infinite loops

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
    const res = await fetch(`${FUEL_FINDER_TOKEN_BASE}/v1/oauth/generate_access_token`, {
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

// --- API types (from Fuel Finder schema) ---

interface FuelFinderPfsStation {
  node_id: string;
  trading_name: string;
  brand_name?: string;
  is_same_trading_and_brand_name?: boolean;
  temporary_closure?: boolean;
  permanent_closure?: boolean;
  location: {
    address_line_1?: string;
    address_line_2?: string | null;
    city?: string;
    country?: string;
    county?: string | null;
    postcode?: string;
    latitude: number;
    longitude: number;
  };
  amenities?: string[];
  fuel_types?: string[];
}

interface FuelFinderPriceStation {
  node_id: string;
  trading_name?: string;
  fuel_prices: Array<{
    fuel_type: string;
    price: number;
    price_last_updated: string;
    price_change_effective_timestamp?: string;
  }>;
}

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

// Map Fuel Finder fuel_type values to our standard codes
const FUEL_TYPE_MAP: Record<string, keyof InternalStation["prices"]> = {
  E10: "E10",
  E5: "E5",
  B7_STANDARD: "B7",
  B7_PREMIUM: "SDV",  // Premium diesel → SDV slot
  B7: "B7",
  SDV: "SDV",
};

// --- Paginated batch fetching ---

async function fetchBatch<T>(token: string, path: string, batchNumber: number): Promise<T[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${FUEL_FINDER_DATA_BASE}${path}?batch-number=${batchNumber}`;

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
      throw new Error(`HTTP ${res.status} — ${text}`);
    }

    const data = await res.json();

    // Response is a direct array
    if (Array.isArray(data)) return data as T[];

    // Response might be wrapped: { success, data: [...] }
    if (data && Array.isArray(data.data)) return data.data as T[];

    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllBatches<T>(token: string, path: string): Promise<T[]> {
  const all: T[] = [];

  for (let batch = 1; batch <= MAX_BATCHES; batch++) {
    try {
      const items = await fetchBatch<T>(token, path, batch);
      if (items.length === 0) break;
      all.push(...items);
    } catch (err: any) {
      // 404 = batch doesn't exist = we've fetched all available batches
      if (err?.message?.includes("HTTP 404")) break;
      throw err;
    }
  }

  return all;
}

// --- Main export ---

/**
 * Fetch all stations + prices from the Fuel Finder API.
 * 1. Fetch station details (location, brand) from /v1/pfs
 * 2. Fetch prices from /v1/pfs/fuel-prices
 * 3. Join by node_id and normalise to InternalStation format
 */
export async function fetchFuelFinderStations(): Promise<{
  stations: InternalStation[];
  lastUpdated: string;
}> {
  const token = await getToken();

  // Fetch stations and prices in parallel
  const [pfsStations, pfsStationPrices] = await Promise.all([
    fetchAllBatches<FuelFinderPfsStation>(token, "/v1/pfs"),
    fetchAllBatches<FuelFinderPriceStation>(token, "/v1/pfs/fuel-prices"),
  ]);

  console.log(`[fuel-finder] Raw data: ${pfsStations.length} stations, ${pfsStationPrices.length} price entries`);

  // Index prices by node_id
  const priceMap = new Map<string, FuelFinderPriceStation>();
  for (const p of pfsStationPrices) {
    priceMap.set(p.node_id, p);
  }

  // Join and normalise
  const stations: InternalStation[] = [];
  let latestUpdate = "";

  for (const pfs of pfsStations) {
    // Skip closed stations
    if (pfs.permanent_closure || pfs.temporary_closure) continue;

    const lat = pfs.location?.latitude;
    const lng = pfs.location?.longitude;
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;
    if (lat === 0 && lng === 0) continue;

    // Look up prices for this station
    const priceData = priceMap.get(pfs.node_id);
    if (!priceData || !priceData.fuel_prices?.length) continue;

    const prices: InternalStation["prices"] = {};
    for (const fp of priceData.fuel_prices) {
      const mapped = FUEL_TYPE_MAP[fp.fuel_type];
      if (!mapped) continue;
      if (fp.price == null || isNaN(fp.price) || fp.price <= 0) continue;
      prices[mapped] = fp.price;

      // Track latest update timestamp
      if (fp.price_last_updated && fp.price_last_updated > latestUpdate) {
        latestUpdate = fp.price_last_updated;
      }
    }

    if (!prices.E10 && !prices.E5 && !prices.B7 && !prices.SDV) continue;

    const address = [pfs.location.address_line_1, pfs.location.city]
      .filter(Boolean)
      .join(", ");

    stations.push({
      siteId: pfs.node_id,
      brand: pfs.brand_name || pfs.trading_name || "Unknown",
      address,
      postcode: pfs.location.postcode || "",
      latitude: lat,
      longitude: lng,
      prices,
    });
  }

  return {
    stations,
    lastUpdated: latestUpdate || new Date().toISOString(),
  };
}
