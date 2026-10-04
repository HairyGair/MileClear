/**
 * Late-start backfill (4 Oct 2026): a recording that began while the car was
 * already moving, 0.2-2 mi from where the previous trip ended, gets its
 * opening stretch back. Every guard is here, because a wrong backfill writes
 * a journey the driver never made into a tax record.
 */
import { describe, it, expect } from "vitest";
import {
  judgeLateStart,
  precheckLateStart,
  prependPolyline,
  alreadyExtended,
  movingAtFirstRealFix,
  splitPlantedAnchor,
  type LateStartTrip,
  type LateStartPrevTrip,
  type LateStartSavedLocation,
} from "../../services/lateStart.js";
import { encodePolyline } from "../../services/tripSplit.js";
import { decodePolyline } from "../../services/mapMatching.js";

// At lat 52.4 one degree of longitude is ~42.2 mi: 0.0142 deg is ~0.6 mi.
const PREV_END = { lat: 52.4, lng: -1.95 };
const START = { lat: 52.4, lng: -1.95 + 0.0142 };
const T_END = new Date("2026-10-01T07:55:00Z");
const T_START = new Date("2026-10-01T08:04:00Z"); // 9 min later
const sec = (d: Date, s: number) => new Date(d.getTime() + s * 1000);

function prev(o: Partial<LateStartPrevTrip> = {}): LateStartPrevTrip {
  return {
    id: "prev",
    endedAt: T_END,
    endLat: PREV_END.lat,
    endLng: PREV_END.lng,
    endAddress: "Work, Bournville",
    vehicleId: "car",
    lastFixAccuracy: 10,
    ...o,
  };
}

function trip(o: Partial<LateStartTrip> = {}): LateStartTrip {
  return {
    id: "trip",
    startedAt: T_START,
    startLat: START.lat,
    startLng: START.lng,
    vehicleId: "car",
    isManualEntry: false,
    isPhantomTrip: false,
    originalStartLat: null,
    gpsQuality: null,
    firstFixes: [
      { lat: START.lat, lng: START.lng, speed: 11, accuracy: 8, recordedAt: T_START },
      { lat: START.lat, lng: START.lng + 0.002, speed: 12, accuracy: 8, recordedAt: sec(T_START, 10) },
    ],
    ...o,
  };
}

const base = () => ({
  trip: trip(),
  prev: prev(),
  savedLocations: [] as LateStartSavedLocation[],
  offerDecided: false,
  otherTrips: [],
  routeMiles: 0.8,
  routeSecs: 150,
});

describe("judgeLateStart: the df0a037d case", () => {
  it("moves the start back to the previous end and adds the routed miles", () => {
    const d = judgeLateStart(base());
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.startLat).toBe(PREV_END.lat);
    expect(d.startLng).toBe(PREV_END.lng);
    expect(d.addedMiles).toBe(0.8);
    expect(d.newStartedAt).toEqual(sec(T_START, -150));
    expect(d.startAddress).toBe("Work, Bournville");
    expect(d.crowMiles).toBeCloseTo(0.6, 1);
    expect(d.gapMin).toBe(9);
  });

  it("names the start after the saved place when the previous end is one", () => {
    const work = { id: "w", name: "Office", latitude: PREV_END.lat, longitude: PREV_END.lng, radiusMeters: 100 };
    const d = judgeLateStart({ ...base(), savedLocations: [work] });
    expect(d.ok && d.startAddress).toBe("Office");
  });

  it("never starts before the previous trip ended", () => {
    // gap 9 min = 540 s; route 540 s exactly fits and starts at prev end
    const d = judgeLateStart({ ...base(), routeSecs: 540 });
    expect(d.ok && d.newStartedAt).toEqual(T_END);
  });
});

describe("judgeLateStart: guards", () => {
  const reason = (args: Parameters<typeof judgeLateStart>[0]) => {
    const d = judgeLateStart(args);
    return d.ok ? "ok" : d.reason;
  };

  it("manual and phantom trips", () => {
    expect(reason({ ...base(), trip: trip({ isManualEntry: true }) })).toBe("manual_entry");
    expect(reason({ ...base(), trip: trip({ isPhantomTrip: true }) })).toBe("phantom");
  });

  it("a start something already moved (wake lag, edge trim, the driver)", () => {
    expect(reason({ ...base(), trip: trip({ originalStartLat: 52.39 }) })).toBe("start_already_moved");
  });

  it("a trip already extended by an offer or by this rule", () => {
    expect(reason({ ...base(), trip: trip({ gpsQuality: { startExtendedSource: "missed_journey_trip_start" } }) })).toBe("already_extended");
    expect(reason({ ...base(), trip: trip({ gpsQuality: { lateStartBackfill: { oldMiles: 3 } } }) })).toBe("already_extended");
    expect(alreadyExtended({ rawCount: 40 })).toBe(false);
    expect(alreadyExtended(null)).toBe(false);
  });

  it("an offer for the pair the driver already decided", () => {
    expect(reason({ ...base(), offerDecided: true })).toBe("offer_decided");
  });

  it("no previous trip, or one without an end", () => {
    expect(reason({ ...base(), prev: null })).toBe("no_prev_trip");
    expect(reason({ ...base(), prev: prev({ endedAt: null }) })).toBe("prev_end_missing");
    expect(reason({ ...base(), prev: prev({ endLat: null }) })).toBe("prev_end_missing");
  });

  it("time gap: previous trip must end before, and within 12 hours", () => {
    expect(reason({ ...base(), prev: prev({ endedAt: sec(T_START, 60) }) })).toBe("prev_ends_after_start");
    expect(reason({ ...base(), prev: prev({ endedAt: sec(T_START, -12 * 3600 - 60) }) })).toBe("gap_too_long");
    expect(reason({ ...base(), prev: prev({ endedAt: sec(T_START, -11 * 3600) }) })).toBe("ok");
  });

  it("a different vehicle; both null counts as the same", () => {
    expect(reason({ ...base(), prev: prev({ vehicleId: "van" }) })).toBe("vehicle_changed");
    expect(reason({ ...base(), prev: prev({ vehicleId: null }) })).toBe("vehicle_changed");
    expect(reason({ ...base(), prev: prev({ vehicleId: null }), trip: trip({ vehicleId: null }) })).toBe("ok");
  });

  it("straight-line gap between 0.2 and 2 miles only", () => {
    const near = { lat: PREV_END.lat, lng: PREV_END.lng + 0.004 }; // ~0.17 mi
    const far = { lat: PREV_END.lat, lng: PREV_END.lng + 0.05 }; // ~2.1 mi
    const at = (p: { lat: number; lng: number }) => trip({
      startLat: p.lat, startLng: p.lng,
      firstFixes: [
        { lat: p.lat, lng: p.lng, speed: 11, accuracy: 8, recordedAt: T_START },
        { lat: p.lat, lng: p.lng + 0.002, speed: 11, accuracy: 8, recordedAt: sec(T_START, 10) },
      ],
    });
    expect(reason({ ...base(), trip: at(near) })).toBe("crow_below_min");
    expect(reason({ ...base(), trip: at(far) })).toBe("crow_above_max");
  });

  it("the stored start must be the first recorded fix", () => {
    expect(reason({ ...base(), trip: trip({ firstFixes: [] }) })).toBe("no_first_fix");
    const shifted = trip();
    shifted.firstFixes = [{ ...shifted.firstFixes[0], recordedAt: sec(T_START, 300) }, shifted.firstFixes[1]];
    expect(reason({ ...base(), trip: shifted })).toBe("start_not_first_fix");
    const moved = trip();
    moved.firstFixes = [{ ...moved.firstFixes[0], lng: START.lng + 0.005 }, moved.firstFixes[1]];
    expect(reason({ ...base(), trip: moved })).toBe("start_not_first_fix");
  });

  it("the car must already be moving at the first fix", () => {
    const still = trip({
      firstFixes: [
        { lat: START.lat, lng: START.lng, speed: 0.5, accuracy: 8, recordedAt: T_START },
        { lat: START.lat, lng: START.lng + 0.0001, speed: 0.5, accuracy: 8, recordedAt: sec(T_START, 30) },
      ],
    });
    expect(reason({ ...base(), trip: still })).toBe("not_moving_at_first_fix");
    // No stored speed, but the first two fixes imply ~30 mph
    const implied = trip({
      firstFixes: [
        { lat: START.lat, lng: START.lng, speed: null, accuracy: 8, recordedAt: T_START },
        { lat: START.lat, lng: START.lng + 0.002, speed: null, accuracy: 8, recordedAt: sec(T_START, 12) },
      ],
    });
    expect(reason({ ...base(), trip: implied })).toBe("ok");
    // Unknown motion is not evidence
    const unknown = trip({ firstFixes: [{ lat: START.lat, lng: START.lng, speed: null, accuracy: 8, recordedAt: T_START }] });
    expect(reason({ ...base(), trip: unknown })).toBe("not_moving_at_first_fix");
  });

  it("an inaccurate first fix", () => {
    const t = trip();
    t.firstFixes = [{ ...t.firstFixes[0], accuracy: 400 }, t.firstFixes[1]];
    expect(reason({ ...base(), trip: t })).toBe("first_fix_inaccurate");
  });

  it("an inaccurate previous end, unless it is a saved place; unknown accuracy is allowed", () => {
    expect(reason({ ...base(), prev: prev({ lastFixAccuracy: 300 }) })).toBe("prev_end_inaccurate");
    expect(reason({ ...base(), prev: prev({ lastFixAccuracy: null }) })).toBe("ok");
    const work = { id: "w", name: "Office", latitude: PREV_END.lat, longitude: PREV_END.lng, radiusMeters: 100 };
    expect(reason({ ...base(), prev: prev({ lastFixAccuracy: 300 }), savedLocations: [work] })).toBe("ok");
  });

  it("a saved place nearer the start and off the way is an equally good origin (Rachel, 27 Aug)", () => {
    // Home 0.2 mi north of the start: not on the way from the previous end.
    const home = { id: "h", name: "Home", latitude: START.lat + 0.003, longitude: START.lng, radiusMeters: 50 };
    expect(reason({ ...base(), savedLocations: [home] })).toBe("closer_saved_place");
    // A client's house the car drives past between the two: on the way, fine.
    const onTheWay = { id: "c", name: "Client", latitude: PREV_END.lat, longitude: PREV_END.lng + 0.007, radiusMeters: 50 };
    expect(reason({ ...base(), savedLocations: [onTheWay] })).toBe("ok");
    // Farther from the start than the previous end: not a rival origin.
    const farAway = { id: "f", name: "Gym", latitude: START.lat + 0.03, longitude: START.lng, radiusMeters: 50 };
    expect(reason({ ...base(), savedLocations: [farAway] })).toBe("ok");
  });

  it("routing must have answered, and plausibly", () => {
    expect(reason({ ...base(), routeMiles: null })).toBe("route_unavailable");
    expect(reason({ ...base(), routeSecs: null })).toBe("route_unavailable");
    expect(reason({ ...base(), routeMiles: 0.4 })).toBe("route_implausible");
    expect(reason({ ...base(), routeMiles: 1.3 })).toBe("route_too_long_for_crow");
    expect(reason({ ...base(), routeMiles: 1.19 })).toBe("ok");
  });

  it("the gap must be long enough to have driven the stretch", () => {
    expect(reason({ ...base(), routeSecs: 541 })).toBe("gap_shorter_than_drive");
  });

  it("no other trip may sit in the stretch", () => {
    const inGap = { id: "other", startedAt: sec(T_START, -120), endedAt: sec(T_START, -30) };
    expect(reason({ ...base(), otherTrips: [inGap] })).toBe("overlaps_other_trip");
    const beforeStretch = { id: "other", startedAt: sec(T_START, -500), endedAt: sec(T_START, -400) };
    expect(reason({ ...base(), otherTrips: [beforeStretch] })).toBe("ok");
    // prev and the trip itself never count
    expect(reason({ ...base(), otherTrips: [{ id: "prev", startedAt: T_END, endedAt: T_START }] })).toBe("ok");
  });
});

describe("the phone's planted departure anchor (speed 0, accuracy 50)", () => {
  const reason = (args: Parameters<typeof judgeLateStart>[0]) => {
    const d = judgeLateStart(args);
    return d.ok ? "ok" : d.reason;
  };
  const anchorAt = (lat: number, lng: number) => ({ lat, lng, speed: 0, accuracy: 50, recordedAt: sec(T_START, -30) });

  it("is split off and never taken as a recorded fix", () => {
    const t = trip();
    const a = anchorAt(PREV_END.lat, PREV_END.lng);
    const { anchor, real } = splitPlantedAnchor([a, ...t.firstFixes]);
    expect(anchor).toBe(a);
    expect(real).toEqual(t.firstFixes);
    expect(splitPlantedAnchor(t.firstFixes).anchor).toBeNull();
    // A real fix at speed 0 with another accuracy is not an anchor
    expect(splitPlantedAnchor([{ ...a, accuracy: 49 }]).anchor).toBeNull();
  });

  it("near the previous end: the phone already put the start back", () => {
    const t = trip();
    t.firstFixes = [anchorAt(PREV_END.lat, PREV_END.lng + 0.001), ...t.firstFixes];
    expect(reason({ ...base(), trip: t })).toBe("anchor_backfilled");
  });

  it("far from the previous end: suspicious, hands off (the 240 mph 'moving' rows of 4 Oct)", () => {
    const t = trip();
    // anchor 2 mi from the first real fix, 30 s before it
    t.firstFixes = [anchorAt(START.lat + 0.029, START.lng), ...t.firstFixes];
    expect(reason({ ...base(), trip: t })).toBe("anchor_mismatch");
    // also when the anchor sits by the start: the car was parked there, not at the previous end
    const u = trip();
    u.firstFixes = [anchorAt(START.lat + 0.0005, START.lng), ...u.firstFixes];
    expect(reason({ ...base(), trip: u })).toBe("anchor_mismatch");
  });
});

describe("movingAtFirstRealFix", () => {
  const fix = (lngOffset: number, s: number, speed: number | null = null) => ({
    lat: START.lat, lng: START.lng + lngOffset, speed, recordedAt: sec(T_START, s),
  });
  it("stored speed of 4 m/s or more is moving", () => {
    expect(movingAtFirstRealFix([fix(0, 0, 5)])).toBe(true);
  });
  it("implied speed between 9 and 90 mph is moving", () => {
    expect(movingAtFirstRealFix([fix(0, 0), fix(0.002, 12)])).toBe(true); // ~25 mph
  });
  it("implied speed over 90 mph is unknown, not moving", () => {
    // ~2 mi in 30 s = 240 mph
    expect(movingAtFirstRealFix([fix(0, 0), fix(0.0474, 30)])).toBeNull();
    expect(movingAtFirstRealFix([fix(0, 0, 0), fix(0.0474, 30)])).toBeNull();
  });
  it("slow is not moving; nothing to judge is unknown", () => {
    expect(movingAtFirstRealFix([fix(0, 0, 0.5), fix(0.0001, 30)])).toBe(false);
    expect(movingAtFirstRealFix([])).toBeNull();
  });
  it("a trip whose only motion evidence is a jump is not backfilled", () => {
    const t = trip({ firstFixes: [
      { lat: START.lat, lng: START.lng, speed: null, accuracy: 8, recordedAt: T_START },
      { lat: START.lat, lng: START.lng + 0.0474, speed: null, accuracy: 8, recordedAt: sec(T_START, 30) },
    ] });
    const d = judgeLateStart({ ...base(), trip: t });
    expect(d.ok ? "ok" : d.reason).toBe("not_moving_at_first_fix");
  });
});

describe("precheckLateStart", () => {
  it("passes the df0a037d case without a route", () => {
    expect(precheckLateStart({ trip: trip(), prev: prev(), savedLocations: [], offerDecided: false })).toBeNull();
  });
});

describe("prependPolyline", () => {
  it("joins the stretch onto the front of the stored route", () => {
    const a = encodePolyline([{ lat: 52.4, lng: -1.95 }, { lat: 52.4, lng: -1.94 }]);
    const b = encodePolyline([{ lat: 52.4, lng: -1.9358 }, { lat: 52.41, lng: -1.93 }]);
    const joined = decodePolyline(prependPolyline(a, b)!);
    expect(joined).toHaveLength(4);
    expect(joined[0]).toEqual({ lat: 52.4, lng: -1.95 });
    expect(joined[3]).toEqual({ lat: 52.41, lng: -1.93 });
  });
  it("null when either side is missing, so the map uses the breadcrumbs", () => {
    expect(prependPolyline(null, "abc")).toBeNull();
    expect(prependPolyline("abc", null)).toBeNull();
  });
});
