import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { _resetFixBus, hasFixListeners, latestFix, offerFix, subscribeToFixes, toNavFix } from "../fixBus";

const loc = {
  coords: { latitude: 51.45, longitude: -0.97, speed: 12.5, accuracy: 6, heading: 88 },
  timestamp: "2026-10-18T20:00:00.000Z",
};

beforeEach(() => {
  _resetFixBus();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("toNavFix", () => {
  it("reads the recorder's fix", () => {
    expect(toNavFix(loc)).toEqual({
      lat: 51.45,
      lng: -0.97,
      speedMps: 12.5,
      accuracyM: 6,
      headingDeg: 88,
      atMs: Date.parse("2026-10-18T20:00:00.000Z"),
    });
  });
  it("unknown speed and heading (-1 from the phone) become null", () => {
    const f = toNavFix({ coords: { latitude: 1, longitude: 2, speed: -1, accuracy: null, heading: -1 }, timestamp: "bad" }, 42);
    expect(f).toEqual({ lat: 1, lng: 2, speedMps: null, accuracyM: null, headingDeg: null, atMs: 42 });
  });
  it("rubbish is ignored", () => {
    expect(toNavFix({ coords: { latitude: NaN, longitude: 2 } })).toBeNull();
    expect(toNavFix({} as never)).toBeNull();
  });
});

describe("offerFix, as the recorder calls it", () => {
  it("is a no-op with nobody listening, and keeps nothing", () => {
    expect(hasFixListeners()).toBe(false);
    offerFix(loc);
    expect(latestFix(Infinity)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never calls a listener on the recorder's own stack", () => {
    const got: number[] = [];
    subscribeToFixes((f) => got.push(f.lat));
    offerFix(loc);
    expect(got).toEqual([]);
    vi.runAllTimers();
    expect(got).toEqual([51.45]);
  });

  it("a throwing listener cannot reach the recorder or the other listeners", () => {
    const got: number[] = [];
    subscribeToFixes(() => {
      throw new Error("guidance bug");
    });
    subscribeToFixes((f) => got.push(f.lng));
    expect(() => offerFix(loc)).not.toThrow();
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(got).toEqual([-0.97]);
  });

  it("never throws on a malformed fix", () => {
    subscribeToFixes(() => {});
    expect(() => offerFix(null as never)).not.toThrow();
    expect(() => offerFix({ coords: null } as never)).not.toThrow();
  });

  it("keeps the newest fix while listening, and forgets it after", () => {
    const off = subscribeToFixes(() => {});
    offerFix(loc);
    const at = Date.parse(loc.timestamp);
    expect(latestFix(30_000, at + 10_000)?.lat).toBe(51.45);
    expect(latestFix(30_000, at + 60_000)).toBeNull();
    off();
    expect(hasFixListeners()).toBe(false);
    expect(latestFix(Infinity)).toBeNull();
  });
});

describe("the recorder hook", () => {
  it("is the first thing handleNativeLocation does, wrapped, and adds no listener", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "..", "tracking", "nativeLocation.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function handleNativeLocation"));
    const firstTry = body.indexOf("try {");
    const hook = body.indexOf("offerNavigationFix(loc)");
    const pauseCheck = body.indexOf("resolvePauseOnWake");
    expect(hook).toBeGreaterThan(firstTry);
    expect(hook).toBeLessThan(pauseCheck);
    // Exactly one onLocation registration in the recorder, ever.
    expect(src.match(/BGGeo\.onLocation\(/g)?.length).toBe(1);
    // Navigation code never touches the engine.
    // (Code only: the comments explain why, so they name these.)
    const nav = ["fixBus.ts", "navigator.ts", "useGuidance.ts", "voice.ts"].map((f) =>
      readFileSync(join(__dirname, "..", f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
    );
    for (const s of nav) {
      expect(s).not.toMatch(/react-native-background-geolocation|startNativeLocationEngine|BGGeo|watchPositionAsync|startLocationUpdatesAsync/);
    }
  });
});
