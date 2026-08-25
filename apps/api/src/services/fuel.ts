// Fuel price data: Fuel Finder API (primary) + CMA retailer feeds (fallback) + GOV.UK national averages

import { cacheGet, cacheSet } from "../lib/redis.js";
import {
  FUEL_RETAILER_FEEDS,
  FUEL_STATION_CACHE_TTL_MS,
} from "@mileclear/shared";
import type { FuelStation, NationalAveragePrices } from "@mileclear/shared";
import { isFuelFinderConfigured, fetchFuelFinderStations } from "./fuelFinder.js";

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

async function fetchFromRetailerFeeds(): Promise<StationCacheEntry> {
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

  console.log(`[fuel] Fetched ${allStations.length} stations from ${successCount}/${FUEL_RETAILER_FEEDS.length} retailer feeds`);

  return {
    stations: allStations,
    lastUpdated: latestUpdate || new Date().toISOString(),
    fetchedAt: Date.now(),
  };
}

// Tracks whether we're currently in degraded mode (Fuel Finder failing,
// retailer feeds serving). Used to log only on state transitions, not on
// every request — otherwise the API error log fills up with the same
// "Fuel Finder API failed" line every cache miss.
let fuelFinderDegraded = false;

async function fetchAllStations(): Promise<StationCacheEntry> {
  // Try Fuel Finder API first (8,300+ stations) if configured
  if (isFuelFinderConfigured()) {
    try {
      const result = await fetchFuelFinderStations();
      if (fuelFinderDegraded) {
        console.log(`[fuel] Fuel Finder API recovered, serving ${result.stations.length} stations`);
        fuelFinderDegraded = false;
      } else {
        console.log(`[fuel] Fetched ${result.stations.length} stations from Fuel Finder API`);
      }
      return {
        stations: result.stations,
        lastUpdated: result.lastUpdated,
        fetchedAt: Date.now(),
      };
    } catch (err) {
      // Log on transition only. Repeated failures during the degraded
      // window are silent — falling back to retailer feeds is the
      // designed behaviour.
      if (!fuelFinderDegraded) {
        console.warn("[fuel] Fuel Finder API degraded, falling back to retailer feeds:", (err as Error).message);
        fuelFinderDegraded = true;
      }
    }
  }

  // Fallback: CMA retailer feeds (~4k stations)
  return fetchFromRetailerFeeds();
}

async function getCachedStations(): Promise<StationCacheEntry> {
  if (stationCache && (Date.now() - stationCache.fetchedAt) < FUEL_STATION_CACHE_TTL_MS) {
    return stationCache;
  }
  stationCache = await fetchAllStations();
  return stationCache;
}

// Background pre-warm. Called from the API server's job scheduler on a
// 12-minute interval so the 15-minute station cache never expires under a
// live user request. Without this, every ~15 min the next /fuel/prices
// caller pays the full Fuel Finder / 13-retailer-feed fetch cost (8.33s
// avg, 26s p95). With this, all user requests hit warm cache.
//
// Idempotent: if the cache is already warm enough (>3 min remaining)
// this is a no-op so manual triggers are safe.
export async function prewarmStationCache(): Promise<void> {
  const STALE_THRESHOLD_MS = FUEL_STATION_CACHE_TTL_MS - 3 * 60 * 1000;
  if (stationCache && (Date.now() - stationCache.fetchedAt) < STALE_THRESHOLD_MS) {
    return;
  }
  try {
    stationCache = await fetchAllStations();
  } catch (err) {
    console.warn("[fuel] prewarm failed:", (err as Error).message);
  }
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


/**
 * UK average pump prices.
 *
 * This used to read the government's weekly road fuel CSV. That URL carries a
 * dated filename and rotates every week, so it redirected to a file that was
 * 410 Gone, and this function had been silently returning null: the app's
 * fuel screen simply showed no national average. Discovered 25 Aug 2026.
 *
 * It is computed from our own station feed instead, which we already fetch
 * and cache for nearby search and which covers thousands of UK forecourts.
 * That removes the weekly breakage entirely, and the number is fresher than
 * a weekly series. The MEDIAN is used rather than the mean because a single
 * mis-keyed price in a retailer feed drags a mean and barely moves a median.
 */
const MIN_STATIONS_FOR_NATIONAL_AVERAGE = 100;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function getNationalAverages(): Promise<NationalAveragePrices | null> {
  try {
    const cached = await cacheGet(NATIONAL_AVG_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as NationalAveragePrices;
    }

    const { stations } = await getCachedStations();
    // Sanity band: retailer feeds occasionally carry prices in pounds, or a
    // placeholder. Anything outside a plausible pence-per-litre range is not
    // a price and must not move the average.
    const plausible = (v: number | undefined): v is number =>
      typeof v === "number" && v >= 50 && v <= 400;

    const petrol = stations.map((s) => s.prices.E10).filter(plausible);
    const diesel = stations.map((s) => s.prices.B7).filter(plausible);

    if (petrol.length < MIN_STATIONS_FOR_NATIONAL_AVERAGE || diesel.length < MIN_STATIONS_FOR_NATIONAL_AVERAGE) {
      return null;
    }

    const petrolMedian = median(petrol);
    const dieselMedian = median(diesel);
    if (petrolMedian === null || dieselMedian === null) return null;

    const result: NationalAveragePrices = {
      petrolPencePerLitre: Math.round(petrolMedian * 10) / 10,
      dieselPencePerLitre: Math.round(dieselMedian * 10) / 10,
      date: new Date().toISOString().slice(0, 10),
    };

    await cacheSet(NATIONAL_AVG_CACHE_KEY, JSON.stringify(result), NATIONAL_AVG_TTL_SECONDS);
    return result;
  } catch (err) {
    console.error("[fuel] national averages failed:", (err as Error).message);
    return null;
  }
}
