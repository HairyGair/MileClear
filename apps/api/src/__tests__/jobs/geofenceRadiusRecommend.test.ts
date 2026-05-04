/**
 * Geofence-radius recommendation cron tests.
 *
 * Server foundation for crowd-sourced geofence accuracy. Verifies the
 * percentile rollup, sample-size threshold, and the upsert path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    geofenceRadiusObservation: {
      findMany: vi.fn(),
    },
    geofenceRadiusRecommendation: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    appEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ appVersion: null, buildNumber: null }),
    },
  },
}));

import { runGeofenceRadiusRecommendJob } from "../../jobs/geofenceRadiusRecommend.js";
import { prisma } from "../../lib/prisma.js";

function obs(distanceMeters: number) {
  return { distanceMeters };
}

describe("runGeofenceRadiusRecommendJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips a location type that has fewer than the min sample size", async () => {
    // 49 observations < MIN_SAMPLE_SIZE (50) → skip.
    vi.mocked(prisma.geofenceRadiusObservation.findMany).mockResolvedValue(
      Array.from({ length: 49 }, () => obs(150)) as any
    );

    await runGeofenceRadiusRecommendJob();

    expect(prisma.geofenceRadiusRecommendation.upsert).not.toHaveBeenCalled();
  });

  it("computes the p75 and writes a recommendation when there's enough data", async () => {
    // 100 observations, evenly spaced from 100m to 200m. p75 should
    // land around 175m (depending on quantile interpolation).
    const distances = Array.from(
      { length: 100 },
      (_, i) => 100 + (100 * i) / 99
    );
    // Mock returns the same array for every locationType (4 calls), so
    // upsert should fire 4 times.
    vi.mocked(prisma.geofenceRadiusObservation.findMany).mockResolvedValue(
      distances.map(obs) as any
    );

    await runGeofenceRadiusRecommendJob();

    expect(prisma.geofenceRadiusRecommendation.upsert).toHaveBeenCalledTimes(4);

    const firstCall = vi.mocked(prisma.geofenceRadiusRecommendation.upsert)
      .mock.calls[0][0];
    expect(firstCall.create.locationType).toBeDefined();
    expect(firstCall.create.p75Meters).toBeGreaterThanOrEqual(170);
    expect(firstCall.create.p75Meters).toBeLessThanOrEqual(180);
    expect(firstCall.create.sampleSize).toBe(100);
  });

  it("filters out outlier observations above the 2km cap", async () => {
    // Outliers shouldn't reach the percentile: the prisma findMany itself
    // filters via the `distanceMeters: { lte: 2000 }` clause. Verify the
    // call site uses that filter so the cron can't be polluted by bad
    // pins.
    vi.mocked(prisma.geofenceRadiusObservation.findMany).mockResolvedValue(
      Array.from({ length: 60 }, () => obs(150)) as any
    );

    await runGeofenceRadiusRecommendJob();

    const calls = vi.mocked(prisma.geofenceRadiusObservation.findMany).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const where = (calls[0][0] as any).where;
    expect(where.distanceMeters).toEqual({ lte: 2000 });
  });
});
