import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  _resetFixBus,
  emitBridgeFix,
  hasFixListeners,
  lastRecorderFixAt,
  latestFix,
  offerFix,
  subscribeToFixes,
  toNavFix,
} from "../fixBus";

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
  it("reads the recorder's fix and tags its source", () => {
    expect(toNavFix(loc, 0, "native")).toEqual({
      lat: 51.45,
      lng: -0.97,
      speedMps: 12.5,
      accuracyM: 6,
      headingDeg: 88,
      atMs: Date.parse("2026-10-18T20:00:00.000Z"),
      source: "native",
    });
  });
  it("expo-location's numeric timestamps work too", () => {
    expect(toNavFix({ coords: { latitude: 1, longitude: 2 }, timestamp: 1234 })?.atMs).toBe(1234);
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
    offerFix(loc, "task");
    expect(latestFix(Infinity)).toBeNull();
    expect(lastRecorderFixAt()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never calls a listener on the recorder's own stack", () => {
    const got: string[] = [];
    subscribeToFixes((f) => got.push(f.source ?? "?"));
    offerFix(loc);
    offerFix(loc, "task");
    expect(got).toEqual([]);
    vi.runAllTimers();
    expect(got).toEqual(["native", "task"]);
  });

  it("is quick with a listener (PLAN AC4: under 1 ms a fix)", () => {
    vi.useRealTimers();
    const off = subscribeToFixes(() => {});
    const n = 2000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) offerFix(loc);
    const each = (performance.now() - t0) / n;
    off();
    expect(each).toBeLessThan(1);
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

  it("bridge fixes are delivered but are not the recorder's", () => {
    const got: string[] = [];
    subscribeToFixes((f) => got.push(f.source ?? "?"));
    emitBridgeFix(loc);
    vi.runAllTimers();
    expect(got).toEqual(["bridge"]);
    expect(lastRecorderFixAt()).toBeNull();
    offerFix(loc);
    expect(lastRecorderFixAt()).not.toBeNull();
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

// ── PLAN.md section 2 (lead developer): the hard rule, enforced ───────────

const MOBILE = join(__dirname, "..", "..", "..");

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : filesIn(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

const NAV_FILES = [
  ...filesIn(join(MOBILE, "lib", "navigation")),
  ...filesIn(join(MOBILE, "components", "directions")),
  join(MOBILE, "app", "navigate.tsx"),
];

const FORBIDDEN = [
  "startNativeLocationEngine",
  "applyEnginePower",
  "startQuickTripTracking",
  "finalizeAutoTrip",
  "BGGeo",
  "startLocationUpdatesAsync",
  "react-native-background-geolocation",
  "changePace",
  "wakeNativeTracking",
  "setConfig",
];

/** Every module a file loads: static, bare, dynamic import() and require(). */
function importsOf(src: string): string[] {
  const out: string[] = [];
  for (const re of [
    /\bfrom\s*["']([^"']+)["']/g,
    /^\s*import\s*["']([^"']+)["']/gm,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    for (const m of src.matchAll(re)) out.push(m[1]);
  }
  return out;
}

const TRACKING = /(^|\/)tracking(\/|$)/;

describe("Directions never reach into trip recording", () => {
  it("finds the Directions code", () => {
    expect(NAV_FILES.length).toBeGreaterThan(15);
  });

  it("the import check catches every way of loading the recorder", () => {
    const sneaky = [
      'import { x } from "../tracking/detection";',
      'import "../tracking/nativeLocation";',
      'const m = await import("../tracking/nativeLocation");',
      'const n = require("../tracking/index");',
    ].join("\n");
    expect(importsOf(sneaky).filter((i) => TRACKING.test(i)).length).toBe(4);
  });

  for (const f of NAV_FILES) {
    const rel = f.slice(MOBILE.length + 1);
    it(`${rel} imports nothing from lib/tracking and names no engine call`, () => {
      const src = code(f);
      for (const i of importsOf(src)) expect(i).not.toMatch(TRACKING);
      for (const name of FORBIDDEN) expect(src).not.toContain(name);
      // Never writes the recorder's state.
      expect(src).not.toMatch(/(INSERT|UPDATE|DELETE|REPLACE)[^"'`]*tracking_state/i);
    });
  }

  it("the recorder offers fixes at the very top of handleNativeLocation, wrapped, before any early return", () => {
    const src = code(join(MOBILE, "lib", "tracking", "nativeLocation.ts"));
    const body = src.slice(src.indexOf("export async function handleNativeLocation"));
    const firstTry = body.indexOf("try {");
    const hook = body.indexOf("offerNavigationFix(loc)");
    expect(hook).toBeGreaterThan(firstTry);
    expect(hook).toBeLessThan(body.indexOf("resolvePauseOnWake"));
    expect(hook).toBeLessThan(body.search(/\breturn\b/));
    // Exactly one onLocation registration in the recorder, ever.
    expect(src.match(/BGGeo\.onLocation\(/g)?.length).toBe(1);
  });

  it("the expo-location task offers its newest fix, wrapped, before storing anything", () => {
    const src = readFileSync(join(MOBILE, "lib", "tracking", "index.ts"), "utf8");
    const task = src.slice(src.indexOf("TaskManager.defineTask(LOCATION_TASK_NAME"));
    const hook = task.indexOf('offerNavigationFix(newest, "task")');
    expect(hook).toBeGreaterThan(0);
    expect(hook).toBeLessThan(task.indexOf("INSERT INTO shift_coordinates"));
    expect(task.slice(0, hook).lastIndexOf("try {")).toBeGreaterThan(-1);
  });

  it("the only location API Directions use is the foreground watch and one-off reads", () => {
    const all = NAV_FILES.map(code).join("\n");
    const calls = [...all.matchAll(/Location\.(\w+)\(/g)].map((m) => m[1]);
    for (const c of calls) {
      expect(["watchPositionAsync", "getForegroundPermissionsAsync", "getLastKnownPositionAsync", "getCurrentPositionAsync"]).toContain(c);
    }
  });
});
