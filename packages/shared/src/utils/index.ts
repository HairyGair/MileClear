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

// ── Distance equivalents ───────────────────────────────────────────
// 125+ real-world comparisons so users rarely see the same one twice.
// Distances are real driving miles from London unless noted.
// Templates use {n} for the trip-count multiplier.

interface DC {
  min: number; max: number; dist: number;
  s: string; m: string;
  r?: string; // UK region tag — undefined = universal
}

// UK regions derived from coordinates
export type UkRegion =
  | "north_east" | "north_west" | "yorkshire" | "midlands"
  | "east" | "london" | "south_east" | "south_west"
  | "wales" | "scotland";

/**
 * Detect UK region from latitude/longitude.
 * Returns undefined for non-UK or unknown coordinates.
 */
export function detectUkRegion(lat: number, lng: number): UkRegion | undefined {
  if (lat < 49.9 || lat > 60.9 || lng < -8.2 || lng > 1.8) return undefined;
  if (lat > 55.8) return "scotland";
  if (lng < -3.0 && lat < 53.5 && lat > 51.3) return "wales";
  if (lat > 54.5 && lng > -2.5) return "north_east";
  if (lat > 53.5 && lng < -1.5) return "north_west";
  if (lat > 53.2 && lat <= 54.5 && lng >= -2.0) return "yorkshire";
  if (lat > 52.0 && lat <= 53.5) return "midlands";
  if (lat < 51.8 && lng < -2.0) return "south_west";
  if (lat >= 51.3 && lat <= 51.7 && lng >= -0.5 && lng <= 0.3) return "london";
  if (lat < 52.2 && lng > 0.4) return "east";
  if (lat < 51.8) return "south_east";
  return undefined;
}

const C: DC[] = [
  // ── Tiny (1–5 mi) ──
  { min: 1, max: 6, dist: 0.05, s: "About {n} laps of a running track", m: "About {n} laps of a running track" },
  { min: 1, max: 6, dist: 1, s: "About as far as a walk across central London", m: "Like {n} walks across central London" },
  { min: 1, max: 6, dist: 2, s: "Roughly Tower Bridge to Buckingham Palace and back", m: "Like {n} trips between Tower Bridge and the Palace" },
  { min: 2, max: 6, dist: 3, s: "About the length of the Thames through Zone 1", m: "Like cruising the Thames through Zone 1 {n} times" },
  { min: 3, max: 6, dist: 4, s: "Like a lap of Hyde Park and Kensington Gardens", m: "Like {n} laps of Hyde Park" },

  // ── Short (5–15 mi) ──
  { min: 5, max: 16, dist: 4, s: "Roughly a Heathrow round trip", m: "Like {n} trips to Heathrow and back" },
  { min: 5, max: 16, dist: 9, s: "About the length of the Tube's Central line", m: "Like riding the Central line end-to-end {n} times" },
  { min: 5, max: 16, dist: 6, s: "About London City to Canary Wharf and back", m: "Like {n} trips between City and Canary Wharf" },
  { min: 5, max: 16, dist: 7, s: "Like driving across Greater Manchester", m: "Like {n} drives across Greater Manchester" },
  { min: 5, max: 16, dist: 8, s: "About the length of the Blackwall Tunnel route", m: "Like {n} Blackwall Tunnel runs" },
  { min: 7, max: 16, dist: 10, s: "About the width of Birmingham", m: "Like driving across Birmingham {n} times" },
  { min: 8, max: 16, dist: 11, s: "Like crossing the whole of Belfast", m: "Like {n} drives across Belfast" },
  { min: 10, max: 16, dist: 13, s: "About the Dartford Crossing round trip", m: "Like {n} Dartford Crossing round trips" },

  // ── Medium (15–55 mi) ──
  { min: 15, max: 55, dist: 21, s: "That's London to Watford and back", m: "Like driving to Watford and back {n} times" },
  { min: 15, max: 55, dist: 26, s: "About the length of the M25 orbital", m: "That's {n} laps of the M25" },
  { min: 15, max: 55, dist: 16, s: "Like London to Croydon and back", m: "Like {n} round trips to Croydon" },
  { min: 15, max: 55, dist: 18, s: "About the length of the M1 through Hertfordshire", m: "Like {n} runs up the M1 through Herts" },
  { min: 20, max: 55, dist: 22, s: "Like crossing the Isle of Wight coast to coast three times", m: "Like {n} Isle of Wight crossings" },
  { min: 20, max: 55, dist: 25, s: "About the length of Loch Ness", m: "Like driving the length of Loch Ness {n} times" },
  { min: 25, max: 55, dist: 30, s: "Like Manchester to Liverpool and back", m: "Like {n} trips between Manchester and Liverpool" },
  { min: 25, max: 55, dist: 28, s: "Like Edinburgh to Stirling and back", m: "Like {n} Edinburgh-to-Stirling round trips" },
  { min: 30, max: 55, dist: 34, s: "Like London to Southend-on-Sea", m: "Like {n} trips to Southend" },
  { min: 30, max: 55, dist: 37, s: "About the length of the M4 through Wales", m: "Like {n} runs along the Welsh M4" },
  { min: 35, max: 55, dist: 40, s: "Like crossing the Lake District end to end", m: "Like {n} drives across the Lake District" },
  { min: 40, max: 55, dist: 45, s: "About Leeds to Sheffield and back", m: "Like {n} Leeds-to-Sheffield round trips" },

  // ── Longer (50–130 mi) ──
  { min: 50, max: 130, dist: 55, s: "Like driving from London to Brighton", m: "Like {n} trips to Brighton from London" },
  { min: 50, max: 130, dist: 61, s: "About London to Cambridge", m: "Like {n} London-to-Cambridge drives" },
  { min: 50, max: 130, dist: 52, s: "Like London to Canterbury", m: "Like {n} drives to Canterbury from London" },
  { min: 50, max: 130, dist: 58, s: "About the length of the A1(M) through Yorkshire", m: "Like {n} runs along the Yorkshire A1" },
  { min: 55, max: 130, dist: 65, s: "Like Glasgow to Edinburgh and back", m: "Like {n} Glasgow-Edinburgh round trips" },
  { min: 60, max: 130, dist: 72, s: "Like driving coast to coast across northern England", m: "Like {n} coast-to-coast drives across England" },
  { min: 60, max: 130, dist: 76, s: "That could get you from London to Oxford and back", m: "Like {n} round trips to Oxford" },
  { min: 65, max: 130, dist: 80, s: "About Manchester to the Peak District and back", m: "Like {n} Peak District round trips" },
  { min: 70, max: 130, dist: 85, s: "Like driving the North Coast 500's best section", m: "Like {n} runs of the NC500 highlights" },
  { min: 75, max: 130, dist: 90, s: "About Bristol to Exeter", m: "Like {n} Bristol-to-Exeter drives" },
  { min: 80, max: 130, dist: 100, s: "About as far as London to Bristol", m: "Like {n} drives from London to Bristol" },
  { min: 80, max: 130, dist: 95, s: "Like London to Southampton and back", m: "Like {n} Southampton round trips" },
  { min: 90, max: 130, dist: 110, s: "Like driving the Welsh coast from Cardiff to Aberystwyth", m: "Like {n} drives along the Welsh coast" },
  { min: 100, max: 130, dist: 120, s: "About London to Bath and back", m: "Like {n} London-to-Bath round trips" },

  // ── Regional (120–320 mi) ──
  { min: 120, max: 320, dist: 127, s: "That's London to Birmingham", m: "Like {n} drives to Birmingham from London" },
  { min: 120, max: 320, dist: 135, s: "About London to Nottingham", m: "Like {n} drives to Nottingham" },
  { min: 120, max: 320, dist: 140, s: "Like driving from Birmingham to the Scottish border", m: "Like {n} drives from Birmingham to Scotland" },
  { min: 130, max: 320, dist: 150, s: "Like the full length of the M5", m: "Like driving the entire M5 {n} times" },
  { min: 140, max: 320, dist: 162, s: "Like driving from London to Cardiff", m: "Like {n} London-to-Cardiff journeys" },
  { min: 150, max: 320, dist: 170, s: "About London to Lincoln", m: "Like {n} drives from London to Lincoln" },
  { min: 160, max: 320, dist: 185, s: "Like driving from London to the Peak District", m: "Like {n} trips to the Peaks from London" },
  { min: 160, max: 320, dist: 200, s: "That would get you from London to Manchester", m: "Like {n} trips from London to Manchester" },
  { min: 180, max: 320, dist: 195, s: "Like London to Blackpool", m: "Like {n} drives to Blackpool from London" },
  { min: 200, max: 320, dist: 210, s: "Like driving from London to York", m: "Like {n} trips from London to York" },
  { min: 200, max: 320, dist: 220, s: "About the full length of the M6", m: "Like driving the entire M6 {n} times" },
  { min: 220, max: 320, dist: 240, s: "Like London to the Lake District", m: "Like {n} drives from London to the Lakes" },
  { min: 230, max: 320, dist: 250, s: "Like driving from Exeter to Edinburgh", m: "Like {n} Exeter-to-Edinburgh drives" },
  { min: 250, max: 320, dist: 275, s: "That's about London to Newcastle", m: "Like driving to Newcastle {n} times" },
  { min: 260, max: 320, dist: 280, s: "About Liverpool to Inverness", m: "Like {n} drives from Liverpool to Inverness" },
  { min: 270, max: 320, dist: 290, s: "Like London to Carlisle", m: "Like {n} drives from London to Carlisle" },
  { min: 280, max: 320, dist: 300, s: "About the width of France", m: "Like driving across France {n} times" },
  { min: 290, max: 320, dist: 310, s: "Like Cornwall to the Scottish Highlands", m: "Like {n} Cornwall-to-Highlands trips" },

  // ── Cross-country (300–620 mi) ──
  { min: 300, max: 620, dist: 320, s: "Like driving from London to Anglesey", m: "Like {n} drives to Anglesey" },
  { min: 300, max: 620, dist: 350, s: "About London to Dumfries", m: "Like {n} London-to-Dumfries drives" },
  { min: 300, max: 620, dist: 395, s: "Like driving from London to Glasgow", m: "Like {n} drives to Glasgow from London" },
  { min: 320, max: 620, dist: 380, s: "Like driving from Bristol to the Highlands", m: "Like {n} Bristol-to-Highlands road trips" },
  { min: 350, max: 620, dist: 405, s: "That would take you from London to Edinburgh", m: "Like {n} drives from London to Edinburgh" },
  { min: 350, max: 620, dist: 420, s: "About the length of the entire UK motorway network's M1", m: "Like {n} full M1 drives" },
  { min: 380, max: 620, dist: 440, s: "Like driving from Dover to the tip of Scotland", m: "Like {n} drives from Dover to northern Scotland" },
  { min: 400, max: 620, dist: 460, s: "Like London to Thurso — almost the very top", m: "Like {n} drives to the top of Scotland" },
  { min: 400, max: 620, dist: 476, s: "That's like London to Inverness", m: "Like {n} drives to the Highlands" },
  { min: 430, max: 620, dist: 500, s: "About London to the Orkney Islands", m: "Like {n} drives from London to Orkney" },
  { min: 450, max: 620, dist: 510, s: "Like driving from Plymouth to Aberdeen", m: "Like {n} Plymouth-to-Aberdeen road trips" },
  { min: 480, max: 620, dist: 540, s: "Like driving from London to Aberdeen", m: "Like {n} trips to Aberdeen" },
  { min: 500, max: 620, dist: 560, s: "About the length of Ireland coast to coast twice", m: "Like {n} Irish coast-to-coast drives" },
  { min: 520, max: 620, dist: 580, s: "Like driving the whole of Route 66 in miniature", m: "Like {n} mini Route 66 adventures" },
  { min: 550, max: 620, dist: 600, s: "About the distance from London to Amsterdam via ferry", m: "Like {n} London-to-Amsterdam road trips" },

  // ── National + short European (600–1200 mi) ──
  { min: 600, max: 1200, dist: 650, s: "Like driving from London to Zurich", m: "Like {n} drives to Zurich" },
  { min: 600, max: 1200, dist: 700, s: "Like the full North Coast 500 route in Scotland", m: "Like {n} laps of the NC500" },
  { min: 600, max: 1200, dist: 874, s: "That's the full length of Britain — Land's End to John o' Groats!", m: "Like driving Land's End to John o' Groats {n} times" },
  { min: 600, max: 1200, dist: 550, s: "Like a UK road trip — London up to Edinburgh and back", m: "Like {n} London-to-Edinburgh round trips" },
  { min: 650, max: 1200, dist: 730, s: "Like driving from London to Barcelona", m: "Like {n} drives to Barcelona" },
  { min: 650, max: 1200, dist: 750, s: "About London to the Swiss Alps", m: "Like {n} road trips to the Alps" },
  { min: 700, max: 1200, dist: 800, s: "Like London to the French Riviera", m: "Like {n} drives to the Riviera" },
  { min: 700, max: 1200, dist: 850, s: "About the length of Italy from Milan to Sicily", m: "Like driving the length of Italy {n} times" },
  { min: 750, max: 1200, dist: 880, s: "Like London to Venice", m: "Like {n} London-to-Venice road trips" },
  { min: 800, max: 1200, dist: 900, s: "Like driving from London to Rome", m: "Like {n} London-to-Rome road trips" },
  { min: 800, max: 1200, dist: 920, s: "About London to Prague", m: "Like {n} drives to Prague" },
  { min: 850, max: 1200, dist: 950, s: "Like London to the Croatian coast", m: "Like {n} drives to Croatia" },
  { min: 900, max: 1200, dist: 1000, s: "About the length of Norway's western coastline", m: "Like driving the Norwegian coast {n} times" },
  { min: 900, max: 1200, dist: 1050, s: "Like London to Copenhagen via the continent", m: "Like {n} London-to-Copenhagen drives" },
  { min: 950, max: 1200, dist: 1100, s: "That's about London to Berlin and back", m: "Like {n} Berlin round trips from London" },
  { min: 1000, max: 1200, dist: 1150, s: "Like a grand European tour — London to Rome via Paris", m: "Like {n} grand European tours" },
  { min: 1050, max: 1200, dist: 1180, s: "About London to Warsaw", m: "Like {n} drives to Warsaw" },

  // ── European long-haul (1200–2500 mi) ──
  { min: 1200, max: 2500, dist: 1300, s: "Like driving from London to Madrid", m: "Like {n} drives to Madrid" },
  { min: 1200, max: 2500, dist: 1350, s: "About London to southern Portugal", m: "Like {n} drives to the Algarve" },
  { min: 1300, max: 2500, dist: 1400, s: "Like driving from London to Athens via the Balkans", m: "Like {n} Balkan road trips" },
  { min: 1300, max: 2500, dist: 1500, s: "Like driving from London to Athens", m: "Like {n} drives to Athens" },
  { min: 1400, max: 2500, dist: 1600, s: "About London to Stockholm", m: "Like {n} drives to Stockholm" },
  { min: 1500, max: 2500, dist: 1700, s: "Like driving from London to the northernmost tip of Norway", m: "Like {n} drives to Nordkapp" },
  { min: 1500, max: 2500, dist: 1750, s: "That's London to Land's End to John o' Groats and back again", m: "Like {n} full British round trips" },
  { min: 1600, max: 2500, dist: 1800, s: "About London to Helsinki", m: "Like {n} drives to Helsinki" },
  { min: 1700, max: 2500, dist: 1900, s: "Like London to Marrakech via Spain", m: "Like {n} road trips to Morocco" },
  { min: 1800, max: 2500, dist: 2000, s: "Like driving from London to Istanbul", m: "Like {n} drives to Istanbul" },
  { min: 2000, max: 2500, dist: 2200, s: "Like London to Cairo if roads connected", m: "Like {n} London-to-Cairo journeys" },
  { min: 2200, max: 2500, dist: 2400, s: "About the full Trans-Siberian Railway's European stretch", m: "Like {n} Trans-Siberian European legs" },

  // ── Global (2500–6000 mi) ──
  { min: 2500, max: 6000, dist: 2800, s: "Like driving from London to the Sahara Desert", m: "Like {n} drives to the Sahara" },
  { min: 2500, max: 6000, dist: 3100, s: "That's about London to Riyadh", m: "Like {n} drives from London to Riyadh" },
  { min: 2800, max: 6000, dist: 3200, s: "About the width of the United States", m: "Like driving coast-to-coast across America {n} times" },
  { min: 3000, max: 6000, dist: 3500, s: "Like driving from London to New York (if you could!)", m: "That's {n} Atlantic crossings worth of driving" },
  { min: 3000, max: 6000, dist: 3400, s: "About London to the middle of the Sahara", m: "Like {n} drives deep into the Sahara" },
  { min: 3200, max: 6000, dist: 3800, s: "Like driving the entire length of Africa's west coast", m: "Like {n} West African coast drives" },
  { min: 3500, max: 6000, dist: 4000, s: "About the distance from London to Dubai", m: "Like {n} London-to-Dubai road trips" },
  { min: 3500, max: 6000, dist: 4200, s: "Like driving the Pan-American Highway from Alaska to Panama", m: "Like {n} Pan-American drives" },
  { min: 4000, max: 6000, dist: 4500, s: "About London to Delhi", m: "Like {n} London-to-Delhi road trips" },
  { min: 4500, max: 6000, dist: 5000, s: "Like driving from London to Beijing", m: "Like {n} London-to-Beijing expeditions" },

  // ── Epic (6000–15000 mi) ──
  { min: 5000, max: 15000, dist: 5600, s: "Like driving from London to Mumbai", m: "Like {n} London-to-Mumbai road trips" },
  { min: 5500, max: 15000, dist: 6000, s: "About driving from London to Tokyo via the Silk Road", m: "Like {n} Silk Road journeys" },
  { min: 6000, max: 15000, dist: 6500, s: "Like driving the entire length of the Americas", m: "Like {n} drives across the Americas" },
  { min: 7000, max: 15000, dist: 7500, s: "About the distance from London to Singapore", m: "Like {n} London-to-Singapore road trips" },
  { min: 8000, max: 15000, dist: 9000, s: "Like driving from London to Cape Town", m: "Like {n} London-to-Cape-Town expeditions" },
  { min: 8000, max: 15000, dist: 10700, s: "That's almost halfway around the Earth", m: "Like driving around half the planet {n} times" },
  { min: 10000, max: 15000, dist: 11000, s: "Like driving from London to Sydney the long way", m: "Like {n} drives to Australia" },
  { min: 12000, max: 15000, dist: 13000, s: "About the distance from pole to pole", m: "Like driving from the North Pole to the South Pole {n} times" },

  // ── Planetary (15000+ mi) ──
  { min: 15000, max: 30000, dist: 24901, s: "That's the circumference of the Earth!", m: "Like driving around the Earth {n} times" },
  { min: 25000, max: 60000, dist: 24901, s: "You've driven further than the Earth's circumference!", m: "Like driving around the Earth {n} times" },
  { min: 50000, max: 300000, dist: 24901, s: "Like driving around the Earth {n} times", m: "Like driving around the Earth {n} times" },
  { min: 200000, max: 500000, dist: 238900, s: "That's about the distance to the Moon!", m: "Like driving to the Moon {n} times" },
  { min: 238900, max: Infinity, dist: 238900, s: "Like driving to the Moon {n} times", m: "Like driving to the Moon {n} times" },

  // ══════════════════════════════════════════════════════════════════
  // REGIONAL — tagged with r: "region_name"
  // These are blended with universal comparisons when region matches.
  // ══════════════════════════════════════════════════════════════════

  // ── North East ──
  { min: 1, max: 6, dist: 2, r: "north_east", s: "About the walk from the Tyne Bridge to the Angel of the North", m: "Like {n} walks from the Tyne Bridge to the Angel" },
  { min: 2, max: 6, dist: 3, r: "north_east", s: "Like a lap of Newcastle's Town Moor", m: "Like {n} laps of the Town Moor" },
  { min: 5, max: 16, dist: 12, r: "north_east", s: "About Newcastle to Durham", m: "Like {n} trips from Newcastle to Durham" },
  { min: 5, max: 16, dist: 10, r: "north_east", s: "Like Newcastle to Sunderland", m: "Like {n} runs from Newcastle to Sunderland" },
  { min: 5, max: 16, dist: 14, r: "north_east", s: "About Newcastle to the coast at Tynemouth", m: "Like {n} trips to Tynemouth" },
  { min: 8, max: 16, dist: 12, r: "north_east", s: "Like a run along the A19 to the Tyne Tunnel", m: "Like {n} Tyne Tunnel runs" },
  { min: 15, max: 55, dist: 30, r: "north_east", s: "Like Newcastle to Middlesbrough", m: "Like {n} drives from Newcastle to Boro" },
  { min: 15, max: 55, dist: 25, r: "north_east", s: "About Newcastle to Hexham", m: "Like {n} Newcastle-to-Hexham drives" },
  { min: 15, max: 55, dist: 20, r: "north_east", s: "Like Sunderland to Hartlepool along the coast", m: "Like {n} coastal runs to Hartlepool" },
  { min: 20, max: 55, dist: 35, r: "north_east", s: "Like Newcastle to Alnwick Castle", m: "Like {n} trips to Alnwick Castle" },
  { min: 25, max: 55, dist: 40, r: "north_east", s: "About Newcastle to Kielder Water", m: "Like {n} drives to Kielder" },
  { min: 30, max: 55, dist: 50, r: "north_east", s: "Like Newcastle to the Scottish border at Berwick", m: "Like {n} drives to Berwick" },
  { min: 50, max: 130, dist: 60, r: "north_east", s: "About Newcastle to Whitby", m: "Like {n} trips from Newcastle to Whitby" },
  { min: 50, max: 130, dist: 55, r: "north_east", s: "Like Newcastle to Carlisle across the Pennines", m: "Like {n} drives across the Pennines" },
  { min: 60, max: 130, dist: 75, r: "north_east", s: "About Newcastle to the Lake District", m: "Like {n} trips to the Lakes from Newcastle" },
  { min: 80, max: 130, dist: 100, r: "north_east", s: "Like Newcastle to Edinburgh", m: "Like {n} Newcastle-to-Edinburgh drives" },
  { min: 100, max: 320, dist: 120, r: "north_east", s: "About Newcastle to York and back", m: "Like {n} York round trips from Newcastle" },
  { min: 120, max: 320, dist: 160, r: "north_east", s: "Like Newcastle to Manchester", m: "Like {n} drives from Newcastle to Manchester" },
  { min: 160, max: 320, dist: 200, r: "north_east", s: "About Newcastle to the Peak District and back", m: "Like {n} Peak District round trips" },
  { min: 200, max: 320, dist: 280, r: "north_east", s: "Like Newcastle to London", m: "Like {n} drives from Newcastle to London" },

  // ── North West ──
  { min: 5, max: 16, dist: 10, r: "north_west", s: "Like Manchester to Stockport and back", m: "Like {n} trips to Stockport and back" },
  { min: 5, max: 16, dist: 8, r: "north_west", s: "About a lap of Liverpool's waterfront and back", m: "Like {n} waterfront laps" },
  { min: 15, max: 55, dist: 35, r: "north_west", s: "Like Manchester to Liverpool", m: "Like {n} drives from Manchester to Liverpool" },
  { min: 15, max: 55, dist: 25, r: "north_west", s: "About Manchester to Blackburn", m: "Like {n} drives to Blackburn" },
  { min: 20, max: 55, dist: 30, r: "north_west", s: "Like Liverpool to Chester", m: "Like {n} trips from Liverpool to Chester" },
  { min: 25, max: 55, dist: 45, r: "north_west", s: "About Manchester to Blackpool", m: "Like {n} drives to Blackpool" },
  { min: 30, max: 55, dist: 50, r: "north_west", s: "Like Manchester to the Lake District", m: "Like {n} drives to the Lakes" },
  { min: 50, max: 130, dist: 75, r: "north_west", s: "About Manchester to North Wales", m: "Like {n} drives from Manchester to North Wales" },
  { min: 60, max: 130, dist: 85, r: "north_west", s: "Like Liverpool to the Yorkshire Dales", m: "Like {n} trips to the Dales" },
  { min: 80, max: 130, dist: 100, r: "north_west", s: "About Manchester to Newcastle", m: "Like {n} Manchester-to-Newcastle drives" },
  { min: 120, max: 320, dist: 150, r: "north_west", s: "Like Manchester to Edinburgh", m: "Like {n} drives to Edinburgh" },
  { min: 200, max: 320, dist: 200, r: "north_west", s: "About Manchester to London", m: "Like {n} drives from Manchester to London" },

  // ── Yorkshire ──
  { min: 5, max: 16, dist: 10, r: "yorkshire", s: "Like Leeds to Bradford", m: "Like {n} trips from Leeds to Bradford" },
  { min: 5, max: 16, dist: 12, r: "yorkshire", s: "About Sheffield to Rotherham and back", m: "Like {n} Rotherham round trips" },
  { min: 15, max: 55, dist: 30, r: "yorkshire", s: "Like Leeds to Sheffield", m: "Like {n} Leeds-to-Sheffield drives" },
  { min: 15, max: 55, dist: 25, r: "yorkshire", s: "About York to Scarborough", m: "Like {n} trips from York to Scarborough" },
  { min: 20, max: 55, dist: 35, r: "yorkshire", s: "Like Leeds to the heart of the Yorkshire Dales", m: "Like {n} trips to the Dales from Leeds" },
  { min: 25, max: 55, dist: 40, r: "yorkshire", s: "About Sheffield to the Peak District and back", m: "Like {n} Peak District round trips" },
  { min: 30, max: 55, dist: 50, r: "yorkshire", s: "Like York to Whitby across the North York Moors", m: "Like {n} drives across the Moors to Whitby" },
  { min: 50, max: 130, dist: 60, r: "yorkshire", s: "About Leeds to Hull", m: "Like {n} Leeds-to-Hull drives" },
  { min: 60, max: 130, dist: 70, r: "yorkshire", s: "Like Sheffield to Manchester and back", m: "Like {n} Manchester round trips" },
  { min: 80, max: 130, dist: 95, r: "yorkshire", s: "About Leeds to Newcastle", m: "Like {n} drives from Leeds to Newcastle" },
  { min: 100, max: 320, dist: 120, r: "yorkshire", s: "Like Leeds to the Lake District and back", m: "Like {n} Lake District round trips" },
  { min: 160, max: 320, dist: 195, r: "yorkshire", s: "About Leeds to London", m: "Like {n} drives from Leeds to London" },

  // ── Scotland ──
  { min: 5, max: 16, dist: 8, r: "scotland", s: "Like a drive along Edinburgh's Royal Mile and back to Leith", m: "Like {n} Royal Mile drives" },
  { min: 5, max: 16, dist: 12, r: "scotland", s: "About Glasgow to East Kilbride and back", m: "Like {n} East Kilbride round trips" },
  { min: 15, max: 55, dist: 45, r: "scotland", s: "Like Glasgow to Edinburgh", m: "Like {n} Glasgow-to-Edinburgh drives" },
  { min: 15, max: 55, dist: 30, r: "scotland", s: "About Edinburgh to Stirling", m: "Like {n} trips from Edinburgh to Stirling" },
  { min: 20, max: 55, dist: 35, r: "scotland", s: "Like Glasgow to Loch Lomond and back", m: "Like {n} trips to Loch Lomond" },
  { min: 30, max: 55, dist: 50, r: "scotland", s: "About Edinburgh to Dundee", m: "Like {n} drives from Edinburgh to Dundee" },
  { min: 50, max: 130, dist: 65, r: "scotland", s: "Like Edinburgh to the Cairngorms", m: "Like {n} drives to the Cairngorms" },
  { min: 60, max: 130, dist: 80, r: "scotland", s: "About Glasgow to Fort William", m: "Like {n} drives to Fort William" },
  { min: 80, max: 130, dist: 110, r: "scotland", s: "Like Edinburgh to Aberdeen", m: "Like {n} Edinburgh-to-Aberdeen drives" },
  { min: 100, max: 320, dist: 125, r: "scotland", s: "About Glasgow to Inverness", m: "Like {n} drives to Inverness from Glasgow" },
  { min: 150, max: 320, dist: 180, r: "scotland", s: "Like Edinburgh to the far north at Thurso", m: "Like {n} drives to Thurso" },
  { min: 250, max: 620, dist: 280, r: "scotland", s: "About a full lap of the North Coast 500", m: "Like {n} laps of the NC500" },

  // ── Wales ──
  { min: 5, max: 16, dist: 8, r: "wales", s: "Like a drive around Cardiff Bay", m: "Like {n} laps of Cardiff Bay" },
  { min: 15, max: 55, dist: 25, r: "wales", s: "About Cardiff to the Brecon Beacons", m: "Like {n} trips to the Beacons" },
  { min: 15, max: 55, dist: 40, r: "wales", s: "Like Cardiff to Swansea", m: "Like {n} Cardiff-to-Swansea drives" },
  { min: 25, max: 55, dist: 50, r: "wales", s: "About Swansea to Pembrokeshire", m: "Like {n} drives to Pembrokeshire" },
  { min: 50, max: 130, dist: 75, r: "wales", s: "Like Cardiff to Aberystwyth", m: "Like {n} drives to Aberystwyth" },
  { min: 60, max: 130, dist: 90, r: "wales", s: "About a drive along the entire Pembrokeshire Coast Path", m: "Like {n} Pembrokeshire coast drives" },
  { min: 80, max: 130, dist: 105, r: "wales", s: "Like Cardiff to Snowdonia", m: "Like {n} drives to Snowdonia" },
  { min: 100, max: 320, dist: 130, r: "wales", s: "About the full length of Wales — Cardiff to Anglesey", m: "Like driving the length of Wales {n} times" },

  // ── Midlands ──
  { min: 5, max: 16, dist: 10, r: "midlands", s: "Like a lap around Birmingham's ring road", m: "Like {n} laps of the ring road" },
  { min: 5, max: 16, dist: 14, r: "midlands", s: "About Nottingham to Derby", m: "Like {n} Nottingham-to-Derby drives" },
  { min: 15, max: 55, dist: 25, r: "midlands", s: "Like Birmingham to Coventry", m: "Like {n} drives from Birmingham to Coventry" },
  { min: 15, max: 55, dist: 30, r: "midlands", s: "About Nottingham to Leicester", m: "Like {n} Nottingham-to-Leicester drives" },
  { min: 20, max: 55, dist: 40, r: "midlands", s: "Like Birmingham to Stratford-upon-Avon and back", m: "Like {n} Stratford round trips" },
  { min: 30, max: 55, dist: 50, r: "midlands", s: "About Birmingham to the Peak District", m: "Like {n} drives to the Peak District" },
  { min: 50, max: 130, dist: 60, r: "midlands", s: "Like Birmingham to Bristol", m: "Like {n} Birmingham-to-Bristol drives" },
  { min: 60, max: 130, dist: 80, r: "midlands", s: "About Nottingham to Manchester", m: "Like {n} Nottingham-to-Manchester drives" },
  { min: 80, max: 130, dist: 110, r: "midlands", s: "Like Birmingham to North Wales", m: "Like {n} drives from Birmingham to North Wales" },
  { min: 120, max: 320, dist: 130, r: "midlands", s: "About Birmingham to London", m: "Like {n} drives from Birmingham to London" },

  // ── South West ──
  { min: 5, max: 16, dist: 8, r: "south_west", s: "Like a drive along the Bristol harbourside and back", m: "Like {n} harbourside drives" },
  { min: 15, max: 55, dist: 30, r: "south_west", s: "About Bristol to Bath and back", m: "Like {n} Bath round trips" },
  { min: 15, max: 55, dist: 45, r: "south_west", s: "Like Bristol to Exeter", m: "Like {n} Bristol-to-Exeter drives" },
  { min: 25, max: 55, dist: 50, r: "south_west", s: "About Exeter to Plymouth", m: "Like {n} Exeter-to-Plymouth drives" },
  { min: 50, max: 130, dist: 75, r: "south_west", s: "Like Exeter to Land's End", m: "Like {n} drives to Land's End" },
  { min: 60, max: 130, dist: 85, r: "south_west", s: "About Bristol to the Jurassic Coast", m: "Like {n} trips to the Jurassic Coast" },
  { min: 80, max: 130, dist: 120, r: "south_west", s: "Like Bristol to London", m: "Like {n} Bristol-to-London drives" },

  // ── South East ──
  { min: 5, max: 16, dist: 10, r: "south_east", s: "Like Brighton seafront end to end and back", m: "Like {n} Brighton seafront drives" },
  { min: 15, max: 55, dist: 25, r: "south_east", s: "About Brighton to Eastbourne", m: "Like {n} drives from Brighton to Eastbourne" },
  { min: 15, max: 55, dist: 30, r: "south_east", s: "Like Southampton to Bournemouth", m: "Like {n} drives to Bournemouth" },
  { min: 25, max: 55, dist: 45, r: "south_east", s: "About Canterbury to Dover and back", m: "Like {n} Dover round trips" },
  { min: 50, max: 130, dist: 60, r: "south_east", s: "Like Brighton to London", m: "Like {n} Brighton-to-London drives" },
  { min: 60, max: 130, dist: 80, r: "south_east", s: "About Southampton to London", m: "Like {n} Southampton-to-London drives" },

  // ── East ──
  { min: 5, max: 16, dist: 12, r: "east", s: "Like Cambridge to Ely and back", m: "Like {n} Ely round trips" },
  { min: 15, max: 55, dist: 25, r: "east", s: "About Norwich to Great Yarmouth and back", m: "Like {n} Yarmouth round trips" },
  { min: 15, max: 55, dist: 40, r: "east", s: "Like Cambridge to Bury St Edmunds", m: "Like {n} drives to Bury St Edmunds" },
  { min: 25, max: 55, dist: 50, r: "east", s: "About Cambridge to Norwich", m: "Like {n} Cambridge-to-Norwich drives" },
  { min: 50, max: 130, dist: 60, r: "east", s: "Like Cambridge to London", m: "Like {n} Cambridge-to-London drives" },
  { min: 60, max: 130, dist: 80, r: "east", s: "About Norwich to London", m: "Like {n} Norwich-to-London drives" },

  // ── London ──
  { min: 1, max: 6, dist: 2, r: "london", s: "About Oxford Circus to Canary Wharf", m: "Like {n} drives from Oxford Circus to Canary Wharf" },
  { min: 5, max: 16, dist: 7, r: "london", s: "Like Brixton to Hampstead across town", m: "Like {n} drives across London" },
  { min: 5, max: 16, dist: 10, r: "london", s: "About Croydon to central London", m: "Like {n} drives from Croydon to central" },
  { min: 15, max: 55, dist: 20, r: "london", s: "Like a trip out to the M25 and back", m: "Like {n} trips out to the M25" },
  { min: 15, max: 55, dist: 30, r: "london", s: "About London to St Albans and back", m: "Like {n} St Albans round trips" },
  { min: 50, max: 130, dist: 55, r: "london", s: "Like London to Brighton for the day", m: "Like {n} day trips to Brighton" },
  { min: 50, max: 130, dist: 65, r: "london", s: "About London to Cambridge for the weekend", m: "Like {n} Cambridge weekend drives" },
];

/**
 * Get a fun, accurate distance comparison for a given mileage.
 * Uses a seeded selection so the same mileage returns the same text
 * within a given day, but varies day-to-day.
 */
export function getDistanceEquivalent(
  miles: number,
  region?: UkRegion | string,
): string | null {
  if (miles < 1) return null;

  // Blend: universal entries + any that match the user's region
  const eligible = C.filter(
    (c) => miles >= c.min && miles < c.max && (!c.r || c.r === region),
  );
  if (eligible.length === 0) return null;

  // Deterministic pick that varies by day
  const seed = Math.floor(miles * 7.3) + new Date().getDate();
  const pick = eligible[seed % eligible.length];

  const n = Math.round(miles / pick.dist);
  if (n <= 1) {
    return pick.s.replace("{n}", String(Math.max(1, n)));
  }
  return pick.m.replace("{n}", String(n));
}
