// The map region that frames a trip (TripMapWidget). Pure, so it can be
// tested without the map SDK.
//
// Only real points count: a NaN, an out-of-range value or the 0,0 "no fix"
// placeholder would stretch or blank the region, and a map handed a broken
// region shows the whole world instead of the trip.

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Smallest span either way, about 550 m, so a very short trip (or two pins
 *  on the same spot) still shows its streets rather than one building. */
const MIN_DELTA = 0.005;
/** Breathing room around the points so the pins are not on the edge. */
const PAD = 1.4;

export function isRealPoint(p: LatLngPoint | null | undefined): p is LatLngPoint {
  return (
    p != null &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

/** The region that fits every real point, or null when there are none. */
export function regionForPoints(points: readonly (LatLngPoint | null | undefined)[]): MapRegion | null {
  const real = points.filter(isRealPoint);
  if (real.length === 0) return null;

  let minLat = real[0].lat;
  let maxLat = real[0].lat;
  let minLng = real[0].lng;
  let maxLng = real[0].lng;
  for (const c of real) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PAD, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PAD, MIN_DELTA),
  };
}

const TILE_DP = 256;
/** Room above each point for its pin, which stands up from the point. */
const PIN_HEADROOM_DP = 44;

function mercatorY(latDeg: number): number {
  const clamped = Math.max(-85, Math.min(85, latDeg));
  const rad = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

/**
 * The Google Maps zoom level at which `region` fits a map `widthDp` by
 * `heightDp`, for a camera move that needs no map measurement (Android's
 * setCamera). Half a level is held back so a map that rounds the zoom still
 * keeps both pins in view. Clamped to 3 (a whole country) .. 16 (streets).
 */
export function zoomForRegion(region: MapRegion, widthDp: number, heightDp: number): number {
  const w = Math.max(widthDp, 64);
  const h = Math.max(heightDp - PIN_HEADROOM_DP, 40);
  const lngZoom = Math.log2((w * 360) / (region.longitudeDelta * TILE_DP));
  const top = region.latitude + region.latitudeDelta / 2;
  const bottom = region.latitude - region.latitudeDelta / 2;
  const fraction = (mercatorY(top) - mercatorY(bottom)) / (2 * Math.PI);
  const latZoom = fraction > 0 ? Math.log2(h / TILE_DP / fraction) : lngZoom;
  const zoom = Math.min(lngZoom, latZoom) - 0.5;
  if (!Number.isFinite(zoom)) return 10;
  return Math.max(3, Math.min(16, zoom));
}
