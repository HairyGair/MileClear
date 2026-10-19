/**
 * "Longest single trip" leaves out a past shift's typed total (Lucian, 19 Oct
 * 2026): a total is a whole shift's miles, not one drive. The record is read
 * longest first in pages, so a run of totals at the top never hides it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: { trip: { findMany: vi.fn() } },
}));

import { prisma } from "../../lib/prisma.js";
import { longestRealTrip } from "../../services/gamification.js";

const total = (miles: number) => ({
  distanceMiles: miles,
  startedAt: new Date("2026-10-17T10:00:00Z"),
  gpsQuality: { distanceSource: "typed_total", drops: 30 },
});
const drive = (miles: number) => ({ distanceMiles: miles, startedAt: new Date("2026-10-12T08:00:00Z"), gpsQuality: null });

describe("longestRealTrip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips totals for the longest real drive", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([total(120), total(84), drive(26.3), drive(4)] as never);
    expect(await longestRealTrip("u1")).toEqual({ distanceMiles: 26.3, startedAt: new Date("2026-10-12T08:00:00Z") });
  });

  it("reads the next page when a whole page is totals", async () => {
    vi.mocked(prisma.trip.findMany)
      .mockResolvedValueOnce(Array.from({ length: 50 }, () => total(90)) as never)
      .mockResolvedValueOnce([total(80), drive(12)] as never);
    expect((await longestRealTrip("u1"))?.distanceMiles).toBe(12);
    // id breaks ties, so paging is stable.
    expect(vi.mocked(prisma.trip.findMany).mock.calls[1][0]).toMatchObject({
      skip: 50,
      take: 50,
      orderBy: [{ distanceMiles: "desc" }, { id: "asc" }],
    });
  });

  it("is null with only totals", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([total(84)] as never);
    expect(await longestRealTrip("u1")).toBeNull();
  });
});
