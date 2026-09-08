/**
 * Tests for the pure parts of the deleted-trip archive: the coordinate cap
 * (newest kept, chronological out) and the archived-JSON to restore-data
 * mapping.
 */
import { describe, it, expect } from "vitest";
import {
  capArchivedCoordinates,
  toArchivedCoordinate,
  restoreDataFromTripJson,
  ARCHIVE_COORDINATE_CAP,
} from "../../services/tripArchive.js";

function coord(i: number) {
  return {
    lat: 51 + i / 1000,
    lng: -1 + i / 1000,
    speed: i,
    accuracy: 5,
    recordedAt: new Date(Date.UTC(2026, 8, 1, 10, 0, i)),
  };
}

describe("capArchivedCoordinates", () => {
  it("returns everything in chronological order when under the cap", () => {
    const input = [coord(3), coord(1), coord(2)];
    const out = capArchivedCoordinates(input, 10);
    expect(out.map((c) => c.speed)).toEqual([1, 2, 3]);
  });

  it("keeps the newest rows when over the cap", () => {
    const input = Array.from({ length: 20 }, (_, i) => coord(i)).reverse();
    const out = capArchivedCoordinates(input, 5);
    expect(out).toHaveLength(5);
    expect(out.map((c) => c.speed)).toEqual([15, 16, 17, 18, 19]);
  });

  it("defaults to the 6000 cap", () => {
    const input = Array.from({ length: ARCHIVE_COORDINATE_CAP + 10 }, (_, i) => coord(i));
    const out = capArchivedCoordinates(input);
    expect(out).toHaveLength(ARCHIVE_COORDINATE_CAP);
    expect(out[0].speed).toBe(10);
    expect(out[out.length - 1].speed).toBe(ARCHIVE_COORDINATE_CAP + 9);
  });

  it("accepts ISO-string recordedAt and does not mutate the input", () => {
    const input = [
      { recordedAt: "2026-09-01T10:00:02.000Z", n: 2 },
      { recordedAt: "2026-09-01T10:00:01.000Z", n: 1 },
    ];
    const snapshot = [...input];
    const out = capArchivedCoordinates(input, 1);
    expect(out.map((c) => c.n)).toEqual([2]);
    expect(input).toEqual(snapshot);
  });

  it("returns an empty array for a non-positive cap", () => {
    expect(capArchivedCoordinates([coord(1)], 0)).toEqual([]);
  });
});

describe("toArchivedCoordinate", () => {
  it("serialises recordedAt to ISO and nulls missing speed/accuracy", () => {
    const out = toArchivedCoordinate({
      lat: 51.5,
      lng: -0.1,
      speed: null,
      accuracy: null,
      recordedAt: new Date("2026-09-01T10:00:00.000Z"),
    });
    expect(out).toEqual({
      lat: 51.5,
      lng: -0.1,
      speed: null,
      accuracy: null,
      recordedAt: "2026-09-01T10:00:00.000Z",
    });
  });
});

describe("restoreDataFromTripJson", () => {
  const archived = {
    id: "old-id",
    userId: "user-1",
    vehicleId: "veh-1",
    shiftId: "shift-1",
    startLat: 51.5,
    startLng: -0.1,
    endLat: 52.0,
    endLng: -0.5,
    startAddress: "Oxted",
    endAddress: "Edenbridge",
    distanceMiles: 48.2,
    startedAt: "2026-09-01T08:00:00.000Z",
    endedAt: "2026-09-01T09:10:00.000Z",
    isManualEntry: false,
    classification: "business",
    platformTag: "uber",
    notes: "Commute",
    routePolyline: "abc",
    gpsQuality: { rawCount: 400, keptCount: 380 },
    coordinateCount: 380,
    createdAt: "2026-09-01T09:11:00.000Z",
    updatedAt: "2026-09-01T09:11:00.000Z",
    odometerStart: 1000,
    odometerEnd: 1048,
  };

  it("maps the restorable fields and drops identity/audit columns", () => {
    const data = restoreDataFromTripJson(archived) as Record<string, unknown>;
    expect(data.startedAt).toEqual(new Date(archived.startedAt));
    expect(data.endedAt).toEqual(new Date(archived.endedAt));
    expect(data.distanceMiles).toBe(48.2);
    expect(data.startAddress).toBe("Oxted");
    expect(data.endAddress).toBe("Edenbridge");
    expect(data.classification).toBe("business");
    expect(data.platformTag).toBe("uber");
    expect(data.notes).toBe("Commute");
    expect(data.routePolyline).toBe("abc");
    expect(data.gpsQuality).toEqual({ rawCount: 400, keptCount: 380 });
    expect(data.odometerEnd).toBe(1048);
    expect(data).not.toHaveProperty("id");
    expect(data).not.toHaveProperty("userId");
    expect(data).not.toHaveProperty("vehicleId");
    expect(data).not.toHaveProperty("shiftId");
    expect(data).not.toHaveProperty("createdAt");
    expect(data).not.toHaveProperty("coordinateCount");
  });

  it("throws when the archived row has no usable start", () => {
    expect(() => restoreDataFromTripJson({ ...archived, startedAt: "not a date" })).toThrow();
    expect(() => restoreDataFromTripJson({ ...archived, startLat: null })).toThrow();
  });

  it("falls back to unclassified and null endedAt", () => {
    const data = restoreDataFromTripJson({
      startLat: 1,
      startLng: 2,
      startedAt: "2026-09-01T08:00:00.000Z",
    }) as Record<string, unknown>;
    expect(data.classification).toBe("unclassified");
    expect(data.endedAt).toBeNull();
    expect(data.distanceMiles).toBe(0);
    expect(data.isManualEntry).toBe(false);
  });
});
