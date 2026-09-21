/**
 * Check 3 (armed but silent) selection rule.
 *
 * The one piece of judgement in the armed-but-silent watchdog push: does
 * this phone look like it's tracking and has simply gone dark. Pure
 * function, no mocks - see the comment on isArmedButSilent in
 * recordingWatchdog.ts for the production numbers that justified it.
 */
import { describe, it, expect } from "vitest";

import {
  isArmedButSilent,
  exceedsArmedSilentDailyCap,
  type ArmedSilentInput,
} from "../../jobs/recordingWatchdog.js";

const NOW = new Date("2026-09-21T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

function user(over: Partial<ArmedSilentInput> = {}): ArmedSilentInput {
  return {
    lastHeartbeatAt: new Date(NOW - 1 * HOUR),
    lastTripAt: new Date(NOW - 25 * HOUR),
    bgLocationPermission: "granted",
    ...over,
  };
}

describe("isArmedButSilent", () => {
  it("qualifies: fresh heartbeat, armed, granted permission, no trip in 25h", () => {
    expect(isArmedButSilent(user(), NOW)).toBe(true);
  });

  it("excludes a user who has never recorded a trip - onboarding, not a dead engine", () => {
    expect(isArmedButSilent(user({ lastTripAt: null }), NOW)).toBe(false);
  });

  it("excludes a stale heartbeat - we can't trust the phone is reachable", () => {
    const staleHeartbeat = new Date(NOW - 27 * HOUR); // beyond HEARTBEAT_FRESHNESS_MS (26h)
    expect(isArmedButSilent(user({ lastHeartbeatAt: staleHeartbeat }), NOW)).toBe(false);
  });

  it("excludes a missing heartbeat entirely", () => {
    expect(isArmedButSilent(user({ lastHeartbeatAt: null }), NOW)).toBe(false);
  });

  it("excludes missing background location permission", () => {
    for (const reading of [null, "denied", "undetermined", "restricted", "foreground"]) {
      expect(isArmedButSilent(user({ bgLocationPermission: reading }), NOW)).toBe(false);
    }
  });

  it("does not depend on trackingTaskActive, which is false for the whole fleet", () => {
    // 21 Sep 2026: that column is isTaskRegisteredAsync() for the JS
    // detection task, and every current build runs the native engine, so it
    // reads false for all 400 users checked (37 Android, 345 iOS, 18 null).
    // Requiring it made this check match nobody. Background permission is the
    // arming signal the server actually holds.
    expect(isArmedButSilent(user({ bgLocationPermission: "granted" }), NOW)).toBe(true);
  });

  it("excludes a trip that arrived within the last 24h - not silent yet", () => {
    expect(isArmedButSilent(user({ lastTripAt: new Date(NOW - 23 * HOUR) }), NOW)).toBe(false);
  });

  it("is on the boundary at exactly 24h - already stale enough to qualify", () => {
    expect(isArmedButSilent(user({ lastTripAt: new Date(NOW - 24 * HOUR) }), NOW)).toBe(true);
  });

  it("just under 24h stale does not yet qualify", () => {
    expect(isArmedButSilent(user({ lastTripAt: new Date(NOW - 24 * HOUR + 1) }), NOW)).toBe(false);
  });
});

describe("exceedsArmedSilentDailyCap", () => {
  it("allows a user who has never received a restart_engine push", () => {
    expect(exceedsArmedSilentDailyCap(null, NOW)).toBe(false);
  });

  it("caps a user pushed earlier today", () => {
    expect(exceedsArmedSilentDailyCap(new Date(NOW - 1 * HOUR), NOW)).toBe(true);
  });

  it("allows a user pushed more than 24h ago", () => {
    expect(exceedsArmedSilentDailyCap(new Date(NOW - 25 * HOUR), NOW)).toBe(false);
  });
});
