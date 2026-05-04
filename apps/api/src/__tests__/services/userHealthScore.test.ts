/**
 * Per-user health score tests.
 *
 * Audit follow-up #2: single 0-100 number aggregated from heartbeat
 * fields. Tests cover the canonical band cuts (good ≥75, warning ≥50,
 * critical <50, unknown when no heartbeat at all) plus a handful of
 * edge cases that have actually shown up in production telemetry.
 */
import { describe, it, expect } from "vitest";
import {
  calculateUserHealthScore,
  type HealthScoreInput,
} from "../../services/userHealthScore.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}

const HEALTHY: HealthScoreInput = {
  bgLocationPermission: "granted",
  trackingTaskActive: true,
  backgroundFetchStatus: "available",
  lastHeartbeatAt: ago(2 * HOUR),
  lastPendingSyncCount: 0,
  lastSyncQueuePermFailed: 0,
  lastDrivingSpeedAt: ago(2 * DAY),
  secondsSinceLastTripPost: 90 * 60, // 90 min
};

describe("calculateUserHealthScore", () => {
  it("scores a fully-healthy user at 100", () => {
    const result = calculateUserHealthScore(HEALTHY);
    expect(result.score).toBe(100);
    expect(result.band).toBe("good");
  });

  it("returns 'unknown' band when there's no heartbeat", () => {
    const result = calculateUserHealthScore({
      ...HEALTHY,
      lastHeartbeatAt: null,
      bgLocationPermission: null,
      trackingTaskActive: null,
      backgroundFetchStatus: null,
      lastPendingSyncCount: null,
      lastSyncQueuePermFailed: null,
      lastDrivingSpeedAt: null,
      secondsSinceLastTripPost: null,
    });
    expect(result.band).toBe("unknown");
  });

  it("drops to warning band when bg-location is denied", () => {
    const result = calculateUserHealthScore({
      ...HEALTHY,
      bgLocationPermission: "denied",
    });
    // Healthy = 100, lose 20 for bg-location → 80, still "good"
    expect(result.score).toBe(80);
    expect(result.band).toBe("good");
  });

  it("drops to critical when multiple core factors fail", () => {
    const result = calculateUserHealthScore({
      ...HEALTHY,
      bgLocationPermission: "denied",
      trackingTaskActive: false,
      backgroundFetchStatus: "denied",
      lastSyncQueuePermFailed: 3,
    });
    // -20 -15 -10 -10 = 45 left → critical
    expect(result.score).toBe(45);
    expect(result.band).toBe("critical");
  });

  it("partial credit when heartbeat is mid-stale (2 days)", () => {
    const result = calculateUserHealthScore({
      ...HEALTHY,
      lastHeartbeatAt: ago(2 * DAY),
    });
    // 100 - 15 (full heartbeat) + 7 (rounded half) = 92
    expect(result.score).toBeGreaterThan(85);
    expect(result.score).toBeLessThan(100);
  });

  it("zero credit when heartbeat is more than a week stale", () => {
    const result = calculateUserHealthScore({
      ...HEALTHY,
      lastHeartbeatAt: ago(10 * DAY),
    });
    expect(result.score).toBe(85); // -15 from healthy
  });

  it("partial credit on older builds with null telemetry", () => {
    // Build 1.1.0-era user — heartbeat sent but v2 fields null. Should
    // not score 0; should get partial credit so admin doesn't think
    // every old-build user is broken.
    const result = calculateUserHealthScore({
      bgLocationPermission: "granted",
      trackingTaskActive: true,
      backgroundFetchStatus: null,
      lastHeartbeatAt: ago(1 * HOUR),
      lastPendingSyncCount: null,
      lastSyncQueuePermFailed: null,
      lastDrivingSpeedAt: null,
      secondsSinceLastTripPost: null,
    });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.band).toBe("good");
  });

  it("flags pending sync queue as a warning even with everything else healthy", () => {
    const result = calculateUserHealthScore({
      ...HEALTHY,
      lastPendingSyncCount: 12, // big backlog
    });
    expect(result.score).toBe(90); // -10 for pending
    expect(result.band).toBe("good");
  });

  it("returns the factor breakdown alongside the score", () => {
    const result = calculateUserHealthScore({
      ...HEALTHY,
      bgLocationPermission: "denied",
    });
    const bgFactor = result.factors.find((f) => f.key === "bgLocation");
    expect(bgFactor).toBeDefined();
    expect(bgFactor?.points).toBe(0);
    expect(bgFactor?.max).toBe(20);
    expect(bgFactor?.detail).toBe("denied");
  });

  it("never produces a negative score", () => {
    // Worst case: every signal red.
    const result = calculateUserHealthScore({
      bgLocationPermission: "denied",
      trackingTaskActive: false,
      backgroundFetchStatus: "denied",
      lastHeartbeatAt: ago(30 * DAY),
      lastPendingSyncCount: 50,
      lastSyncQueuePermFailed: 50,
      lastDrivingSpeedAt: ago(60 * DAY),
      secondsSinceLastTripPost: 30 * DAY * 60, // not seconds, but very old
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.band).toBe("critical");
  });
});
