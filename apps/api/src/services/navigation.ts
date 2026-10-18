// In-app navigation: routes from our own GraphHopper (18 Oct 2026).
//
// Contract and rules: docs/navigation-build-oct2026.md. The app does the
// guidance; this turns a GraphHopper path into the route the app follows:
// [lat, lng] geometry, steps in plain UK English, and speed limits in mph.
//
// Profile `car_nav` obeys turn restrictions (no right turn, no U-turn signs);
// `car` (manual-trip distances) does not. If the GraphHopper we reach does not
// know `car_nav` yet, we fall back to `car` and say so in `profile`.
//
// No live traffic: OpenStreetMap only. Durations are free-flow estimates.
import crypto from "node:crypto";

export type NavStepType = "depart" | "continue" | "turn" | "keep" | "roundabout" | "uturn" | "arrive";
export type NavModifier = "left" | "right" | "slight_left" | "slight_right" | "sharp_left" | "sharp_right" | "straight";

export interface NavStep {
  type: NavStepType;
  modifier?: NavModifier;
  exit?: number;
  streetName: string | null;
  /** Road number from OpenStreetMap ("A1", "A189", "M62"), or null. Many
   *  major roads have a number and no name, so say "the A1" then. */
  roadRef: string | null;
  /** Signposted destinations for the exit ("Sunderland, Washington"), or null. */
  towards: string | null;
  text: string;
  distanceMeters: number;
  durationSeconds: number;
  startIndex: number;
  endIndex: number;
}

export interface NavRoute {
  routeId: string;
  distanceMeters: number;
  durationSeconds: number;
  geometry: Array<[number, number]>;
  steps: NavStep[];
  speedLimitsMph: Array<{ startIndex: number; endIndex: number; mph: number | null }>;
  dataDate: string;
  engine: "graphhopper";
  profile: string;
}

export interface GraphHopperInstruction {
  sign: number;
  text?: string;
  street_name?: string;
  street_ref?: string;
  street_destination?: string;
  street_destination_ref?: string;
  distance: number;
  time: number;
  interval: [number, number];
  exit_number?: number;
}

export interface GraphHopperPath {
  distance: number;
  time: number;
  points: { type?: string; coordinates: Array<[number, number] | [number, number, number]> };
  instructions: GraphHopperInstruction[];
  details?: { max_speed?: Array<[number, number, number | null]> };
}

/** Who sees navigation (18 Oct 2026, Anthony: Pro only, every Pro driver can
 *  test it, labelled as a test).
 *
 *  NAVIGATION_ROLLOUT: "off" (nobody), "list" (admins + NAVIGATION_USER_IDS),
 *  "pro" (admins + the list + every Pro driver). Unset falls back to the
 *  first switch: NAVIGATION_ENABLED=1 means "list", otherwise "off". Pure;
 *  the caller passes whether the driver is Pro (hasPremiumAccess). */
export type NavigationRollout = "off" | "list" | "pro";

export function navigationRollout(env: NodeJS.ProcessEnv = process.env): NavigationRollout {
  const r = env.NAVIGATION_ROLLOUT;
  if (r === "off" || r === "list" || r === "pro") return r;
  return env.NAVIGATION_ENABLED === "1" ? "list" : "off";
}

export function navigationEnabledFor(
  user: { id: string; isAdmin: boolean; isPro?: boolean },
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const rollout = navigationRollout(env);
  if (rollout === "off") return false;
  if (user.isAdmin) return true;
  const ids = (env.NAVIGATION_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.includes(user.id)) return true;
  return rollout === "pro" && user.isPro === true;
}

/** A compass heading 0-359 from the query, or null (absent or nonsense). */
export function parseHeading(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n >= 360) return null;
  return Math.round(n) % 360; // 359.6 rounds to 360, which is north: 0
}

/** "lat,lng" within sane bounds, or null. */
export function parseLatLng(raw: unknown): [number, number] | null {
  if (typeof raw !== "string") return null;
  const parts = raw.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng] = parts;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

const MODIFIER_WORDS: Record<NavModifier, string> = {
  left: "left",
  right: "right",
  slight_left: "slight left",
  slight_right: "slight right",
  sharp_left: "sharp left",
  sharp_right: "sharp right",
  straight: "straight on",
};

/** GraphHopper `sign` to our step type and modifier. */
export function stepKind(sign: number): { type: NavStepType; modifier?: NavModifier } {
  switch (sign) {
    case -3: return { type: "turn", modifier: "sharp_left" };
    case -2: return { type: "turn", modifier: "left" };
    case -1: return { type: "turn", modifier: "slight_left" };
    case 1: return { type: "turn", modifier: "slight_right" };
    case 2: return { type: "turn", modifier: "right" };
    case 3: return { type: "turn", modifier: "sharp_right" };
    case 4: return { type: "arrive" };
    case 6: return { type: "roundabout" };
    case -7: return { type: "keep", modifier: "left" };
    case 7: return { type: "keep", modifier: "right" };
    case -8: return { type: "uturn", modifier: "left" };
    case 8: return { type: "uturn", modifier: "right" };
    case -98: return { type: "uturn" };
    default: return { type: "continue", modifier: "straight" }; // 0 continue, 5 via, anything new
  }
}

/** Plain UK wording for a step (the app builds the spoken version from the
 *  same fields, with the distance in front). */
export function stepText(type: NavStepType, modifier: NavModifier | undefined, street: string | null, exit?: number): string {
  const onto = street ? ` onto ${street}` : "";
  switch (type) {
    case "depart": return street ? `Head along ${street}` : "Set off";
    case "arrive": return "You have arrived";
    case "roundabout": return exit ? `At the roundabout, take the ${ordinal(exit)} exit${onto}` : `At the roundabout, continue${onto}`;
    case "uturn": return "Make a U-turn when it is safe to do so";
    case "keep": return `Keep ${modifier === "left" ? "left" : "right"}${onto}`;
    case "turn": return `Turn ${MODIFIER_WORDS[modifier ?? "straight"]}${onto}`;
    default: return street ? `Continue on ${street}` : "Continue";
  }
}

/** First road number in an OSM ref list ("A1231;A182" -> "A1231"). */
export function firstRef(raw: string | undefined): string | null {
  const first = raw?.split(/[;,]/)[0]?.trim();
  return first ? first : null;
}

/** OSM destination signs, minus the "Non-motorway traffic" sign text. */
export function cleanTowards(raw: string | undefined): string | null {
  if (!raw) return null;
  const parts = raw
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter((p) => p && !/non-motorway traffic/i.test(p));
  return parts.length ? parts.join(", ") : null;
}

/** km/h from OpenStreetMap to the UK sign it came from, in mph (nearest 5). */
export function kmhToUkMph(kmh: number | null | undefined): number | null {
  if (kmh == null || !Number.isFinite(kmh) || kmh <= 0) return null;
  return Math.round(kmh / 1.609344 / 5) * 5;
}

/** One GraphHopper path to the route the app follows. Pure. */
export function toNavRoute(path: GraphHopperPath, opts: { dataDate: string; profile: string; routeId?: string }): NavRoute {
  const geometry = path.points.coordinates.map((c) => [c[1], c[0]] as [number, number]);
  const steps: NavStep[] = path.instructions.map((ins, i) => {
    const kind = stepKind(ins.sign);
    const modifier = kind.modifier;
    let type = kind.type;
    // GraphHopper's first instruction is "Continue" from the start point.
    if (i === 0 && type === "continue") type = "depart";
    const streetName = ins.street_name && ins.street_name.trim() ? ins.street_name.trim() : null;
    // On a slip road GraphHopper's street_ref is still the motorway's number
    // (the road being left); the exit road's number is the first part of
    // street_destination_ref ("A1231"), so a keep step prefers that.
    const exitRef = firstRef(ins.street_destination_ref);
    const ownRef = ins.street_ref && ins.street_ref.trim() ? ins.street_ref.trim() : null;
    const roadRef = Math.abs(ins.sign) === 7 && exitRef ? exitRef : ownRef;
    const towards = cleanTowards(ins.street_destination);
    // Name first ("Gallowgate"); a road with only a number reads "the A1".
    const label = streetName ?? (roadRef ? `the ${roadRef}` : null);
    const exit = type === "roundabout" && typeof ins.exit_number === "number" && ins.exit_number > 0 ? ins.exit_number : undefined;
    return {
      type,
      ...(modifier && type !== "depart" ? { modifier } : {}),
      ...(exit ? { exit } : {}),
      streetName,
      roadRef,
      towards,
      text: stepText(type, modifier, label, exit),
      distanceMeters: Math.round(ins.distance * 10) / 10,
      durationSeconds: Math.round(ins.time / 1000),
      startIndex: ins.interval[0],
      endIndex: ins.interval[1],
    };
  });
  const speedLimitsMph = (path.details?.max_speed ?? []).map(([startIndex, endIndex, kmh]) => ({
    startIndex,
    endIndex,
    mph: kmhToUkMph(kmh),
  }));
  return {
    routeId: opts.routeId ?? crypto.randomUUID(),
    distanceMeters: Math.round(path.distance),
    durationSeconds: Math.round(path.time / 1000),
    geometry,
    steps,
    speedLimitsMph,
    dataDate: opts.dataDate,
    engine: "graphhopper",
    profile: opts.profile,
  };
}

export type NavRouteResult =
  | { ok: true; route: NavRoute }
  | { ok: false; code: "NO_ROUTE" | "ROUTING_UNAVAILABLE"; detail?: string };

/** Asks our GraphHopper for a navigation route. `car_nav` first; if that
 *  profile isn't known (an older graph), `car` without turn restrictions. */
export async function fetchNavRoute(
  from: [number, number],
  to: [number, number],
  env: NodeJS.ProcessEnv = process.env,
  heading: number | null = null
): Promise<NavRouteResult> {
  // Navigation has its own GraphHopper (GRAPHHOPPER_NAV_URL) so a navigation
  // map refresh or load never touches the instance behind manual-trip
  // distances and map-matching (GRAPHHOPPER_URL), which feed trip mileage.
  const base = (env.GRAPHHOPPER_NAV_URL || env.GRAPHHOPPER_URL)?.replace(/\/$/, "");
  if (!base) return { ok: false, code: "ROUTING_UNAVAILABLE", detail: "GRAPHHOPPER_NAV_URL not set" };
  const wanted = env.GRAPHHOPPER_NAV_PROFILE || "car_nav";
  const profiles = wanted === "car" ? ["car"] : [wanted, "car"];
  for (const profile of profiles) {
    const url =
      `${base}/route?point=${from[0]},${from[1]}&point=${to[0]},${to[1]}` +
      `&profile=${encodeURIComponent(profile)}&instructions=true&locale=en-GB` +
      `&points_encoded=false&calc_points=true&details=max_speed` +
      // With the car's direction (reroutes, setting off while moving), the
      // route starts the way the car is already going instead of "make a
      // U-turn". The CH speed-up mode can't take a heading, so these use the
      // landmark (LM) mode of car_nav: a little slower, still well under a second.
      (heading !== null && profile !== "car" ? `&heading=${heading}&ch.disable=true` : "");
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch (err) {
      return { ok: false, code: "ROUTING_UNAVAILABLE", detail: err instanceof Error ? err.message : String(err) };
    }
    const body = (await res.json().catch(() => null)) as
      | { paths?: GraphHopperPath[]; info?: { road_data_timestamp?: string }; message?: string }
      | null;
    if (res.ok && body?.paths?.[0]) {
      const dataDate = (body.info?.road_data_timestamp ?? "").slice(0, 10);
      return { ok: true, route: toNavRoute(body.paths[0], { dataDate, profile }) };
    }
    const message = body?.message ?? `HTTP ${res.status}`;
    // An unknown profile is a server set-up gap, not "no route": try the next.
    if (res.status === 400 && /profile/i.test(message) && profile !== profiles[profiles.length - 1]) continue;
    if (res.status === 400) return { ok: false, code: "NO_ROUTE", detail: message };
    return { ok: false, code: "ROUTING_UNAVAILABLE", detail: message };
  }
  return { ok: false, code: "ROUTING_UNAVAILABLE" };
}
