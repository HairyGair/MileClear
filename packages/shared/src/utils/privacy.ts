/**
 * Coordinate scrubbing for diagnostic payloads.
 *
 * The privacy policy says diagnostic dumps carry no coordinates. Detection
 * events and tracking state are written by dozens of call sites, several of
 * which attach raw lat/lng (anchors, geofence centres, coordinate buffers).
 * Rather than audit every call site forever, both the mobile uploader and the
 * API receiver run the payload through `scrubCoordinates` so nothing
 * location-shaped survives, whichever side forgets.
 *
 * What is removed:
 *  - any value under a key whose last word is a coordinate word (lat, lng,
 *    lon, latitude, longitude, coord(s), coordinate(s), center/centre,
 *    anchor, position, geometry, point, origin, destination) unless the value
 *    is a boolean or null (a flag such as `hasAnchor` is not a location)
 *  - inside free-text strings, `lat: 51.5074`-style pairs and bare decimal
 *    pairs that look like a lat,lng
 *
 * Everything else (event names, counts, speeds, accuracies, timestamps,
 * ids, permission states) passes through untouched. Arrays under a
 * coordinate key are replaced by `{ redacted: true, count }` so the
 * diagnostic reader still sees how many fixes were involved.
 */

export const COORDINATE_REDACTED = "[coords redacted]";

const COORDINATE_WORDS = new Set([
  "lat",
  "lng",
  "lon",
  "long",
  "latitude",
  "longitude",
  "coord",
  "coords",
  "coordinate",
  "coordinates",
  "center",
  "centre",
  "anchor",
  "position",
  "geometry",
  "point",
  "origin",
  "destination",
  "latlng",
  "latlon",
]);

/** Split camelCase / snake_case / kebab-case into lower-case words. */
function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.\s]+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
}

/** True when a key names a coordinate-carrying value (`fromLat`,
 *  `departure_anchor_lng`, `coords`, `allCoords`, `center`, `anchor`). */
export function isCoordinateKey(key: string): boolean {
  const words = keyWords(key);
  if (words.length === 0) return false;
  return COORDINATE_WORDS.has(words[words.length - 1]);
}

// `"lat": 51.507`, `lat=51.507`, `latitude: -0.1278` inside a string.
const LABELLED_COORD_RE =
  /(["']?)\b(lat|lng|lon|long|latitude|longitude)\1\s*[:=]\s*(-?\d{1,3}(?:\.\d+)?)/gi;

// A bare decimal pair with 4+ decimals each, e.g. `51.5074, -0.1278` or
// `[51.5074,-0.1278]`. Four decimals is ~11 m, so anything this precise
// that comes in a pair is a fix, not a speed or an accuracy figure.
const BARE_PAIR_RE = /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g;

/** Redact coordinate-looking fragments inside a string. */
export function scrubCoordinateString(text: string): string {
  return text
    .replace(LABELLED_COORD_RE, (_m, q: string, name: string) => `${q}${name}${q}: ${COORDINATE_REDACTED}`)
    .replace(BARE_PAIR_RE, COORDINATE_REDACTED);
}

const MAX_DEPTH = 24;

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return { redacted: true, count: value.length };
  return COORDINATE_REDACTED;
}

/**
 * Deep-scrub any JSON-shaped value. Returns a new value; the input is not
 * mutated. Non-JSON values (functions, symbols) are passed through.
 */
export function scrubCoordinates<T = unknown>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH) return value;
  if (typeof value === "string") return scrubCoordinateString(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((v) => scrubCoordinates(v, depth + 1)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (isCoordinateKey(key) && v !== null && typeof v !== "boolean" && v !== undefined) {
        out[key] = redactValue(v);
      } else {
        out[key] = scrubCoordinates(v, depth + 1);
      }
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Detection events store `data` as a JSON string (or null). Parse, scrub,
 * re-serialise; if it is not valid JSON fall back to the string scrub so a
 * malformed payload still cannot carry a fix.
 */
export function scrubDiagnosticEventData(data: string | null | undefined): string | null {
  if (data == null) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === "object") return JSON.stringify(scrubCoordinates(parsed));
  } catch {
    // not JSON
  }
  return scrubCoordinateString(data);
}
