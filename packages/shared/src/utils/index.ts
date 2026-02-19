import { HMRC_RATES, HMRC_THRESHOLD_MILES } from "../constants/index.js";

/**
 * Calculate the Haversine distance between two coordinates in miles.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate HMRC mileage deduction in pence for a given vehicle type and distance.
 */
export function calculateHmrcDeduction(
  vehicleType: "car" | "van" | "motorbike",
  totalBusinessMiles: number
): number {
  if (vehicleType === "motorbike") {
    return Math.round(totalBusinessMiles * HMRC_RATES.motorbike.flat);
  }

  const rates = HMRC_RATES[vehicleType];
  if (totalBusinessMiles <= HMRC_THRESHOLD_MILES) {
    return Math.round(totalBusinessMiles * rates.first10000);
  }

  const first = HMRC_THRESHOLD_MILES * rates.first10000;
  const remaining = (totalBusinessMiles - HMRC_THRESHOLD_MILES) * rates.after10000;
  return Math.round(first + remaining);
}

/**
 * Format pence as GBP string (e.g. 12345 → "£123.45").
 */
export function formatPence(pence: number): string {
  const pounds = pence / 100;
  return `\u00A3${pounds.toFixed(2)}`;
}

/**
 * Format a distance in miles (e.g. 1234.5 → "1,234.5 mi").
 */
export function formatMiles(miles: number): string {
  return `${miles.toLocaleString("en-GB", { maximumFractionDigits: 1 })} mi`;
}

/**
 * Get the UK tax year string for a given date (e.g. "2025-26").
 * UK tax year runs 6 April to 5 April.
 */
export function getTaxYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();

  // Before 6 April = previous tax year
  if (month < 3 || (month === 3 && day < 6)) {
    return `${year - 1}-${String(year).slice(2)}`;
  }
  return `${year}-${String(year + 1).slice(2)}`;
}

/**
 * Parse a UK tax year string (e.g. "2025-26") into start/end dates.
 * Tax year runs 6 April to 5 April.
 */
export function parseTaxYear(taxYear: string): { start: Date; end: Date } {
  const match = taxYear.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`Invalid tax year format: ${taxYear}`);

  const startYear = parseInt(match[1], 10);
  const endYear = startYear + 1;

  // Validate the suffix matches
  if (match[2] !== String(endYear).slice(2)) {
    throw new Error(`Invalid tax year format: ${taxYear}`);
  }

  return {
    start: new Date(startYear, 3, 6), // 6 April
    end: new Date(endYear, 3, 5, 23, 59, 59, 999), // 5 April 23:59:59.999
  };
}
