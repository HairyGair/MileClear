/**
 * Place-pair quiet classification: two places, either direction, three
 * consistent driver decisions, never Home <-> Work (15 Sep 2026).
 */
import { describe, it, expect } from "vitest";
import {
  suggestPlacePair,
  isDriverDecidedTrip,
  PLACE_PAIR_MIN_TRIPS,
  PLACE_PAIR_SOURCE,
  type PlacePairTripInput,
  type PlacePairSavedLocation,
} from "../../services/placePairClassifier.js";

// ~111 km per degree of latitude, so 0.001 deg is ~111 m.
const DEG_PER_100M = 0.0009;
const DEPOT = { lat: 52.2, lng: -1.9 };
const CUSTOMER = { lat: 52.23, lng: -1.95 }; // a few km away
const SHOPS = { lat: 52.15, lng: -1.8 };

let seq = 0;
function trip(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  classification: string,
  opts: { source?: string | null; jitterM?: number; platformTag?: string | null } = {}
): PlacePairTripInput {
  const j = ((opts.jitterM ?? 0) / 100) * DEG_PER_100M;
  seq += 1;
  return {
    id: `t${seq}`,
    startLat: from.lat + j,
    startLng: from.lng,
    endLat: to.lat - j,
    endLng: to.lng,
    classification,
    classificationSource: opts.source ?? null,
    platformTag: opts.platformTag ?? null,
    businessPurpose: null,
    category: null,
  };
}

const candidate = { startLat: DEPOT.lat, startLng: DEPOT.lng, endLat: CUSTOMER.lat, endLng: CUSTOMER.lng };

describe("suggestPlacePair", () => {
  it("fires on three consistent trips between the same two places", () => {
    const history = [
      trip(DEPOT, CUSTOMER, "business", { jitterM: 50, platformTag: "amazon_flex" }),
      trip(DEPOT, CUSTOMER, "business", { jitterM: 120, platformTag: "amazon_flex" }),
      trip(DEPOT, CUSTOMER, "business", { jitterM: 200 }),
    ];
    const r = suggestPlacePair(candidate, history, []);
    expect(r.reason).toBe("fires");
    expect(r.suggestion?.classification).toBe("business");
    expect(r.suggestion?.source).toBe(PLACE_PAIR_SOURCE);
    expect(r.suggestion?.matchCount).toBe(3);
    expect(r.suggestion?.contradictions).toBe(0);
    expect(r.suggestion?.platformTag).toBe("amazon_flex");
    expect(r.suggestion?.startPlace.kind).toBe("cluster");
  });

  it("counts the return leg as the same pair", () => {
    const history = [
      trip(CUSTOMER, DEPOT, "business"),
      trip(CUSTOMER, DEPOT, "business", { jitterM: 80 }),
      trip(DEPOT, CUSTOMER, "business"),
    ];
    const r = suggestPlacePair(candidate, history, []);
    expect(r.reason).toBe("fires");
    expect(r.suggestion?.reverseMatches).toBe(2);
  });

  it("stays quiet on two trips", () => {
    const history = [trip(DEPOT, CUSTOMER, "business"), trip(DEPOT, CUSTOMER, "business")];
    const r = suggestPlacePair(candidate, history, []);
    expect(r.reason).toBe("too_few");
    expect(r.matchCount).toBe(PLACE_PAIR_MIN_TRIPS - 1);
    expect(r.suggestion).toBeNull();
  });

  it("stays quiet when the driver has sorted the pair both ways", () => {
    const history = [
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, CUSTOMER, "business"),
      trip(CUSTOMER, DEPOT, "personal"),
    ];
    const r = suggestPlacePair(candidate, history, []);
    expect(r.reason).toBe("mixed");
    expect(r.suggestion).toBeNull();
  });

  it("treats an undone quiet guess as a contradiction", () => {
    const history = [
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, CUSTOMER, "unclassified", { source: "user_undo" }),
    ];
    expect(suggestPlacePair(candidate, history, []).reason).toBe("mixed");
  });

  it("ignores its own and the A->B learner's quiet output", () => {
    const history = [
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, CUSTOMER, "business", { source: "pattern_learning" }),
      trip(DEPOT, CUSTOMER, "business", { source: PLACE_PAIR_SOURCE }),
    ];
    const r = suggestPlacePair(candidate, history, []);
    expect(r.reason).toBe("too_few");
    expect(r.matchCount).toBe(1);
  });

  it("ignores trips that end somewhere else", () => {
    const history = [
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, SHOPS, "business"),
      trip(SHOPS, CUSTOMER, "business"),
    ];
    expect(suggestPlacePair(candidate, history, []).reason).toBe("too_few");
  });

  it("uses a saved location as the place, so a wider yard still matches", () => {
    const yard: PlacePairSavedLocation = { id: "s1", name: "Depot", locationType: "depot", latitude: DEPOT.lat, longitude: DEPOT.lng };
    // Candidate starts 200 m north of the pin; history starts 200 m south.
    // 400 m apart as coordinates, one place by name.
    const far = { lat: DEPOT.lat - 2 * DEG_PER_100M, lng: DEPOT.lng };
    const near = { ...candidate, startLat: DEPOT.lat + 2 * DEG_PER_100M };
    const history = [trip(far, CUSTOMER, "business"), trip(far, CUSTOMER, "business"), trip(far, CUSTOMER, "business")];
    expect(suggestPlacePair(near, history, []).reason).toBe("too_few");
    const r = suggestPlacePair(near, history, [yard]);
    expect(r.reason).toBe("fires");
    expect(r.suggestion?.startPlace).toEqual({ kind: "saved", id: "s1", label: "Depot", locationType: "depot" });
  });

  it("never decides Home -> Work, however consistent the history", () => {
    const home: PlacePairSavedLocation = { id: "h", name: "Home", locationType: "home", latitude: DEPOT.lat, longitude: DEPOT.lng };
    const work: PlacePairSavedLocation = { id: "w", name: "Work", locationType: "work", latitude: CUSTOMER.lat, longitude: CUSTOMER.lng };
    const history = [
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, CUSTOMER, "business"),
      trip(DEPOT, CUSTOMER, "business"),
      trip(CUSTOMER, DEPOT, "business"),
    ];
    const there = suggestPlacePair(candidate, history, [home, work]);
    expect(there.reason).toBe("commute");
    expect(there.suggestion).toBeNull();
    const back = suggestPlacePair(
      { startLat: CUSTOMER.lat, startLng: CUSTOMER.lng, endLat: DEPOT.lat, endLng: DEPOT.lng },
      history,
      [home, work]
    );
    expect(back.reason).toBe("commute");
    // Home -> a customer is still fine: only the Home/Work pairing is reserved.
    const toShops = suggestPlacePair(
      { startLat: DEPOT.lat, startLng: DEPOT.lng, endLat: SHOPS.lat, endLng: SHOPS.lng },
      [trip(DEPOT, SHOPS, "personal"), trip(SHOPS, DEPOT, "personal"), trip(DEPOT, SHOPS, "personal")],
      [home, work]
    );
    expect(toShops.reason).toBe("fires");
    expect(toShops.suggestion?.classification).toBe("personal");
  });

  it("does not pair a trip with itself or a short hop inside one place", () => {
    const hop = { startLat: DEPOT.lat, startLng: DEPOT.lng, endLat: DEPOT.lat + DEG_PER_100M, endLng: DEPOT.lng };
    expect(suggestPlacePair(hop, [], []).reason).toBe("same_place");
  });
});

describe("isDriverDecidedTrip", () => {
  it("counts driver decisions and undos, not quiet guesses or blanks", () => {
    expect(isDriverDecidedTrip({ classification: "business", classificationSource: null })).toBe(true);
    expect(isDriverDecidedTrip({ classification: "business", classificationSource: "user" })).toBe(true);
    expect(isDriverDecidedTrip({ classification: "unclassified", classificationSource: "user_undo" })).toBe(true);
    expect(isDriverDecidedTrip({ classification: "business", classificationSource: "pattern_learning" })).toBe(false);
    expect(isDriverDecidedTrip({ classification: "personal", classificationSource: PLACE_PAIR_SOURCE })).toBe(false);
    expect(isDriverDecidedTrip({ classification: "unclassified", classificationSource: null })).toBe(false);
  });
});
