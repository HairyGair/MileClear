// Google encoded-polyline decoder. The API stores each map-matched route as
// one of these strings (trips.routePolyline, produced by GraphHopper /match)
// and the trips LIST already ships it per row, so a list card can draw the
// route with no per-trip round trip. Same algorithm as the server's
// services/mapMatching.ts decodePolyline; kept dependency-free so it rides
// in an OTA.

export interface LatLng {
  lat: number;
  lng: number;
}

export function decodePolyline(encoded: string): LatLng[] {
  const out: LatLng[] = [];
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

/** Decode defensively: a malformed string yields [] rather than a throw or a
 *  half-decoded route with a wild last point. */
export function safeDecodePolyline(encoded: string | null | undefined): LatLng[] {
  if (!encoded) return [];
  try {
    const pts = decodePolyline(encoded);
    return pts.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
      ? pts
      : [];
  } catch {
    return [];
  }
}

/** Thin a route to at most `max` points, always keeping both ends. A list
 *  card at 120pt does not need 2,000 vertices per row. */
export function samplePoints<T>(points: T[], max: number): T[] {
  if (points.length <= max || max < 2) return points;
  const step = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}
