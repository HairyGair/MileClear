import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));

import { planTailAppend } from "../../services/splitTailAppend.js";

const at = (iso: string) => new Date(iso);
const TAIL_START = at("2026-09-19T15:15:25Z");

describe("planTailAppend", () => {
  it("skips breadcrumbs already held anywhere in the split family (a replayed PATCH)", () => {
    // These moved from the parent into a later leg when the split ran, so
    // deduping against the parent alone would have re-added them.
    const held = [at("2026-09-19T15:16:00Z"), at("2026-09-19T15:17:00Z")];
    const plan = planTailAppend({
      incoming: held.map((recordedAt) => ({ lat: 51.4, lng: -0.2, recordedAt })),
      familyTimes: new Set(held.map((d) => d.getTime())),
      tailStartedAt: TAIL_START,
      tailLast: { lat: 51.4, lng: -0.2 },
    });
    expect(plan.fresh).toHaveLength(0);
    expect(plan.duplicates).toBe(2);
    expect(plan.addedMiles).toBe(0);
  });

  it("drops breadcrumbs from before the last leg started rather than bending its trail backwards", () => {
    const plan = planTailAppend({
      incoming: [{ lat: 51.4, lng: -0.2, recordedAt: at("2026-09-19T15:00:00Z") }],
      familyTimes: new Set(),
      tailStartedAt: TAIL_START,
      tailLast: null,
    });
    expect(plan.fresh).toHaveLength(0);
    expect(plan.beforeTail).toBe(1);
  });

  it("measures the new stretch from where the last leg stopped, in time order", () => {
    // ~0.5 mi per 0.0072 degrees of latitude.
    const plan = planTailAppend({
      incoming: [
        { lat: 51.4144, lng: -0.2, recordedAt: at("2026-09-19T15:32:00Z") },
        { lat: 51.4072, lng: -0.2, recordedAt: at("2026-09-19T15:30:00Z") },
      ],
      familyTimes: new Set(),
      tailStartedAt: TAIL_START,
      tailLast: { lat: 51.4, lng: -0.2 },
    });
    expect(plan.fresh.map((c) => c.lat)).toEqual([51.4072, 51.4144]);
    expect(plan.addedMiles).toBeGreaterThan(0.9);
    expect(plan.addedMiles).toBeLessThan(1.1);
  });
});
