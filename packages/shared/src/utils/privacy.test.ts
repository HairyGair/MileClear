import { describe, it, expect } from "vitest";
import {
  COORDINATE_REDACTED,
  isCoordinateKey,
  scrubCoordinateString,
  scrubCoordinates,
  scrubDiagnosticEventData,
} from "./privacy.js";

describe("isCoordinateKey", () => {
  it("matches plain and suffixed coordinate keys", () => {
    for (const k of [
      "lat",
      "lng",
      "latitude",
      "longitude",
      "fromLat",
      "toLng",
      "startLatitude",
      "departure_anchor_lat",
      "coords",
      "allCoords",
      "deferredCoords",
      "coordinates",
      "center",
      "centre",
      "anchor",
      "stop_anchor",
      "position",
      "location_lat",
    ]) {
      expect(isCoordinateKey(k), k).toBe(true);
    }
  });

  it("leaves non-location keys alone", () => {
    for (const k of [
      "platform",
      "locationId",
      "locationName",
      "location_type",
      "coordCount",
      "anchorAgeMs",
      "accuracy",
      "speed",
      "lastFixAccuracyMeters",
      "event",
      "recorded_at",
      "radius_meters",
    ]) {
      expect(isCoordinateKey(k), k).toBe(false);
    }
  });
});

describe("scrubCoordinates", () => {
  it("redacts values under coordinate keys and keeps everything else", () => {
    const out = scrubCoordinates({
      event: "anchor_exit_verified",
      fromLat: 51.5074,
      fromLng: -0.1278,
      anchor: { lat: 51.5, lng: -0.1, ageMs: 4000 },
      coords: [
        [51.5, -0.1],
        [51.6, -0.2],
      ],
      coordCount: 2,
      accuracy: 12.5,
      speed: 4.2,
      hasAnchor: true,
      center: null,
      locationId: "abc-123",
    });
    expect(out).toEqual({
      event: "anchor_exit_verified",
      fromLat: COORDINATE_REDACTED,
      fromLng: COORDINATE_REDACTED,
      anchor: COORDINATE_REDACTED,
      coords: { redacted: true, count: 2 },
      coordCount: 2,
      accuracy: 12.5,
      speed: 4.2,
      hasAnchor: true,
      center: null,
      locationId: "abc-123",
    });
  });

  it("scrubs nested structures and arrays of rows", () => {
    const out = scrubCoordinates({
      savedLocations: [
        { id: "1", name: "Home", latitude: 53.1, longitude: -2.9, radius_meters: 100 },
      ],
      trackingState: [{ key: "stop_anchor", value: '{"lat":53.1,"lng":-2.9}' }],
    });
    expect(out.savedLocations[0]).toEqual({
      id: "1",
      name: "Home",
      latitude: COORDINATE_REDACTED,
      longitude: COORDINATE_REDACTED,
      radius_meters: 100,
    });
    expect(out.trackingState[0].value).not.toContain("53.1");
    expect(out.trackingState[0].value).not.toContain("-2.9");
  });

  it("does not mutate the input", () => {
    const input = { lat: 1.5, nested: { lng: 2.5 } };
    const copy = JSON.parse(JSON.stringify(input));
    scrubCoordinates(input);
    expect(input).toEqual(copy);
  });
});

describe("scrubCoordinateString", () => {
  it("redacts labelled coordinates in free text", () => {
    const s = scrubCoordinateString("fix at lat: 51.5074, lng: -0.1278 accuracy 12");
    expect(s).not.toContain("51.5074");
    expect(s).not.toContain("-0.1278");
    expect(s).toContain("accuracy 12");
  });

  it("redacts bare decimal pairs but not single decimals", () => {
    expect(scrubCoordinateString("at 51.5074,-0.1278 going 12.5 mph")).toBe(
      `at ${COORDINATE_REDACTED} going 12.5 mph`
    );
    expect(scrubCoordinateString("accuracy 12.5 speed 3.25")).toBe("accuracy 12.5 speed 3.25");
  });
});

describe("scrubDiagnosticEventData", () => {
  it("handles null and non-JSON", () => {
    expect(scrubDiagnosticEventData(null)).toBeNull();
    expect(scrubDiagnosticEventData(undefined)).toBeNull();
    expect(scrubDiagnosticEventData("lat=51.5074")).not.toContain("51.5074");
  });

  it("scrubs JSON data strings and keeps the rest of the payload", () => {
    const out = scrubDiagnosticEventData(
      JSON.stringify({ reason: "drift", distanceM: 340, lat: 51.5074, lng: -0.1278 })
    );
    const parsed = JSON.parse(out!);
    expect(parsed).toEqual({
      reason: "drift",
      distanceM: 340,
      lat: COORDINATE_REDACTED,
      lng: COORDINATE_REDACTED,
    });
  });
});
