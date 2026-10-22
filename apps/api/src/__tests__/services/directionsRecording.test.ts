/**
 * Directions drives (PLAN-recording.md, step 1): the switch, the size cap on
 * the phone's gpsQuality.directions note, and the event fields. The note must
 * never move a trip's start: the wake-lag and late-start rules read the trip
 * exactly as they would without it.
 */
import { describe, it, expect } from "vitest";
import {
  capDirectionsGpsQuality,
  directionsEventFields,
  directionsRecordingFor,
  directionsRecordingMode,
  DIRECTIONS_MAX_BYTES,
  DIRECTIONS_MAX_GAPS,
} from "../../services/directionsRecording.js";
import { SERVER_OWNED_GPS_QUALITY_KEYS, stripServerOwnedGpsQuality } from "../../services/tripEndEdit.js";
import { alreadyExtended, precheckLateStart, type LateStartTrip } from "../../services/lateStart.js";
import { resolveWakeLagStart } from "../../services/wakeLagStart.js";

const logNote = {
  sessionId: "dir_abc123",
  mode: "log",
  destination: { lat: 54.9, lng: -1.6, label: "Depot, Gateshead", name: "Depot", savedLocationId: "loc1", savedType: "depot" },
  wouldFill: { miles: 8.3, gapCount: 1, gaps: [{ fromMs: 1, toMs: 2, miles: 8.3, points: 133 }] },
  wouldName: { use: true, source: "saved", metresBucket: "0-100" },
};

describe("DIRECTIONS_RECORDING", () => {
  it("is off unless set to log or on", () => {
    expect(directionsRecordingMode({})).toBe("off");
    expect(directionsRecordingMode({ DIRECTIONS_RECORDING: "1" })).toBe("off");
    expect(directionsRecordingMode({ DIRECTIONS_RECORDING: "LOG" })).toBe("off");
    expect(directionsRecordingMode({ DIRECTIONS_RECORDING: "log" })).toBe("log");
    expect(directionsRecordingMode({ DIRECTIONS_RECORDING: "on" })).toBe("on");
  });

  it("the profile says off for a driver without Directions, whatever the switch", () => {
    expect(directionsRecordingFor(false, { DIRECTIONS_RECORDING: "on" })).toBe("off");
    expect(directionsRecordingFor(true, { DIRECTIONS_RECORDING: "log" })).toBe("log");
    expect(directionsRecordingFor(true, {})).toBe("off");
  });
});

describe("gpsQuality.directions is the phone's own key", () => {
  it("is not server-owned, so the create keeps it", () => {
    expect(SERVER_OWNED_GPS_QUALITY_KEYS as readonly string[]).not.toContain("directions");
    expect(stripServerOwnedGpsQuality({ directions: logNote, drops: 2 })).toEqual({ directions: logNote, drops: 2 });
  });

  it("a normal note passes unchanged", () => {
    const gq = { maxSpeedMph: 40, directions: logNote };
    expect(capDirectionsGpsQuality(gq)).toEqual(gq);
  });

  it("no note: the same object back", () => {
    const gq = { maxSpeedMph: 40 };
    expect(capDirectionsGpsQuality(gq)).toBe(gq);
    expect(capDirectionsGpsQuality(undefined)).toBeUndefined();
  });

  it("cuts a long gap list to 20 and says how many went", () => {
    const gaps = Array.from({ length: 35 }, (_, i) => ({ fromMs: i, toMs: i + 1, miles: 0.5 }));
    const out = capDirectionsGpsQuality({ directions: { ...logNote, wouldFill: { miles: 17.5, gaps } } });
    const wf = (out.directions as { wouldFill: { gaps: unknown[]; gapsCut: number } }).wouldFill;
    expect(wf.gaps).toHaveLength(DIRECTIONS_MAX_GAPS);
    expect(wf.gapsCut).toBe(15);
  });

  it("an oversized note becomes a small marker; the rest of gpsQuality is kept", () => {
    const out = capDirectionsGpsQuality({ drops: 1, directions: { ...logNote, junk: "x".repeat(DIRECTIONS_MAX_BYTES) } });
    expect(out.drops).toBe(1);
    expect(out.directions).toMatchObject({ tooLarge: true, sessionId: "dir_abc123", mode: "log" });
    expect(JSON.stringify(out.directions).length).toBeLessThan(200);
  });

  it("a note that is not an object is dropped, never a refusal", () => {
    expect(capDirectionsGpsQuality({ drops: 1, directions: "nonsense" })).toEqual({ drops: 1 });
    expect(capDirectionsGpsQuality({ drops: 1, directions: [1, 2] })).toEqual({ drops: 1 });
  });
});

describe("trip.created fields", () => {
  it("counts only, and nothing at all for a trip without a note", () => {
    expect(directionsEventFields(null)).toEqual({});
    expect(directionsEventFields({ maxSpeedMph: 3 })).toEqual({});
    const f = directionsEventFields({ directions: logNote });
    expect(f).toEqual({
      directionsMode: "log",
      directionsOpened: null,
      directionsFilledMiles: null,
      directionsFilledGaps: null,
      directionsWouldFillMiles: 8.3,
      directionsWouldFillGaps: 1,
      directionsNamed: null,
      directionsWouldName: true,
    });
    expect(JSON.stringify(f)).not.toContain("Depot");
    expect(JSON.stringify(f)).not.toContain("54.9");
  });
});

describe("a directions note never moves a trip's start (wake lag, late start)", () => {
  const T_END = new Date("2026-10-01T07:55:00Z");
  const T_START = new Date("2026-10-01T08:04:00Z");
  const prev = {
    id: "prev",
    endedAt: T_END,
    endLat: 52.4,
    endLng: -1.95,
    endAddress: "Work, Bournville",
    vehicleId: "car",
    lastFixAccuracy: 10,
  };
  const trip = (gpsQuality: unknown): LateStartTrip => ({
    id: "trip",
    startedAt: T_START,
    startLat: 52.4,
    startLng: -1.95 + 0.0142,
    vehicleId: "car",
    isManualEntry: false,
    isPhantomTrip: false,
    originalStartLat: null,
    gpsQuality,
    firstFixes: [
      { lat: 52.4, lng: -1.9358, speed: 11, accuracy: 8, recordedAt: T_START },
      { lat: 52.4, lng: -1.9338, speed: 12, accuracy: 8, recordedAt: new Date(T_START.getTime() + 10_000) },
    ],
  });

  it("late start judges the trip the same with or without the note", () => {
    expect(alreadyExtended({ directions: logNote })).toBe(false);
    for (const offerDecided of [false, true]) {
      const without = precheckLateStart({ trip: trip(null), prev, savedLocations: [], offerDecided });
      const withNote = precheckLateStart({ trip: trip({ directions: logNote }), prev, savedLocations: [], offerDecided });
      expect(withNote).toEqual(without);
    }
  });

  it("wake lag never reads gpsQuality: the same decision for the same trip", () => {
    const args = {
      prevTrip: { id: "prev", endedAt: T_END, endLat: 52.4, endLng: -1.95, endAddress: "Work" },
      newTrip: { startedAt: new Date(T_END.getTime() + 30 * 60_000), startLat: 52.4, startLng: -1.943, isManualEntry: false, hasCoordinates: true },
      savedLocations: [],
      routeMiles: 0.35,
    };
    const a = resolveWakeLagStart(args);
    const b = resolveWakeLagStart({ ...args, newTrip: { ...args.newTrip, gpsQuality: { directions: logNote } } as typeof args.newTrip });
    expect(b).toEqual(a);
  });
});
