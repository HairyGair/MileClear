/**
 * Location-starvation push: which drops count, who is chosen, and the gate.
 * Pure functions, no mocks.
 */
import { describe, it, expect } from "vitest";

import {
  decideLocationStarvation,
  dumpBatteryIgnoring,
  isStarvedDrop,
  locationStarvationEnabled,
  LOCATION_STARVATION_ACTION,
  LOCATION_STARVATION_BODY,
  LOCATION_STARVATION_TITLE,
  STARVATION_COOLDOWN_MS,
  type StarvationCandidate,
} from "../../jobs/locationStarvation.js";

const NOW = Date.parse("2026-10-12T14:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function candidate(over: Partial<StarvationCandidate> = {}): StarvationCandidate {
  return {
    hasPushToken: true,
    starvedDropTimes: [NOW - 50 * HOUR, NOW - 30 * HOUR, NOW - 5 * HOUR],
    lastAutoTripAt: null,
    batteryIgnoring: false,
    batteryResolvedRecently: false,
    lastSupportReplyAt: null,
    lastPushAt: null,
    lastDryRunAt: null,
    ...over,
  };
}

describe("isStarvedDrop", () => {
  const base = { platform: "android", reason: "too_short", detail: "no_driving_speed", coords: 2, durationSec: 300 };
  it("counts a short recording with almost no location points", () => {
    expect(isStarvedDrop(base)).toBe(true);
    expect(isStarvedDrop({ ...base, coords: 3 })).toBe(true);
  });
  it("counts no_coords, with or without a coords number", () => {
    expect(isStarvedDrop({ ...base, reason: "no_coords", coords: 0 })).toBe(true);
    expect(isStarvedDrop({ platform: "android", reason: "no_coords", durationSec: 120 })).toBe(true);
  });
  it("ignores iOS, other reasons and healthy recordings", () => {
    expect(isStarvedDrop({ ...base, platform: "ios" })).toBe(false);
    expect(isStarvedDrop({ ...base, reason: "walk" })).toBe(false);
    expect(isStarvedDrop({ ...base, reason: "phantom" })).toBe(false);
    expect(isStarvedDrop({ ...base, coords: 4 })).toBe(false);
  });
  it("ignores blips under a minute but accepts a missing duration", () => {
    expect(isStarvedDrop({ ...base, durationSec: 59 })).toBe(false);
    expect(isStarvedDrop({ ...base, durationSec: 60 })).toBe(true);
    const { durationSec: _d, ...noDuration } = base;
    expect(isStarvedDrop(noDuration)).toBe(true);
  });
  it("does not count too_short with no coords figure", () => {
    expect(isStarvedDrop({ platform: "android", reason: "too_short", durationSec: 200 })).toBe(false);
  });
  it("copes with junk", () => {
    expect(isStarvedDrop(null)).toBe(false);
    expect(isStarvedDrop("x")).toBe(false);
    expect(isStarvedDrop([])).toBe(false);
  });
});

describe("dumpBatteryIgnoring", () => {
  it("reads the flag the app reports", () => {
    expect(dumpBatteryIgnoring({ batteryOptimisation: { ignoring: true } })).toBe(true);
    expect(dumpBatteryIgnoring({ batteryOptimisation: { ignoring: false } })).toBe(false);
  });
  it("is null when unknown", () => {
    expect(dumpBatteryIgnoring({ batteryOptimisation: null })).toBeNull();
    expect(dumpBatteryIgnoring({ batteryOptimisation: { ignoring: null } })).toBeNull();
    expect(dumpBatteryIgnoring({})).toBeNull();
    expect(dumpBatteryIgnoring(null)).toBeNull();
  });
});

describe("decideLocationStarvation", () => {
  it("picks a driver with three starved drops and no trip since", () => {
    const d = decideLocationStarvation(candidate(), NOW, true);
    expect(d).toEqual({ send: true, starvedDrops: 3, lastStarvedAt: NOW - 5 * HOUR });
  });
  it("needs three drops inside 72 hours", () => {
    expect(decideLocationStarvation(candidate({ starvedDropTimes: [NOW - HOUR, NOW - 2 * HOUR] }), NOW, true)).toEqual({
      send: false,
      reason: "too_few_drops",
    });
    // Two recent, one older than 72h: only two count.
    expect(
      decideLocationStarvation(candidate({ starvedDropTimes: [NOW - HOUR, NOW - 2 * HOUR, NOW - 80 * HOUR] }), NOW, true)
    ).toEqual({ send: false, reason: "too_few_drops" });
  });
  it("leaves a phone alone once an automatic trip saved after the last drop", () => {
    expect(decideLocationStarvation(candidate({ lastAutoTripAt: NOW - HOUR }), NOW, true)).toEqual({
      send: false,
      reason: "trip_saved_since",
    });
    // A trip older than the newest drop does not clear it.
    expect(decideLocationStarvation(candidate({ lastAutoTripAt: NOW - 20 * HOUR }), NOW, true).send).toBe(true);
  });
  it("skips phones already Unrestricted, or fixed since", () => {
    expect(decideLocationStarvation(candidate({ batteryIgnoring: true }), NOW, true)).toEqual({
      send: false,
      reason: "already_unrestricted",
    });
    expect(decideLocationStarvation(candidate({ batteryResolvedRecently: true }), NOW, true).send).toBe(false);
    // Unknown (no dump) still qualifies.
    expect(decideLocationStarvation(candidate({ batteryIgnoring: null }), NOW, true).send).toBe(true);
  });
  it("skips drivers support wrote to in the last 7 days", () => {
    expect(decideLocationStarvation(candidate({ lastSupportReplyAt: NOW - 6 * DAY }), NOW, true)).toEqual({
      send: false,
      reason: "support_contacted",
    });
    expect(decideLocationStarvation(candidate({ lastSupportReplyAt: NOW - 8 * DAY }), NOW, true).send).toBe(true);
  });
  it("sends one per 30 days", () => {
    expect(decideLocationStarvation(candidate({ lastPushAt: NOW - 29 * DAY }), NOW, true)).toEqual({
      send: false,
      reason: "cooldown",
    });
    expect(decideLocationStarvation(candidate({ lastPushAt: NOW - STARVATION_COOLDOWN_MS - 1 }), NOW, true).send).toBe(true);
  });
  it("a dry run marker holds back later dry runs but not a live run", () => {
    const c = candidate({ lastDryRunAt: NOW - 2 * DAY });
    expect(decideLocationStarvation(c, NOW, false)).toEqual({ send: false, reason: "cooldown" });
    expect(decideLocationStarvation(c, NOW, true).send).toBe(true);
  });
  it("skips a driver with no push token", () => {
    expect(decideLocationStarvation(candidate({ hasPushToken: false }), NOW, true)).toEqual({
      send: false,
      reason: "no_token",
    });
  });
});

describe("gate and copy", () => {
  it("sends only when the flag is exactly 1", () => {
    expect(locationStarvationEnabled({ LOCATION_STARVATION_PUSH: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(locationStarvationEnabled({ LOCATION_STARVATION_PUSH: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(locationStarvationEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
  it("uses plain copy and an action the app routes", () => {
    expect(LOCATION_STARVATION_ACTION).toBe("open_battery_settings");
    expect(`${LOCATION_STARVATION_TITLE} ${LOCATION_STARVATION_BODY}`).not.toMatch(/—|HMRC|fix/i);
  });
});
