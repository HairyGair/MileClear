// Smart auto-classification engine for MileClear.
//
// Evaluates multiple signals in priority order to determine trip classification
// (business / personal / unclassified) and an optional platform tag.
// Runs after each auto-trip is finalized.

import { getDatabase } from "../db/index";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface ClassificationResult {
  classification: "business" | "personal" | "unclassified";
  platformTag: string | null;
  confidence: number; // 0-100
  source: "shift" | "rule" | "route_learning" | "saved_location" | "work_schedule" | "none";
}

/** Only auto-apply a result when confidence is at or above this threshold.
 * Set above saved-location confidence (75%) so only shift, rules, and
 * confirmed route patterns (3+ matches) auto-classify. Saved locations
 * and work schedule produce suggestions, not auto-classifications. */
export const AUTO_CLASSIFY_THRESHOLD = 80;

// ─── Internal row types ────────────────────────────────────────────────────────

interface ClassificationRuleRow {
  id: number;
  rule_type: string;
  classification: string;
  platform_tag: string | null;
  config: string;
  priority: number;
}

interface LearnedRouteRow {
  id: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  classification: string;
  platform_tag: string | null;
  match_count: number;
}

interface SavedLocationRow {
  id: string;
  location_type: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

interface WorkScheduleRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

// ─── Geometry ──────────────────────────────────────────────────────────────────

/**
 * Great-circle distance between two WGS84 coordinates, in metres.
 * A local copy is used so this module has no dependency on the shared package
 * (which returns miles and may not be available in all build environments).
 */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Signal helpers ────────────────────────────────────────────────────────────

/**
 * Signal 1: was a shift active at the time of this trip?
 * We check tracking_state for a non-null active_shift_id — if a shift was
 * active when the trip was finalized, the shift ID will still be present.
 */
async function checkActiveShift(): Promise<ClassificationResult | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
  );
  if (row?.value) {
    return {
      classification: "business",
      platformTag: null,
      confidence: 100,
      source: "shift",
    };
  }
  return null;
}

/**
 * Signal 2: user-defined classification rules, evaluated in descending priority.
 *
 * Supported rule types:
 *  - work_hours    : config { days: number[], startHour: number, endHour: number }
 *  - saved_location: config { locationId: string, direction: "from" | "to", radius?: number }
 *  - bluetooth     : skipped post-trip (BT state unavailable after the fact)
 */
async function checkClassificationRules(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  startedAt: Date
): Promise<ClassificationResult | null> {
  const db = await getDatabase();
  const rules = await db.getAllAsync<ClassificationRuleRow>(
    "SELECT id, rule_type, classification, platform_tag, config, priority FROM classification_rules WHERE enabled = 1 ORDER BY priority DESC"
  );

  for (const rule of rules) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(rule.config);
    } catch {
      // Malformed config — skip this rule.
      continue;
    }

    if (rule.rule_type === "work_hours") {
      const days = config.days as number[] | undefined;
      const startHour = config.startHour as number | undefined;
      const endHour = config.endHour as number | undefined;

      if (days == null || startHour == null || endHour == null) continue;

      const tripDay = startedAt.getDay(); // 0=Sun, 6=Sat
      const tripHour = startedAt.getHours();

      if (days.includes(tripDay) && tripHour >= startHour && tripHour < endHour) {
        return {
          classification: rule.classification as "business" | "personal",
          platformTag: rule.platform_tag,
          confidence: 85,
          source: "rule",
        };
      }
    } else if (rule.rule_type === "saved_location") {
      const locationId = config.locationId as string | undefined;
      const direction = config.direction as "from" | "to" | undefined;
      const radiusOverride = config.radius as number | undefined;

      if (!locationId || !direction) continue;

      const loc = await db.getFirstAsync<SavedLocationRow>(
        "SELECT id, location_type, latitude, longitude, radius_meters FROM saved_locations WHERE id = ?",
        [locationId]
      );
      if (!loc) continue;

      const radius = radiusOverride ?? loc.radius_meters;
      const checkLat = direction === "from" ? startLat : endLat;
      const checkLng = direction === "from" ? startLng : endLng;
      const dist = haversineMeters(checkLat, checkLng, loc.latitude, loc.longitude);

      if (dist <= radius) {
        return {
          classification: rule.classification as "business" | "personal",
          platformTag: rule.platform_tag,
          confidence: 85,
          source: "rule",
        };
      }
    }
    // bluetooth: intentionally skipped post-trip.
  }

  return null;
}

/** Route proximity threshold used for learned routes. */
const ROUTE_MATCH_RADIUS_M = 300;

/**
 * Signal 3: learned route patterns.
 * A route matches when start coords are within 300 m AND end coords are within 300 m.
 * Routes with match_count >= 3 return 80% confidence; below that, 50% (suggestion only).
 */
async function checkLearnedRoutes(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<ClassificationResult | null> {
  const db = await getDatabase();
  const routes = await db.getAllAsync<LearnedRouteRow>(
    "SELECT id, start_lat, start_lng, end_lat, end_lng, classification, platform_tag, match_count FROM learned_routes"
  );

  for (const route of routes) {
    const startDist = haversineMeters(startLat, startLng, route.start_lat, route.start_lng);
    const endDist = haversineMeters(endLat, endLng, route.end_lat, route.end_lng);

    if (startDist <= ROUTE_MATCH_RADIUS_M && endDist <= ROUTE_MATCH_RADIUS_M) {
      if (!route.classification) continue; // guard against null DB values
      const confidence = route.match_count >= 3 ? 80 : 50;
      return {
        classification: route.classification as "business" | "personal",
        platformTag: route.platform_tag,
        confidence,
        source: "route_learning",
      };
    }
  }

  return null;
}

/**
 * Signal 4: proximity to saved locations.
 *
 * Priority:
 *  - start near work/depot → business 75%
 *  - end near work/depot   → business 70%
 *  - start near home AND end near home → personal 60%
 */
async function checkSavedLocations(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<ClassificationResult | null> {
  const db = await getDatabase();
  const locations = await db.getAllAsync<SavedLocationRow>(
    "SELECT id, location_type, latitude, longitude, radius_meters FROM saved_locations"
  );

  let startNearWork = false;
  let endNearWork = false;
  let startNearHome = false;
  let endNearHome = false;

  for (const loc of locations) {
    const startDist = haversineMeters(startLat, startLng, loc.latitude, loc.longitude);
    const endDist = haversineMeters(endLat, endLng, loc.latitude, loc.longitude);
    const isWorkType = loc.location_type === "work" || loc.location_type === "depot";

    if (isWorkType) {
      if (startDist <= loc.radius_meters) startNearWork = true;
      if (endDist <= loc.radius_meters) endNearWork = true;
    } else if (loc.location_type === "home") {
      if (startDist <= loc.radius_meters) startNearHome = true;
      if (endDist <= loc.radius_meters) endNearHome = true;
    }
  }

  if (startNearWork) {
    return { classification: "business", platformTag: null, confidence: 75, source: "saved_location" };
  }
  if (endNearWork) {
    return { classification: "business", platformTag: null, confidence: 70, source: "saved_location" };
  }
  if (startNearHome && endNearHome) {
    return { classification: "personal", platformTag: null, confidence: 60, source: "saved_location" };
  }

  return null;
}

/**
 * Signal 5: work schedule.
 * Checks if the trip's start time falls within any enabled work_schedule slot.
 * Days use the JS convention: 0=Sunday … 6=Saturday.
 */
async function checkWorkSchedule(startedAt: Date): Promise<ClassificationResult | null> {
  const db = await getDatabase();
  const dayOfWeek = startedAt.getDay();
  const row = await db.getFirstAsync<WorkScheduleRow>(
    "SELECT day_of_week, start_time, end_time FROM work_schedule WHERE day_of_week = ? AND enabled = 1",
    [dayOfWeek]
  );

  if (!row) return null;

  // "HH:MM" comparison — lexicographic sort works correctly here.
  const tripTime = `${String(startedAt.getHours()).padStart(2, "0")}:${String(startedAt.getMinutes()).padStart(2, "0")}`;

  if (tripTime >= row.start_time && tripTime < row.end_time) {
    return {
      classification: "business",
      platformTag: null,
      confidence: 65,
      source: "work_schedule",
    };
  }

  return null;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a trip by evaluating all available signals in priority order.
 * Returns the first signal that produces a result, or an "unclassified" fallback.
 *
 * @param params - Trip coordinates and ISO timestamp strings.
 * @returns ClassificationResult with confidence and source metadata.
 */
export async function classifyTrip(params: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startedAt: string; // ISO date
  endedAt: string;
}): Promise<ClassificationResult> {
  const { startLat, startLng, endLat, endLng, startedAt } = params;
  const startDate = new Date(startedAt);

  // 1. Active shift — highest priority, definitive.
  const shiftResult = await checkActiveShift();
  if (shiftResult) return shiftResult;

  // 2. User-defined classification rules.
  const ruleResult = await checkClassificationRules(startLat, startLng, endLat, endLng, startDate);
  if (ruleResult) return ruleResult;

  // 3. Route learning from historical classifications.
  const routeResult = await checkLearnedRoutes(startLat, startLng, endLat, endLng);
  if (routeResult) return routeResult;

  // 4. Saved location proximity.
  const locationResult = await checkSavedLocations(startLat, startLng, endLat, endLng);
  if (locationResult) return locationResult;

  // 5. Work schedule coverage.
  const scheduleResult = await checkWorkSchedule(startDate);
  if (scheduleResult) return scheduleResult;

  // No signal matched.
  return {
    classification: "unclassified",
    platformTag: null,
    confidence: 0,
    source: "none",
  };
}

/**
 * Record a manual classification as a learned route pattern.
 *
 * - If a matching route already exists with the same classification: increment match_count.
 * - If a matching route exists with a different classification: overwrite, reset count to 1.
 * - If no match: insert a new row.
 *
 * @param params - Trip coordinates, confirmed classification and optional platform tag.
 */
export async function learnFromClassification(params: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  classification: string;
  platformTag: string | null;
}): Promise<void> {
  const { startLat, startLng, endLat, endLng, classification, platformTag } = params;
  const db = await getDatabase();
  const now = new Date().toISOString();

  const routes = await db.getAllAsync<LearnedRouteRow>(
    "SELECT id, start_lat, start_lng, end_lat, end_lng, classification, platform_tag, match_count FROM learned_routes"
  );

  // Find the nearest matching route (start + end both within 300 m).
  let matchedRoute: LearnedRouteRow | null = null;
  for (const route of routes) {
    const startDist = haversineMeters(startLat, startLng, route.start_lat, route.start_lng);
    const endDist = haversineMeters(endLat, endLng, route.end_lat, route.end_lng);
    if (startDist <= ROUTE_MATCH_RADIUS_M && endDist <= ROUTE_MATCH_RADIUS_M) {
      matchedRoute = route;
      break;
    }
  }

  if (matchedRoute) {
    if (matchedRoute.classification === classification) {
      // Reinforce the existing pattern. Only update platform_tag if provided,
      // otherwise keep the existing one (COALESCE preserves non-null values).
      await db.runAsync(
        "UPDATE learned_routes SET match_count = match_count + 1, last_matched_at = ?, platform_tag = COALESCE(?, platform_tag) WHERE id = ?",
        [now, platformTag, matchedRoute.id]
      );
    } else {
      // User corrected the classification — overwrite and reset confidence.
      await db.runAsync(
        "UPDATE learned_routes SET classification = ?, platform_tag = ?, match_count = 1, last_matched_at = ? WHERE id = ?",
        [classification, platformTag, now, matchedRoute.id]
      );
    }
  } else {
    // New route pattern.
    await db.runAsync(
      "INSERT INTO learned_routes (start_lat, start_lng, end_lat, end_lng, classification, platform_tag, match_count, last_matched_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
      [startLat, startLng, endLat, endLng, classification, platformTag, now]
    );
  }
}
