// Three more free road-data sources for road alerts (17 Oct 2026): parsing
// and mapping to the one RoadEvent shape. Pure, unit-tested. The fetching,
// caching and gating live in services/roadSources.ts.
//
//   TfL Unified API, /Road/all/Disruption (Greater London). Disruptions in
//   effect now: a Point for each, plus per-street line segments for some,
//   with a closure flag and directions per street. Severity is TfL's own
//   (Serious, Moderate, Minimal, No impact).
//
//   Traffic Wales RSS (Welsh trunk roads and motorways). One georss:point
//   per item and free text titles like
//   "M4 : Westbound : J24 Coldra to J28 Tredegar Park : Road closed :
//    19/10/26-23/10/26 2000-0600 : Diversions in place :".
//
//   National Highways planned closures (England motorways and major A
//   roads), the open ArcGIS layer PublicScheduledRoadClosures. One feature
//   per closure window (one night), polyline geometry.
//
// Mapping (kept conservative: only closures and serious incidents can ever
// cause a push, everything else is screen-only):
//   - A whole road or carriageway shut: road_closed / closure.
//   - Slip roads, lanes, lights, stop/go: roadworks / minor (listed under
//     "upcoming" on the screen, never pushed). A slip closure is a point at
//     a junction that every through driver passes, so it is not a push.
//   - TfL collisions: accident, major when TfL says Moderate or worse.
//   - TfL "Serious" or "Severe" anything: major.
//
// Direction: none of the three gives a line drawn in the direction of
// traffic (National Highways lines run the same way whatever the closed
// carriageway, checked against 3,646 one-way features on 17 Oct 2026), so
// lines match either way along the road ("axis") and points match on
// location. The direction word goes into the road label instead
// ("M6 northbound"), so the driver can tell.

import type { LatLng } from "./roadCorridor.js";
import { haversineMetres, ukLocalParts } from "./roadCorridor.js";
import type { RoadEvent, RoadEventCategory, RoadEventSeverity, RoadEventSource } from "./roadEvents.js";

export type ExtraSource = Extract<RoadEventSource, "tfl" | "traffic_wales" | "national_highways">;

export interface Bbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Rough boxes: a source is only fetched when an opted-in driver's corridor
 *  touches its area. */
export const GREATER_LONDON_BBOX: Bbox = { minLat: 51.28, maxLat: 51.69, minLng: -0.51, maxLng: 0.33 };
export const WALES_BBOX: Bbox = { minLat: 51.3, maxLat: 53.5, minLng: -5.4, maxLng: -2.6 };
export const ENGLAND_BBOX: Bbox = { minLat: 49.8, maxLat: 55.85, minLng: -6.5, maxLng: 1.8 };

/** The same margin matchEventToCorridor allows around a corridor's box, so
 *  the prefilter never drops an event matching would have kept. */
export const CORRIDOR_PAD_LAT = 0.01;
export const CORRIDOR_PAD_LNG = 0.015;

export function padBbox(b: Bbox): Bbox {
  return {
    minLat: b.minLat - CORRIDOR_PAD_LAT,
    maxLat: b.maxLat + CORRIDOR_PAD_LAT,
    minLng: b.minLng - CORRIDOR_PAD_LNG,
    maxLng: b.maxLng + CORRIDOR_PAD_LNG,
  };
}

/** National Highways and Traffic Wales list many slip, lane and link road
 *  closures on motorways; only closures and serious items reach matching
 *  (and so the screen), so a motorway driver is not flooded. */
export function screenWorthy(e: Pick<RoadEvent, "source" | "severity">): boolean {
  if (e.source === "national_highways" || e.source === "traffic_wales") return e.severity !== "minor";
  return true;
}

export function bboxTouches(a: Bbox, b: Bbox): boolean {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng;
}

export function eventBbox(e: Pick<RoadEvent, "lines" | "points">): Bbox | null {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of [...e.lines.flat(), ...e.points]) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return Number.isFinite(minLat) ? { minLat, maxLat, minLng, maxLng } : null;
}

/** A closure window that repeats (every night of a planned closure) is one
 *  RoadEvent per window, the way Street Manager books them, so the existing
 *  grouping shows "closed overnight on N nights" and "in effect when they
 *  leave" is true only on the nights it is. */
export const MAX_WINDOWS_PER_ITEM = 200;

// ── Small helpers ───────────────────────────────────────────────────

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(/-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

function sentenceCase(s: string): string {
  const t = s.trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function parseIso(s: unknown): Date | null {
  if (typeof s !== "string" || !s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DIRECTION_RE = /\b(northbound|southbound|eastbound|westbound|anti-?clockwise|clockwise)\b/gi;

/** One direction word from free text ("Westbound" -> "westbound"), or null
 *  when it says both ways or names more than one direction. */
export function oneDirection(text: string): string | null {
  if (/\b(both|all) (directions|ways|approaches)\b/i.test(text)) return null;
  const found = new Set((text.match(DIRECTION_RE) ?? []).map((w) => w.toLowerCase().replace("anticlockwise", "anti-clockwise")));
  return found.size === 1 ? [...found][0] : null;
}

function withDirection(road: string | null, dir: string | null): string | null {
  if (!road) return null;
  return dir ? `${road} ${dir}` : road;
}

/** A wall-clock time in the UK -> the UTC instant (handles BST). */
export function ukLocalToUtc(y: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(y, month - 1, day, hour, minute);
  const want = hour * 60 + minute;
  const wantDay = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  for (const off of [0, -3600000]) {
    const p = ukLocalParts(new Date(guess + off));
    if (p.minutes === want && p.dayKey === wantDay) return new Date(guess + off);
  }
  return new Date(guess);
}

/** Copies of one event, one per time window, ids suffixed with the start. */
function perWindow(base: RoadEvent, windows: { start: Date | null; end: Date | null }[]): RoadEvent[] {
  if (windows.length <= 1) {
    const w = windows[0] ?? { start: base.startAt, end: base.endAt };
    return [{ ...base, startAt: w.start, endAt: w.end }];
  }
  return windows.slice(0, MAX_WINDOWS_PER_ITEM).map((w) => ({
    ...base,
    id: `${base.id}@${w.start ? w.start.toISOString() : "open"}`,
    startAt: w.start,
    endAt: w.end,
  }));
}

function blank(id: string, source: ExtraSource): RoadEvent {
  return {
    id,
    source,
    category: "other",
    severity: "minor",
    road: null,
    from: null,
    to: null,
    bearing: null,
    directionMode: "none",
    description: "",
    delayMinutes: null,
    startAt: null,
    endAt: null,
    future: false,
    town: null,
    lines: [],
    points: [],
  };
}

const LANE_RE = /\blanes?\b[^.:]{0,40}\bclos(ed|ure|ures)\b|\blane closures?\b/i;
const LIGHTS_RE = /temporary (traffic )?(lights|signals)|traffic signals in (operation|place)|three-way|multi-way|two-way signals/i;
const STOPGO_RE = /stop\s*\/?\s*go|convoy/i;

// ── TfL ─────────────────────────────────────────────────────────────

interface TflStreet {
  name?: string;
  closure?: string;
  directions?: string;
  segments?: { lineString?: string }[];
}

interface TflDisruption {
  id?: string;
  point?: string;
  severity?: string;
  category?: string;
  subCategory?: string;
  comments?: string;
  location?: string;
  startDateTime?: string;
  endDateTime?: string;
  geography?: { type?: string; coordinates?: unknown };
  streets?: TflStreet[];
  recurringSchedules?: { startTime?: string; endTime?: string }[];
}

function lngLat(c: unknown): LatLng | null {
  if (!Array.isArray(c) || c.length < 2) return null;
  const [lng, lat] = c as number[];
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

function tflLine(s: string | undefined): LatLng[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s) as unknown[];
    return Array.isArray(arr) ? arr.map(lngLat).filter((p): p is LatLng => p != null) : [];
  } catch {
    return [];
  }
}

/** "[A3031] ALBERT BRIDGE ROAD (SW11 ,SW3 ) (Kensington & Chelsea,Wandsworth)"
 *  -> road "A3031 Albert Bridge Road", town "Kensington & Chelsea". */
export function tflStreetName(raw: string | undefined | null): { road: string | null; town: string | null } {
  if (!raw) return { road: null, town: null };
  const number = raw.match(/^\s*\[([AMB]\d+[A-Z]?(?:\(M\))?)\]/i)?.[1]?.toUpperCase() ?? null;
  const parens = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
  // The last bracket is the borough list when the one before it is postcodes.
  const boroughs = parens.length >= 2 ? parens[parens.length - 1] : null;
  const name = raw.replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)/g, "").trim();
  const street = name ? titleCase(name) : null;
  const road = number && street ? `${number} ${street}` : number ?? street;
  const town = boroughs ? titleCase(boroughs.split(",")[0]).replace(/ And /g, " & ") : null;
  return { road, town };
}

function tflWindows(d: TflDisruption): { start: Date | null; end: Date | null }[] {
  const sched = (d.recurringSchedules ?? [])
    .map((r) => ({ start: parseIso(r.startTime), end: parseIso(r.endTime) }))
    .filter((w) => w.start || w.end);
  if (sched.length > 0) return sched;
  return [{ start: parseIso(d.startDateTime), end: parseIso(d.endDateTime) }];
}

export function tflSeverityRank(s: string | undefined): number {
  switch ((s ?? "").toLowerCase()) {
    case "severe": return 3;
    case "serious": return 3;
    case "moderate": return 2;
    case "minimal": return 1;
    default: return 0; // "No impact" and anything new
  }
}

/** TfL /Road/all/Disruption JSON -> RoadEvents. */
export function parseTflDisruptions(json: unknown): RoadEvent[] {
  if (!Array.isArray(json)) return [];
  const out: RoadEvent[] = [];
  for (const d of json as TflDisruption[]) {
    if (!d || typeof d.id !== "string") continue;
    const streets = Array.isArray(d.streets) ? d.streets : [];
    const closed = streets.filter((s) => (s.closure ?? "").toLowerCase() === "closed");
    const comments = d.comments ?? "";
    const cat = (d.category ?? "").toLowerCase();
    const rank = tflSeverityRank(d.severity);

    let category: RoadEventCategory;
    let severity: RoadEventSeverity;
    let description: string;
    if (closed.length > 0) {
      category = "road_closed";
      severity = "closure";
      description = cat === "planned events" ? "Closed for an event" : cat === "collisions" ? "Closed after a collision" : "Closed";
    } else if (cat === "collisions") {
      category = "accident";
      severity = rank >= 2 ? "major" : "minor";
      description = "Collision";
    } else if (cat === "planned events") {
      category = "event";
      severity = rank >= 3 ? "major" : "minor";
      description = "Event";
    } else if (cat === "surface damage" || cat === "asset issues") {
      category = "hazard";
      severity = rank >= 3 ? "major" : "minor";
      description = d.subCategory ? sentenceCase(d.subCategory) : "Hazard";
    } else {
      category = LANE_RE.test(comments) ? "lane_closed" : "roadworks";
      severity = rank >= 3 ? "major" : "minor";
      description =
        category === "lane_closed" ? "Lane closed" : LIGHTS_RE.test(comments) ? "Temporary lights" : "Roadworks";
    }
    // "No impact" with nothing shut: nothing a driver would notice.
    if (rank === 0 && severity !== "closure") continue;

    // Geometry: the closed streets when some are shut (not the open side
    // streets listed with them), else every street, else TfL's point.
    const useStreets = closed.length > 0 ? closed : streets;
    const lines: LatLng[][] = [];
    for (const s of useStreets) {
      for (const seg of s.segments ?? []) {
        const l = tflLine(seg.lineString);
        if (l.length >= 2) lines.push(l);
      }
    }
    const points: LatLng[] = [];
    if (lines.length === 0) {
      const p = d.geography?.type === "Point" ? lngLat(d.geography.coordinates) : null;
      const q = p ?? (typeof d.point === "string" ? lngLat(safeJson(d.point)) : null);
      if (q) points.push(q);
    }
    if (lines.length === 0 && points.length === 0) continue;

    const main = closed[0] ?? streets[0];
    const fromStreet = main?.name ? tflStreetName(main.name) : null;
    const fromLocation = tflStreetName(d.location);
    const road = fromStreet?.road ?? fromLocation.road;
    const dir = oneDirection(main?.directions ?? "") ?? (main?.directions ? null : oneDirection(comments.split(" - ")[0] ?? ""));

    const base: RoadEvent = {
      ...blank(`tfl:${d.id}`, "tfl"),
      category,
      severity,
      road: withDirection(road, dir),
      directionMode: lines.length > 0 ? "axis" : "none",
      description,
      town: fromLocation.town,
      lines,
      points,
    };
    out.push(...perWindow(base, tflWindows(d)));
  }
  return out;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ── Traffic Wales RSS ───────────────────────────────────────────────

export interface RssItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  point: LatLng | null;
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

/** The text of the first <name ...>...</name> in a small chunk, found with
 *  indexOf (linear, no backtracking). */
function tag(xml: string, name: string): string {
  const lower = xml.toLowerCase();
  const open = `<${name.toLowerCase()}`;
  let i = lower.indexOf(open);
  while (i !== -1) {
    const next = lower.charAt(i + open.length);
    if (next === ">" || next === " " || next === "\t" || next === "\n" || next === "\r" || next === "/") break;
    i = lower.indexOf(open, i + 1);
  }
  if (i === -1) return "";
  const gt = lower.indexOf(">", i);
  if (gt === -1 || lower.charAt(gt - 1) === "/") return "";
  const close = lower.indexOf(`</${name.toLowerCase()}>`, gt);
  if (close === -1) return "";
  return decodeXml(xml.slice(gt + 1, close));
}

/** RSS 2.0 items with an optional georss:point ("lat lng"). Small and
 *  forgiving: anything that is not an item is ignored. Linear: the feed is
 *  cut at each <item> and each piece read with indexOf. */
export function parseRssItems(xml: string): RssItem[] {
  if (typeof xml !== "string") return [];
  const out: RssItem[] = [];
  const lower = xml.toLowerCase();
  let from = 0;
  for (;;) {
    let i = lower.indexOf("<item", from);
    // "<items>" or "<itemfoo>" are not items.
    while (i !== -1 && !/[\s>]/.test(lower.charAt(i + 5))) i = lower.indexOf("<item", i + 5);
    if (i === -1) break;
    const end = lower.indexOf("</item>", i);
    if (end === -1) break;
    const body = xml.slice(lower.indexOf(">", i) + 1, end);
    from = end + 7;
    const pt = tag(body, "georss:point").split(/[\s,]+/).map(Number);
    const point: LatLng | null =
      pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]) && pt[0] !== 0 ? [pt[0], pt[1]] : null;
    out.push({
      title: tag(body, "title"),
      description: tag(body, "description"),
      link: tag(body, "link"),
      guid: tag(body, "guid"),
      point,
    });
  }
  return out;
}

/** "19/10/2026 19:00" (UK time) -> Date. */
function ukDateTime(s: string | undefined): Date | null {
  const m = s?.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return ukLocalToUtc(y, Number(m[2]), Number(m[1]), Number(m[4]), Number(m[5]));
}

/** The repeating window in a Traffic Wales title, "19/10/26-27/10/26
 *  1900-0700" (every night from the 19th to the morning of the 27th) or
 *  "19/10/26 2100-0000" (one night). Null when the title has none. */
export function walesTitleWindows(title: string, now: Date | null = null): { start: Date; end: Date }[] | null {
  const m = title.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4}))?\s+(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})\b/
  );
  if (!m) return null;
  const yr = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
  const first = Date.UTC(yr(m[3]), Number(m[2]) - 1, Number(m[1]));
  const last = m[4] ? Date.UTC(yr(m[6]), Number(m[5]) - 1, Number(m[4])) : first;
  const sh = Number(m[7]), sm = Number(m[8]), eh = Number(m[9]), em = Number(m[10]);
  if (sh > 23 || eh > 24 || sm > 59 || em > 59 || (eh === 24 && em > 0) || last < first) return null;
  // "2000-2400" ends at midnight: the next day at 00:00, not an overnight wrap.
  const overnight = eh !== 24 && eh * 60 + em <= sh * 60 + sm;
  const endsNextDay = overnight || eh === 24;
  // A range of overnight windows ends on the morning of the last date.
  const lastStart = overnight && m[4] ? last - 86400000 : last;
  const out: { start: Date; end: Date }[] = [];
  for (let t = first; t <= lastStart && out.length < MAX_WINDOWS_PER_ITEM; t += 86400000) {
    const d = new Date(t);
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, day = d.getUTCDate();
    const start = ukLocalToUtc(y, mo, day, sh, sm);
    const e = endsNextDay ? new Date(t + 86400000) : d;
    const end = ukLocalToUtc(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate(), eh % 24, em);
    // Nights already over are left out, so the cap counts only those to come.
    if (now && end.getTime() <= now.getTime()) continue;
    out.push({ start, end });
  }
  return out.length > 0 || now ? out : null;
}

/** Things that can be shut without the road itself being shut: slip roads,
 *  link roads, the hard shoulder, lay-bys. "Entry slip road and link road
 *  closed" is removed whole before looking for a closure of the road. */
const PART = String.raw`(?:(?:entry|exit|on|off)\s*-?\s*slip(?:\s*roads?)?|onslips?|offslips?|slip\s*roads?|slips|link\s*roads?|hard\s*shoulders?|lay-?bys?)`;
const PART_CLOSED_RE = new RegExp(`\\b${PART}(?:\\s*(?:,|and|&|or)\\s*${PART})*\\s*(?:closed|closures?)\\b`, "g");
const ROAD_CLOSED_RE = /\b(?:road|carriageway|motorway|bridge|tunnel) closed\b|\b(?:carriageway|road|full) closures?\b/;

export function walesCategory(
  title: string,
  extra: string,
  severityField: string
): { category: RoadEventCategory; severity: RoadEventSeverity; description: string } {
  const t = `${title} ${extra}`.toLowerCase();
  const main = t.replace(PART_CLOSED_RE, " ");
  // The road itself: "Road closed", "Carriageway closed", or a bare
  // ": Closed :" field in the title.
  const titleFields = title.split(":").map((f) => f.trim().toLowerCase());
  const fullyClosed = ROAD_CLOSED_RE.test(main) || titleFields.includes("closed");
  const sev = (fallback: RoadEventSeverity): RoadEventSeverity => (fullyClosed ? "closure" : majorWord(severityField) ? "major" : fallback);
  if (/\b(accident|collision|rtc)\b/.test(t)) return { category: "accident", severity: sev("minor"), description: "Accident" };
  if (/\bbroken[- ]down\b|\bbreakdown\b/.test(t)) {
    return { category: "broken_down_vehicle", severity: sev("minor"), description: "Broken-down vehicle" };
  }
  if (/\bflood/.test(t)) return { category: "flooding", severity: sev("minor"), description: "Flooding" };
  if (fullyClosed) return { category: "road_closed", severity: "closure", description: "Closed" };
  if (/\bslip|onslip|offslip/.test(t)) return { category: "roadworks", severity: "minor", description: "Slip road closed" };
  if (/\blink roads?\b/.test(t)) return { category: "roadworks", severity: "minor", description: "Link road closed" };
  if (/\bhard shoulders?\b/.test(t)) return { category: "roadworks", severity: "minor", description: "Hard shoulder closed" };
  if (/\blay-?bys?\b/.test(t)) return { category: "roadworks", severity: "minor", description: "Lay-by closed" };
  if (LANE_RE.test(t)) return { category: "roadworks", severity: "minor", description: "Lane closed" };
  if (STOPGO_RE.test(t)) return { category: "roadworks", severity: "minor", description: "Stop/go boards" };
  if (LIGHTS_RE.test(t)) return { category: "roadworks", severity: "minor", description: "Temporary lights" };
  return { category: "roadworks", severity: "minor", description: "Roadworks" };
}

function majorWord(sev: string): boolean {
  return /\b(severe|serious|major|high)\b/i.test(sev);
}

/** Traffic Wales RSS (any of the three English feeds) -> RoadEvents. Items
 *  without a georss:point are skipped (nothing to match). */
export function parseTrafficWalesRss(
  xml: string,
  feed: "incidents" | "roadworks" | "headlines",
  now: Date | null = null
): RoadEvent[] {
  const out: RoadEvent[] = [];
  for (const item of parseRssItems(xml)) {
    if (!item.point || !item.title) continue;
    const key = item.link.match(/(\d+)\/?$/)?.[1] ?? item.guid ?? item.title;
    const parts = item.title.split(/\s+:\s+|\s*:\s*$/).map((s) => s.trim()).filter(Boolean);
    const roadPart = parts[0] ?? "";
    const road = /^[AMB]\d+[A-Z]?(\(M\))?$/i.test(roadPart) ? roadPart.toUpperCase() : null;
    const dir = oneDirection(parts[1] ?? "");
    const place = road && parts.length > 2 ? parts[2] : null;
    let from: string | null = null, to: string | null = null;
    if (place && !/\d{1,2}\/\d{1,2}\/\d{2}/.test(place) && !LANE_RE.test(place) && !/closed/i.test(place)) {
      const ft = place.split(/\s+to\s+/i);
      from = ft[0] || null;
      to = ft.length > 1 ? ft.slice(1).join(" to ") : null;
    }
    const severityField = item.description.match(/Severity:\s*([^,]*)/i)?.[1]?.trim() ?? "";
    const isIncidentFeed = feed !== "roadworks";
    const mapped = walesCategory(item.title, isIncidentFeed ? item.description.replace(/Severity:[^,]*/i, "") : "", severityField);
    const start = ukDateTime(item.description.match(/Start time:\s*([^,]*)/i)?.[1]);
    const end = ukDateTime(item.description.match(/End Date:\s*([^,]*)/i)?.[1]);
    const base: RoadEvent = {
      ...blank(`tw:${key}`, "traffic_wales"),
      ...mapped,
      // One point for what can be kilometres of road: drivers who only cross
      // it, or drive the other carriageway, would match. Screen only.
      pushable: false,
      road: withDirection(road ?? (roadPart || null), dir),
      from,
      to,
      startAt: start,
      endAt: end,
      points: [item.point],
    };
    const windows = walesTitleWindows(item.title, now);
    if (windows && windows.length === 0) continue; // every night is over
    out.push(...perWindow(base, windows ?? [{ start, end }]));
  }
  return out;
}

// ── National Highways planned closures ──────────────────────────────

interface NhFeature {
  id?: number | string;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: {
    objectid?: number;
    description?: string | null;
    road_number?: string | null;
    eventtype?: string | null;
    natureofworks?: string | null;
    scheduledplannedstartdate?: number | string | null;
    scheduledplannedenddate?: number | string | null;
  };
}

function nhDate(v: number | string | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Jct 11 to Jct 13", "J14 to J16", "Junction 22 to Junction 23",
 *  "Jct 23 to 22" -> ["J11", "J13"]. */
export function nhJunctions(text: string): { from: string | null; to: string | null } {
  const j = String.raw`(?:j|jct|jnc|jn|junction)\.?\s*(\d+[a-z]?)`;
  const m = text.match(new RegExp(`\\b${j}\\s+to\\s+(?:${j}|(\\d+[a-z]?)\\b)`, "i"));
  if (m) return { from: `J${m[1].toUpperCase()}`, to: `J${(m[2] ?? m[3]).toUpperCase()}` };
  const one = text.match(new RegExp(`\\b${j}\\b`, "i"));
  return one ? { from: `J${one[1].toUpperCase()}`, to: null } : { from: null, to: null };
}

export function nhCategory(description: string): { category: RoadEventCategory; severity: RoadEventSeverity; description: string } {
  const t = description.toLowerCase().replace(/\bslip roads?\b/g, "slip").replace(/\b(link|distributor) roads?\b/g, "link");
  if (/\b(carriageway|tunnel)\b/.test(t) || /\b(full|road) closures?\b/.test(t)) {
    return { category: "road_closed", severity: "closure", description: "Closed" };
  }
  if (/\bslip\b/.test(t)) return { category: "roadworks", severity: "minor", description: "Slip road closed" };
  if (/\blanes?\b/.test(t)) return { category: "roadworks", severity: "minor", description: "Lane closed" };
  if (/\blink\b|\broundabout\b/.test(t)) return { category: "roadworks", severity: "minor", description: "Link road closed" };
  return { category: "roadworks", severity: "minor", description: "Roadworks" };
}

/** One page of the ArcGIS layer as GeoJSON -> RoadEvents. Closures that
 *  ended before `now` are dropped. */
export function parseNhClosures(json: unknown, now: Date): RoadEvent[] {
  const features = (json as { features?: NhFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: RoadEvent[] = [];
  for (const f of features) {
    const p = f?.properties ?? {};
    const id = p.objectid ?? f.id;
    if (id == null) continue;
    const endAt = nhDate(p.scheduledplannedenddate);
    if (endAt && endAt.getTime() <= now.getTime()) continue;
    const g = f.geometry ?? null;
    const raw: unknown[] =
      g?.type === "LineString" ? [g.coordinates] : g?.type === "MultiLineString" && Array.isArray(g.coordinates) ? (g.coordinates as unknown[]) : [];
    const lines: LatLng[][] = [];
    for (const l of raw) {
      if (!Array.isArray(l)) continue;
      const line = l.map(lngLat).filter((q): q is LatLng => q != null);
      if (line.length >= 2) lines.push(line);
    }
    const points: LatLng[] = [];
    if (g?.type === "Point") {
      const q = lngLat(g.coordinates);
      if (q) points.push(q);
    }
    if (lines.length === 0 && points.length === 0) continue;
    const text = (p.description ?? "").replace(/\s+/g, " ").trim();
    const mapped = nhCategory(text);
    const road = p.road_number?.trim().toUpperCase() || null;
    const { from, to } = nhJunctions(text);
    out.push({
      ...blank(`nh:${id}`, "national_highways"),
      ...mapped,
      road: withDirection(road, oneDirection(text)),
      from,
      to,
      directionMode: lines.length > 0 ? "axis" : "none",
      startAt: nhDate(p.scheduledplannedstartdate),
      endAt,
      lines,
      points,
    });
  }
  return out;
}

// ── London: TfL items that Street Manager already has ───────────────

/** Street Manager covers the London boroughs too, so TfL works on the same
 *  street within this distance and overlapping in time are dropped. */
export const DEDUPE_DISTANCE_M = 50;

const SEVERITY_ORDER: Record<RoadEventSeverity, number> = { minor: 0, major: 1, closure: 2 };

/** "A3031 Albert Bridge Road eastbound" and "Albert Bridge Road" -> both
 *  "albert bridge road". */
export function streetKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const k = name
    .toLowerCase()
    .replace(/\b[amb]\d+[a-z]?(\(m\))?\b/g, " ")
    .replace(/\b(northbound|southbound|eastbound|westbound|anti-?clockwise|clockwise)\b/g, " ")
    .replace(/\brd\b/g, "road")
    .replace(/\bst\b/g, "street")
    .replace(/\bave?\b/g, "avenue")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return k || null;
}

function sameStreet(a: string | null, b: string | null): boolean {
  const ka = streetKey(a), kb = streetKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

function overlapsInTime(a: RoadEvent, b: RoadEvent): boolean {
  const aS = a.startAt?.getTime() ?? -Infinity, aE = a.endAt?.getTime() ?? Infinity;
  const bS = b.startAt?.getTime() ?? -Infinity, bE = b.endAt?.getTime() ?? Infinity;
  return aS <= bE && bS <= aE;
}

/** Metres from p to segment ab (flat earth; fine at 50 m). */
function pointSegmentMetres(p: LatLng, a: LatLng, b: LatLng): number {
  const k = Math.cos((p[0] * Math.PI) / 180);
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0];
  const bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y) * 111320;
}

export function minDistanceMetres(a: Pick<RoadEvent, "lines" | "points">, b: Pick<RoadEvent, "lines" | "points">): number {
  const pts = [...a.lines.flat(), ...a.points];
  let best = Infinity;
  for (const p of pts) {
    for (const l of b.lines) {
      for (let i = 0; i < l.length - 1; i++) best = Math.min(best, pointSegmentMetres(p, l[i], l[i + 1]));
      if (l.length === 1) best = Math.min(best, haversineMetres(p, l[0]));
    }
    for (const q of b.points) best = Math.min(best, haversineMetres(p, q));
    if (best <= 1) return best;
  }
  return best;
}

/** TfL works (and surface damage) that duplicate a Street Manager item:
 *  same street, within 50 m, dates overlapping. Collisions and events are
 *  never in Street Manager, so they always stay. */
export function withoutStreetManagerDuplicates(tfl: RoadEvent[], streetWorks: RoadEvent[]): RoadEvent[] {
  if (streetWorks.length === 0) return tfl;
  return tfl.filter((e) => {
    if (e.source !== "tfl" || e.category === "accident" || e.category === "event") return true;
    for (const w of streetWorks) {
      if (w.source !== "street_manager") continue;
      // Never hide a TfL closure behind a lesser Street Manager item.
      if (SEVERITY_ORDER[w.severity] < SEVERITY_ORDER[e.severity]) continue;
      if (!sameStreet(e.road, w.road)) continue;
      if (!overlapsInTime(e, w)) continue;
      if (minDistanceMetres(e, w) <= DEDUPE_DISTANCE_M) return false;
    }
    return true;
  });
}

// ── Grouping helpers (used by roadAlertGroups.ts) ───────────────────

const DIRECTION_WORD_RE = /\s*\b(northbound|southbound|eastbound|westbound|anti-clockwise|clockwise)\b\s*$/i;

/** "M25 anti-clockwise" -> "M25"; anything without a trailing direction
 *  word is returned as it is. */
export function stripDirectionWord(road: string | null | undefined): string | null {
  if (!road) return road ?? null;
  return road.replace(DIRECTION_WORD_RE, "").trim() || road;
}

function directionWordOf(road: string | null | undefined): string | null {
  return road?.match(DIRECTION_WORD_RE)?.[1]?.toLowerCase() ?? null;
}

const OPPOSITE: [string, string][] = [
  ["northbound", "southbound"],
  ["eastbound", "westbound"],
  ["clockwise", "anti-clockwise"],
];

/** True when the labels are one road in opposite directions ("M25
 *  clockwise" and "M25 anti-clockwise"): both carriageways are shut. */
export function oppositeDirectionLabels(roads: (string | null | undefined)[]): boolean {
  const named = roads.filter((r): r is string => Boolean(r));
  if (named.length < 2) return false;
  const bases = new Set(named.map((r) => stripDirectionWord(r)!.toLowerCase()));
  if (bases.size !== 1) return false;
  const dirs = new Set(named.map(directionWordOf).filter(Boolean));
  return OPPOSITE.some(([a, b]) => dirs.has(a) && dirs.has(b));
}

/** National Highways and Traffic Wales book many unrelated closures for the
 *  same night: those may only be merged into one card when they are on the
 *  same road (direction ignored). Other sources are not restricted here. */
export function mayMergeAsOnePlan(a: Pick<RoadEvent, "source" | "road">, b: Pick<RoadEvent, "source" | "road">): boolean {
  const strict = (s: string) => s === "national_highways" || s === "traffic_wales";
  if (!strict(a.source) && !strict(b.source)) return true;
  const ra = stripDirectionWord(a.road)?.toLowerCase();
  const rb = stripDirectionWord(b.road)?.toLowerCase();
  return Boolean(ra && rb && ra === rb);
}
