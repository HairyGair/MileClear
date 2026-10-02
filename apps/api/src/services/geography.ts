// Where new sign-ups are, for the admin Geography view (GET /admin/geography).
//
// Pure: no database. The route (routes/admin/observability.ts) loads rows via
// services/geographyLoader.ts and hands them here, so every rule below is
// unit-tested in __tests__/services/geography.test.ts.
//
// HOME AREA RULE (one per user, best evidence first):
//   1. trip_postcode  The most frequent postcode DISTRICT ("LN1", "GL56")
//                     among the start addresses of their trips (the loader
//                     passes each user's most recent 200 non-phantom trips,
//                     manual ones included: a typed address is good
//                     evidence of where someone drives from). Ties go to
//                     the district seen EARLIEST. Area = the district's
//                     leading letters. Map point = median of their trip
//                     start coordinates inside that district.
//   2. saved_home     A saved location of type "home": the point is the
//                     saved lat/lng, the area is the nearest area centroid
//                     (approximate; no offline district lookup).
//   3. trip_location  Trips with coordinates but no parseable postcode:
//                     the median trip start, snapped to the nearest area
//                     centroid (approximate).
//   4. signup_ip      The signup IP's city ("Leeds, ENG, GB") matched to an
//                     area name/alias. LOW confidence: mobile networks
//                     often geolocate to a carrier hub (London, Manchester).
//                     Often only the nation is known.
//   5. unknown
//
// Single users' points are never returned: map points are area centroids
// (static) or district means over at least DISTRICT_FLOOR users.

import { ACQUISITION_SOURCES, haversineDistance } from "@mileclear/shared";
import {
  GEO_NATIONS,
  UK_POSTCODE_AREAS,
  UK_REGIONS,
  areaCandidatesForCity,
  areaInfo,
  type GeoNation,
  type GeoRegion,
} from "./geographyAreas.js";

export { UK_POSTCODE_AREAS, UK_REGIONS, areaInfo } from "./geographyAreas.js";

const DAY = 24 * 60 * 60 * 1000;
/** Districts (and district map points) need at least this many users. */
export const DISTRICT_FLOOR = 3;
/** A point further than this (miles) from every area centroid is not snapped. */
const SNAP_MAX_MILES = 50;

// ── Postcode parsing ─────────────────────────────────────────────────────

export interface ParsedPostcode {
  /** Leading letters: "LN", "B", "EC". */
  area: string;
  /** Area + district number, sub-district letter dropped: "LN1", "SW1", "DN21". */
  district: string;
  /** Outward code as written: "LN1", "SW1A", "GL56". */
  outward: string;
  /** "LN1 2AA" when a full postcode was present, else null. */
  full: string | null;
}

const FULL_RE = /(?:^|[^A-Z0-9])([A-Z]{1,2})(\d[A-Z\d]?)\s*(\d[A-Z]{2})(?![A-Z0-9])/g;
const OUTWARD_RE = /^([A-Z]{1,2})(\d[A-Z\d]?)$/;
const TRAILING_COUNTRY_RE = /,?\s*(UK|U\.K\.|GB|UNITED KINGDOM|ENGLAND|SCOTLAND|WALES|NORTHERN IRELAND)\s*$/;

function toDistrict(area: string, rest: string): string {
  const digits = rest.match(/^\d+/)?.[0] ?? "";
  return `${area}${digits}`;
}

/**
 * The UK postcode (or bare postcode district) in an address, or null.
 * A full postcode anywhere wins (the LAST one, since addresses end with it);
 * a bare district ("GL56") is only accepted as the final comma segment or
 * final word, so a house number or road name mid-address is not mistaken
 * for one. Areas are validated against the table, which rejects road
 * numbers like "A1". A bare "M<n>" needs "Manchester"/"Salford" in the
 * address, because motorways (M6, M25) look exactly like M districts.
 */
export function parsePostcode(text: string | null | undefined): ParsedPostcode | null {
  if (!text) return null;
  const s = text.toUpperCase().replace(/\s+/g, " ").trim();
  if (!s) return null;

  let best: ParsedPostcode | null = null;
  FULL_RE.lastIndex = 0;
  for (let m = FULL_RE.exec(s); m; m = FULL_RE.exec(s)) {
    const [, area, rest, inward] = m;
    if (!UK_POSTCODE_AREAS[area]) continue;
    best = { area, district: toDistrict(area, rest), outward: `${area}${rest}`, full: `${area}${rest} ${inward}` };
  }
  if (best) return best;

  let tail = s;
  while (TRAILING_COUNTRY_RE.test(tail)) tail = tail.replace(TRAILING_COUNTRY_RE, "").trim();
  const lastSegment = tail.split(",").pop()?.trim() ?? "";
  const lastWord = lastSegment.split(" ").pop() ?? "";
  const m = OUTWARD_RE.exec(lastWord);
  if (!m) return null;
  const [, area, rest] = m;
  if (!UK_POSTCODE_AREAS[area]) return null;
  if (area === "M" && !/MANCHESTER|SALFORD/.test(s)) return null;
  return { area, district: toDistrict(area, rest), outward: `${area}${rest}`, full: null };
}

// ── Nearest area (approximate) ───────────────────────────────────────────

function usablePoint(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/** Nearest area centroid within 50 miles, else null (abroad / at sea). */
export function nearestArea(lat: number, lng: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const a of Object.values(UK_POSTCODE_AREAS)) {
    const d = haversineDistance(lat, lng, a.lat, a.lng);
    if (d < bestD) {
      bestD = d;
      best = a.code;
    }
  }
  return bestD <= SNAP_MAX_MILES ? best : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// ── Signup IP ────────────────────────────────────────────────────────────

export type NationOrOther = GeoNation | "Outside UK";

export interface IpGeo {
  city: string | null;
  area: string | null;
  region: GeoRegion | null;
  nation: NationOrOther | null;
}

const IP_REGION_NATION: Record<string, GeoNation> = {
  ENG: "England",
  SCT: "Scotland",
  WLS: "Wales",
  NIR: "Northern Ireland",
};

/** geoip-lite's "city, region, country" -> what it tells us. Null when empty. */
export function parseSignupLocation(raw: string | null | undefined): IpGeo | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  let country: string | null = null;
  let regionCode: string | null = null;
  if (parts.length && /^[A-Z]{2}$/.test(parts[parts.length - 1])) country = parts.pop()!;
  if (parts.length && /^[A-Z0-9]{1,3}$/.test(parts[parts.length - 1])) regionCode = parts.pop()!;
  const city = parts.length ? parts.join(", ") : null;

  let nation: NationOrOther | null = null;
  if (country === "IM" || country === "JE" || country === "GG") nation = "Crown Dependencies";
  else if (country && country !== "GB") nation = "Outside UK";
  else if (regionCode && IP_REGION_NATION[regionCode]) nation = IP_REGION_NATION[regionCode];
  else if (country === "GB") nation = null; // UK, nation unknown

  let area: string | null = null;
  let region: GeoRegion | null = null;
  if (city && nation !== "Outside UK") {
    if (/^london$/i.test(city) && (nation === "England" || nation === null)) {
      region = "London";
      nation = "England";
    } else {
      const candidates = areaCandidatesForCity(city)
        .map((c) => UK_POSTCODE_AREAS[c])
        .filter((a) => a && (nation === null || a.nation === nation));
      if (candidates.length) {
        area = candidates[0].code;
        region = candidates[0].region;
        nation = candidates[0].nation;
      }
    }
  }
  return { city, area, region, nation };
}

// ── Home area ────────────────────────────────────────────────────────────

export type GeoConfidence = "trip_postcode" | "saved_home" | "trip_location" | "signup_ip" | "unknown";
export const GEO_CONFIDENCES: GeoConfidence[] = ["trip_postcode", "saved_home", "trip_location", "signup_ip", "unknown"];

export interface HomeArea {
  confidence: GeoConfidence;
  area: string | null;
  district: string | null;
  region: GeoRegion | null;
  nation: NationOrOther | null;
  /** Internal only (district map means); never returned per user. */
  point: { lat: number; lng: number } | null;
}

export interface TripLite {
  startAddress: string | null;
  startLat: number | null;
  startLng: number | null;
  startedAt: Date;
}

export function assignHomeArea(input: {
  trips: TripLite[];
  savedHome: { lat: number; lng: number } | null;
  signupLocation: string | null;
}): HomeArea {
  // 1. Trip postcodes.
  const tally = new Map<string, { count: number; first: number; lats: number[]; lngs: number[] }>();
  for (const t of input.trips) {
    const pc = parsePostcode(t.startAddress);
    if (!pc) continue;
    let e = tally.get(pc.district);
    if (!e) {
      e = { count: 0, first: Infinity, lats: [], lngs: [] };
      tally.set(pc.district, e);
    }
    e.count += 1;
    e.first = Math.min(e.first, t.startedAt.getTime());
    if (usablePoint(t.startLat, t.startLng)) {
      e.lats.push(t.startLat!);
      e.lngs.push(t.startLng!);
    }
  }
  if (tally.size) {
    const [district, e] = [...tally.entries()].sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)[0];
    const area = district.match(/^[A-Z]+/)![0];
    const info = UK_POSTCODE_AREAS[area];
    const lat = median(e.lats);
    const lng = median(e.lngs);
    return {
      confidence: "trip_postcode",
      area,
      district,
      region: info.region,
      nation: info.nation,
      point: lat != null && lng != null ? { lat, lng } : null,
    };
  }

  // 2. Saved home.
  if (input.savedHome && usablePoint(input.savedHome.lat, input.savedHome.lng)) {
    const area = nearestArea(input.savedHome.lat, input.savedHome.lng);
    if (area) {
      const info = UK_POSTCODE_AREAS[area];
      return {
        confidence: "saved_home",
        area,
        district: null,
        region: info.region,
        nation: info.nation,
        point: { lat: input.savedHome.lat, lng: input.savedHome.lng },
      };
    }
  }

  // 3. Trip coordinates without a postcode.
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const t of input.trips) {
    if (usablePoint(t.startLat, t.startLng)) {
      lats.push(t.startLat!);
      lngs.push(t.startLng!);
    }
  }
  const mLat = median(lats);
  const mLng = median(lngs);
  if (mLat != null && mLng != null) {
    const area = nearestArea(mLat, mLng);
    if (area) {
      const info = UK_POSTCODE_AREAS[area];
      return {
        confidence: "trip_location",
        area,
        district: null,
        region: info.region,
        nation: info.nation,
        point: { lat: mLat, lng: mLng },
      };
    }
  }

  // 4. Signup IP.
  const ip = parseSignupLocation(input.signupLocation);
  if (ip && (ip.area || ip.region || ip.nation)) {
    return { confidence: "signup_ip", area: ip.area, district: null, region: ip.region, nation: ip.nation, point: null };
  }
  return { confidence: "unknown", area: null, district: null, region: null, nation: null, point: null };
}

// ── Rollup ───────────────────────────────────────────────────────────────

export type GeoWindow = 7 | 30 | 90 | 365 | "all";
export type GeoPlatform = "ios" | "android" | "both" | "web";

export interface GeoUser {
  id: string;
  createdAt: Date;
  /** From platformsSeen, falling back to signupPlatform. */
  platform: GeoPlatform | null;
  /** Latest "How did you hear" answer, or null. */
  source: string | null;
  home: HomeArea;
  /** Signup IP reading, independent of the home rule (for the agreement check). */
  ip: IpGeo | null;
  lastAutoTripAt: Date | null;
  paying: boolean;
  pro: boolean;
}

export interface GeographyOptions {
  window: GeoWindow;
  platform: "all" | "ios" | "android";
  /** "all", an ACQUISITION_SOURCES value, or "unanswered". */
  source: string;
  /** false = a location known ONLY from the signup IP counts as Unknown. */
  includeIp: boolean;
  now: Date;
}

export interface GeoMetrics {
  /** Sign-ups inside the window. */
  signups: number;
  /** Sign-ups in the equal-length window before it; null for window=all. */
  prevSignups: number | null;
  /** (signups - prev) / prev, %; null when prev is 0 or window=all. */
  growthPct: number | null;
  allTimeUsers: number;
  /** All-time users with an automatic (non-manual) trip in the last 7 days. */
  activeDrivers: number;
  /** Window sign-ups with at least one automatic trip. */
  activatedSignups: number;
  /** activatedSignups / signups, %; null when no sign-ups. */
  activationRatePct: number | null;
  /** All-time users paying today (subscriptionTruth "paying"). */
  paying: number;
  /** All-time users with Pro from any source except App Review sandbox (team excluded). */
  pro: number;
  /** Window sign-ups by platform. */
  platform: { ios: number; android: number; both: number; other: number };
  /** Top 3 "How did you hear" answers among window sign-ups. */
  topSources: Array<{ value: string; label: string; count: number }>;
  /** All-time users placed by saved home / trip location / signup IP rather than a trip postcode. */
  approximateUsers: number;
}

export interface GeoNationRow extends GeoMetrics {
  nation: NationOrOther | "Unknown";
}
export interface GeoRegionRow extends GeoMetrics {
  region: GeoRegion | "Unknown";
  nation: NationOrOther | "Unknown";
}
export interface GeoAreaRow extends GeoMetrics {
  area: string;
  name: string;
  region: GeoRegion;
  nation: GeoNation;
  lat: number;
  lng: number;
  /** First-ever user in this area signed up inside the window. */
  newInWindow: boolean;
}
export interface GeoDistrictRow extends GeoMetrics {
  district: string;
  area: string;
  areaName: string;
  region: GeoRegion;
  nation: GeoNation;
  /** Mean of the district's users' home points, 2 dp; null if fewer than 3 points. */
  lat: number | null;
  lng: number | null;
}
export interface GeoMapPoint {
  level: "area" | "district";
  code: string;
  label: string;
  region: GeoRegion;
  lat: number;
  lng: number;
  signups: number;
  allTimeUsers: number;
  activeDrivers: number;
}
export interface GeoTimelineBucket {
  /** Bucket start, YYYY-MM-DD (UTC). Weeks start Monday. */
  date: string;
  total: number;
  byRegion: Record<string, number>;
  byNation: Record<string, number>;
}
export interface GeoNewestSignup {
  hoursAgo: number;
  area: string | null;
  areaName: string | null;
  /** Only when the district has 3+ users; else null. */
  district: string | null;
  region: GeoRegion | null;
  nation: NationOrOther | null;
  platform: GeoPlatform | null;
  source: string | null;
  confidence: GeoConfidence;
  hasAutoTrip: boolean;
}
export interface GeoIpAgreement {
  /** Users with BOTH a trip-postcode home and a signup IP nation. */
  compared: number;
  sameArea: number;
  /** Same region, different (or unmappable) area. */
  sameRegion: number;
  /** Same nation, different/unknown region. */
  sameNation: number;
  differentNation: number;
  /** Users with a trip-postcode home whose IP said nothing usable. */
  ipUnknown: number;
  /** Of compared, how many IP cities mapped to an area at all. */
  ipCityMapped: number;
  sameAreaPct: number | null;
  sameRegionOrBetterPct: number | null;
  /** Most common disagreements, e.g. IP "London" vs trips in "LN". */
  topMismatches: Array<{ ipCity: string; tripArea: string; tripAreaName: string; count: number }>;
}

export interface AdminGeography {
  params: { window: GeoWindow; platform: string; source: string; includeIp: boolean };
  summary: {
    signups: number;
    prevSignups: number | null;
    growthPct: number | null;
    /** Window sign-ups with a known postcode area. */
    withArea: number;
    withAreaPct: number | null;
    /** Window sign-ups with at least a known region. */
    withRegionPct: number | null;
    byConfidence: Record<GeoConfidence, number>;
    allTimeUsers: number;
    allTimeByConfidence: Record<GeoConfidence, number>;
    areasReached: number;
    regionsReached: number;
    newAreas: Array<{ area: string; name: string; region: GeoRegion; signups: number }>;
  };
  byNation: GeoNationRow[];
  byRegion: GeoRegionRow[];
  byArea: GeoAreaRow[];
  topDistricts: GeoDistrictRow[];
  suppressedDistricts: { districts: number; users: number };
  mapPoints: GeoMapPoint[];
  timeline: { bucket: "day" | "week"; regions: string[]; nations: string[]; series: GeoTimelineBucket[] };
  newestSignups: GeoNewestSignup[];
  signupIpVsTrip: GeoIpAgreement;
  sources: Array<{ value: string; label: string }>;
  privacyFloor: number;
  generatedAt: string;
}

const SOURCE_LABEL = new Map<string, string>(ACQUISITION_SOURCES.map((s) => [s.value, s.label]));

export function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

export function growthPct(cur: number, prev: number | null): number | null {
  if (prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

interface Acc {
  signups: number;
  prev: number;
  all: number;
  active: number;
  activated: number;
  paying: number;
  pro: number;
  approx: number;
  ios: number;
  android: number;
  both: number;
  other: number;
  sources: Map<string, number>;
  lats: number[];
  lngs: number[];
  firstAt: number;
}

function newAcc(): Acc {
  return {
    signups: 0, prev: 0, all: 0, active: 0, activated: 0, paying: 0, pro: 0, approx: 0,
    ios: 0, android: 0, both: 0, other: 0, sources: new Map(), lats: [], lngs: [], firstAt: Infinity,
  };
}

function finish(a: Acc, hasPrev: boolean): GeoMetrics {
  const prevSignups = hasPrev ? a.prev : null;
  return {
    signups: a.signups,
    prevSignups,
    growthPct: growthPct(a.signups, prevSignups),
    allTimeUsers: a.all,
    activeDrivers: a.active,
    activatedSignups: a.activated,
    activationRatePct: pct(a.activated, a.signups),
    paying: a.paying,
    pro: a.pro,
    platform: { ios: a.ios, android: a.android, both: a.both, other: a.other },
    topSources: [...a.sources.entries()]
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, 3)
      .map(([value, count]) => ({ value, label: SOURCE_LABEL.get(value) ?? value, count })),
    approximateUsers: a.approx,
  };
}

function dayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}
function weekStart(t: number): number {
  const d = new Date(t);
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(utcMidnight).getUTCDay() + 6) % 7; // Monday = 0
  return utcMidnight - dow * DAY;
}
function dayStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function rollupGeography(allUsers: GeoUser[], opts: GeographyOptions): AdminGeography {
  const now = opts.now.getTime();
  const hasPrev = opts.window !== "all";
  const winStart = opts.window === "all" ? -Infinity : now - opts.window * DAY;
  const prevStart = opts.window === "all" ? -Infinity : now - 2 * opts.window * DAY;
  const activeSince = now - 7 * DAY;

  const users = allUsers.filter((u) => {
    if (opts.platform === "ios" && u.platform !== "ios" && u.platform !== "both") return false;
    if (opts.platform === "android" && u.platform !== "android" && u.platform !== "both") return false;
    if (opts.source === "unanswered") return u.source == null;
    if (opts.source !== "all" && u.source !== opts.source) return false;
    return true;
  });

  // Location used for grouping (IP-only locations dropped when includeIp=false).
  const loc = (u: GeoUser): HomeArea =>
    !opts.includeIp && u.home.confidence === "signup_ip"
      ? { confidence: "unknown", area: null, district: null, region: null, nation: null, point: null }
      : u.home;

  const nations = new Map<string, Acc>();
  const regions = new Map<string, Acc>();
  const areas = new Map<string, Acc>();
  const districts = new Map<string, Acc>();
  const summaryAcc = newAcc();
  const byConfidence = Object.fromEntries(GEO_CONFIDENCES.map((c) => [c, 0])) as Record<GeoConfidence, number>;
  const allTimeByConfidence = { ...byConfidence };
  let withArea = 0;
  let withRegion = 0;

  const get = (m: Map<string, Acc>, k: string) => {
    let a = m.get(k);
    if (!a) {
      a = newAcc();
      m.set(k, a);
    }
    return a;
  };

  for (const u of users) {
    const t = u.createdAt.getTime();
    const inWin = t >= winStart && t <= now;
    const inPrev = hasPrev && t >= prevStart && t < winStart;
    const h = loc(u);
    allTimeByConfidence[u.home.confidence] += 1;
    if (inWin) {
      byConfidence[u.home.confidence] += 1;
      if (h.area) withArea += 1;
      if (h.region) withRegion += 1;
    }
    const accs: Acc[] = [summaryAcc, get(nations, h.nation ?? "Unknown"), get(regions, h.region ?? "Unknown")];
    if (h.area) accs.push(get(areas, h.area));
    if (h.district) {
      const d = get(districts, h.district);
      accs.push(d);
      if (h.point) {
        d.lats.push(h.point.lat);
        d.lngs.push(h.point.lng);
      }
    }
    const isActive = !!u.lastAutoTripAt && u.lastAutoTripAt.getTime() >= activeSince;
    for (const a of accs) {
      a.all += 1;
      a.firstAt = Math.min(a.firstAt, t);
      if (isActive) a.active += 1;
      if (u.paying) a.paying += 1;
      if (u.pro) a.pro += 1;
      if (h.confidence !== "trip_postcode" && h.confidence !== "unknown") a.approx += 1;
      if (inPrev) a.prev += 1;
      if (inWin) {
        a.signups += 1;
        if (u.lastAutoTripAt) a.activated += 1;
        if (u.platform === "ios") a.ios += 1;
        else if (u.platform === "android") a.android += 1;
        else if (u.platform === "both") a.both += 1;
        else a.other += 1;
        if (u.source) a.sources.set(u.source, (a.sources.get(u.source) ?? 0) + 1);
      }
    }
  }

  // Nations: the four always, others when present.
  const nationOrder = [...GEO_NATIONS, "Outside UK", "Unknown"];
  const byNation: GeoNationRow[] = nationOrder
    .filter((n) => nations.has(n) || ["England", "Scotland", "Wales", "Northern Ireland"].includes(n))
    .map((n) => ({ nation: n as GeoNationRow["nation"], ...finish(nations.get(n) ?? newAcc(), hasPrev) }));

  const regionOrder: Array<GeoRegion | "Unknown"> = [...UK_REGIONS, "Crown Dependencies", "Unknown"];
  const byRegion: GeoRegionRow[] = regionOrder
    .filter((r) => regions.has(r) || (UK_REGIONS as readonly string[]).includes(r))
    .map((r) => ({
      region: r,
      nation:
        r === "Unknown"
          ? "Unknown"
          : r === "Crown Dependencies"
            ? "Crown Dependencies"
            : (Object.values(UK_POSTCODE_AREAS).find((a) => a.region === r)?.nation ?? "England"),
      ...finish(regions.get(r) ?? newAcc(), hasPrev),
    }));

  const byArea: GeoAreaRow[] = [...areas.entries()]
    .map(([code, a]) => {
      const info = UK_POSTCODE_AREAS[code];
      return {
        area: code,
        name: info.name,
        region: info.region,
        nation: info.nation,
        lat: info.lat,
        lng: info.lng,
        newInWindow: hasPrev && a.firstAt >= winStart,
        ...finish(a, hasPrev),
      };
    })
    .sort((x, y) => y.signups - x.signups || y.allTimeUsers - x.allTimeUsers || x.area.localeCompare(y.area));

  let suppressedDistricts = 0;
  let suppressedDistrictUsers = 0;
  const shownDistricts = new Set<string>();
  const districtRows: GeoDistrictRow[] = [];
  for (const [code, a] of districts) {
    if (a.all < DISTRICT_FLOOR) {
      suppressedDistricts += 1;
      suppressedDistrictUsers += a.all;
      continue;
    }
    shownDistricts.add(code);
    const area = code.match(/^[A-Z]+/)![0];
    const info = UK_POSTCODE_AREAS[area];
    const enough = a.lats.length >= DISTRICT_FLOOR;
    districtRows.push({
      district: code,
      area,
      areaName: info.name,
      region: info.region,
      nation: info.nation,
      lat: enough ? round2(a.lats.reduce((s, v) => s + v, 0) / a.lats.length) : null,
      lng: enough ? round2(a.lngs.reduce((s, v) => s + v, 0) / a.lngs.length) : null,
      ...finish(a, hasPrev),
    });
  }
  districtRows.sort((x, y) => y.signups - x.signups || y.allTimeUsers - x.allTimeUsers || x.district.localeCompare(y.district));
  const topDistricts = districtRows.slice(0, 50);

  const mapPoints: GeoMapPoint[] = [
    ...byArea.map((a) => ({
      level: "area" as const,
      code: a.area,
      label: a.name,
      region: a.region,
      lat: a.lat,
      lng: a.lng,
      signups: a.signups,
      allTimeUsers: a.allTimeUsers,
      activeDrivers: a.activeDrivers,
    })),
    ...districtRows
      .filter((d) => d.lat != null && d.lng != null)
      .map((d) => ({
        level: "district" as const,
        code: d.district,
        label: `${d.district} (${d.areaName})`,
        region: d.region,
        lat: d.lat!,
        lng: d.lng!,
        signups: d.signups,
        allTimeUsers: d.allTimeUsers,
        activeDrivers: d.activeDrivers,
      })),
  ];

  // Timeline.
  const weekly = opts.window === "all" || opts.window === 365;
  const bucketOf = weekly ? weekStart : dayStart;
  const firstUser = users.reduce((m, u) => Math.min(m, u.createdAt.getTime()), now);
  const startT = bucketOf(opts.window === "all" ? firstUser : winStart + 1);
  const step = weekly ? 7 * DAY : DAY;
  const series: GeoTimelineBucket[] = [];
  const idx = new Map<number, GeoTimelineBucket>();
  for (let t = startT; t <= now; t += step) {
    const b: GeoTimelineBucket = { date: dayKey(t), total: 0, byRegion: {}, byNation: {} };
    series.push(b);
    idx.set(t, b);
  }
  const seenRegions = new Set<string>();
  const seenNations = new Set<string>();
  for (const u of users) {
    const t = u.createdAt.getTime();
    if (t < winStart || t > now) continue;
    const b = idx.get(bucketOf(t));
    if (!b) continue;
    const h = loc(u);
    const r = h.region ?? "Unknown";
    const n = h.nation ?? "Unknown";
    b.total += 1;
    b.byRegion[r] = (b.byRegion[r] ?? 0) + 1;
    b.byNation[n] = (b.byNation[n] ?? 0) + 1;
    seenRegions.add(r);
    seenNations.add(n);
  }

  const newestSignups: GeoNewestSignup[] = [...users]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20)
    .map((u) => {
      const h = loc(u);
      const info = areaInfo(h.area);
      return {
        hoursAgo: Math.max(0, Math.round(((now - u.createdAt.getTime()) / (60 * 60 * 1000)) * 10) / 10),
        area: h.area,
        areaName: info?.name ?? null,
        district: h.district && shownDistricts.has(h.district) ? h.district : null,
        region: h.region,
        nation: h.nation,
        platform: u.platform,
        source: u.source,
        confidence: h.confidence,
        hasAutoTrip: !!u.lastAutoTripAt,
      };
    });

  const newAreas = byArea
    .filter((a) => a.newInWindow)
    .map((a) => ({ area: a.area, name: a.name, region: a.region, signups: a.signups }));

  return {
    params: { window: opts.window, platform: opts.platform, source: opts.source, includeIp: opts.includeIp },
    summary: {
      signups: summaryAcc.signups,
      prevSignups: hasPrev ? summaryAcc.prev : null,
      growthPct: growthPct(summaryAcc.signups, hasPrev ? summaryAcc.prev : null),
      withArea,
      withAreaPct: pct(withArea, summaryAcc.signups),
      withRegionPct: pct(withRegion, summaryAcc.signups),
      byConfidence,
      allTimeUsers: summaryAcc.all,
      allTimeByConfidence,
      areasReached: areas.size,
      regionsReached: [...regions.keys()].filter((r) => r !== "Unknown").length,
      newAreas,
    },
    byNation,
    byRegion,
    byArea,
    topDistricts,
    suppressedDistricts: { districts: suppressedDistricts, users: suppressedDistrictUsers },
    mapPoints,
    timeline: {
      bucket: weekly ? "week" : "day",
      regions: regionOrder.filter((r) => seenRegions.has(r)),
      nations: nationOrder.filter((n) => seenNations.has(n)),
      series,
    },
    newestSignups,
    signupIpVsTrip: ipAgreement(users),
    sources: [...ACQUISITION_SOURCES.map((s) => ({ value: s.value as string, label: s.label as string })), { value: "unanswered", label: "Not answered" }],
    privacyFloor: DISTRICT_FLOOR,
    generatedAt: opts.now.toISOString(),
  };
}

/** How often the signup IP agrees with where the trips say the driver lives. */
export function ipAgreement(users: GeoUser[]): GeoIpAgreement {
  const out = {
    compared: 0, sameArea: 0, sameRegion: 0, sameNation: 0, differentNation: 0, ipUnknown: 0, ipCityMapped: 0,
  };
  const mismatches = new Map<string, { ipCity: string; tripArea: string; count: number }>();
  for (const u of users) {
    if (u.home.confidence !== "trip_postcode" || !u.home.area) continue;
    const ip = u.ip;
    if (!ip || !ip.nation) {
      out.ipUnknown += 1;
      continue;
    }
    out.compared += 1;
    if (ip.area) out.ipCityMapped += 1;
    if (ip.area && ip.area === u.home.area) {
      out.sameArea += 1;
      continue;
    }
    if (ip.region && ip.region === u.home.region) out.sameRegion += 1;
    else if (ip.nation === u.home.nation) out.sameNation += 1;
    else out.differentNation += 1;
    const ipCity = ip.city ?? ip.nation;
    const key = `${ipCity}|${u.home.area}`;
    const m = mismatches.get(key) ?? { ipCity, tripArea: u.home.area, count: 0 };
    m.count += 1;
    mismatches.set(key, m);
  }
  return {
    ...out,
    sameAreaPct: pct(out.sameArea, out.compared),
    sameRegionOrBetterPct: pct(out.sameArea + out.sameRegion, out.compared),
    topMismatches: [...mismatches.values()]
      .sort((a, b) => b.count - a.count || a.ipCity.localeCompare(b.ipCity))
      .slice(0, 10)
      .map((m) => ({ ...m, tripAreaName: UK_POSTCODE_AREAS[m.tripArea]?.name ?? m.tripArea })),
  };
}
