/**
 * Place-pair quiet classification (free for every driver, 15 Sep 2026).
 *
 * The A->B learner in routes/trips (suggestPairClassification) needs three
 * earlier drives in the SAME direction between two 500 m boxes. This signal
 * looks at PLACES instead: a saved location, or a 250 m circle around each
 * end of the new trip, and counts the driver's own decisions between those
 * two places in EITHER direction. A courier who has sorted depot->customer
 * three times as work has told us what customer->depot is too.
 *
 * Rules, all deliberate:
 *  - Only the driver's own decisions count. Anything the server classified
 *    quietly (pattern_learning or place_pair) is excluded, so one wrong guess
 *    can never become three matching "priors". An undo counts AGAINST the pair.
 *  - Three or more trips, every one sorted the same way. A single disagreeing
 *    trip keeps the pair quiet: this lands on a tax record.
 *  - Home <-> Work is never decided here. For a self-employed driver the
 *    drive between home and a saved "work" is only business if that work is
 *    not a fixed base (HMRC ordinary-commuting rule, BIM37600). The app cannot
 *    know whether it is, so the trip is left for the driver even when every
 *    earlier one was sorted the same way.
 *
 * Pure logic lives in suggestPlacePair() so it can be unit-tested and dry-run
 * against production rows without writing anything.
 */
import { haversineDistance } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";

export const PLACE_PAIR_SOURCE = "place_pair";
/** Every quiet source the learners must never treat as a driver decision. */
export const QUIET_CLASSIFICATION_SOURCES = ["pattern_learning", PLACE_PAIR_SOURCE] as const;
export const PLACE_RADIUS_METRES = 250;
export const PLACE_PAIR_MIN_TRIPS = 3;
/** Newest driver-decided trips consulted per candidate. */
export const PLACE_PAIR_HISTORY_LIMIT = 600;

const METRES_PER_MILE = 1609.344;

export interface PlacePairTripInput {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  classification: string;
  classificationSource: string | null;
  platformTag: string | null;
  businessPurpose: string | null;
  category: string | null;
}

export interface PlacePairSavedLocation {
  id: string;
  name: string;
  locationType: string;
  latitude: number;
  longitude: number;
}

export interface PlacePairCandidate {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

export interface PlacePairPlace {
  kind: "saved" | "cluster";
  /** Saved location id, or "cluster" for a 250 m circle around the trip end. */
  id: string;
  label: string | null;
  locationType: string | null;
}

export type PlacePairReason =
  | "fires"
  | "no_place" // neither a saved location nor any classified endpoint nearby
  | "same_place" // both ends in one place: nothing to pair
  | "commute" // Home <-> Work, left for the driver
  | "too_few" // fewer than PLACE_PAIR_MIN_TRIPS decisions between the places
  | "mixed"; // the driver has sorted this pair both ways, or undone a guess

/** Same shape as the A->B learner's PairSuggestion so the create response and
 *  the app's undo toast need no new branches. */
export interface PlacePairSuggestion {
  classification: string;
  platformTag: string | null;
  businessPurpose: string | null;
  category: string | null;
  matchCount: number;
  confidence: number;
  contradictions: number;
  source: typeof PLACE_PAIR_SOURCE;
  startPlace: PlacePairPlace;
  endPlace: PlacePairPlace;
  /** How many of the matches ran the opposite way to the new trip. */
  reverseMatches: number;
}

export interface PlacePairOutcome {
  reason: PlacePairReason;
  suggestion: PlacePairSuggestion | null;
  /** Trips between the two places, whichever way they ran. */
  matchCount: number;
}

function metresBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineDistance(lat1, lng1, lat2, lng2) * METRES_PER_MILE;
}

function isUsablePoint(lat: number | null, lng: number | null): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1)
  );
}

/** A driver decision, as opposed to something the server guessed. */
export function isDriverDecidedTrip(t: Pick<PlacePairTripInput, "classification" | "classificationSource">): boolean {
  if (t.classificationSource === "user_undo") return true;
  if (t.classification === "unclassified") return false;
  return !(QUIET_CLASSIFICATION_SOURCES as readonly string[]).includes(t.classificationSource ?? "");
}

/** The place a point belongs to: the nearest saved location within 250 m, else
 *  the 250 m circle around `centre` (the new trip's own end). */
function placeOf(
  lat: number,
  lng: number,
  saved: PlacePairSavedLocation[],
  centre: { lat: number; lng: number; id: string }
): PlacePairPlace | null {
  let best: PlacePairSavedLocation | null = null;
  let bestM = Infinity;
  for (const s of saved) {
    const m = metresBetween(lat, lng, s.latitude, s.longitude);
    if (m <= PLACE_RADIUS_METRES && m < bestM) {
      best = s;
      bestM = m;
    }
  }
  if (best) return { kind: "saved", id: best.id, label: best.name, locationType: best.locationType };
  if (metresBetween(lat, lng, centre.lat, centre.lng) <= PLACE_RADIUS_METRES) {
    return { kind: "cluster", id: centre.id, label: null, locationType: null };
  }
  return null;
}

function samePlace(a: PlacePairPlace, b: PlacePairPlace): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function isHomeWorkPair(a: PlacePairPlace, b: PlacePairPlace): boolean {
  const types = new Set([a.locationType, b.locationType]);
  return types.has("home") && types.has("work");
}

export function suggestPlacePair(
  candidate: PlacePairCandidate,
  history: PlacePairTripInput[],
  savedLocations: PlacePairSavedLocation[]
): PlacePairOutcome {
  const none = (reason: PlacePairReason, matchCount = 0): PlacePairOutcome => ({
    reason,
    suggestion: null,
    matchCount,
  });
  if (!isUsablePoint(candidate.startLat, candidate.startLng) || !isUsablePoint(candidate.endLat, candidate.endLng)) {
    return none("no_place");
  }

  const startCentre = { lat: candidate.startLat, lng: candidate.startLng, id: "start" };
  const endCentre = { lat: candidate.endLat, lng: candidate.endLng, id: "end" };
  const startPlace = placeOf(candidate.startLat, candidate.startLng, savedLocations, startCentre)!;
  const endPlace = placeOf(candidate.endLat, candidate.endLng, savedLocations, endCentre)!;
  if (samePlace(startPlace, endPlace)) return none("same_place");
  if (startPlace.kind === "cluster" && endPlace.kind === "cluster") {
    // Two unnamed circles that overlap are one place, not a pair.
    if (metresBetween(candidate.startLat, candidate.startLng, candidate.endLat, candidate.endLng) <= PLACE_RADIUS_METRES) {
      return none("same_place");
    }
  }

  // Home <-> Work: see the file comment. Checked before counting so the
  // driver's own consistent history cannot override it.
  if (isHomeWorkPair(startPlace, endPlace)) return none("commute");

  const decided = history.filter(isDriverDecidedTrip);
  const inPlace = (lat: number, lng: number, place: PlacePairPlace, centre: { lat: number; lng: number; id: string }) => {
    const p = placeOf(lat, lng, savedLocations, centre);
    return p != null && samePlace(p, place);
  };

  const votes: Record<string, number> = {};
  const matches: PlacePairTripInput[] = [];
  let reverseMatches = 0;
  for (const t of decided) {
    if (!isUsablePoint(t.startLat, t.startLng) || !isUsablePoint(t.endLat, t.endLng)) continue;
    const endLat = t.endLat as number;
    const endLng = t.endLng as number;
    // A history trip's ends must resolve against the SAME circles as the
    // candidate's, so a saved location beats a cluster for it too.
    const forward = inPlace(t.startLat, t.startLng, startPlace, startCentre) && inPlace(endLat, endLng, endPlace, endCentre);
    const reverse = !forward && inPlace(t.startLat, t.startLng, endPlace, endCentre) && inPlace(endLat, endLng, startPlace, startCentre);
    if (!forward && !reverse) continue;
    if (reverse) reverseMatches++;
    matches.push(t);
    const key = t.classificationSource === "user_undo" ? "__undone__" : t.classification;
    votes[key] = (votes[key] ?? 0) + 1;
  }

  if (matches.length < PLACE_PAIR_MIN_TRIPS) return none("too_few", matches.length);
  const keys = Object.keys(votes);
  if (keys.length !== 1 || keys[0] === "__undone__" || keys[0] === "unclassified") {
    return none("mixed", matches.length);
  }
  const classification = keys[0];
  if (classification !== "business" && classification !== "personal") return none("mixed", matches.length);

  const modeOf = (key: "platformTag" | "businessPurpose" | "category"): string | null => {
    const c: Record<string, number> = {};
    for (const t of matches) {
      const v = t[key];
      if (typeof v === "string" && v.length > 0) c[v] = (c[v] ?? 0) + 1;
    }
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  };

  return {
    reason: "fires",
    matchCount: matches.length,
    suggestion: {
      classification,
      platformTag: modeOf("platformTag"),
      businessPurpose: modeOf("businessPurpose"),
      category: modeOf("category"),
      matchCount: matches.length,
      confidence: 100,
      contradictions: 0,
      source: PLACE_PAIR_SOURCE,
      startPlace,
      endPlace,
      reverseMatches,
    },
  };
}

/**
 * Load the driver's decided trips and saved locations, then run the pure rule.
 * Reads only. The NULL-safe source filter matters: `NOT { classificationSource:
 * "pattern_learning" }` alone drops every row whose source is NULL, which is
 * every trip sorted before 8 Sep 2026.
 */
export async function suggestPlacePairClassification(args: {
  userId: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}): Promise<PlacePairOutcome> {
  const { userId, ...candidate } = args;
  const [history, savedLocations] = await Promise.all([
    prisma.trip.findMany({
      where: {
        userId,
        isPhantomTrip: false,
        OR: [
          {
            classification: { not: "unclassified" },
            OR: [
              { classificationSource: null },
              { classificationSource: { notIn: [...QUIET_CLASSIFICATION_SOURCES] } },
            ],
          },
          { classificationSource: "user_undo" },
        ],
      },
      select: {
        id: true,
        startLat: true,
        startLng: true,
        endLat: true,
        endLng: true,
        classification: true,
        classificationSource: true,
        platformTag: true,
        businessPurpose: true,
        category: true,
      },
      orderBy: { startedAt: "desc" },
      take: PLACE_PAIR_HISTORY_LIMIT,
    }),
    prisma.savedLocation.findMany({
      where: { userId },
      select: { id: true, name: true, locationType: true, latitude: true, longitude: true },
    }),
  ]);
  return suggestPlacePair(candidate, history, savedLocations);
}
