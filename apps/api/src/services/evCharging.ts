// EV charging data — the electric analogue of the fuel service.
//
//  - Nearby chargers: Open Charge Map (free, CC BY 4.0 — requires visible
//    attribution, which the response carries). Needs a free API key in
//    OPEN_CHARGE_MAP_API_KEY; no-ops gracefully when unset (like fuelFinder).
//  - Home electricity rate: Octopus Energy public API (no auth). Used to
//    suggest a current p/kWh; the user can override and store their own.
//
// Charge-point locations change slowly, so we cache aggressively in-memory by
// a coarse geographic cell, mirroring the fuel-station cache.

import type { ChargePoint, ElectricityRate } from "@mileclear/shared";

const OCM_API_KEY = process.env.OPEN_CHARGE_MAP_API_KEY || "";
const OCM_BASE = "https://api.openchargemap.io/v3";
const OCM_ATTRIBUTION = "Charge point data © Open Charge Map contributors";

export function isOpenChargeMapConfigured(): boolean {
  return !!OCM_API_KEY;
}

interface OcmCacheEntry {
  chargers: ChargePoint[];
  at: number;
}
const ocmCache = new Map<string, OcmCacheEntry>();
const OCM_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — charge points change slowly
const OCM_FETCH_TIMEOUT_MS = 8000;

/** Coarse cache key: round to ~1km so nearby requests share a cache entry. */
function cellKey(lat: number, lng: number, radiusMiles: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)},${radiusMiles}`;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const ACCESS_MAP: Record<number, string> = {
  1: "public",
  4: "public",
  5: "restricted",
  6: "restricted",
  7: "membership",
};

interface OcmPoi {
  ID: number;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    Postcode?: string;
    Latitude?: number;
    Longitude?: number;
  };
  OperatorInfo?: { Title?: string } | null;
  UsageType?: { ID?: number } | null;
  UsageCost?: string | null;
  Connections?: { ConnectionType?: { Title?: string } | null; PowerKW?: number | null }[] | null;
}

function normaliseOcm(poi: OcmPoi, fromLat: number, fromLng: number): ChargePoint | null {
  const a = poi.AddressInfo;
  if (!a || a.Latitude == null || a.Longitude == null) return null;

  // Group connectors by type, summing counts and tracking max power.
  const byType = new Map<string, { powerKw: number | null; count: number }>();
  let maxPowerKw: number | null = null;
  for (const c of poi.Connections ?? []) {
    const type = c.ConnectionType?.Title ?? "Unknown";
    const power = typeof c.PowerKW === "number" ? c.PowerKW : null;
    if (power != null && (maxPowerKw == null || power > maxPowerKw)) maxPowerKw = power;
    const existing = byType.get(type);
    if (existing) {
      existing.count += 1;
      if (power != null && (existing.powerKw == null || power > existing.powerKw)) existing.powerKw = power;
    } else {
      byType.set(type, { powerKw: power, count: 1 });
    }
  }

  return {
    id: String(poi.ID),
    name: a.Title ?? "Charge point",
    operator: poi.OperatorInfo?.Title ?? null,
    address: [a.AddressLine1, a.Town].filter(Boolean).join(", "),
    postcode: a.Postcode ?? null,
    latitude: a.Latitude,
    longitude: a.Longitude,
    distanceMiles: Math.round(haversineMiles(fromLat, fromLng, a.Latitude, a.Longitude) * 10) / 10,
    access: ACCESS_MAP[poi.UsageType?.ID ?? -1] ?? "unknown",
    connectors: [...byType.entries()].map(([type, v]) => ({ type, powerKw: v.powerKw, count: v.count })),
    maxPowerKw,
    costNote: poi.UsageCost?.trim() || null,
  };
}

/**
 * Nearby public EV chargers from Open Charge Map. Cached per coarse cell.
 * Returns [] (not an error) when the key is unconfigured or the upstream
 * fails — the feature degrades, never breaks the request.
 */
export async function getNearbyChargers(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<{ chargers: ChargePoint[]; attribution: string }> {
  if (!isOpenChargeMapConfigured()) return { chargers: [], attribution: OCM_ATTRIBUTION };

  const key = cellKey(lat, lng, radiusMiles);
  const cached = ocmCache.get(key);
  if (cached && Date.now() - cached.at < OCM_CACHE_TTL_MS) {
    return { chargers: cached.chargers, attribution: OCM_ATTRIBUTION };
  }

  try {
    const url =
      `${OCM_BASE}/poi/?output=json&countrycode=GB&maxresults=50` +
      `&latitude=${lat}&longitude=${lng}&distance=${radiusMiles}&distanceunit=Miles`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OCM_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "X-API-Key": OCM_API_KEY, "User-Agent": "MileClear/1.0 (+https://mileclear.com)" },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return { chargers: cached?.chargers ?? [], attribution: OCM_ATTRIBUTION };

    const pois = (await res.json()) as OcmPoi[];
    const chargers = (Array.isArray(pois) ? pois : [])
      .map((p) => normaliseOcm(p, lat, lng))
      .filter((c): c is ChargePoint => c != null)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
    ocmCache.set(key, { chargers, at: Date.now() });
    return { chargers, attribution: OCM_ATTRIBUTION };
  } catch {
    return { chargers: cached?.chargers ?? [], attribution: OCM_ATTRIBUTION };
  }
}

// ── Octopus electricity rate (public, no auth) ───────────────────────────────

const OCTOPUS_BASE = "https://api.octopus.energy/v1";
// Current Agile product + a representative region (London, GSP group "C") for
// a national-ish reference. Users on other tariffs override with their own.
const OCTOPUS_AGILE_PRODUCT = "AGILE-24-10-01";
const OCTOPUS_AGILE_TARIFF = "E-1R-AGILE-24-10-01-C";
const DEFAULT_PENCE_PER_KWH = 24.5;

interface RateCache {
  rate: ElectricityRate;
  at: number;
}
let octopusCache: RateCache | null = null;
const OCTOPUS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — Agile updates daily

/**
 * Suggest a current home electricity rate (p/kWh). Tries the Octopus Agile
 * public feed (the day's average of the half-hourly rates); falls back to a
 * sensible UK default. Best-effort; never throws.
 */
export async function getElectricityRate(): Promise<ElectricityRate> {
  if (octopusCache && Date.now() - octopusCache.at < OCTOPUS_CACHE_TTL_MS) {
    return octopusCache.rate;
  }
  const fallback: ElectricityRate = {
    pencePerKwh: DEFAULT_PENCE_PER_KWH,
    source: "default",
    region: null,
    asOf: new Date().toISOString(),
  };
  try {
    const url = `${OCTOPUS_BASE}/products/${OCTOPUS_AGILE_PRODUCT}/electricity-tariffs/${OCTOPUS_AGILE_TARIFF}/standard-unit-rates/?page_size=48`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return fallback;
    const body = (await res.json()) as { results?: { value_inc_vat?: number }[] };
    const rates = (body.results ?? []).map((r) => r.value_inc_vat).filter((v): v is number => typeof v === "number");
    if (rates.length === 0) return fallback;
    const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
    const rate: ElectricityRate = {
      pencePerKwh: Math.round(avg * 10) / 10,
      source: "octopus_agile",
      region: "London (C)",
      asOf: new Date().toISOString(),
    };
    octopusCache = { rate, at: Date.now() };
    return rate;
  } catch {
    return fallback;
  }
}
