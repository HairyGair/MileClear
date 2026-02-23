// Community-sourced fuel prices service
// Aggregates nearby fuel logs from MileClear users + GOV.UK national averages

import { prisma } from "../lib/prisma.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import {
  FUEL_PRICE_STALENESS_DAYS,
} from "@mileclear/shared";
import type { CommunityFuelStation, NationalAveragePrices } from "@mileclear/shared";

const EARTH_RADIUS_MILES = 3958.8;
const NATIONAL_AVG_CACHE_KEY = "fuel:national_averages";
const NATIONAL_AVG_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export async function getNearbyFuelPrices(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<CommunityFuelStation[]> {
  // Bounding box pre-filter (rough, fast)
  const latDelta = radiusMiles / 69.0;
  const lngDelta = radiusMiles / (69.0 * Math.cos((lat * Math.PI) / 180));
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - FUEL_PRICE_STALENESS_DAYS);

  const rows = await prisma.$queryRawUnsafe<
    {
      station_name: string;
      avg_lat: number;
      avg_lng: number;
      avg_price_ppl: number;
      report_count: bigint;
      last_reported: Date;
      distance_miles: number;
    }[]
  >(
    `SELECT s.*, (
        ${EARTH_RADIUS_MILES} * ACOS(
          LEAST(1, COS(RADIANS(?)) * COS(RADIANS(s.avg_lat)) * COS(RADIANS(s.avg_lng) - RADIANS(?))
          + SIN(RADIANS(?)) * SIN(RADIANS(s.avg_lat)))
        )
      ) AS distance_miles
    FROM (
      SELECT
        LOWER(TRIM(stationName)) AS station_name,
        AVG(latitude) AS avg_lat,
        AVG(longitude) AS avg_lng,
        AVG(costPence / litres) AS avg_price_ppl,
        COUNT(*) AS report_count,
        MAX(loggedAt) AS last_reported
      FROM fuel_logs
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND stationName IS NOT NULL
        AND stationName != ''
        AND loggedAt >= ?
        AND latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
      GROUP BY LOWER(TRIM(stationName)), ROUND(latitude, 3), ROUND(longitude, 3)
    ) s
    HAVING distance_miles <= ?
    ORDER BY distance_miles ASC
    LIMIT 50`,
    lat,
    lng,
    lat,
    cutoffDate,
    minLat,
    maxLat,
    minLng,
    maxLng,
    radiusMiles
  );

  return rows.map((row) => ({
    stationName: row.station_name,
    latitude: row.avg_lat,
    longitude: row.avg_lng,
    distanceMiles: Math.round(row.distance_miles * 100) / 100,
    avgPricePerLitrePence: Math.round(row.avg_price_ppl * 10) / 10,
    reportCount: Number(row.report_count),
    lastReportedAt: row.last_reported instanceof Date
      ? row.last_reported.toISOString()
      : String(row.last_reported),
  }));
}

const GOV_UK_CSV_URL =
  "https://assets.publishing.service.gov.uk/media/6993252f7da91680ad7f44a1/CSV__2018_-____3_.csv";

export async function getNationalAverages(): Promise<NationalAveragePrices | null> {
  try {
    // Check cache first
    const cached = await cacheGet(NATIONAL_AVG_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as NationalAveragePrices;
    }

    const response = await fetch(GOV_UK_CSV_URL);
    if (!response.ok) return null;

    const text = await response.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;

    // Parse header to find ULSP (unleaded petrol) and ULSD (diesel) column indices
    const headers = lines[0].split(",").map((h) => h.trim().toUpperCase());
    const ulspIndex = headers.findIndex((h) => h.includes("ULSP"));
    const ulsdIndex = headers.findIndex((h) => h.includes("ULSD"));
    if (ulspIndex === -1 || ulsdIndex === -1) return null;

    // Read last data row
    const lastLine = lines[lines.length - 1];
    const cols = lastLine.split(",").map((c) => c.trim());

    const petrolPpl = parseFloat(cols[ulspIndex]);
    const dieselPpl = parseFloat(cols[ulsdIndex]);
    if (isNaN(petrolPpl) || isNaN(dieselPpl)) return null;

    // GOV.UK prices are in pence per litre already
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
