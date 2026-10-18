import { describe, it, expect } from "vitest";
import {
  addRecentDestination,
  calmFigures,
  directionsReportPrefix,
  inGreatBritain,
  initialMovingLock,
  isNight,
  nextZoom,
  recordingChip,
  shouldCloseAfterArrival,
  shouldOfferResume,
  thinLine,
  updateMovingLock,
  zoomNearManoeuvre,
  type SavedSession,
} from "../rules";
import { bridgeShouldRun, BRIDGE_QUIET_MS } from "../bridgeRule";
import { countsOnly } from "../countsOnly";
import { previewErrorCopy, rerouteFailureBody } from "../errorCopy";

const MPH = 0.44704;

describe("Great Britain only (checked on the phone)", () => {
  it.each([
    ["Sunderland", 54.906, -1.383, true],
    ["Newcastle", 54.978, -1.617, true],
    ["Land's End", 50.066, -5.714, true],
    ["St David's", 51.882, -5.27, true],
    ["Campbeltown (Kintyre)", 55.425, -5.605, true],
    ["Stranraer", 54.903, -5.024, true],
    ["Thurso", 58.594, -3.527, true],
    ["Dover", 51.129, 1.31, true],
    ["Belfast", 54.597, -5.93, false],
    ["Larne", 54.85, -5.82, false],
    ["Ballycastle", 55.205, -6.24, false],
    ["Dublin", 53.35, -6.26, false],
    ["Douglas, Isle of Man", 54.15, -4.48, false],
    ["St Helier, Jersey", 49.186, -2.106, false],
    ["Isles of Scilly", 49.915, -6.31, false],
    ["Calais", 50.95, 1.86, false],
  ])("%s", (_n, lat, lng, inGb) => expect(inGreatBritain({ lat, lng })).toBe(inGb));
});

describe("search lock while moving", () => {
  it("locks at 10 mph, unlocks after 5 s below 3 mph", () => {
    let l = updateMovingLock(initialMovingLock, 12 * MPH, 0);
    expect(l.locked).toBe(true);
    l = updateMovingLock(l, 6 * MPH, 1000);
    expect(l.locked).toBe(true);
    l = updateMovingLock(l, 1 * MPH, 2000);
    l = updateMovingLock(l, 1 * MPH, 6000);
    expect(l.locked).toBe(true);
    l = updateMovingLock(l, 1 * MPH, 7001);
    expect(l.locked).toBe(false);
    expect(updateMovingLock(initialMovingLock, 9 * MPH, 0).locked).toBe(false);
  });
});

describe("camera zoom", () => {
  it("by speed band, at most every 5 s, one step in near a junction", () => {
    let z = nextZoom(null, 20 * MPH, 0);
    expect(z.level).toBe(17);
    z = nextZoom(z, 60 * MPH, 1000);
    expect(z.level).toBe(17);
    z = nextZoom(z, 60 * MPH, 6000);
    expect(z.level).toBe(15);
    expect(nextZoom(z, 40 * MPH, 12_000).level).toBe(16);
    expect(zoomNearManoeuvre(16, 100)).toBe(17);
    expect(zoomNearManoeuvre(16, 400)).toBe(16);
  });
});

describe("night map", () => {
  const sunderland = { lat: 54.906, lng: -1.383 };
  it("dark at night, light by day, through the year", () => {
    expect(isNight(sunderland, new Date(Date.UTC(2026, 9, 18, 12, 0)))).toBe(false);
    expect(isNight(sunderland, new Date(Date.UTC(2026, 9, 18, 22, 0)))).toBe(true);
    expect(isNight(sunderland, new Date(Date.UTC(2026, 11, 21, 16, 30)))).toBe(true);
    expect(isNight(sunderland, new Date(Date.UTC(2026, 5, 21, 19, 30)))).toBe(false);
    expect(isNight(sunderland, new Date(Date.UTC(2026, 5, 21, 2, 0)))).toBe(true);
  });
});

describe("resume after the app was closed", () => {
  const s: SavedSession = {
    destination: { lat: 54.9, lng: -1.38, label: "Home" },
    startedAtMs: 0,
    updatedAtMs: 1_000_000,
    remaining: [
      [54.95, -1.5],
      [54.9, -1.38],
    ],
  };
  it("within 30 minutes and 2 km of the rest of the route", () => {
    expect(shouldOfferResume(s, 1_000_000 + 29 * 60_000, { lat: 54.951, lng: -1.501 })).toBe(true);
    expect(shouldOfferResume(s, 1_000_000 + 31 * 60_000, { lat: 54.951, lng: -1.501 })).toBe(false);
    expect(shouldOfferResume(s, 1_000_000, { lat: 55.2, lng: -1.5 })).toBe(false);
    expect(shouldOfferResume(s, 1_000_000, null)).toBe(true);
    expect(shouldOfferResume(null, 0, null)).toBe(false);
  });
  it("the stored route is thinned and keeps its end", () => {
    const line: Array<[number, number]> = Array.from({ length: 1000 }, (_, i) => [i, i]);
    const t = thinLine(line, 100, 60);
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t[0]).toEqual([100, 100]);
    expect(t.at(-1)).toEqual([999, 999]);
  });
});

describe("recent destinations", () => {
  it("newest first, the same spot once, at most 5", () => {
    let l = [] as ReturnType<typeof addRecentDestination>;
    for (let i = 0; i < 7; i++) l = addRecentDestination(l, { lat: 54 + i * 0.01, lng: -1.4, label: `P${i}`, atMs: i });
    expect(l.map((d) => d.label)).toEqual(["P6", "P5", "P4", "P3", "P2"]);
    l = addRecentDestination(l, { lat: 54.04, lng: -1.4, label: "P4 again", atMs: 9 });
    expect(l.map((d) => d.label)).toEqual(["P4 again", "P6", "P5", "P3", "P2"]);
  });
});

describe("arrived", () => {
  it("closes after 60 s, or once the car is 300 m away", () => {
    expect(shouldCloseAfterArrival({ arrivedAtMs: 0, nowMs: 59_000, distanceFromDestination: 20 })).toBe(false);
    expect(shouldCloseAfterArrival({ arrivedAtMs: 0, nowMs: 60_000, distanceFromDestination: 20 })).toBe(true);
    expect(shouldCloseAfterArrival({ arrivedAtMs: 0, nowMs: 5_000, distanceFromDestination: 320 })).toBe(true);
  });
});

describe("recording chip (read-only)", () => {
  it("Recording, Recording is off, or nothing", () => {
    expect(recordingChip({ auto_recording_active: "1" }, 0)).toBe("recording");
    expect(recordingChip({ active_shift_id: "s1" }, 0)).toBe("recording");
    expect(recordingChip({ drive_pause_until: "5000" }, 1000)).toBe("off");
    expect(recordingChip({ drive_pause_until: "500" }, 1000)).toBeNull();
    expect(recordingChip({ drive_detection_enabled: "0" }, 0)).toBe("off");
    expect(recordingChip({}, 0)).toBeNull();
  });
});

describe("calm bottom-bar figures", () => {
  it("change at most every 30 s; arrival only when it moves a minute", () => {
    const a = calmFigures(null, { remainingSeconds: 600, remainingMeters: 9000 }, 0);
    expect(calmFigures(a, { remainingSeconds: 590, remainingMeters: 8800 }, 10_000)).toBe(a);
    const b = calmFigures(a, { remainingSeconds: 570, remainingMeters: 8000 }, 30_000);
    expect(b.remainingMeters).toBe(8000);
    expect(b.arrivalMs).toBe(a.arrivalMs);
  });
});

describe("foreground bridge rule", () => {
  const base = { focused: true, appActive: true, nowMs: 10_000, lastRecorderAtMs: null, listeningSinceMs: 0 };
  it("runs only on screen, in the foreground, after 4 s with no recorder fix", () => {
    expect(bridgeShouldRun(base)).toBe(true);
    expect(bridgeShouldRun({ ...base, listeningSinceMs: 10_000 - BRIDGE_QUIET_MS + 1 })).toBe(false);
    expect(bridgeShouldRun({ ...base, lastRecorderAtMs: 9_000 })).toBe(false);
    expect(bridgeShouldRun({ ...base, lastRecorderAtMs: 5_000 })).toBe(true);
    expect(bridgeShouldRun({ ...base, focused: false })).toBe(false);
    expect(bridgeShouldRun({ ...base, appActive: false })).toBe(false);
  });
});

describe("telemetry is counts only", () => {
  it("drops places, addresses and free text", () => {
    expect(
      countsOnly({
        miles: 11.234,
        reroutes: 2,
        muted: false,
        code: "NO_ROUTE",
        label: "14 Grange Road, Sunderland",
        lat: "54.9" as unknown as string,
        street: "Park Lane",
      })
    ).toEqual({ miles: 11.2, reroutes: 2, muted: false, code: "NO_ROUTE" });
  });
});

describe("error copy (DESIGN 2.8)", () => {
  it("every error has a way on, and Maps where a route could still be had", () => {
    for (const e of ["OFFLINE", "ROUTING_UNAVAILABLE", "NO_ROUTE", "BAD_INPUT", "NAVIGATION_NOT_ENABLED", "TOO_MANY_REQUESTS", "NO_PERMISSION", "OUTSIDE_GB", "NO_FIX", "UNKNOWN"] as const) {
      const c = previewErrorCopy(e, "Apple Maps");
      expect(c.actions.length).toBeGreaterThan(0);
      expect(c.title).not.toMatch(/—|!/);
    }
    expect(previewErrorCopy("ROUTING_UNAVAILABLE", "Google Maps").body).toBe("Try again in a minute, or use Google Maps for this one.");
    expect(previewErrorCopy("OUTSIDE_GB", "Apple Maps").title).toBe("Directions only cover Great Britain");
    expect(previewErrorCopy("NO_ROUTE", "Apple Maps").actions).toContain("open_maps");
    expect(rerouteFailureBody("OFFLINE")).toBe("No internet for a new route. We'll keep trying.");
  });
});

describe("problem reports", () => {
  it("carry the session and route ids only", () => {
    expect(directionsReportPrefix("dir_abc:route-1")).toBe("[Directions test, dir_abc:route-1]");
    expect(directionsReportPrefix("dir_abc<b>&x=1")).toBe("[Directions test, dir_abcbx1]");
    expect(directionsReportPrefix(undefined)).toBe("[Directions test]");
  });
});
