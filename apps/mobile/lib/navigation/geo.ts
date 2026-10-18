// Small geometry helpers for the navigator. Pure, metres and degrees.
//
// Snapping projects a fix onto each route segment in a local flat frame
// (equirectangular around the segment's start). Segments are tens to hundreds
// of metres long, so the error from treating the earth as flat over one
// segment is far below GPS noise.

export const EARTH_RADIUS_M = 6371008.8;
export const METRES_PER_MILE = 1609.344;
export const METRES_PER_YARD = 0.9144;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a to b, 0-360, 0 = north. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest angle between two bearings, 0-180. */
export function bearingDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

/** The point `metres` from `from` along `bearing`. Used by the tests to lay
 *  out synthetic roads. */
export function offset(from: LatLng, bearing: number, metres: number): LatLng {
  const δ = metres / EARTH_RADIUS_M;
  const θ = toRad(bearing);
  const φ1 = toRad(from.lat);
  const λ1 = toRad(from.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lng: toDeg(λ2) };
}

export interface SegmentProjection {
  /** 0..1 along the segment. */
  t: number;
  /** Distance from the point to the closest point of the segment, metres. */
  distance: number;
  point: LatLng;
}

/** Closest point to `p` on the segment a-b. */
export function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): SegmentProjection {
  const k = Math.cos(toRad(a.lat));
  const ax = 0;
  const ay = 0;
  const bx = toRad(b.lng - a.lng) * k * EARTH_RADIUS_M;
  const by = toRad(b.lat - a.lat) * EARTH_RADIUS_M;
  const px = toRad(p.lng - a.lng) * k * EARTH_RADIUS_M;
  const py = toRad(p.lat - a.lat) * EARTH_RADIUS_M;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const distance = Math.hypot(px - cx, py - cy);
  return {
    t,
    distance,
    point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
  };
}
