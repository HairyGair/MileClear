/**
 * Road alerts (17 Oct 2026): "Planned roadworks cover England only" is only
 * said while Traffic Wales is off, and the new sources count as "available".
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ pushPrefs: {} })) },
    trip: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("../../services/tomtomTraffic.js", () => ({
  getTileEvents: vi.fn(async () => []),
  isTomTomConfigured: () => false,
  isTomTomServing: async () => false,
  screenFreshnessMs: async () => null,
  tilesForCorridor: () => [],
}));
vi.mock("../../services/streetManager.js", () => ({
  isStreetManagerEnabled: () => process.env.STREET_MANAGER_SNS_ENABLED === "1",
  loadStreetWorks: vi.fn(async () => []),
}));

import { roadAlertsForUser } from "../../services/roadAlerts.js";

const ENV = ["STREET_MANAGER_SNS_ENABLED", "ROAD_SOURCE_WALES", "ROAD_SOURCE_NH"];

describe("plannedWorksCoverage and availability", () => {
  afterEach(() => {
    for (const k of ENV) delete process.env[k];
  });

  it("Street Manager alone: England only", async () => {
    process.env.STREET_MANAGER_SNS_ENABLED = "1";
    const r = await roadAlertsForUser("u1");
    expect(r.plannedWorksCoverage).toBe("england");
    expect(r.available).toBe(true);
  });

  it("with Traffic Wales on: not England only", async () => {
    process.env.STREET_MANAGER_SNS_ENABLED = "1";
    process.env.ROAD_SOURCE_WALES = "1";
    const r = await roadAlertsForUser("u1");
    expect(r.plannedWorksCoverage).toBeNull();
  });

  it("only a new source on: available, and no attribution until its items are shown", async () => {
    process.env.ROAD_SOURCE_NH = "1";
    const r = await roadAlertsForUser("u1");
    expect(r.available).toBe(true);
    expect(r.attribution).toEqual([]);
  });

  it("nothing on: not available", async () => {
    const r = await roadAlertsForUser("u1");
    expect(r.available).toBe(false);
  });
});
