/**
 * Correcting where a journey began.
 *
 * Rachel Thorndyke asked for this twice: the engine arms a few hundred metres
 * into a drive, so the trip is recorded as starting at the roadside rather than
 * at the farm she left. Moving the pin has to ADD the missing stretch to a
 * tracked trip, not re-derive the whole thing as a straight line between two
 * points, which would throw away the route she actually drove.
 */
import { describe, it, expect } from "vitest";
import {
  resolveStartEdit,
  START_EDIT_MAX_MILES,
  type StartEditTrip,
} from "../../services/tripStartEdit.js";

const MAYDALE = { lat: 53.68894, lng: -0.31185 };
// Where her engine actually woke, 0.19 mi down the road.
const ROADSIDE = { lat: 53.68869, lng: -0.30706 };

const tracked: StartEditTrip = {
  startLat: ROADSIDE.lat,
  startLng: ROADSIDE.lng,
  startedAt: new Date("2026-08-27T16:56:00Z"),
  hasCoordinates: true,
};
const manual: StartEditTrip = { ...tracked, hasCoordinates: false };

describe("resolveStartEdit - tracked trips", () => {
  it("adds the routed stretch in front of the recorded route", () => {
    const d = resolveStartEdit({
      trip: tracked,
      newLat: MAYDALE.lat,
      newLng: MAYDALE.lng,
      routeMiles: 0.27,
      routeSecs: 60,
    });
    expect(d).toMatchObject({ ok: true, addedMiles: 0.27 });
    if (!d.ok) throw new Error("expected a plan");
    expect(d.prependCoordinate).toMatchObject({ lat: MAYDALE.lat, lng: MAYDALE.lng });
  });

  it("dates the new breadcrumb before the recording started, not after", () => {
    const d = resolveStartEdit({
      trip: tracked,
      newLat: MAYDALE.lat,
      newLng: MAYDALE.lng,
      routeMiles: 0.27,
      routeSecs: 60,
    });
    if (!d.ok || !d.prependCoordinate) throw new Error("expected a plan");
    expect(d.prependCoordinate.recordedAt.getTime()).toBe(
      tracked.startedAt.getTime() - 60_000
    );
  });

  it("leaves the distance alone when no router could price the stretch", () => {
    const d = resolveStartEdit({
      trip: tracked,
      newLat: MAYDALE.lat,
      newLng: MAYDALE.lng,
      routeMiles: null,
    });
    expect(d).toMatchObject({ ok: false, reason: "route_unavailable" });
  });

  it("rejects a route shorter than the straight line between the two points", () => {
    const d = resolveStartEdit({
      trip: tracked,
      newLat: MAYDALE.lat,
      newLng: MAYDALE.lng,
      routeMiles: 0.05,
    });
    expect(d).toMatchObject({ ok: false, reason: "route_implausible" });
  });

  it("rejects a wildly long route for a short hop", () => {
    const d = resolveStartEdit({
      trip: tracked,
      newLat: MAYDALE.lat,
      newLng: MAYDALE.lng,
      routeMiles: 40,
    });
    expect(d).toMatchObject({ ok: false, reason: "route_implausible" });
  });
});

describe("resolveStartEdit - manual trips", () => {
  it("plans no breadcrumb and no added miles: the caller re-routes end to end", () => {
    const d = resolveStartEdit({
      trip: manual,
      newLat: MAYDALE.lat,
      newLng: MAYDALE.lng,
      routeMiles: null,
    });
    expect(d).toMatchObject({ ok: true, addedMiles: 0 });
    if (!d.ok) throw new Error("expected a plan");
    expect(d.prependCoordinate).toBeNull();
  });
});

describe("resolveStartEdit - bounds", () => {
  it("treats a pin nudged a few metres as no change at all", () => {
    const d = resolveStartEdit({
      trip: tracked,
      newLat: ROADSIDE.lat + 0.0001,
      newLng: ROADSIDE.lng,
      routeMiles: 0.3,
    });
    expect(d).toMatchObject({ ok: false, reason: "same_place" });
  });

  it("refuses to price a pin dropped across the county", () => {
    // A fat finger on a zoomed-out map must not add fifty miles to a tax
    // return. The caller still moves the label; only the mileage stays put.
    const d = resolveStartEdit({
      trip: tracked,
      newLat: ROADSIDE.lat + 1,
      newLng: ROADSIDE.lng,
      routeMiles: 70,
    });
    expect(d).toMatchObject({ ok: false, reason: "too_far" });
    expect(d.crowMiles).toBeGreaterThan(START_EDIT_MAX_MILES);
  });
});
