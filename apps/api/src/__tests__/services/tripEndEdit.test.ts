/**
 * Correcting where a journey ended.
 *
 * Chris Saunders (17 Sep 2026): the phone finalised his recording at a long
 * red light on West Wycombe Road and the last 0.8 miles home went unrecorded.
 * Moving the end pin has to ADD that stretch to the recorded trip, not
 * re-derive the whole thing as a route between two points, and the breadcrumb
 * that stands in for it has to sit after the recording's last point.
 */
import { describe, it, expect } from "vitest";
import {
  resolveEndEdit,
  appendedBreadcrumbTime,
  END_EDIT_MAX_MILES,
  type EndEditTrip,
} from "../../services/tripEndEdit.js";

// Where the phone decided the trip was over: the lights on West Wycombe Road.
const LIGHTS = { lat: 51.64, lng: -0.78105 };
// Home, 0.6 mi as the crow flies and about 0.8 by road.
const HOME = { lat: 51.64837, lng: -0.7753 };

const recorded: EndEditTrip = {
  endLat: LIGHTS.lat,
  endLng: LIGHTS.lng,
  startedAt: new Date("2026-09-17T14:20:00Z"),
  endedAt: new Date("2026-09-17T14:35:00Z"),
};

describe("resolveEndEdit - a plausible extension", () => {
  it("adds the routed stretch after the recorded route", () => {
    const d = resolveEndEdit({
      trip: recorded,
      newLat: HOME.lat,
      newLng: HOME.lng,
      routeMiles: 0.82,
      routeSecs: 180,
    });
    expect(d).toMatchObject({ ok: true, addedMiles: 0.82 });
    if (!d.ok) throw new Error("expected a plan");
    expect(d.appendCoordinate).toMatchObject({ lat: HOME.lat, lng: HOME.lng });
  });

  it("dates the new breadcrumb after the recording stopped, by the drive time", () => {
    const d = resolveEndEdit({
      trip: recorded,
      newLat: HOME.lat,
      newLng: HOME.lng,
      routeMiles: 0.82,
      routeSecs: 180,
    });
    if (!d.ok) throw new Error("expected a plan");
    expect(d.appendCoordinate.recordedAt.getTime()).toBe(
      recorded.endedAt!.getTime() + 180_000
    );
  });

  it("dates the breadcrumb at the new end time when the driver gives one", () => {
    const d = resolveEndEdit({
      trip: recorded,
      newLat: HOME.lat,
      newLng: HOME.lng,
      newEndedAt: new Date("2026-09-17T14:40:00Z"),
      routeMiles: 0.82,
      routeSecs: 180,
    });
    if (!d.ok) throw new Error("expected a plan");
    expect(d.appendCoordinate.recordedAt).toEqual(new Date("2026-09-17T14:40:00Z"));
  });

  it("times the breadcrumb at an urban pace when routing gave no duration", () => {
    const d = resolveEndEdit({
      trip: recorded,
      newLat: HOME.lat,
      newLng: HOME.lng,
      routeMiles: 1,
      routeSecs: null,
    });
    if (!d.ok) throw new Error("expected a plan");
    // 1 mile at 20 mph is 3 minutes.
    expect(d.appendCoordinate.recordedAt.getTime()).toBe(
      recorded.endedAt!.getTime() + 180_000
    );
  });

  it("falls back to the start time when the recording never had an end", () => {
    const d = resolveEndEdit({
      trip: { ...recorded, endedAt: null },
      newLat: HOME.lat,
      newLng: HOME.lng,
      routeMiles: 0.82,
      routeSecs: 180,
    });
    if (!d.ok) throw new Error("expected a plan");
    expect(d.appendCoordinate.recordedAt.getTime()).toBe(
      recorded.startedAt.getTime() + 180_000
    );
  });
});

describe("appendedBreadcrumbTime", () => {
  const recordedEnd = new Date("2026-09-17T14:35:00Z");

  it("never sits after the new end time", () => {
    // Routing says three minutes, the driver says they arrived one minute later.
    const at = appendedBreadcrumbTime({
      recordedEnd,
      routeSecs: 180,
      newEndedAt: new Date("2026-09-17T14:36:00Z"),
    });
    expect(at).toEqual(new Date("2026-09-17T14:36:00Z"));
  });

  it("never sits before the recording's last point, whatever the new end time says", () => {
    // A new end time at or before the recorded end would break the trail's
    // order, so the floor wins over the cap.
    const at = appendedBreadcrumbTime({
      recordedEnd,
      routeSecs: 180,
      newEndedAt: new Date("2026-09-17T14:30:00Z"),
    });
    expect(at.getTime()).toBeGreaterThan(recordedEnd.getTime());
  });
});

describe("resolveEndEdit - when the distance stays put", () => {
  it("leaves the distance alone when no router could price the stretch", () => {
    const d = resolveEndEdit({
      trip: recorded,
      newLat: HOME.lat,
      newLng: HOME.lng,
      routeMiles: null,
    });
    expect(d).toMatchObject({ ok: false, reason: "route_unavailable" });
  });

  it("rejects a route shorter than the straight line between the two points", () => {
    const d = resolveEndEdit({
      trip: recorded,
      newLat: HOME.lat,
      newLng: HOME.lng,
      routeMiles: 0.2,
    });
    expect(d).toMatchObject({ ok: false, reason: "route_implausible" });
  });

  it("rejects a wildly long route for a short hop", () => {
    const d = resolveEndEdit({
      trip: recorded,
      newLat: HOME.lat,
      newLng: HOME.lng,
      routeMiles: 40,
    });
    expect(d).toMatchObject({ ok: false, reason: "route_implausible" });
  });

  it("treats a pin nudged a few metres as no change at all", () => {
    const d = resolveEndEdit({
      trip: recorded,
      newLat: LIGHTS.lat + 0.0001,
      newLng: LIGHTS.lng,
      routeMiles: 0.3,
    });
    expect(d).toMatchObject({ ok: false, reason: "same_place" });
  });

  it("refuses to price a pin dropped across the county", () => {
    // A fat finger on a zoomed-out map must not add fifty miles to a tax
    // return. The caller still moves the pin; only the mileage stays put.
    const d = resolveEndEdit({
      trip: recorded,
      newLat: LIGHTS.lat + 1,
      newLng: LIGHTS.lng,
      routeMiles: 70,
    });
    expect(d).toMatchObject({ ok: false, reason: "too_far" });
    expect(d.crowMiles).toBeGreaterThan(END_EDIT_MAX_MILES);
  });
});
