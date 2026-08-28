import { describe, it, expect } from "vitest";
import { resolveWakeLagStart } from "../../services/wakeLagStart.js";

// Home (saved location, 50 m radius) and a point ~0.3 mi east of it.
// At lat 51.5, one degree of longitude is ~43 mi, so 0.007 deg is ~0.30 mi.
const HOME = { lat: 51.5, lng: -0.12 };
const home = { id: "home", latitude: HOME.lat, longitude: HOME.lng, radiusMeters: 50 };
const savedLocations = [home];

const T0 = new Date("2026-08-25T08:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

function prev(overrides: Partial<Parameters<typeof resolveWakeLagStart>[0]["prevTrip"] & object> = {}) {
  return {
    id: "prev",
    endedAt: T0,
    endLat: HOME.lat,
    endLng: HOME.lng,
    endAddress: "12 Home Street",
    ...overrides,
  };
}

function next(overrides: Partial<Parameters<typeof resolveWakeLagStart>[0]["newTrip"]> = {}) {
  return {
    startedAt: minutes(30),
    startLat: HOME.lat,
    startLng: HOME.lng + 0.007, // ~0.30 mi east
    isManualEntry: false,
    hasCoordinates: true,
    ...overrides,
  };
}

describe("resolveWakeLagStart", () => {
  it("fires for a 0.3 mi wake-lag hop from a saved Home, 30 min after the last trip", () => {
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next(),
      savedLocations,
      routeMiles: 0.36,
      routeSecs: 90,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.startLat).toBe(HOME.lat);
    expect(d.startLng).toBe(HOME.lng);
    expect(d.startAddress).toBe("12 Home Street");
    expect(d.addedMiles).toBe(0.36);
    expect(d.crowMiles).toBeCloseTo(0.3, 1);
    expect(d.gapMin).toBe(30);
    expect(d.savedLocationId).toBe("home");
    expect(d.prependCoordinate.lat).toBe(HOME.lat);
    expect(d.prependCoordinate.recordedAt.getTime()).toBe(minutes(30).getTime() - 90_000);
  });

  it("fires with no saved location when the previous end has an address", () => {
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next(),
      savedLocations: [],
      routeMiles: 0.35,
    });
    expect(d.ok).toBe(true);
  });

  it("skips when the previous end is neither a saved location nor addressed", () => {
    const d = resolveWakeLagStart({
      prevTrip: prev({ endAddress: null }),
      newTrip: next(),
      savedLocations: [],
      routeMiles: 0.35,
    });
    expect(d).toMatchObject({ ok: false, reason: "prev_end_not_a_stop" });
  });

  it("skips when the hop is under 0.15 mi", () => {
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next({ startLng: HOME.lng + 0.002 }), // ~0.09 mi
      savedLocations,
      routeMiles: 0.1,
    });
    expect(d).toMatchObject({ ok: false, reason: "gap_below_min" });
  });

  it("refuses a hop of 0.6 mi or more, however wake-lag-shaped it looks", () => {
    // The ceiling went to 0.9 on 27 Aug and came back the next morning. A gap
    // this wide is as often an unrecorded leg as a late-arming engine, and
    // guessing wrong writes a journey the driver never made into a tax record.
    // Above the ceiling the gap goes to the Missed Journeys card instead, where
    // they can accept it.
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next({ startLng: HOME.lng + 0.019 }), // ~0.82 mi
      savedLocations,
      routeMiles: 0.9,
    });
    expect(d).toMatchObject({ ok: false, reason: "gap_above_max" });
  });

  it("still covers the ordinary wake lag the engine actually produces", () => {
    // 0.3-0.4 mi is the designed arming distance, and the common case.
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next({ startLng: HOME.lng + 0.009 }), // ~0.39 mi
      savedLocations,
      routeMiles: 0.45,
    });
    expect(d).toMatchObject({ ok: true });
  });

  it("skips manual entries", () => {
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next({ isManualEntry: true, hasCoordinates: false }),
      savedLocations,
      routeMiles: 0.36,
    });
    expect(d).toMatchObject({ ok: false, reason: "manual_entry" });
  });

  it("skips when the gap is under 5 minutes", () => {
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next({ startedAt: minutes(4) }),
      savedLocations,
      routeMiles: 0.36,
    });
    expect(d).toMatchObject({ ok: false, reason: "gap_too_short" });
  });

  it("skips when the gap is over 24 hours", () => {
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next({ startedAt: minutes(24 * 60 + 1) }),
      savedLocations,
      routeMiles: 0.36,
    });
    expect(d).toMatchObject({ ok: false, reason: "gap_too_long" });
  });

  it("skips entirely when routing is unavailable (never falls back to crow-flies)", () => {
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next(),
      savedLocations,
      routeMiles: null,
    });
    expect(d).toMatchObject({ ok: false, reason: "route_unavailable" });
  });

  it("skips when the routed figure is wildly off the crow-flies gap", () => {
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next(),
      savedLocations,
      routeMiles: 4.2,
    });
    expect(d).toMatchObject({ ok: false, reason: "route_implausible" });
  });

  it("skips a genuine restart from inside the same saved location, even with a wide radius", () => {
    const wideHome = { ...home, radiusMeters: 400 };
    const d = resolveWakeLagStart({
      prevTrip: prev(),
      newTrip: next({ startLng: HOME.lng + 0.005 }), // ~0.21 mi, inside 400 m + 50 m buffer
      savedLocations: [wideHome],
      routeMiles: 0.25,
    });
    expect(d).toMatchObject({ ok: false, reason: "same_saved_location" });
  });

  it("skips when there is no previous trip or its end is missing", () => {
    expect(resolveWakeLagStart({ prevTrip: null, newTrip: next(), savedLocations, routeMiles: 0.3 }))
      .toMatchObject({ ok: false, reason: "no_prev_trip" });
    expect(resolveWakeLagStart({ prevTrip: prev({ endLat: null }), newTrip: next(), savedLocations, routeMiles: 0.3 }))
      .toMatchObject({ ok: false, reason: "prev_end_missing" });
  });
});
