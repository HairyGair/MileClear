/**
 * Missing-address backfill job.
 *
 * Trip splits and failed device lookups leave startAddress / endAddress null,
 * and the app then shows raw coordinates. The job fills only the null sides,
 * never overwrites what the device sent, leaves a failed lookup null for the
 * next run, and stops early after a streak of provider failures.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("../../services/geocoding.js", () => ({
  reverseGeocode: vi.fn(),
}));

vi.mock("../../services/appEvents.js", () => ({
  logEvent: vi.fn(),
}));

import { runGeocodeMissingAddresses } from "../../jobs/geocodeMissingAddresses.js";
import { prisma } from "../../lib/prisma.js";
import { reverseGeocode } from "../../services/geocoding.js";
import { logEvent } from "../../services/appEvents.js";

function trip(over: Partial<{
  id: string;
  startAddress: string | null;
  endAddress: string | null;
  endLat: number | null;
  endLng: number | null;
  startLat: number;
  startLng: number;
}> = {}) {
  return {
    id: "t1",
    userId: "u1",
    startLat: 53.689,
    startLng: -0.313,
    endLat: 53.686,
    endLng: -0.317,
    startAddress: null,
    endAddress: null,
    ...over,
  };
}

describe("runGeocodeMissingAddresses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects recent trips missing either address, oldest first, capped at the limit", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);

    const res = await runGeocodeMissingAddresses({ userId: "u1", limit: 7, pace: false });

    expect(res).toEqual({ scanned: 0, filled: 0, failed: 0, aborted: false });
    const args = vi.mocked(prisma.trip.findMany).mock.calls[0][0]!;
    expect(args.take).toBe(7);
    expect(args.orderBy).toEqual({ createdAt: "asc" });
    expect(args.where).toMatchObject({ userId: "u1", isPhantomTrip: false });
    expect(args.where!.AND).toEqual([
      {
        OR: [
          { startAddress: null },
          { endAddress: null, endLat: { not: null }, endLng: { not: null } },
        ],
      },
    ]);
    // Nothing scanned, nothing logged.
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("fills only the null side and never touches an address the device sent", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip({ startAddress: "Depot, Hull" }),
    ] as never);
    vi.mocked(reverseGeocode).mockResolvedValue("Hessle Road, Hull, HU3 4AA");

    const res = await runGeocodeMissingAddresses({ pace: false });

    expect(reverseGeocode).toHaveBeenCalledTimes(1);
    expect(reverseGeocode).toHaveBeenCalledWith(53.686, -0.317);
    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { endAddress: "Hessle Road, Hull, HU3 4AA" },
    });
    expect(res).toEqual({ scanned: 1, filled: 1, failed: 0, aborted: false });
    expect(logEvent).toHaveBeenCalledWith(
      "job.geocode_missing_addresses",
      null,
      { scanned: 1, filled: 1, failed: 0 }
    );
  });

  it("leaves a failed lookup null for the next run and still fills the other side", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([trip()] as never);
    vi.mocked(reverseGeocode)
      .mockResolvedValueOnce("Start Road")
      .mockResolvedValueOnce(null);

    const res = await runGeocodeMissingAddresses({ pace: false });

    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { startAddress: "Start Road" },
    });
    expect(res).toEqual({ scanned: 1, filled: 1, failed: 1, aborted: false });
  });

  it("skips the 0,0 sentinel and trips with no end coordinates without calling the geocoder", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip({ id: "a", startLat: 0, startLng: 0, endLat: null, endLng: null }),
    ] as never);

    const res = await runGeocodeMissingAddresses({ pace: false });

    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(res).toEqual({ scanned: 1, filled: 0, failed: 0, aborted: false });
  });

  it("stops after five consecutive failures so a dead provider cannot burn the run", async () => {
    const trips = Array.from({ length: 10 }, (_, i) =>
      trip({ id: `t${i}`, endLat: null, endLng: null })
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValue(trips as never);
    vi.mocked(reverseGeocode).mockResolvedValue(null);

    const res = await runGeocodeMissingAddresses({ pace: false });

    expect(reverseGeocode).toHaveBeenCalledTimes(5);
    expect(res).toEqual({ scanned: 10, filled: 0, failed: 5, aborted: true });
    expect(logEvent).toHaveBeenCalledWith(
      "job.geocode_missing_addresses",
      null,
      { scanned: 10, filled: 0, failed: 5, aborted: true }
    );
  });
});
