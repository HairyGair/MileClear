// Road events for the road alerts trial (2 Oct 2026): parsing and severity.
// Pure, unit-tested.
//
// Two free sources, normalised to one RoadEvent shape:
//
//   TomTom Traffic Incident Details API v5 (UK-wide, all roads). Closures,
//   lane closures, accidents, broken-down vehicles, roadworks and flooding,
//   each with a delay in seconds, a delay magnitude and a line in the
//   direction of travel. Jams are left out on purpose: daily congestion is the
//   sat-nav's job, not ours.
//
//   DfT Street Manager open data (England). Permits and activities from every
//   highway authority and utility, pushed to us over AWS SNS. Coordinates are
//   British National Grid (EPSG:27700) WKT and are converted to WGS84 here.
//
// Severity: "closure" (the road or carriageway is shut), "major" (lanes shut
// or an incident with a reported delay of 15 minutes or more, or TomTom's
// "major" magnitude), "minor" (everything else). Only closure and major ever
// cause a push.

import type { DirectionMode, LatLng } from "./roadCorridor.js";
import { bearingDeg, haversineMetres } from "./roadCorridor.js";

export type RoadEventSource = "tomtom" | "street_manager";
export type RoadEventSeverity = "closure" | "major" | "minor";
export type RoadEventCategory =
  | "road_closed"
  | "lane_closed"
  | "accident"
  | "broken_down_vehicle"
  | "roadworks"
  | "flooding"
  | "hazard"
  | "event"
  | "other";

export interface RoadEvent {
  /** Source-prefixed and stable for the life of the event: "tt:<id>",
   *  "sm:<permit or activity reference>". */
  id: string;
  source: RoadEventSource;
  category: RoadEventCategory;
  severity: RoadEventSeverity;
  /** "M6", "A1(M)", or a street name for Street Manager. */
  road: string | null;
  from: string | null;
  to: string | null;
  /** Overall direction of travel, degrees, when the event is one-way. */
  bearing: number | null;
  directionMode: DirectionMode;
  /** Short plain description from the source ("Closed", "Lane closed"...). */
  description: string;
  delayMinutes: number | null;
  startAt: Date | null;
  endAt: Date | null;
  /** True when the source says it has not started yet. */
  future: boolean;
  town: string | null;
  /** Street (and area) at the middle of an event that has no road number,
   *  looked up from OpenStreetMap after matching (services/roadEventNames.ts). */
  placeName?: string | null;
  placeTown?: string | null;
  lines: LatLng[][];
  points: LatLng[];
}

/** Delay that turns a lane closure or incident into "major". */
export const MAJOR_DELAY_MINUTES = 15;

// ── TomTom ─────────────────────────────────────────────────────────

/** iconCategory values from the Incident Details v5 documentation. */
export const TOMTOM_ICON = {
  unknown: 0,
  accident: 1,
  fog: 2,
  dangerousConditions: 3,
  rain: 4,
  ice: 5,
  jam: 6,
  laneClosed: 7,
  roadClosed: 8,
  roadWorks: 9,
  wind: 10,
  flooding: 11,
  brokenDownVehicle: 14,
} as const;

/** What we ask TomTom for. Jams (6) and weather-only categories are left out. */
export const TOMTOM_CATEGORY_FILTER = [1, 3, 7, 8, 9, 11, 14].join(",");

export const TOMTOM_FIELDS =
  "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay," +
  "events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers," +
  "timeValidity,probabilityOfOccurrence}}}";

interface TomTomIncident {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    id?: string;
    iconCategory?: number;
    magnitudeOfDelay?: number;
    events?: { description?: string; code?: number; iconCategory?: number }[];
    startTime?: string | null;
    endTime?: string | null;
    from?: string | null;
    to?: string | null;
    length?: number | null;
    delay?: number | null;
    roadNumbers?: string[] | null;
    timeValidity?: string | null;
    probabilityOfOccurrence?: string | null;
  };
}

function tomtomCategory(icon: number | undefined): RoadEventCategory {
  switch (icon) {
    case TOMTOM_ICON.roadClosed: return "road_closed";
    case TOMTOM_ICON.laneClosed: return "lane_closed";
    case TOMTOM_ICON.accident: return "accident";
    case TOMTOM_ICON.brokenDownVehicle: return "broken_down_vehicle";
    case TOMTOM_ICON.roadWorks: return "roadworks";
    case TOMTOM_ICON.flooding: return "flooding";
    case TOMTOM_ICON.dangerousConditions: return "hazard";
    default: return "other";
  }
}

export function tomtomSeverity(input: {
  iconCategory?: number;
  magnitudeOfDelay?: number;
  delaySeconds?: number | null;
  probabilityOfOccurrence?: string | null;
  eventIcons?: number[];
}): RoadEventSeverity {
  const p = (input.probabilityOfOccurrence ?? "").toLowerCase();
  if (p === "improbable" || p === "risk_of") return "minor";
  const icons = new Set([input.iconCategory, ...(input.eventIcons ?? [])]);
  if (icons.has(TOMTOM_ICON.roadClosed)) return "closure";
  const delayMin = input.delaySeconds != null ? input.delaySeconds / 60 : 0;
  if (delayMin >= MAJOR_DELAY_MINUTES) return "major";
  // 3 = major. 4 = "undefined", which TomTom uses for closures and other
  // indefinite delays; without a closure icon it stays minor.
  if (input.magnitudeOfDelay === 3) return "major";
  return "minor";
}

function asLatLng(c: unknown): LatLng | null {
  if (!Array.isArray(c) || c.length < 2) return null;
  const [lng, lat] = c as number[];
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Overall bearing of a line, first point to last, when it is long enough to
 *  have one. */
export function lineBearing(line: LatLng[]): number | null {
  if (line.length < 2) return null;
  const a = line[0], b = line[line.length - 1];
  if (haversineMetres(a, b) < 30) return null;
  return bearingDeg(a, b);
}

/** TomTom incidentDetails JSON -> RoadEvents. LineStrings run in the
 *  direction of traffic (TomTom geometry follows the driving direction), so
 *  they are matched "along"; Points have no direction. */
export function parseTomTomIncidents(json: unknown): RoadEvent[] {
  const incidents = (json as { incidents?: TomTomIncident[] } | null)?.incidents;
  if (!Array.isArray(incidents)) return [];
  const out: RoadEvent[] = [];
  for (const inc of incidents) {
    const pr = inc.properties ?? {};
    if (!pr.id) continue;
    if (pr.iconCategory === TOMTOM_ICON.jam) continue;
    const g = inc.geometry ?? {};
    const lines: LatLng[][] = [];
    const points: LatLng[] = [];
    if (g.type === "LineString" && Array.isArray(g.coordinates)) {
      const line = (g.coordinates as unknown[]).map(asLatLng).filter((p): p is LatLng => p != null);
      if (line.length >= 2) lines.push(line);
      else if (line.length === 1) points.push(line[0]);
    } else if (g.type === "Point") {
      const p = asLatLng(g.coordinates);
      if (p) points.push(p);
    }
    if (lines.length === 0 && points.length === 0) continue;

    const eventIcons = (pr.events ?? []).map((e) => e.iconCategory).filter((n): n is number => typeof n === "number");
    const severity = tomtomSeverity({
      iconCategory: pr.iconCategory,
      magnitudeOfDelay: pr.magnitudeOfDelay,
      delaySeconds: pr.delay,
      probabilityOfOccurrence: pr.probabilityOfOccurrence,
      eventIcons,
    });
    const description = (pr.events ?? [])
      .map((e) => (e.description ?? "").trim())
      .filter(Boolean)
      .join(", ");
    const category = eventIcons.includes(TOMTOM_ICON.roadClosed) ? "road_closed" : tomtomCategory(pr.iconCategory);
    out.push({
      id: `tt:${pr.id}`,
      source: "tomtom",
      category,
      severity,
      road: pr.roadNumbers && pr.roadNumbers.length > 0 ? pr.roadNumbers[0] : null,
      from: pr.from?.trim() || null,
      to: pr.to?.trim() || null,
      bearing: lines.length > 0 ? lineBearing(lines[0]) : null,
      directionMode: lines.length > 0 ? "along" : "none",
      description: description || defaultDescription(category),
      delayMinutes: pr.delay != null && pr.delay > 0 ? Math.round(pr.delay / 60) : null,
      startAt: parseDate(pr.startTime),
      endAt: parseDate(pr.endTime),
      future: pr.timeValidity === "future",
      town: null,
      lines,
      points,
    });
  }
  return out;
}

function defaultDescription(c: RoadEventCategory): string {
  switch (c) {
    case "road_closed": return "Closed";
    case "lane_closed": return "Lane closed";
    case "accident": return "Accident";
    case "broken_down_vehicle": return "Broken-down vehicle";
    case "roadworks": return "Roadworks";
    case "flooding": return "Flooding";
    case "hazard": return "Hazard";
    case "event": return "Event";
    default: return "Incident";
  }
}

// ── British National Grid -> WGS84 ─────────────────────────────────

/** OSGB36 easting/northing -> OSGB36 latitude/longitude (Airy 1830), the
 *  Ordnance Survey inverse transverse Mercator. */
export function bngToOsgb36(E: number, N: number): LatLng {
  const a = 6377563.396, b = 6356256.909;
  const F0 = 0.9996012717;
  const lat0 = (49 * Math.PI) / 180, lon0 = (-2 * Math.PI) / 180;
  const N0 = -100000, E0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b), n2 = n * n, n3 = n * n * n;

  let lat = lat0;
  let M = 0;
  do {
    lat = (N - N0 - M) / (a * F0) + lat;
    const Ma = (1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (lat - lat0);
    const Mb = (3 * n + 3 * n * n + (21 / 8) * n3) * Math.sin(lat - lat0) * Math.cos(lat + lat0);
    const Mc = ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0));
    const Md = (35 / 24) * n3 * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0));
    M = b * F0 * (Ma - Mb + Mc - Md);
  } while (Math.abs(N - N0 - M) >= 0.00001);

  const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;
  const tanLat = Math.tan(lat);
  const tan2 = tanLat * tanLat, tan4 = tan2 * tan2, tan6 = tan4 * tan2;
  const secLat = 1 / cosLat;
  const nu3 = nu * nu * nu, nu5 = nu3 * nu * nu, nu7 = nu5 * nu * nu;
  const VII = tanLat / (2 * rho * nu);
  const VIII = (tanLat / (24 * rho * nu3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const IX = (tanLat / (720 * rho * nu5)) * (61 + 90 * tan2 + 45 * tan4);
  const X = secLat / nu;
  const XI = (secLat / (6 * nu3)) * (nu / rho + 2 * tan2);
  const XII = (secLat / (120 * nu5)) * (5 + 28 * tan2 + 24 * tan4);
  const XIIA = (secLat / (5040 * nu7)) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);
  const dE = E - E0;
  const outLat = lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6;
  const outLon = lon0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;
  return [(outLat * 180) / Math.PI, (outLon * 180) / Math.PI];
}

/** OSGB36 lat/lng -> WGS84 by the standard 7-parameter Helmert transform
 *  (accurate to a few metres, plenty for matching to 250 m cells). */
export function osgb36ToWgs84(lat: number, lng: number): LatLng {
  const toRadL = (d: number) => (d * Math.PI) / 180;
  // Airy 1830 -> cartesian
  const a1 = 6377563.396, b1 = 6356256.909;
  const e21 = 1 - (b1 * b1) / (a1 * a1);
  const f = toRadL(lat), l = toRadL(lng);
  const nu = a1 / Math.sqrt(1 - e21 * Math.sin(f) ** 2);
  const x1 = nu * Math.cos(f) * Math.cos(l);
  const y1 = nu * Math.cos(f) * Math.sin(l);
  const z1 = (1 - e21) * nu * Math.sin(f);
  // Helmert OSGB36 -> WGS84
  const tx = 446.448, ty = -125.157, tz = 542.06;
  const s = -20.4894e-6;
  const sec = (v: number) => toRadL(v / 3600);
  const rx = sec(0.1502), ry = sec(0.247), rz = sec(0.8421);
  const x2 = tx + (1 + s) * x1 - rz * y1 + ry * z1;
  const y2 = ty + rz * x1 + (1 + s) * y1 - rx * z1;
  const z2 = tz - ry * x1 + rx * y1 + (1 + s) * z1;
  // cartesian -> WGS84
  const a2 = 6378137, b2 = 6356752.3142;
  const e22 = 1 - (b2 * b2) / (a2 * a2);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let phi = Math.atan2(z2, p * (1 - e22));
  for (let i = 0; i < 10; i++) {
    const nu2 = a2 / Math.sqrt(1 - e22 * Math.sin(phi) ** 2);
    const next = Math.atan2(z2 + e22 * nu2 * Math.sin(phi), p);
    if (Math.abs(next - phi) < 1e-12) { phi = next; break; }
    phi = next;
  }
  return [(phi * 180) / Math.PI, (Math.atan2(y2, x2) * 180) / Math.PI];
}

export function bngToWgs84(E: number, N: number): LatLng {
  const [lat, lng] = bngToOsgb36(E, N);
  return osgb36ToWgs84(lat, lng);
}

/** POINT / LINESTRING / MULTILINESTRING / POLYGON / MULTIPOINT WKT in British
 *  National Grid -> WGS84 lines and points. Unknown shapes give nothing. */
export function parseBngWkt(wkt: string | null | undefined): { lines: LatLng[][]; points: LatLng[] } {
  const empty = { lines: [] as LatLng[][], points: [] as LatLng[] };
  if (!wkt || typeof wkt !== "string") return empty;
  const m = wkt.trim().match(/^([A-Z]+)\s*\((.*)\)$/is);
  if (!m) return empty;
  const kind = m[1].toUpperCase();
  const body = m[2];
  const parseCoords = (s: string): LatLng[] =>
    s
      .replace(/[()]/g, "")
      .split(",")
      .map((pair) => pair.trim().split(/\s+/).map(Number))
      .filter((xy) => xy.length >= 2 && Number.isFinite(xy[0]) && Number.isFinite(xy[1]))
      .map(([x, y]) => bngToWgs84(x, y));
  if (kind === "POINT" || kind === "MULTIPOINT") return { lines: [], points: parseCoords(body) };
  if (kind === "LINESTRING") return { lines: [parseCoords(body)], points: [] };
  if (kind === "MULTILINESTRING" || kind === "POLYGON" || kind === "MULTIPOLYGON") {
    const parts = body.split(/\)\s*,\s*\(/).map(parseCoords).filter((l) => l.length > 0);
    return { lines: parts.filter((l) => l.length >= 2), points: parts.filter((l) => l.length === 1).flat() };
  }
  return empty;
}

// ── Street Manager ─────────────────────────────────────────────────

/** Traffic management worth storing. Signals and closures hold traffic up;
 *  "no carriageway incursion" and similar do not. */
export const STREET_WORKS_KEEP = new Set([
  "road_closure",
  "lane_closure",
  "contra_flow",
  "convoy_workings",
  "multi_way_signals",
  "two_way_signals",
  "stop_go_boards",
]);

export interface StreetWorksRecord {
  reference: string;
  objectType: "PERMIT" | "ACTIVITY";
  trafficManagement: string;
  isTrafficSensitive: boolean;
  workStatus: string | null;
  streetName: string | null;
  town: string | null;
  areaName: string | null;
  highwayAuthority: string | null;
  promoter: string | null;
  startAt: Date | null;
  endAt: Date | null;
  eventAt: Date;
  lines: LatLng[][];
  points: LatLng[];
}

export type StreetWorksChange =
  | { kind: "upsert"; record: StreetWorksRecord }
  | { kind: "delete"; reference: string; eventAt: Date }
  | { kind: "ignore"; reason: string };

/** "work-start", "WORK_START" and "Work start" -> "work_start". */
export function normaliseEventType(t: unknown): string {
  return String(t ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Street Manager keeps date and time apart: a null time means "time not
 *  given". Start without a time = start of that day; end without a time =
 *  end of that day (UTC; the dates arrive as UTC midnights). */
export function combineDateTime(date: unknown, time: unknown, endOfDay: boolean): Date | null {
  const t = typeof time === "string" ? parseDate(time) : null;
  if (t) return t;
  const d = typeof date === "string" ? parseDate(date) : null;
  if (!d) return null;
  if (!endOfDay) return d;
  return new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1000);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function toRef(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const DELETE_EVENTS = new Set([
  "permit_cancelled",
  "permit_refused",
  "permit_revoked",
  "activity_cancelled",
]);

/** One SNS Message (the JSON string inside the notification) -> a change to
 *  our store. Section 58 notices (restrictions on NEW works) are ignored. */
export function parseStreetManagerMessage(message: unknown): StreetWorksChange {
  let msg: Record<string, unknown>;
  try {
    msg = (typeof message === "string" ? JSON.parse(message) : message) as Record<string, unknown>;
  } catch {
    return { kind: "ignore", reason: "bad_json" };
  }
  if (!msg || typeof msg !== "object") return { kind: "ignore", reason: "bad_json" };
  const objectType = String(msg.object_type ?? "").toUpperCase();
  const eventType = normaliseEventType(msg.event_type);
  const data = (msg.object_data ?? {}) as Record<string, unknown>;
  const eventAt = parseDate(str(msg.event_time)) ?? new Date();

  if (objectType !== "PERMIT" && objectType !== "ACTIVITY") return { kind: "ignore", reason: "object_type" };

  const reference =
    objectType === "PERMIT"
      ? str(data.permit_reference_number) ?? str(msg.object_reference)
      : str(data.activity_reference_number) ?? str(msg.object_reference);
  if (!reference) return { kind: "ignore", reason: "no_reference" };

  const cancelled = objectType === "ACTIVITY" && String(data.cancelled ?? "").toLowerCase() === "yes";
  if (DELETE_EVENTS.has(eventType) || cancelled) return { kind: "delete", reference, eventAt };

  const tm =
    objectType === "PERMIT"
      ? toRef(data.current_traffic_management_type_ref ?? data.traffic_management_type_ref ?? data.traffic_management_type)
      : toRef(data.traffic_management_type);
  if (!STREET_WORKS_KEEP.has(tm)) {
    // A permit whose traffic management was relaxed to nothing worth
    // knowing about: drop any stored copy.
    return { kind: "delete", reference, eventAt };
  }

  const geom = parseBngWkt(
    str(objectType === "PERMIT" ? data.works_location_coordinates : data.activity_coordinates)
  );
  if (geom.lines.length === 0 && geom.points.length === 0) return { kind: "ignore", reason: "no_geometry" };

  let startAt: Date | null;
  let endAt: Date | null;
  if (objectType === "PERMIT") {
    startAt = parseDate(str(data.actual_start_date_time)) ?? combineDateTime(data.proposed_start_date, data.proposed_start_time, false);
    endAt = parseDate(str(data.actual_end_date_time)) ?? combineDateTime(data.proposed_end_date, data.proposed_end_time, true);
  } else {
    startAt = combineDateTime(data.start_date, data.start_time, false);
    endAt = combineDateTime(data.end_date, data.end_time, true);
  }

  return {
    kind: "upsert",
    record: {
      reference,
      objectType: objectType as "PERMIT" | "ACTIVITY",
      trafficManagement: tm,
      isTrafficSensitive: String(data.is_traffic_sensitive ?? "").toLowerCase() === "yes",
      workStatus: str(data.work_status_ref) ?? str(data.work_status),
      streetName: str(data.street_name),
      town: str(data.town),
      areaName: str(data.area_name),
      highwayAuthority: str(data.highway_authority),
      promoter: str(data.promoter_organisation) ?? (objectType === "ACTIVITY" ? str(data.activity_name) : null),
      startAt,
      endAt,
      eventAt,
      lines: geom.lines,
      points: geom.points,
    },
  };
}

function titleCase(s: string | null): string | null {
  if (!s) return null;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

const TM_LABEL: Record<string, string> = {
  road_closure: "Road closed",
  lane_closure: "Lane closed",
  contra_flow: "Contraflow",
  convoy_workings: "Convoy working",
  multi_way_signals: "Temporary lights",
  two_way_signals: "Temporary lights",
  stop_go_boards: "Stop/go boards",
};

/** A stored Street Manager row -> RoadEvent. No direction information, so it
 *  matches on location only ("axis" for lines: either way along the street). */
export function streetWorksToRoadEvent(r: {
  reference: string;
  trafficManagement: string;
  isTrafficSensitive: boolean;
  streetName: string | null;
  town: string | null;
  promoter: string | null;
  startAt: Date | null;
  endAt: Date | null;
  lines: LatLng[][];
  points: LatLng[];
}, now: Date): RoadEvent {
  const closure = r.trafficManagement === "road_closure";
  return {
    id: `sm:${r.reference}`,
    source: "street_manager",
    category: closure ? "road_closed" : r.trafficManagement === "lane_closure" ? "lane_closed" : "roadworks",
    severity: closure ? "closure" : "minor",
    road: titleCase(r.streetName),
    from: null,
    to: null,
    bearing: null,
    directionMode: r.lines.length > 0 ? "axis" : "none",
    description: TM_LABEL[r.trafficManagement] ?? "Roadworks",
    delayMinutes: null,
    startAt: r.startAt,
    endAt: r.endAt,
    future: r.startAt != null && r.startAt.getTime() > now.getTime(),
    town: titleCase(r.town),
    lines: r.lines,
    points: r.points,
  };
}
