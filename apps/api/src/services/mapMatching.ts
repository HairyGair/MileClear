// GPS map-matching: snap raw breadcrumb trails to actual roads.
//
// Calls GraphHopper's /match endpoint with the trip's GPS breadcrumbs
// and gets back a road-snapped polyline + distance + duration. Replaces
// the raw breadcrumbs (which jitter, cut corners, and occasionally show
// the route going through buildings) with a clean route that follows
// real roads.
//
// Why this matters: trip detail screens look immediately more
// professional, and the matched distance is a more accurate figure than
// the breadcrumb-summed haversine sum (which tends to overcount due to
// GPS noise, OR undercount on winding roads at sparse sampling).
//
// Activates only when GRAPHHOPPER_URL is set. If GraphHopper is
// unreachable, returns null — the caller leaves the raw breadcrumbs in
// place. Never blocks trip creation; runs as a fire-and-forget post-
// save side effect.
//
// Reference: https://docs.graphhopper.com/#tag/Map-Matching-API

/** Raw breadcrumb input — what we have in TripCoordinate rows. */
export interface BreadcrumbInput {
  lat: number;
  lng: number;
  /** Per-point GPS accuracy in metres (CoreLocation horizontalAccuracy). */
  accuracy?: number | null;
  /** ISO timestamp; used for ordering, not currently sent to GraphHopper. */
  recordedAt?: string | Date;
}

export interface MapMatchResult {
  /** Google-encoded polyline string — store as-is in Trip.routePolyline. */
  encodedPolyline: string;
  /** Decoded matched coordinates — array of [lat, lng] pairs. */
  matchedPoints: { lat: number; lng: number }[];
  /** Distance along the matched route, in miles. */
  distanceMiles: number;
  /** Estimated duration, in seconds. */
  durationSecs: number;
  /** Number of input breadcrumbs after filtering. */
  pointsUsed: number;
  /** Number of breadcrumbs filtered out for high inaccuracy. */
  pointsFilteredOut: number;
}

/** Maximum input points GraphHopper /match handles cleanly. */
const MAX_POINTS = 500;
/** Drop breadcrumbs worse than this metres-accuracy. */
const ACCURACY_CEILING_M = 50;
/** Minimum points to attempt a match — any fewer and matching is unreliable. */
const MIN_POINTS = 10;

/**
 * Snap GPS breadcrumbs to the nearest road network. Returns null on
 * any failure — caller MUST handle that without breaking trip save.
 */
export async function matchTripRoute(
  breadcrumbs: BreadcrumbInput[]
): Promise<MapMatchResult | null> {
  const baseUrl = process.env.GRAPHHOPPER_URL;
  if (!baseUrl) return null;

  const filtered = filterBreadcrumbs(breadcrumbs);
  if (filtered.length < MIN_POINTS) return null;

  const thinned = thinTo(filtered, MAX_POINTS);
  const gpx = buildGpx(thinned);

  const url =
    `${baseUrl.replace(/\/$/, "")}/match` +
    `?profile=car&type=json&gps_accuracy=20`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/gpx+xml" },
      body: gpx,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let data: GraphHopperMatchResponse;
  try {
    data = (await response.json()) as GraphHopperMatchResponse;
  } catch {
    return null;
  }

  const path = data.paths?.[0];
  if (!path || typeof path.distance !== "number" || typeof path.points !== "string") {
    return null;
  }

  const matchedPoints = decodePolyline(path.points);
  if (matchedPoints.length === 0) return null;

  return {
    encodedPolyline: path.points,
    matchedPoints,
    distanceMiles: Math.round((path.distance / 1609.344) * 100) / 100,
    durationSecs: Math.round((path.time ?? 0) / 1000),
    pointsUsed: thinned.length,
    pointsFilteredOut: breadcrumbs.length - filtered.length,
  };
}

interface GraphHopperMatchResponse {
  paths?: { distance?: number; time?: number; points?: string }[];
}

/** Drop breadcrumbs with bad accuracy or invalid coords. */
function filterBreadcrumbs(crumbs: BreadcrumbInput[]): BreadcrumbInput[] {
  return crumbs.filter((c) => {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return false;
    if (Math.abs(c.lat) < 0.001 && Math.abs(c.lng) < 0.001) return false;
    if (c.accuracy != null && c.accuracy > ACCURACY_CEILING_M) return false;
    return true;
  });
}

/**
 * Thin a long breadcrumb list down to at most `max` points by even
 * stride sampling. Keeps the first and last points; the rest get
 * sampled uniformly. Preserves trip shape better than just truncating.
 */
function thinTo<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const stride = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.round(i * stride)]);
  }
  return out;
}

/** Build a minimal GPX 1.1 document from breadcrumbs. */
function buildGpx(crumbs: BreadcrumbInput[]): string {
  const points = crumbs
    .map((c) => `<trkpt lat="${c.lat}" lon="${c.lng}"></trkpt>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<gpx version="1.1" creator="MileClear">` +
    `<trk><trkseg>${points}</trkseg></trk>` +
    `</gpx>`
  );
}

/**
 * Decode Google's encoded-polyline format. Standard 5-decimal-place
 * precision (matches GraphHopper's default). We bring our own decoder
 * rather than pull in @mapbox/polyline to avoid one more dep on the
 * server.
 *
 * Reference: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}
