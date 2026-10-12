/**
 * Location-starvation push: which drops count, who is chosen, and the gate.
 * Pure functions, no mocks.
 */
import { describe, it, expect } from "vitest";

import {
  currentPhoneIsIos,
  decideLocationStarvation,
  dropDriveTimeMs,
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
    currentlyIos: false,
    ...over,
  };
}

describe("isStarvedDrop (12 Oct 2026 review: false starts must not count)", () => {
  const base = {
    platform: "android",
    reason: "too_short",
    detail: "no_driving_speed",
    lost: true,
    coords: 2,
    durationSec: 300,
  };
  it("does not count a drop with no location points at all", () => {
    expect(isStarvedDrop({ ...base, reason: "no_coords", coords: 0, durationSec: 0 })).toBe(false);
    expect(isStarvedDrop({ platform: "android", reason: "no_coords", lost: true })).toBe(false);
  });
  it("needs the phone's own lost verdict (an orphan sweep is lost:false)", () => {
    expect(isStarvedDrop({ ...base, source: "orphan_sweep", lost: false })).toBe(false);
    expect(isStarvedDrop({ ...base, lost: false })).toBe(false);
    const { lost: _l, ...noLost } = base;
    expect(isStarvedDrop(noLost)).toBe(false);
  });
  it("counts a single fix, whose duration is 0", () => {
    expect(isStarvedDrop({ ...base, coords: 1, durationSec: 0 })).toBe(true);
    expect(isStarvedDrop({ ...base, coords: 1, durationSec: undefined })).toBe(true);
  });
  it("does not count 2 fixes over 30 seconds", () => {
    expect(isStarvedDrop({ ...base, coords: 2, durationSec: 30 })).toBe(false);
  });
  it("counts 2 fixes over 90 seconds, and 3 over exactly 60", () => {
    expect(isStarvedDrop({ ...base, coords: 2, durationSec: 90 })).toBe(true);
    expect(isStarvedDrop({ ...base, coords: 3, durationSec: 60 })).toBe(true);
  });
  it("does not count 2 fixes with no duration", () => {
    const { durationSec: _d, ...noDuration } = base;
    expect(isStarvedDrop(noDuration)).toBe(false);
  });
  it("ignores iOS, other reasons and healthy recordings", () => {
    expect(isStarvedDrop({ ...base, platform: "ios" })).toBe(false);
    expect(isStarvedDrop({ ...base, reason: "walk" })).toBe(false);
    expect(isStarvedDrop({ ...base, coords: 4 })).toBe(false);
  });
  it("does not count too_short with no coords figure", () => {
    expect(isStarvedDrop({ platform: "android", reason: "too_short", lost: true, durationSec: 200 })).toBe(false);
  });
  it("copes with junk", () => {
    expect(isStarvedDrop(null)).toBe(false);
    expect(isStarvedDrop("x")).toBe(false);
    expect(isStarvedDrop([])).toBe(false);
  });
});

describe("dropDriveTimeMs (drive time, not upload time)", () => {
  const upload = new Date("2026-10-12T12:00:00Z");
  it("prefers endedAt, then droppedAt, then the upload time", () => {
    expect(dropDriveTimeMs({ endedAt: "2026-10-05T08:00:00Z", droppedAt: "2026-10-05T08:05:00Z" }, upload)).toBe(
      Date.parse("2026-10-05T08:00:00Z")
    );
    expect(dropDriveTimeMs({ droppedAt: "2026-10-05T08:05:00Z" }, upload)).toBe(Date.parse("2026-10-05T08:05:00Z"));
    expect(dropDriveTimeMs({}, upload)).toBe(upload.getTime());
    expect(dropDriveTimeMs({ endedAt: "nonsense" }, upload)).toBe(upload.getTime());
    expect(dropDriveTimeMs(null, upload)).toBe(upload.getTime());
  });
  it("a batch of old drops uploaded together does not count as recent", () => {
    const times = [3, 4, 5, 6].map((d) => dropDriveTimeMs({ endedAt: new Date(NOW - d * DAY).toISOString() }, new Date(NOW)));
    expect(decideLocationStarvation(candidate({ starvedDropTimes: times }), NOW, true)).toEqual({
      send: false,
      reason: "too_few_drops",
    });
  });
});

describe("currentPhoneIsIos", () => {
  it("skips only when clearly iOS now", () => {
    expect(currentPhoneIsIos("ios", "android,ios")).toBe(true);
    expect(currentPhoneIsIos(null, "ios")).toBe(true);
    expect(currentPhoneIsIos("android", "ios")).toBe(false);
    expect(currentPhoneIsIos(null, "android,ios")).toBe(false);
    expect(currentPhoneIsIos(undefined, null)).toBe(false);
  });
  it("is skipped by the decision", () => {
    expect(decideLocationStarvation(candidate({ currentlyIos: true }), NOW, true)).toEqual({
      send: false,
      reason: "ios_now",
    });
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
    // A good trip whose end is after the last drop clears it, even if it was
    // uploaded (created) long afterwards: both sides are drive times.
    expect(decideLocationStarvation(candidate({ lastAutoTripAt: NOW - 5 * HOUR + 1000 }), NOW, true)).toEqual({
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
