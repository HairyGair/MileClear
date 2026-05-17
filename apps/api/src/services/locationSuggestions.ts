// Saved-location suggestions
//
// Analyses a user's last 90 days of trips and clusters distinct endpoints
// (start + end points) within ~100m of each other. Returns clusters with
// 3+ visits that aren't already covered by a saved location, with a
// best-effort guess at whether each cluster is Home / Work / Other based
// on time-of-day patterns.
//
// The point of this feature: a user with 50+ trips and 0 saved locations
// is currently invisible to MileClear's classification engine. We have
// all the data needed to credibly say "you've ended here 14 times — is
// this Home?" — that turns a setup task into a moment of intelligence.
//
// Anthony 17 May 2026 — committed feature scope, shipped with reasonable
// defaults to iterate on.
//
// Tunable variables (commented inline below):
//   - CLUSTER_RADIUS_METERS: how close two endpoints need to be to be
//     considered the same place
//   - LOOKBACK_DAYS: how far back to analyse trips
//   - MIN_VISITS: minimum cluster size before we suggest it
//   - MAX_SUGGESTIONS: cap the response so the review UI doesn't overflow
//   - HOME_ARRIVAL_HOURS / WORK_ARRIVAL_HOURS: time windows that
//     distinguish home from work clusters

import { prisma } from "../lib/prisma.js";

// --- Tunables (iterate on these once we have user feedback) -----------
const CLUSTER_RADIUS_METERS = 100;
const LOOKBACK_DAYS = 90;
const MIN_VISITS = 3;
const MAX_SUGGESTIONS = 8;
// Hours during which an arrival is treated as "going home" (evening/night)
const HOME_ARRIVAL_START_HOUR = 17; // 5pm UK
const HOME_ARRIVAL_END_HOUR = 23; // 11pm UK
// Hours during which an arrival is treated as "going to work"
const WORK_ARRIVAL_START_HOUR = 6; // 6am UK
const WORK_ARRIVAL_END_HOUR = 11; // 11am UK
// Dedup against existing saved locations: drop suggestions within this
// many metres of any already-saved location.
const EXISTING_LOCATION_OVERLAP_METERS = 150;

// ---------------------------------------------------------------------

interface Endpoint {
  lat: number;
  lng: number;
  /** Trip date — used for time-of-day inference. */
  at: Date;
  /** "start" or "end" — both contribute to the cluster's visit count. */
  side: "start" | "end";
  /** The reverse-geocoded address stored on the trip row at this endpoint.
   *  Used to derive an inferred name without a server-side geocoder. */
  address: string | null;
}

interface Cluster {
  centroidLat: number;
  centroidLng: number;
  visits: Endpoint[];
}

export interface SuggestedLocation {
  /** Stable identifier for the client to track dismissals. Derived from the
   *  centroid; same cluster → same id across calls. */
  id: string;
  centroidLat: number;
  centroidLng: number;
  visitCount: number;
  /** Most recent visit. Used by the UI to show "last visited 2 days ago". */
  lastVisitedAt: string;
  /** First visit in the lookback window. UI shows "47 times since 12 Feb". */
  firstVisitedAt: string;
  /** Best guess at what to label this — never overrides user choice. */
  suggestedType: "home" | "work" | "other";
  /** Best-effort reverse-geocoded street/locality. May be null if geocoding
   *  failed. UI falls back to "Saved location" + map preview. */
  inferredName: string | null;
}

function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000; // metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Convert a UTC Date to UK local hour (handles BST/GMT switch).
 *  Used so the home/work time windows align with the user's local sense
 *  of "I get home at 6pm" rather than depending on server timezone. */
function ukHour(d: Date): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  // "24" can appear at midnight in some formats — clamp to 23
  const h = parseInt(hour, 10);
  return h >= 24 ? 0 : h;
}

/** Derive a stable cluster id from rounded centroid coords. Same place →
 *  same id, even if visit count changes. Lets the client dismiss "no, that's
 *  not interesting" suggestions and not see them again. */
function clusterId(lat: number, lng: number): string {
  // Round to ~10m precision (5 decimal places of degrees ≈ 1m, but cluster
  // centroids shift as new visits land — 4dp keeps the id stable across
  // small drift)
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function getSuggestedSavedLocations(
  userId: string,
): Promise<SuggestedLocation[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Pull trips with valid endpoints. Both start AND end coords count as
  // visits to those places — if the user keeps starting from the same
  // street and ending at the same supermarket, both should surface.
  const trips = await prisma.trip.findMany({
    where: {
      userId,
      isPhantomTrip: false,
      startedAt: { gte: since },
      endLat: { not: null },
      endLng: { not: null },
    },
    select: {
      startLat: true,
      startLng: true,
      endLat: true,
      endLng: true,
      startedAt: true,
      endedAt: true,
      startAddress: true,
      endAddress: true,
    },
    orderBy: { startedAt: "desc" },
    take: 1000,
  });

  if (trips.length < MIN_VISITS) return [];

  // Flatten into endpoints. Each trip contributes a start and an end.
  const endpoints: Endpoint[] = [];
  for (const trip of trips) {
    if (trip.startLat !== 0 || trip.startLng !== 0) {
      endpoints.push({
        lat: trip.startLat,
        lng: trip.startLng,
        at: trip.startedAt,
        side: "start",
        address: trip.startAddress,
      });
    }
    if (trip.endLat != null && trip.endLng != null) {
      endpoints.push({
        lat: trip.endLat,
        lng: trip.endLng,
        at: trip.endedAt ?? trip.startedAt,
        side: "end",
        address: trip.endAddress,
      });
    }
  }

  // Cluster: greedy single-pass. For each endpoint, attach it to an
  // existing cluster within radius (using running centroid), or start a
  // new cluster. Greedy isn't optimal but the user only ever sees the
  // top N — sub-optimal clustering at the long tail doesn't matter.
  const clusters: Cluster[] = [];
  for (const ep of endpoints) {
    let matched = false;
    for (const c of clusters) {
      if (
        haversineMeters(ep.lat, ep.lng, c.centroidLat, c.centroidLng) <=
        CLUSTER_RADIUS_METERS
      ) {
        c.visits.push(ep);
        // Update centroid as a rolling average
        c.centroidLat =
          c.centroidLat + (ep.lat - c.centroidLat) / c.visits.length;
        c.centroidLng =
          c.centroidLng + (ep.lng - c.centroidLng) / c.visits.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({
        centroidLat: ep.lat,
        centroidLng: ep.lng,
        visits: [ep],
      });
    }
  }

  // Filter to clusters with at least MIN_VISITS, sorted by visit count
  const frequent = clusters
    .filter((c) => c.visits.length >= MIN_VISITS)
    .sort((a, b) => b.visits.length - a.visits.length);

  // Dedup against existing saved locations
  const existing = await prisma.savedLocation.findMany({
    where: { userId },
    select: { latitude: true, longitude: true },
  });

  const novel = frequent.filter((c) => {
    return !existing.some(
      (loc) =>
        haversineMeters(
          c.centroidLat,
          c.centroidLng,
          loc.latitude,
          loc.longitude,
        ) <= EXISTING_LOCATION_OVERLAP_METERS,
    );
  });

  // Take the top N
  const top = novel.slice(0, MAX_SUGGESTIONS);

  // Infer Home / Work labels. We score each cluster on home-ness and
  // work-ness based on time of day, then assign Home to the highest
  // home-score cluster and Work to the highest work-score cluster
  // (provided it's not the same cluster).
  const scored = top.map((c) => {
    let homeScore = 0;
    let workScore = 0;
    let firstAt = c.visits[0].at;
    let lastAt = c.visits[0].at;
    for (const v of c.visits) {
      if (v.at < firstAt) firstAt = v.at;
      if (v.at > lastAt) lastAt = v.at;
      const h = ukHour(v.at);
      const isWeekday = (() => {
        const day = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/London",
          weekday: "short",
        }).format(v.at);
        return day !== "Sat" && day !== "Sun";
      })();
      // Evening arrival → home signal
      if (
        v.side === "end" &&
        h >= HOME_ARRIVAL_START_HOUR &&
        h <= HOME_ARRIVAL_END_HOUR
      ) {
        homeScore += 1;
      }
      // Morning weekday arrival → work signal
      if (
        v.side === "end" &&
        isWeekday &&
        h >= WORK_ARRIVAL_START_HOUR &&
        h <= WORK_ARRIVAL_END_HOUR
      ) {
        workScore += 1;
      }
    }
    return { cluster: c, homeScore, workScore, firstAt, lastAt };
  });

  // Pick the cluster with the highest home-score as Home (if any).
  // Then pick the cluster with the highest work-score as Work (excluding
  // whatever was chosen as Home).
  let homeClusterIdx = -1;
  let bestHomeScore = 0;
  for (let i = 0; i < scored.length; i++) {
    if (scored[i].homeScore > bestHomeScore) {
      bestHomeScore = scored[i].homeScore;
      homeClusterIdx = i;
    }
  }
  let workClusterIdx = -1;
  let bestWorkScore = 0;
  for (let i = 0; i < scored.length; i++) {
    if (i === homeClusterIdx) continue;
    if (scored[i].workScore > bestWorkScore) {
      bestWorkScore = scored[i].workScore;
      workClusterIdx = i;
    }
  }

  // Derive inferredName from the most common trip address at this cluster.
  // The trip's startAddress/endAddress was already reverse-geocoded when
  // the trip was finalised — reusing it here avoids any server-side
  // geocoding dependency and means the suggestion's name matches the
  // text the user already sees in their trip list.
  function pickName(visits: Endpoint[]): string | null {
    const counts = new Map<string, number>();
    for (const v of visits) {
      const addr = v.address?.trim();
      if (!addr) continue;
      // Strip leading house numbers — "67, Durham Road" → "Durham Road".
      // Matches the same shortAddress logic the mobile uses for trip rows.
      const segments = addr.split(",").map((s) => s.trim());
      const informative =
        segments.find((s) => s.length > 2 && !/^\d+$/.test(s)) ?? segments[0];
      if (!informative) continue;
      counts.set(informative, (counts.get(informative) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    let bestName: string | null = null;
    let bestCount = 0;
    for (const [name, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        bestName = name;
      }
    }
    return bestName;
  }

  return scored.map(({ cluster, firstAt, lastAt }, i) => {
    const suggestedType: SuggestedLocation["suggestedType"] =
      i === homeClusterIdx ? "home" : i === workClusterIdx ? "work" : "other";
    return {
      id: clusterId(cluster.centroidLat, cluster.centroidLng),
      centroidLat: cluster.centroidLat,
      centroidLng: cluster.centroidLng,
      visitCount: cluster.visits.length,
      firstVisitedAt: firstAt.toISOString(),
      lastVisitedAt: lastAt.toISOString(),
      suggestedType,
      inferredName: pickName(cluster.visits),
    };
  });
}
