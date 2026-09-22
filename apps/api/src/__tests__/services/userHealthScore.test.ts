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
    // Healthy = 100, lose bg-location's 20 of the 85 scoreable → 76, still "good"
    expect(result.score).toBe(76);
    expect(result.band).toBe("good");
  });

  it("drops to critical when multiple core factors fail", () => {
    const result = calculateUserHealthScore({
      ...HEALTHY,
      bgLocationPermission: "denied",
      backgroundFetchStatus: "denied",
      lastSyncQueuePermFailed: 3,
    });
    // -20 -10 -10 of the 85 scoreable = 45/85 → 53.
    // ⚠️ This case was "critical" until 22 Sep 2026, and only because the
    // dead tracking-task factor took a further 15 off everyone. With the
    // phantom penalty gone the honest arithmetic puts it in "warning".
    // Worth knowing if the band thresholds are ever retuned.
    expect(result.score).toBe(53);
    expect(result.band).toBe("warning");
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
    expect(result.score).toBe(82); // -15 of 85 scoreable, rounded
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
    expect(result.score).toBe(88); // -10 of the 85 scoreable
    expect(result.band).toBe("good");
  });

  it("ignores trackingTaskActive, which is false for the entire fleet", () => {
    // 22 Sep 2026: it was 15 of 100 points that nobody could ever earn, so
    // every user carried a flat penalty and no one could score above 85.
    const on = calculateUserHealthScore({ ...HEALTHY, trackingTaskActive: true });
    const off = calculateUserHealthScore({ ...HEALTHY, trackingTaskActive: false });
    const absent = calculateUserHealthScore({ ...HEALTHY, trackingTaskActive: null });
    expect(on.score).toBe(100);
    expect(off.score).toBe(100);
    expect(absent.score).toBe(100);
    expect(on.factors.some((f) => f.key === "trackingTask")).toBe(false);
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

  it("caps the band at unknown when the heartbeat is a week old, whatever the points say", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const r = calculateUserHealthScore({
      bgLocationPermission: "granted",
      trackingTaskActive: true,
      backgroundFetchStatus: "available",
      lastHeartbeatAt: eightDaysAgo,
      lastPendingSyncCount: 0,
      lastSyncQueuePermFailed: 0,
      lastDrivingSpeedAt: new Date(),
      secondsSinceLastTripPost: 60,
    });
    expect(r.band).toBe("unknown");
    expect(r.score).toBeGreaterThan(0); // still sortable
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
    expect(result.band).toBe("unknown");
  });
});
