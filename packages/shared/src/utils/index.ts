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

/**
 * Fetch the actual driving distance between two points using OSRM.
 * Returns distance in miles, or null if the request fails.
 * Uses the free OSRM demo server (no API key needed).
 */
export async function fetchRouteDistance(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<{ distanceMiles: number; durationSecs: number } | null> {
  try {
    // Request alternatives and pick the shortest distance route —
    // OSRM's default "fastest" route often overshoots on distance
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=false&alternatives=true`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    // Pick the route with the shortest distance
    const route = data.routes.reduce(
      (shortest: { distance: number; duration: number }, r: { distance: number; duration: number }) =>
        r.distance < shortest.distance ? r : shortest,
      data.routes[0]
    );
    return {
      distanceMiles: Math.round((route.distance / 1609.344) * 100) / 100,
      durationSecs: Math.round(route.duration),
    };
  } catch {
    return null;
  }
}

/**
 * Compute trip insights from GPS coordinates.
 * Coordinates must be sorted by recordedAt ascending.
 */
export function computeTripInsights(
  coords: { lat: number; lng: number; speed: number | null; recordedAt: string | Date }[],
  distanceMiles: number,
  durationSecs: number,
): import("../types/index.js").TripInsights | null {
  if (coords.length < 2) return null;

  const MS_TO_MPH = 2.23694;
  const STOP_SPEED_MS = 1.5;

  let topSpeedMph = 0;
  let movingSpeedSum = 0;
  let movingCount = 0;
  let timeMovingSecs = 0;
  let timeStoppedSecs = 0;
  let currentStretchMiles = 0;
  let longestNonStopMiles = 0;
  let numberOfStops = 0;
  let wasMoving = false;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const dt =
      (new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 1000;
    if (dt <= 0) continue;

    // Use GPS speed if available, otherwise estimate from distance/time
    const segDist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    let speed = curr.speed;
    if (speed == null && dt > 0) {
      // Estimate speed in m/s from haversine distance
      speed = (segDist * 1609.344) / dt;
    }
    const isStopped = speed != null ? speed < STOP_SPEED_MS : false;

    if (speed != null && speed >= 0) {
      const mph = speed * MS_TO_MPH;
      if (mph > topSpeedMph) topSpeedMph = mph;
      if (!isStopped) {
        movingSpeedSum += mph;
        movingCount++;
      }
    }

    if (isStopped) {
      timeStoppedSecs += dt;
      if (wasMoving) numberOfStops++;
      wasMoving = false;
      if (currentStretchMiles > longestNonStopMiles) {
        longestNonStopMiles = currentStretchMiles;
      }
      currentStretchMiles = 0;
    } else {
      timeMovingSecs += dt;
      wasMoving = true;
      currentStretchMiles += segDist;
    }
  }

  if (currentStretchMiles > longestNonStopMiles) {
    longestNonStopMiles = currentStretchMiles;
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  const straightLine = haversineDistance(first.lat, first.lng, last.lat, last.lng);
  const routeEfficiency = straightLine > 0.01 ? distanceMiles / straightLine : 1;

  const avgSpeedMph = durationSecs > 0 ? (distanceMiles / durationSecs) * 3600 : 0;
  const avgMovingSpeedMph = movingCount > 0 ? movingSpeedSum / movingCount : avgSpeedMph;

  const topMph = Math.round(topSpeedMph);
  let speedFunFact: string | null = null;
  if (topMph >= 70) speedFunFact = "Motorway speed reached — 70 mph zone";
  else if (topMph >= 60) speedFunFact = "Dual carriageway pace — 60 mph zone";
  else if (topMph >= 40) speedFunFact = "Faster than Usain Bolt's 27 mph world record";
  else if (topMph >= 30) speedFunFact = "Town driving — nice and steady";
  else if (topMph >= 15) speedFunFact = "Quicker than a London cyclist";

  let distanceFunFact: string | null = null;
  if (distanceMiles >= 100) distanceFunFact = "That's like London to Birmingham";
  else if (distanceMiles >= 60) distanceFunFact = "That's London to Brighton and back";
  else if (distanceMiles >= 30) distanceFunFact = "About the same as London to Brighton";
  else if (distanceMiles >= 15) distanceFunFact = `That's about ${Math.round(distanceMiles * 100)} football pitches end-to-end`;
  else if (distanceMiles >= 7) distanceFunFact = `About ${Math.round(distanceMiles / 3.1)} parkruns back-to-back`;
  else if (distanceMiles >= 4) distanceFunFact = "A bit more than a parkrun by road";
  else if (distanceMiles >= 2.5) distanceFunFact = "About a parkrun distance by road";
  else if (distanceMiles >= 1) distanceFunFact = `About ${Math.round(distanceMiles * 20)} laps of a running track`;

  const re = Math.round(routeEfficiency * 10) / 10;
  let routeDirectnessNote: string | null = null;
  if (re <= 1.3) routeDirectnessNote = "Nearly a straight line — very direct route";
  else if (re <= 2.0) routeDirectnessNote = "Pretty direct — minimal detours";
  else if (re <= 3.5) routeDirectnessNote = "A few twists and turns along the way";
  else if (re <= 6.0) routeDirectnessNote = "Winding route — lots of turns";
  else routeDirectnessNote = "Very indirect — you really explored the area";

  return {
    topSpeedMph: topMph,
    avgSpeedMph: Math.round(avgSpeedMph),
    avgMovingSpeedMph: Math.round(avgMovingSpeedMph),
    timeMovingSecs: Math.round(timeMovingSecs),
    timeStoppedSecs: Math.round(timeStoppedSecs),
    routeEfficiency: re,
    longestNonStopMiles: Math.round(longestNonStopMiles * 10) / 10,
    numberOfStops,
    coordCount: coords.length,
    speedFunFact,
    distanceFunFact,
    routeDirectnessNote,
  };
}
