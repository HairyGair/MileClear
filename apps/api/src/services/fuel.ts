// Government retailer fuel price feeds + GOV.UK national averages

import { cacheGet, cacheSet } from "../lib/redis.js";
import {
  FUEL_RETAILER_FEEDS,
  FUEL_STATION_CACHE_TTL_MS,
} from "@mileclear/shared";
import type { FuelStation, NationalAveragePrices } from "@mileclear/shared";

const NATIONAL_AVG_CACHE_KEY = "fuel:national_averages";
const NATIONAL_AVG_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const FEED_TIMEOUT_MS = 10_000;

// --- In-memory station cache ---

interface StationCacheEntry {
  stations: InternalStation[];
  lastUpdated: string;
  fetchedAt: number;
}

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

let stationCache: StationCacheEntry | null = null;

// Raw feed station shape (government standard format)
// Prices come as an object: { E10?: number, E5?: number, B7?: number, SDV?: number }
interface RawFeedStation {
  site_id?: string;
  brand?: string;
  address?: string;
  postcode?: string;
  location?: { latitude?: number; longitude?: number };
  prices?: Record<string, number | string | null>;
}

const VALID_FUEL_TYPES = new Set(["E10", "E5", "B7", "SDV"]);

function normaliseStation(raw: RawFeedStation, feedName: string): InternalStation | null {
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  const prices: InternalStation["prices"] = {};
  if (raw.prices && typeof raw.prices === "object") {
    for (const [key, rawVal] of Object.entries(raw.prices)) {
      const type = key.toUpperCase();
      if (!VALID_FUEL_TYPES.has(type)) continue;
      const val = typeof rawVal === "string" ? parseFloat(rawVal) : rawVal;
      if (val == null || isNaN(val) || val <= 0) continue;
      if (type === "E10") prices.E10 = val;
      else if (type === "E5") prices.E5 = val;
      else if (type === "B7") prices.B7 = val;
      else if (type === "SDV") prices.SDV = val;
    }
  }

  // Skip stations with no valid prices
  if (!prices.E10 && !prices.E5 && !prices.B7 && !prices.SDV) return null;

  return {
    siteId: String(raw.site_id || `${feedName}-${lat}-${lng}`),
    brand: raw.brand || feedName,
    address: raw.address || "",
    postcode: raw.postcode || "",
    latitude: lat,
    longitude: lng,
    prices,
  };
}

async function fetchFeed(feed: { name: string; url: string }): Promise<{ stations: InternalStation[]; lastUpdated: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { "User-Agent": "MileClear/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as {
      last_updated?: string;
      stations?: RawFeedStation[];
    };

    const stations: InternalStation[] = [];
    if (Array.isArray(data.stations)) {
      for (const raw of data.stations) {
        const normalised = normaliseStation(raw, feed.name);
        if (normalised) stations.push(normalised);
      }
    }

    return {
      stations,
      lastUpdated: data.last_updated || new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAllStations(): Promise<StationCacheEntry> {
  const results = await Promise.allSettled(
    FUEL_RETAILER_FEEDS.map((feed) => fetchFeed(feed))
  );

  const seen = new Set<string>();
  const allStations: InternalStation[] = [];
  let latestUpdate = "";
  let successCount = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      successCount++;
      if (result.value.lastUpdated > latestUpdate) {
        latestUpdate = result.value.lastUpdated;
      }
      for (const s of result.value.stations) {
        if (!seen.has(s.siteId)) {
          seen.add(s.siteId);
          allStations.push(s);
        }
      }
    } else {
      console.warn(`[fuel] Feed ${FUEL_RETAILER_FEEDS[i].name} failed:`, result.reason?.message || result.reason);
    }
  }

  console.log(`[fuel] Fetched ${allStations.length} stations from ${successCount}/${FUEL_RETAILER_FEEDS.length} feeds`);

  return {
    stations: allStations,
    lastUpdated: latestUpdate || new Date().toISOString(),
    fetchedAt: Date.now(),
  };
}

async function getCachedStations(): Promise<StationCacheEntry> {
  if (stationCache && (Date.now() - stationCache.fetchedAt) < FUEL_STATION_CACHE_TTL_MS) {
    return stationCache;
  }
  stationCache = await fetchAllStations();
  return stationCache;
}

// --- Nearby search ---

const EARTH_RADIUS_MILES = 3958.8;

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getNearbyStations(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<{ stations: FuelStation[]; lastUpdated: string }> {
  const cache = await getCachedStations();

  // Bounding box pre-filter
  const latDelta = radiusMiles / 69.0;
  const lngDelta = radiusMiles / (69.0 * Math.cos((lat * Math.PI) / 180));
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  const nearby: FuelStation[] = [];

  for (const s of cache.stations) {
    // Fast bounding box check
    if (s.latitude < minLat || s.latitude > maxLat) continue;
    if (s.longitude < minLng || s.longitude > maxLng) continue;

    // Precise distance
    const dist = haversineDistance(lat, lng, s.latitude, s.longitude);
    if (dist > radiusMiles) continue;

    nearby.push({
      siteId: s.siteId,
      brand: s.brand,
      stationName: s.brand + (s.address ? ` - ${s.address}` : ""),
      address: s.address,
      postcode: s.postcode,
      latitude: s.latitude,
      longitude: s.longitude,
      distanceMiles: Math.round(dist * 100) / 100,
      prices: s.prices,
    });
  }

  // Sort by distance, limit 50
  nearby.sort((a, b) => a.distanceMiles - b.distanceMiles);

  return {
    stations: nearby.slice(0, 50),
    lastUpdated: cache.lastUpdated,
  };
}

// --- National averages (unchanged) ---

const GOV_UK_CSV_URL =
  "https://assets.publishing.service.gov.uk/media/6993252f7da91680ad7f44a1/CSV__2018_-____3_.csv";

export async function getNationalAverages(): Promise<NationalAveragePrices | null> {
  try {
    const cached = await cacheGet(NATIONAL_AVG_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as NationalAveragePrices;
    }

    const response = await fetch(GOV_UK_CSV_URL);
    if (!response.ok) return null;

    const text = await response.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;

    const headers = lines[0].split(",").map((h) => h.trim().toUpperCase());
    const ulspIndex = headers.findIndex((h) => h.includes("ULSP"));
    const ulsdIndex = headers.findIndex((h) => h.includes("ULSD"));
    if (ulspIndex === -1 || ulsdIndex === -1) return null;

    const lastLine = lines[lines.length - 1];
    const cols = lastLine.split(",").map((c) => c.trim());

    const petrolPpl = parseFloat(cols[ulspIndex]);
    const dieselPpl = parseFloat(cols[ulsdIndex]);
    if (isNaN(petrolPpl) || isNaN(dieselPpl)) return null;

    const result: NationalAveragePrices = {
      petrolPencePerLitre: Math.round(petrolPpl * 10) / 10,
      dieselPencePerLitre: Math.round(dieselPpl * 10) / 10,
      date: new Date().toISOString().slice(0, 10),
    };

    await cacheSet(NATIONAL_AVG_CACHE_KEY, JSON.stringify(result), NATIONAL_AVG_TTL_SECONDS);
    return result;
  } catch {
    return null;
  }
}
