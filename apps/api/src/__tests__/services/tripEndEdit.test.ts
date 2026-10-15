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
  readEndExtension,
  noteStillHolds,
  inferLegacyExtension,
  gpsQualityRetiringEndNote,
  stripServerOwnedGpsQuality,
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

describe("readEndExtension - the note an earlier end edit leaves", () => {
  it("reads a well-formed note", () => {
    const note = {
      recordedEndLat: LIGHTS.lat,
      recordedEndLng: LIGHTS.lng,
      recordedEndedAt: "2026-09-17T14:35:00.000Z",
      addedMiles: 0.82,
      breadcrumbAt: "2026-09-17T14:40:00.000Z",
    };
    expect(readEndExtension({ endExtension: note, other: 1 })).toEqual(note);
  });

  it("ignores a missing, partial or nonsense note", () => {
    expect(readEndExtension(null)).toBeNull();
    expect(readEndExtension({})).toBeNull();
    expect(readEndExtension({ endExtension: { recordedEndLat: 51.6, addedMiles: 1 } })).toBeNull();
    expect(readEndExtension({ endExtension: { recordedEndLat: 51.6, recordedEndLng: -0.7, addedMiles: -1 } })).toBeNull();
    expect(readEndExtension({ endExtension: "nope" })).toBeNull();
  });

  it("drops unreadable times rather than the note", () => {
    const n = readEndExtension({
      endExtension: { recordedEndLat: 51.6, recordedEndLng: -0.7, addedMiles: 1, recordedEndedAt: "x", breadcrumbAt: 5 },
    });
    expect(n).toMatchObject({ addedMiles: 1, recordedEndedAt: null, breadcrumbAt: null });
  });
});

describe("the end-edit note's safety checks", () => {
  const note = {
    recordedEndLat: LIGHTS.lat,
    recordedEndLng: LIGHTS.lng,
    recordedEndedAt: "2026-09-17T14:35:00.000Z",
    addedMiles: 0.82,
    breadcrumbAt: "2026-09-17T14:40:00.000Z",
  };
  const trip = { distanceMiles: 4.22, endedAt: new Date("2026-09-17T14:40:00Z") };

  it("trusts a note that still fits the trip", () => {
    expect(noteStillHolds(note, trip, true)).toBe(true);
  });

  it("refuses a note whose miles the trip no longer holds (a split took them)", () => {
    expect(noteStillHolds(note, { ...trip, distanceMiles: 0.5 }, true)).toBe(false);
  });

  it("still trusts a note when the driver set an end time before the recording's last fix", () => {
    expect(noteStillHolds(note, { ...trip, endedAt: new Date("2026-09-17T14:30:00Z") }, true)).toBe(true);
  });

  it("refuses a note whose stand-in point has gone", () => {
    expect(noteStillHolds(note, trip, false)).toBe(false);
  });

  it("retires a live note to null and leaves the rest alone", () => {
    expect(gpsQualityRetiringEndNote({ a: 1, endExtension: note })).toEqual({ a: 1, endExtension: null });
    expect(gpsQualityRetiringEndNote({ a: 1 })).toBeUndefined();
    expect(gpsQualityRetiringEndNote({ endExtension: null })).toBeUndefined();
  });

  it("strips server-owned keys from what a client sends", () => {
    expect(stripServerOwnedGpsQuality({ a: 1, endExtension: note, appendOutlierCut: {} })).toEqual({ a: 1 });
    expect(stripServerOwnedGpsQuality(undefined)).toBeUndefined();
  });
});

describe("inferLegacyExtension - an end edited before the note existed", () => {
  const real = (t: string, lat = LIGHTS.lat) => ({ lat, lng: LIGHTS.lng, speed: 8, accuracy: 5, recordedAt: new Date(t) });
  const standIn = (t: string, lat = HOME.lat) => ({ lat, lng: HOME.lng, speed: null, accuracy: null, recordedAt: new Date(t) });
  const trip = { distanceMiles: 5.52, endedAt: new Date("2026-09-17T14:50:00Z"), endLat: HOME.lat, endLng: HOME.lng };
  const realTrailMiles = 3.45;

  it("adds up every old stretch when stand-ins and events agree", () => {
    const p = inferLegacyExtension({
      lastFixesDesc: [standIn("2026-09-17T14:50:00Z"), standIn("2026-09-17T14:40:00Z"), real("2026-09-17T14:35:00Z")],
      eventAddedMiles: [0.82, 0, 1.3],
      trip,
      realTrailMiles,
    });
    expect(p).toMatchObject({ recordedEndLat: LIGHTS.lat, addedMiles: 2.12, source: "legacy" });
    expect(p!.breadcrumbs).toHaveLength(2);
  });

  it("gives nothing for a trail that ends on a real fix", () => {
    expect(inferLegacyExtension({ lastFixesDesc: [real("2026-09-17T14:35:00Z")], eventAddedMiles: [0.82], trip, realTrailMiles })).toBeNull();
  });

  it("gives nothing when the counts differ, or no real fix is in view", () => {
    expect(inferLegacyExtension({
      lastFixesDesc: [standIn("2026-09-17T14:40:00Z"), real("2026-09-17T14:35:00Z")],
      eventAddedMiles: [0.82, 1.3],
      trip,
      realTrailMiles,
    })).toBeNull();
    expect(inferLegacyExtension({ lastFixesDesc: [standIn("2026-09-17T14:40:00Z")], eventAddedMiles: [0.82], trip, realTrailMiles })).toBeNull();
  });

  it("gives nothing when the old miles are more than the trip holds", () => {
    expect(inferLegacyExtension({
      lastFixesDesc: [standIn("2026-09-17T14:40:00Z"), real("2026-09-17T14:35:00Z")],
      eventAddedMiles: [9],
      trip,
      realTrailMiles,
    })).toBeNull();
  });

  const oneEdit = {
    lastFixesDesc: [standIn("2026-09-17T14:40:00Z"), real("2026-09-17T14:35:00Z")],
    eventAddedMiles: [0.82],
  };

  it("trusts one old stretch when what is left matches the trail", () => {
    expect(inferLegacyExtension({ ...oneEdit, trip: { ...trip, distanceMiles: 4.22 }, realTrailMiles })).toMatchObject({ addedMiles: 0.82 });
  });

  it("gives nothing when the stored miles were the client's own (a website save that also typed miles)", () => {
    expect(inferLegacyExtension({ ...oneEdit, trip: { ...trip, distanceMiles: 9 }, realTrailMiles })).toBeNull();
    expect(inferLegacyExtension({ ...oneEdit, trip: { ...trip, distanceMiles: 3.6 }, realTrailMiles })).toBeNull();
    expect(inferLegacyExtension({ ...oneEdit, trip: { ...trip, distanceMiles: 4.22 }, realTrailMiles: null })).toBeNull();
  });

  it("gives nothing when the newest stand-in is not exactly where the trip ends", () => {
    expect(inferLegacyExtension({
      ...oneEdit,
      trip: { ...trip, distanceMiles: 4.22, endLat: HOME.lat + 0.0001 },
      realTrailMiles,
    })).toBeNull();
  });
});
