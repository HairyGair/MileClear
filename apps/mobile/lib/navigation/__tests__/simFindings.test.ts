// Simulator test-drive findings, 19 Oct 2026.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { offset } from "../geo";
import { gpsStateFor, pathMeters, shortAddress, GPS_GONE_MS } from "../rules";
import { READING } from "./fixtures";

describe("GPS state: a parked car with no fixes is offered End directions", () => {
  const base = { startedAtMs: 0, lastSpeedMps: 0 };
  it("waiting, still waiting, then gone after 2 minutes still", () => {
    expect(gpsStateFor({ ...base, nowMs: 10_000, lastUsableAtMs: 8_000 })).toBe("ok");
    expect(gpsStateFor({ ...base, nowMs: 15_000, lastUsableAtMs: 8_000 })).toBe("waiting");
    expect(gpsStateFor({ ...base, nowMs: 60_000, lastUsableAtMs: 8_000 })).toBe("still_waiting");
    expect(gpsStateFor({ ...base, nowMs: 8_000 + GPS_GONE_MS, lastUsableAtMs: 8_000 })).toBe("gone");
  });
  it("not while the last fixes said the car was moving (a long tunnel)", () => {
    expect(gpsStateFor({ startedAtMs: 0, nowMs: 300_000, lastUsableAtMs: 8_000, lastSpeedMps: 20 })).toBe("still_waiting");
  });
  it("started parked: 'Start driving' for 2 minutes, then gone", () => {
    expect(gpsStateFor({ ...base, nowMs: 60_000, lastUsableAtMs: null })).toBe("start_driving");
    expect(gpsStateFor({ ...base, nowMs: GPS_GONE_MS + 1, lastUsableAtMs: null })).toBe("gone");
  });
});

describe("arrival shows what was driven", () => {
  it("adds usable steps, ignores fuzzy fixes and jumps", () => {
    const a = { ...READING, atMs: 0, accuracyM: 5 };
    const b = { ...offset(READING, 90, 20), atMs: 1000, accuracyM: 5 };
    expect(pathMeters(null, a)).toBe(0);
    expect(pathMeters(a, b)).toBeCloseTo(20, 0);
    expect(pathMeters(a, { ...b, accuracyM: 80 })).toBe(0);
    expect(pathMeters(a, { ...offset(READING, 90, 500), atMs: 1000, accuracyM: 5 })).toBe(0);
  });
});

describe("saved places show a short address", () => {
  it("first two parts, without the country, and not when it repeats the name", () => {
    expect(shortAddress("14 Grange Road, Sunderland, SR2 7AB, United Kingdom", "Home")).toBe("14 Grange Road, Sunderland");
    expect(shortAddress("Unit 4, Pallion Park, Sunderland", "Depot")).toBe("Unit 4, Pallion Park");
    expect(shortAddress("Home", "Home")).toBeNull();
    expect(shortAddress(null, "Home")).toBeNull();
  });
});

describe("screen layout fixes", () => {
  const root = join(__dirname, "..", "..", "..");
  const hud = readFileSync(join(root, "components", "directions", "Hud.tsx"), "utf8");
  const screen = readFileSync(join(root, "app", "navigate.tsx"), "utf8");
  const sheets = readFileSync(join(root, "components", "directions", "Sheets.tsx"), "utf8");
  const hook = readFileSync(join(root, "lib", "navigation", "useGuidance.ts"), "utf8");

  it("no speed limit keeps a 56 pt space, so Mute stays bottom right", () => {
    const sign = hud.slice(hud.indexOf("export function SpeedSign"));
    expect(sign.slice(0, sign.indexOf("return ("))).toContain("speedPlaceholder");
    expect(sign).not.toMatch(/if \(mph == null\) return null/);
  });
  it("the car sits about 70% down while following", () => {
    expect(screen).toMatch(/0\.4 \* screenH \+ barPad/);
  });
  it("the preview fits the route above the measured sheet", () => {
    expect(screen).toMatch(/bottom: sheetH \+ 24/);
    expect(sheets).toMatch(/onLayout=\{\(e\) => props\.onHeight/);
  });
  it("the arrival summary is the driven distance and time, not the plan", () => {
    expect(screen).toContain("g.driven");
    expect(screen).not.toMatch(/trip\.current\.meters|route\.distanceMeters\)\} in/);
  });
  it("spoken prompts are logged in debug builds only", () => {
    expect(hook).toMatch(/if \(__DEV__\) console\.log\(`\[directions\] say/);
  });
});
