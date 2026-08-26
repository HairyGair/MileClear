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
/** Lower / upper bounds on `matched / stored` ratio for trusting the match.
 *  Outside this window the match almost certainly went wrong (GH chose a
 *  shortcut through a junction loop, or breadcrumbs had a mid-trip gap that
 *  threw the matcher). Caller skips persisting the polyline + distance rather
 *  than showing a route that doesn't represent the actual trip.
 *
 *  The stored distance is already road-corrected (bestTraceDistance =
 *  max(haversine, OSRM route)), so a correct map-match should land within a
 *  few percent of it — NOT 1.4x larger. The old 3.0 ceiling let gross
 *  over-counts straight through (8 Jun: a real 79mi York→home drive that
 *  map-matched to 111mi, ratio 1.4, was accepted and inflated the trip — and
 *  over-counting mileage is an HMRC problem, not just a cosmetic one). A 1.3
 *  ceiling still allows a genuine undercount correction (curvy roads, a short
 *  GPS gap) but rejects the mis-matches; a rejected match falls back to the
 *  start->end routing distance (recalc paths) or keeps the stored road
 *  distance (create hook), both of which are reliable. */
const MATCH_PLAUSIBLE_MIN_RATIO = 0.7;
const MATCH_PLAUSIBLE_MAX_RATIO = 1.3;

/**
 * Decide whether a match result looks plausible relative to the stored
 * distance. Routing engines occasionally produce wildly wrong matches on
 * trips with mid-route GPS gaps or unusual road geometries — without a
 * sanity check we'd happily overwrite a 22-mile trip's polyline with a
 * 3-mile match.
 */
export function isMatchPlausible(
  matchedDistanceMiles: number,
  storedDistanceMiles: number
): boolean {
  if (storedDistanceMiles <= 0) return true; // can't sanity-check against 0
  const ratio = matchedDistanceMiles / storedDistanceMiles;
  return ratio >= MATCH_PLAUSIBLE_MIN_RATIO && ratio <= MATCH_PLAUSIBLE_MAX_RATIO;
}

/**
 * Edge phantom trim (22 Aug 2026, Rachel Thorndyke's "random point in
 * Immingham"). A recording's first or last fix is sometimes a cell-tower
 * position a mile or more from where the phone actually was - Rachel's
 * opened with accuracy 2,724 m, 2.3 mi south-east of the real start;
 * others in the same fortnight read 1,130 / 1,422 / 149,000 / 3,356 m
 * against 2-28 m for every point after. The JS engine's ingest filter
 * drops such fixes; the native engine's buffer does not. The phone then
 * sums its distance across the phantom jump, the trip starts in a place
 * the driver never was, and the map-match plausibility guard - seeing a
 * road route much shorter than the raw one - keeps the inflated figure.
 * Eleven trips in fourteen days, all over-claims on HMRC records.
 *
 * This drops up to MAX_EDGE_TRIM points from each end that are both
 * grossly inaccurate AND far from their neighbour, and reports how many
 * raw miles went with them so the caller can correct the stored distance.
 * Interior points are never touched; a mid-trip glitch is the matcher's
 * job. Pure, so it is unit-tested.
 */
export const EDGE_PHANTOM_ACCURACY_M = 500;
export const EDGE_PHANTOM_MIN_JUMP_MILES = 0.5;
/** Second signature (Rachel, 25 Aug 2026): a stale edge fix can CLAIM good
 *  accuracy (50 m) yet sit 1.2 mi from the next fix 52 s later, an 86 mph
 *  jump no car made. When both points carry timestamps, an edge whose
 *  implied speed to its neighbour exceeds this is phantom whatever it
 *  claims. 90 mph is above any sustained UK road speed. */
export const EDGE_PHANTOM_MAX_JUMP_MPH = 90;
/** Third signature: a far edge fix whose remaining trail never leaves one
 *  spot (Rachel's 25 Aug case: seven fixes shuffling 20 m at a client's
 *  house behind a first fix 1.24 mi away). A real drive moves; a trail
 *  spanning under this is a parked phone, so the far edge is stale. */
export const EDGE_PHANTOM_STATIONARY_SPAN_MILES = 0.1;
const MAX_EDGE_TRIM = 3;
const MIN_POINTS_AFTER_TRIM = 3;

export interface EdgeTrimResult<T extends BreadcrumbInput> {
  breadcrumbs: T[];
  droppedLeading: number;
  droppedTrailing: number;
  /** Raw haversine miles the dropped edge segments contributed. */
  removedMiles: number;
  /** Worst accuracy among the dropped points, for the audit event. */
  worstAccuracyM: number | null;
}

function milesBetween(a: BreadcrumbInput, b: BreadcrumbInput): number {
  const R = 3958.8;
  const k = Math.PI / 180;
  const x =
    Math.sin(((b.lat - a.lat) * k) / 2) ** 2 +
    Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(((b.lng - a.lng) * k) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function trimEdgePhantoms<T extends BreadcrumbInput>(input: T[]): EdgeTrimResult<T> {
  const pts = [...input];
  let droppedLeading = 0;
  let droppedTrailing = 0;
  let removedMiles = 0;
  let worst: number | null = null;

  const impliedMph = (a: T, b: T): number | null => {
    if (a.recordedAt == null || b.recordedAt == null) return null;
    const ms = Math.abs(new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return milesBetween(a, b) / (ms / 3_600_000);
  };
  const spanMiles = (rest: T[]): number => {
    let span = 0;
    for (let i = 1; i < rest.length; i++) span = Math.max(span, milesBetween(rest[0], rest[i]));
    return span;
  };
  const isPhantomEdge = (edge: T, neighbour: T, rest: T[]): boolean => {
    const jump = milesBetween(edge, neighbour);
    if (jump < EDGE_PHANTOM_MIN_JUMP_MILES) return false;
    if (typeof edge.accuracy === "number" && edge.accuracy > EDGE_PHANTOM_ACCURACY_M) return true;
    if (spanMiles(rest) < EDGE_PHANTOM_STATIONARY_SPAN_MILES) return true;
    const mph = impliedMph(edge, neighbour);
    return mph != null && mph > EDGE_PHANTOM_MAX_JUMP_MPH;
  };

  while (droppedLeading < MAX_EDGE_TRIM && pts.length > MIN_POINTS_AFTER_TRIM && isPhantomEdge(pts[0], pts[1], pts.slice(1))) {
    removedMiles += milesBetween(pts[0], pts[1]);
    worst = Math.max(worst ?? 0, typeof pts[0].accuracy === "number" ? pts[0].accuracy : 0);
    pts.shift();
    droppedLeading += 1;
  }
  while (
    droppedTrailing < MAX_EDGE_TRIM &&
    pts.length > MIN_POINTS_AFTER_TRIM &&
    isPhantomEdge(pts[pts.length - 1], pts[pts.length - 2], pts.slice(0, -1))
  ) {
    removedMiles += milesBetween(pts[pts.length - 1], pts[pts.length - 2]);
    const last = pts[pts.length - 1];
    worst = Math.max(worst ?? 0, typeof last.accuracy === "number" ? last.accuracy : 0);
    pts.pop();
    droppedTrailing += 1;
  }

  return { breadcrumbs: pts, droppedLeading, droppedTrailing, removedMiles, worstAccuracyM: worst };
}

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
