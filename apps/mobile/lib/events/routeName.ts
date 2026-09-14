/**
 * Turn expo-router file segments into a route name that is safe to store.
 *
 * expo-router offers two views of "where am I", and only one of them is safe:
 *
 *   usePathname()  NORMALISES dynamic segments, so a screen declared at
 *                  app/trips/[id].tsx arrives as "/trips/9f2c8b14-..." - a real
 *                  record id, which is exactly what must never reach the event
 *                  log.
 *   useSegments()  returns the UNNORMALISED file segments, so the same screen
 *                  arrives as ["trips", "[id]"]. Its own docs put it plainly:
 *                  "/[id]?id=normal becomes ["[id]"]".
 *
 * So the tracker feeds this module useSegments() output, never a pathname. The
 * id-like checks below then re-assert that guarantee locally, so a caller that
 * one day passes a resolved path still cannot leak a record id into telemetry.
 *
 * Pure and dependency-free on purpose: it is the part worth unit testing, and
 * keeping React Native and expo-router out of it lets the node-env vitest suite
 * import it directly.
 */

/** Longest route name we will record. Keeps one malformed deep link bounded. */
export const MAX_ROUTE_LENGTH = 120;

/** Placeholder substituted for anything that looks like a record identifier. */
export const ID_PLACEHOLDER = "[id]";

/** Canonical UUID, the shape every primary key in this app uses. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A run of hex long enough to be an id rather than a word (dashless UUIDs). */
const LONG_HEX = /^[0-9a-f]{12,}$/i;

/** Purely numeric: a row id, a timestamp, a tax year fragment. */
const NUMERIC = /^\d+$/;

/**
 * Is this segment a real identifier rather than a route name?
 *
 * The generic rule needs a digit as well as length, because genuine route
 * names in this app get long without ever carrying one:
 * "saved-locations-suggest", "drive-detection-diagnostics",
 * "admin-user-detail". Requiring a digit keeps those intact while still
 * catching opaque tokens.
 */
function isIdLike(segment: string): boolean {
  if (UUID.test(segment)) return true;
  if (LONG_HEX.test(segment)) return true;
  if (NUMERIC.test(segment)) return true;
  return segment.length >= 16 && /\d/.test(segment);
}

/**
 * Sanitise one segment.
 *
 * Already-bracketed segments ("[id]", "[...rest]") are the file-system pattern
 * we want and pass through untouched. Route groups ("(tabs)", "(auth)") are
 * structural and carry no user data, so they are kept: they are how we tell a
 * tab from a modal when ranking destinations.
 */
export function sanitiseSegment(segment: string): string {
  // Defensive: a resolved path would bring query and hash along with it.
  const withoutQuery = segment.split("?")[0].split("#")[0];
  if (!withoutQuery) return "";
  if (withoutQuery.startsWith("[") && withoutQuery.endsWith("]")) {
    return withoutQuery;
  }
  return isIdLike(withoutQuery) ? ID_PLACEHOLDER : withoutQuery;
}

/**
 * Build the recorded route name from expo-router segments.
 *
 * Returns a leading-slash path such as "/(tabs)/dashboard" or "/trips/[id]".
 * The root route, which expo-router reports as an empty segment list, is "/".
 */
export function routeNameFromSegments(segments: readonly string[]): string {
  if (!Array.isArray(segments)) return "/";
  const parts: string[] = [];
  for (const raw of segments) {
    if (typeof raw !== "string") continue;
    const clean = sanitiseSegment(raw);
    if (clean) parts.push(clean);
  }
  if (parts.length === 0) return "/";
  return `/${parts.join("/")}`.slice(0, MAX_ROUTE_LENGTH);
}
