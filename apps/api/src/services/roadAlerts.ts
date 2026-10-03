// Road alerts trial (2 Oct 2026): per-driver corridors, departure times and
// matched events. The rules are pure and tested in roadCorridor.ts,
// roadEvents.ts and roadAlertsRule.ts; this file only loads and caches.
//
// Cost and privacy:
//   - Only opted-in drivers (and a driver opening their own Road alerts
//     screen) ever have breadcrumbs read. Reads are bounded to that one
//     driver, the last 42 days, non-phantom trips, and select only
//     tripId/lat/lng. trip_coordinates is read in chunks of 40 trips.
//   - Corridors live in memory for 24 hours and are rebuilt lazily, so the
//     nightly restart simply means the first use of the day rebuilds them.
//   - A corridor is never returned by any endpoint, logged, or sent anywhere.
//     Only the matched events go back to the driver who owns the corridor.

import type { RoadAlertItem, RoadAlertsResponse } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import {
  CORRIDOR_WINDOW_DAYS,
  buildCorridor,
  estimateDepartures,
  matchEventToCorridor,
  ukLocalParts,
  type BreadcrumbTrip,
  type Corridor,
  type DepartureProfile,
} from "./roadCorridor.js";
import type { RoadEvent } from "./roadEvents.js";
import { UPCOMING_DAYS, directionWord, offerEligible, splitForScreen, type MatchedEvent } from "./roadAlertsRule.js";
import { groupMatches, sortGroups, type AlertGroup } from "./roadAlertGroups.js";
import { applyKnownNames } from "./roadEventNames.js";
import {
  getTileEvents,
  isTomTomConfigured,
  screenFreshnessMs,
  tilesForCorridor,
} from "./tomtomTraffic.js";
import { isStreetManagerEnabled, loadStreetWorks } from "./streetManager.js";
import { pushPrefOptedIn } from "./pushPrefs.js";

const CACHE_TTL_MS = 24 * 3600000;
const COORD_CHUNK_TRIPS = 40;
/** Corridors bigger than this many cells are trimmed to the most-used ones
 *  (a long-distance driver's six weeks can cover half the country). */
const MAX_CORRIDOR_CELLS = 60000;

export const ATTRIBUTION_TOMTOM = "Traffic incidents © TomTom";
export const ATTRIBUTION_STREET_MANAGER =
  "Roadworks: contains public sector information from DfT Street Manager, licensed under the Open Government Licence v3.0";

interface ProfileEntry {
  builtAt: number;
  profile: DepartureProfile;
}
interface CorridorEntry {
  builtAt: number;
  corridor: Corridor;
}

const profileCache = new Map<string, ProfileEntry>();
const corridorCache = new Map<string, CorridorEntry>();

function windowStart(now: Date): Date {
  return new Date(now.getTime() - CORRIDOR_WINDOW_DAYS * 86400000);
}

export function roadAlertsAvailable(): { incidents: boolean; plannedWorks: boolean } {
  return { incidents: isTomTomConfigured(), plannedWorks: isStreetManagerEnabled() };
}

/** Usual departure per weekday for each driver (cached a day). One small
 *  query for the drivers not cached: trip start times only. */
export async function loadDepartureProfiles(userIds: string[], now: Date): Promise<Map<string, DepartureProfile>> {
  const out = new Map<string, DepartureProfile>();
  const missing: string[] = [];
  for (const id of userIds) {
    const hit = profileCache.get(id);
    if (hit && now.getTime() - hit.builtAt < CACHE_TTL_MS) out.set(id, hit.profile);
    else missing.push(id);
  }
  if (missing.length > 0) {
    const trips = await prisma.trip.findMany({
      where: { userId: { in: missing }, isPhantomTrip: false, startedAt: { gte: windowStart(now), lte: now } },
      select: { userId: true, startedAt: true },
    });
    const byUser = new Map<string, Date[]>();
    for (const t of trips) {
      let arr = byUser.get(t.userId);
      if (!arr) byUser.set(t.userId, (arr = []));
      arr.push(t.startedAt);
    }
    for (const id of missing) {
      const profile = estimateDepartures(byUser.get(id) ?? []);
      profileCache.set(id, { builtAt: now.getTime(), profile });
      out.set(id, profile);
    }
  }
  return out;
}

function trimCorridor(c: Corridor): Corridor {
  if (c.cells.size <= MAX_CORRIDOR_CELLS) return c;
  const kept = [...c.cells.entries()].sort((a, b) => b[1].days - a[1].days).slice(0, MAX_CORRIDOR_CELLS);
  return { ...c, cells: new Map(kept) };
}

/** The driver's corridor (cached a day). */
export async function loadCorridor(userId: string, now: Date): Promise<Corridor> {
  const hit = corridorCache.get(userId);
  if (hit && now.getTime() - hit.builtAt < CACHE_TTL_MS) return hit.corridor;

  const trips = await prisma.trip.findMany({
    where: {
      userId,
      isPhantomTrip: false,
      isManualEntry: false,
      coordinateCount: { gt: 1 },
      startedAt: { gte: windowStart(now), lte: now },
    },
    select: { id: true, startedAt: true },
  });
  const dayByTrip = new Map(trips.map((t) => [t.id, ukLocalParts(t.startedAt).dayKey]));
  const pointsByTrip = new Map<string, { lat: number; lng: number }[]>();
  const ids = trips.map((t) => t.id);
  for (let i = 0; i < ids.length; i += COORD_CHUNK_TRIPS) {
    const chunk = ids.slice(i, i + COORD_CHUNK_TRIPS);
    const rows = await prisma.tripCoordinate.findMany({
      where: { tripId: { in: chunk } },
      select: { tripId: true, lat: true, lng: true },
      orderBy: [{ tripId: "asc" }, { recordedAt: "asc" }],
    });
    for (const r of rows) {
      let arr = pointsByTrip.get(r.tripId);
      if (!arr) pointsByTrip.set(r.tripId, (arr = []));
      arr.push({ lat: r.lat, lng: r.lng });
    }
  }
  const crumbs: BreadcrumbTrip[] = [];
  for (const [tripId, points] of pointsByTrip) {
    crumbs.push({ dayKey: dayByTrip.get(tripId) ?? "", points });
  }
  const corridor = trimCorridor(buildCorridor(crumbs));
  corridorCache.set(userId, { builtAt: now.getTime(), corridor });
  return corridor;
}

/** Drop cached corridors and profiles nobody has used for two days. */
export function pruneRoadAlertCaches(now: Date = new Date()): void {
  const cutoff = now.getTime() - 2 * CACHE_TTL_MS;
  for (const [k, v] of corridorCache) if (v.builtAt < cutoff) corridorCache.delete(k);
  for (const [k, v] of profileCache) if (v.builtAt < cutoff) profileCache.delete(k);
}

/** Events on this driver's usual roads. maxAgeMs: how fresh the TomTom tiles
 *  must be (null = cached only). */
export async function matchedEventsForDriver(
  userId: string,
  now: Date,
  maxAgeMs: number | null
): Promise<{ corridor: Corridor; matches: MatchedEvent[] }> {
  const corridor = await loadCorridor(userId, now);
  if (!corridor.bbox) return { corridor, matches: [] };
  const [incidents, works] = await Promise.all([
    isTomTomConfigured() ? getTileEvents(tilesForCorridor(corridor), maxAgeMs, now) : Promise.resolve([] as RoadEvent[]),
    loadStreetWorks(corridor.bbox, now, UPCOMING_DAYS + 1),
  ]);
  const matches: MatchedEvent[] = [];
  for (const event of [...incidents, ...works]) {
    const m = matchEventToCorridor(corridor, { lines: event.lines, points: event.points, directionMode: event.directionMode });
    if (m.matched) matches.push({ event, days: m.days });
  }
  return { corridor, matches };
}

function toItem(g: AlertGroup): RoadAlertItem {
  const e = g.lead;
  return {
    id: g.id,
    source: e.source,
    severity: g.severity,
    category: e.category,
    when: g.when,
    headline: g.headline,
    sentence: g.sentence,
    road: g.roads[0] ?? null,
    direction: !g.bothDirections && !g.multiPlace && e.directionMode === "along" ? directionWord(e.bearing) : null,
    from: e.from,
    to: e.to,
    town: e.town ?? e.placeTown ?? null,
    delayMinutes: e.delayMinutes,
    startAt: g.startAt ? g.startAt.toISOString() : null,
    endAt: g.endAt ? g.endAt.toISOString() : null,
    daysOnRoute: g.days,
    ongoing: g.ongoing,
    roads: g.roads,
    bothDirections: g.bothDirections,
    occurrences: g.occurrences,
    recurring: g.recurring,
    memberIds: g.members.map((m) => m.event.id),
    centre: g.centre ? { lat: g.centre[0], lng: g.centre[1] } : null,
  };
}

/** GET /road-alerts for one driver. */
export async function roadAlertsForUser(userId: string, now: Date = new Date()): Promise<RoadAlertsResponse["data"]> {
  const available = roadAlertsAvailable();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushPrefs: true } });
  const enabled = pushPrefOptedIn(user?.pushPrefs, "roadAlerts");
  const attribution = [
    ...(available.incidents ? [ATTRIBUTION_TOMTOM] : []),
    ...(available.plannedWorks ? [ATTRIBUTION_STREET_MANAGER] : []),
  ];
  const base = {
    enabled,
    available: available.incidents || available.plannedWorks,
    plannedWorksCoverage: available.plannedWorks ? ("england" as const) : null,
    attribution,
    updatedAt: now.toISOString(),
  };

  if (!enabled) {
    const trips = await prisma.trip.findMany({
      where: { userId, isPhantomTrip: false, isManualEntry: false, startedAt: { gte: windowStart(now) } },
      select: { startedAt: true, startLat: true, startLng: true },
      take: 200,
    });
    return { ...base, offerEligible: base.available && offerEligible(trips), current: [], upcoming: [], hasUsualRoads: false };
  }
  if (!base.available) {
    return { ...base, offerEligible: false, current: [], upcoming: [], hasUsualRoads: false };
  }

  const { corridor, matches } = await matchedEventsForDriver(userId, now, await screenFreshnessMs(now));
  const { current, upcoming } = splitForScreen(matches, now);
  // Street names known so far (the rest are looked up in the background and
  // appear on the next load), then one card per closure.
  const relevant = [...current, ...upcoming];
  const named = applyKnownNames(relevant.map((m) => m.event), now.getTime());
  const groups = sortGroups(groupMatches(relevant.map((m, i): MatchedEvent => ({ ...m, event: named[i] })), now));
  return {
    ...base,
    offerEligible: false,
    hasUsualRoads: corridor.cells.size > 0,
    // Older apps read only current and upcoming, so ongoing closures stay
    // out of both: they disappear there rather than crowding the list.
    current: groups.current.map(toItem),
    upcoming: groups.upcoming.map(toItem),
    ongoing: groups.ongoing.map(toItem),
  };
}
