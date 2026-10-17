// Three more free road-data sources for road alerts (17 Oct 2026): TfL
// (London), Traffic Wales and National Highways planned closures. Fetching,
// caching and gating. Parsing and mapping are pure, in roadSourcesParse.ts.
//
// Each source is independent and fails soft:
//   - Off unless its env flag is "1": ROAD_SOURCE_TFL, ROAD_SOURCE_WALES,
//     ROAD_SOURCE_NH.
//   - One shared in-memory copy per source, never a per-driver fetch. It is
//     refreshed on use, at most every REFRESH interval, and only when an
//     opted-in driver's corridor touches the source's area (the road alerts
//     job's prefetch tick, 45-60 minutes before each departure, is what
//     keeps it warm).
//   - A failed fetch keeps the last good copy until it is STALE, logs at
//     most once an hour, waits RETRY before trying again, and never throws
//     into road alerts or the Street Manager path.
//   - Requests time out after 18 seconds. No credentials are sent, except an
//     optional TfL app_key (TFL_APP_KEY), which is never logged.
//
// Licences (attribution shown only when that source's items are shown):
//   TfL: Transport Data Service terms (OGL v2.0 based), must not imply
//   endorsement. Traffic Wales and National Highways: OGL v3.0.

import type { RoadEvent } from "./roadEvents.js";
import {
  ENGLAND_BBOX,
  GREATER_LONDON_BBOX,
  WALES_BBOX,
  bboxTouches,
  eventBbox,
  parseNhClosures,
  parseTflDisruptions,
  parseTrafficWalesRss,
  withoutStreetManagerDuplicates,
  type Bbox,
  type ExtraSource,
} from "./roadSourcesParse.js";

export const ATTRIBUTION_TFL =
  "Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016. Geomni UK Map data © and database rights [2019]";
export const ATTRIBUTION_TRAFFIC_WALES =
  "Contains Traffic Wales data © Crown copyright, licensed under the Open Government Licence v3.0";
export const ATTRIBUTION_NATIONAL_HIGHWAYS =
  "Contains National Highways data © Crown copyright, licensed under the Open Government Licence v3.0";

const ATTRIBUTION: Record<ExtraSource, string> = {
  tfl: ATTRIBUTION_TFL,
  traffic_wales: ATTRIBUTION_TRAFFIC_WALES,
  national_highways: ATTRIBUTION_NATIONAL_HIGHWAYS,
};

/** Attribution lines for the new sources among `sources` (the sources of the
 *  items actually on the screen), in a fixed order. */
export function attributionForSources(sources: Iterable<string>): string[] {
  const set = new Set(sources);
  return (Object.keys(ATTRIBUTION) as ExtraSource[]).filter((s) => set.has(s)).map((s) => ATTRIBUTION[s]);
}

export const TFL_URL = "https://api.tfl.gov.uk/Road/all/Disruption?stripContent=true";
export const WALES_FEEDS = {
  incidents: "https://traffic.wales/feeds/incidents-events/rss.xml",
  roadworks: "https://traffic.wales/feeds/roadworks/rss.xml",
  headlines: "https://traffic.wales/feeds/headlines/rss.xml",
} as const;
export const NH_LAYER =
  "https://services-eu1.arcgis.com/mZXeBXkkZpekxjXT/arcgis/rest/services/PublicScheduledRoadClosures/FeatureServer/0";
export const NH_PAGE_SIZE = 1000;
const NH_MAX_PAGES = 10;

export const REQUEST_TIMEOUT_MS = 18000;
const MIN = 60000;
const HOUR = 60 * MIN;
const ERROR_LOG_EVERY_MS = HOUR;
/** Events further ahead than this are not handed to matching (the screen
 *  shows 7 days; the same horizon as Street Manager's load). */
const HORIZON_DAYS = 8;

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

let fetchImpl: FetchLike = (url, init) => fetch(url, init);

/** Tests only. */
export function setRoadSourcesFetch(f: FetchLike | null): void {
  fetchImpl = f ?? ((url, init) => fetch(url, init));
}

async function get(url: string, as: "json" | "text"): Promise<unknown> {
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: as === "json" ? "application/json" : "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return as === "json" ? res.json() : res.text();
}

// ── Loaders (no gating, no cache; the dry-run script calls these) ────

export async function loadTfl(now: Date): Promise<RoadEvent[]> {
  void now;
  const key = process.env.TFL_APP_KEY?.trim();
  const url = key ? `${TFL_URL}&app_key=${encodeURIComponent(key)}` : TFL_URL;
  const json = await get(url, "json");
  if (!Array.isArray(json)) throw new Error(`unexpected TfL response: ${JSON.stringify(json)?.slice(0, 120)}`);
  return parseTflDisruptions(json);
}

/** Last good copy of each Wales feed, so one feed failing does not empty
 *  the others. */
const walesLastGood = new Map<keyof typeof WALES_FEEDS, RoadEvent[]>();

export async function loadWales(now: Date): Promise<RoadEvent[]> {
  const names = Object.keys(WALES_FEEDS) as (keyof typeof WALES_FEEDS)[];
  const results = await Promise.allSettled(names.map((n) => get(WALES_FEEDS[n], "text")));
  let ok = 0;
  const errors: string[] = [];
  results.forEach((r, i) => {
    const name = names[i];
    if (r.status === "fulfilled" && typeof r.value === "string" && /<rss[\s>]/i.test(r.value)) {
      walesLastGood.set(name, parseTrafficWalesRss(r.value, name, now));
      ok++;
    } else {
      errors.push(`${name}: ${r.status === "rejected" ? (r.reason as Error)?.message : "not RSS"}`);
    }
  });
  if (ok === 0) throw new Error(errors.join("; "));
  if (errors.length > 0) logFailure("traffic_wales", new Error(`partial: ${errors.join("; ")}`), Date.now());
  // The headlines feed can repeat an incident: one copy per id.
  const byId = new Map<string, RoadEvent>();
  for (const n of names) for (const e of walesLastGood.get(n) ?? []) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()];
}

export async function loadNh(now: Date): Promise<RoadEvent[]> {
  const out: RoadEvent[] = [];
  for (let page = 0; page < NH_MAX_PAGES; page++) {
    const q = new URLSearchParams({
      where: "1=1",
      outFields: "objectid,description,road_number,eventtype,natureofworks,scheduledplannedstartdate,scheduledplannedenddate",
      orderByFields: "objectid",
      resultOffset: String(page * NH_PAGE_SIZE),
      resultRecordCount: String(NH_PAGE_SIZE),
      geometryPrecision: "5",
      f: "geojson",
    });
    const json = (await get(`${NH_LAYER}/query?${q}`, "json")) as {
      features?: unknown[];
      properties?: { exceededTransferLimit?: boolean };
      exceededTransferLimit?: boolean;
      error?: { message?: string };
    };
    if (!json || !Array.isArray(json.features)) throw new Error(json?.error?.message ?? "unexpected ArcGIS response");
    out.push(...parseNhClosures(json, now));
    const more = json.properties?.exceededTransferLimit ?? json.exceededTransferLimit ?? json.features.length >= NH_PAGE_SIZE;
    if (!more || json.features.length === 0) break;
  }
  return out;
}

// ── National Highways live incidents: NOT BUILT ─────────────────────
// Live NH incidents (the DATEX feed on the NH Developer Portal) need a key.
// Gate: NH_API_KEY. Until the client is written this makes NO calls, with
// or without the key; it only says so once.
let nhIncidentsNoted = false;
export async function loadNhIncidents(): Promise<RoadEvent[]> {
  if (!process.env.NH_API_KEY) return [];
  if (!nhIncidentsNoted) {
    nhIncidentsNoted = true;
    console.log("[roadSources] NH_API_KEY is set but the live incidents client is not built yet; nothing fetched");
  }
  return [];
}

// ── Shared cache per source ─────────────────────────────────────────

export interface FeedSpec {
  source: ExtraSource;
  flag: string;
  area: Bbox;
  /** Refresh no more often than this. */
  refreshMs: number;
  /** After a failure, wait this long before trying again. */
  retryMs: number;
  /** Serve the last good copy for this long, then nothing. */
  staleMs: number;
  load: (now: Date) => Promise<RoadEvent[]>;
}

export const FEED_SPECS: Record<ExtraSource, FeedSpec> = {
  // TfL caches for 150-300 s itself; one request for all of London.
  tfl: { source: "tfl", flag: "ROAD_SOURCE_TFL", area: GREATER_LONDON_BBOX, refreshMs: 5 * MIN, retryMs: 5 * MIN, staleMs: 30 * MIN, load: loadTfl },
  // Updated every 5 minutes; three small requests.
  traffic_wales: { source: "traffic_wales", flag: "ROAD_SOURCE_WALES", area: WALES_BBOX, refreshMs: 10 * MIN, retryMs: 10 * MIN, staleMs: 2 * HOUR, load: loadWales },
  // Updated daily, about 3,000 closures over 4 pages.
  national_highways: { source: "national_highways", flag: "ROAD_SOURCE_NH", area: ENGLAND_BBOX, refreshMs: 6 * HOUR, retryMs: 30 * MIN, staleMs: 48 * HOUR, load: loadNh },
};

interface FeedState {
  events: RoadEvent[];
  boxes: (Bbox | null)[];
  fetchedAt: number | null;
  lastAttemptAt: number | null;
  lastFailed: boolean;
  inFlight: Promise<void> | null;
}

const states = new Map<ExtraSource, FeedState>();
const lastErrorLogAt = new Map<ExtraSource, number>();

function stateOf(s: ExtraSource): FeedState {
  let st = states.get(s);
  if (!st) states.set(s, (st = { events: [], boxes: [], fetchedAt: null, lastAttemptAt: null, lastFailed: false, inFlight: null }));
  return st;
}

function logFailure(source: ExtraSource, err: unknown, at: number): void {
  const last = lastErrorLogAt.get(source) ?? -Infinity;
  if (at - last < ERROR_LOG_EVERY_MS) return;
  lastErrorLogAt.set(source, at);
  // The message only: never the URL (it can carry the TfL key).
  console.error(`[roadSources] ${source} fetch failed (kept last good data; next log in an hour at most):`, (err as Error)?.message ?? String(err));
}

export function isSourceEnabled(source: ExtraSource): boolean {
  return process.env[FEED_SPECS[source].flag] === "1";
}

export function extraRoadSourcesEnabled(): boolean {
  return (Object.keys(FEED_SPECS) as ExtraSource[]).some(isSourceEnabled);
}

function refresh(spec: FeedSpec, st: FeedState, now: Date): Promise<void> {
  if (st.inFlight) return st.inFlight;
  st.lastAttemptAt = now.getTime();
  const p = (async () => {
    try {
      const events = await spec.load(now);
      st.events = events;
      st.boxes = events.map(eventBbox);
      st.fetchedAt = now.getTime();
      st.lastFailed = false;
    } catch (err) {
      st.lastFailed = true;
      logFailure(spec.source, err, now.getTime());
    } finally {
      st.inFlight = null;
    }
  })();
  st.inFlight = p;
  return p;
}

function usable(spec: FeedSpec, st: FeedState, now: Date): boolean {
  return st.fetchedAt != null && now.getTime() - st.fetchedAt < spec.staleMs;
}

/** One source's events touching `bbox`, not ended, starting within the
 *  horizon. Never throws. Fetches only when enabled, the bbox touches the
 *  source's area, and the copy is due a refresh. Waits for the fetch only
 *  when there is no usable copy. */
export async function sourceEvents(source: ExtraSource, bbox: Bbox, now: Date): Promise<RoadEvent[]> {
  try {
    if (!isSourceEnabled(source)) return [];
    const spec = FEED_SPECS[source];
    if (!bboxTouches(bbox, spec.area)) return [];
    const st = stateOf(source);
    const t = now.getTime();
    const due =
      st.fetchedAt == null || t - st.fetchedAt >= spec.refreshMs;
    const waited = st.lastAttemptAt == null || t - st.lastAttemptAt >= (st.lastFailed ? spec.retryMs : 0);
    if (due && waited && !st.inFlight) void refresh(spec, st, now);
    if (!usable(spec, st, now) && st.inFlight) await st.inFlight;
    if (!usable(spec, st, now)) return [];

    const horizon = t + HORIZON_DAYS * 86400000;
    const out: RoadEvent[] = [];
    for (let i = 0; i < st.events.length; i++) {
      const e = st.events[i];
      const b = st.boxes[i];
      if (!b || !bboxTouches(b, bbox)) continue;
      if (e.endAt && e.endAt.getTime() <= t) continue;
      if (e.startAt && e.startAt.getTime() > horizon) continue;
      out.push({ ...e, future: e.startAt != null && e.startAt.getTime() > t });
    }
    return out;
  } catch (err) {
    logFailure(source, err, now.getTime());
    return [];
  }
}

/** Events from every enabled new source for a corridor's box, with TfL
 *  works that Street Manager already lists (`streetWorks`) taken out so a
 *  London driver never sees the same roadworks twice. Never throws. */
export async function extraRoadEventsFor(bbox: Bbox, streetWorks: RoadEvent[], now: Date): Promise<RoadEvent[]> {
  if (!extraRoadSourcesEnabled()) return [];
  const [tfl, wales, nh] = await Promise.all([
    sourceEvents("tfl", bbox, now),
    sourceEvents("traffic_wales", bbox, now),
    sourceEvents("national_highways", bbox, now),
  ]);
  return [...withoutStreetManagerDuplicates(tfl, streetWorks), ...wales, ...nh];
}

/** Tests only. */
export function resetRoadSources(): void {
  states.clear();
  lastErrorLogAt.clear();
  walesLastGood.clear();
  nhIncidentsNoted = false;
}

/** Tests and the dry run: when the source last refreshed. */
export function sourceSnapshot(source: ExtraSource): { fetchedAt: number | null; count: number; lastFailed: boolean } {
  const st = stateOf(source);
  return { fetchedAt: st.fetchedAt, count: st.events.length, lastFailed: st.lastFailed };
}
