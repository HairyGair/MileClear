/**
 * Missing-address backfill job.
 *
 * Trip splits and failed device lookups leave startAddress / endAddress null,
 * and the app then shows raw coordinates. The job fills only the null sides,
 * never overwrites what the device sent, leaves a failed lookup null for the
 * next run, and stops early after a streak of PROVIDER failures.
 *
 * A point the provider has no name for (a GPS glitch in the Channel) is not a
 * provider failure. Five such rows at the head of an oldest-first queue kept
 * the job at "scanned 50, filled 0, aborted" for ten days in September 2026
 * while the backlog grew to 10,000, so the job now works newest first and
 * counts only timeouts / 429s / 5xx towards the cut-off.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    savedLocation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../../services/geocoding.js", () => ({
  reverseGeocodeDetailed: vi.fn(),
}));

vi.mock("../../services/appEvents.js", () => ({
  logEvent: vi.fn(),
}));

import { runGeocodeMissingAddresses } from "../../jobs/geocodeMissingAddresses.js";
import { prisma } from "../../lib/prisma.js";
import { reverseGeocodeDetailed, type ReverseGeocodeResult } from "../../services/geocoding.js";
import { logEvent } from "../../services/appEvents.js";

const found = (address: string): ReverseGeocodeResult => ({ address, outcome: "found", cached: false });
const nowhere: ReverseGeocodeResult = { address: null, outcome: "nowhere", cached: false };
const unavailable: ReverseGeocodeResult = { address: null, outcome: "unavailable", cached: false };

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

  it("selects recent trips missing either address, newest first, capped at the limit", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);

    const res = await runGeocodeMissingAddresses({ userId: "u1", limit: 7, pace: false });

    expect(res).toEqual({ scanned: 0, filled: 0, failed: 0, unnameable: 0, aborted: false });
    const args = vi.mocked(prisma.trip.findMany).mock.calls[0][0]!;
    expect(args.take).toBe(7);
    // Newest first: last hour's trips are what the driver is looking at, and
    // a row that can never be named must not stand in front of them.
    expect(args.orderBy).toEqual({ createdAt: "desc" });
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

  it("takes 300 a run by default: hourly, that outpaces the ~600 blank trips a day", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
    await runGeocodeMissingAddresses({ pace: false });
    expect(vi.mocked(prisma.trip.findMany).mock.calls[0][0]!.take).toBe(300);
  });

  it("fills only the null side and never touches an address the device sent", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip({ startAddress: "Depot, Hull" }),
    ] as never);
    vi.mocked(reverseGeocodeDetailed).mockResolvedValue(found("Hessle Road, Hull, HU3 4AA"));

    const res = await runGeocodeMissingAddresses({ pace: false });

    expect(reverseGeocodeDetailed).toHaveBeenCalledTimes(1);
    expect(reverseGeocodeDetailed).toHaveBeenCalledWith(53.686, -0.317);
    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { endAddress: "Hessle Road, Hull, HU3 4AA" },
    });
    expect(res).toEqual({ scanned: 1, filled: 1, failed: 0, unnameable: 0, aborted: false });
    expect(logEvent).toHaveBeenCalledWith(
      "job.geocode_missing_addresses",
      null,
      { scanned: 1, filled: 1, failed: 0, unnameable: 0 }
    );
  });

  it("leaves a failed lookup null for the next run and still fills the other side", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([trip()] as never);
    vi.mocked(reverseGeocodeDetailed)
      .mockResolvedValueOnce(found("Start Road"))
      .mockResolvedValueOnce(unavailable);

    const res = await runGeocodeMissingAddresses({ pace: false });

    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { startAddress: "Start Road" },
    });
    expect(res).toEqual({ scanned: 1, filled: 1, failed: 1, unnameable: 0, aborted: false });
  });

  it("skips the 0,0 sentinel and trips with no end coordinates without calling the geocoder", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip({ id: "a", startLat: 0, startLng: 0, endLat: null, endLng: null }),
    ] as never);

    const res = await runGeocodeMissingAddresses({ pace: false });

    expect(reverseGeocodeDetailed).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(res).toEqual({ scanned: 1, filled: 0, failed: 0, unnameable: 0, aborted: false });
  });

  it("stops after five consecutive provider failures so a dead provider cannot burn the run", async () => {
    const trips = Array.from({ length: 10 }, (_, i) =>
      trip({ id: `t${i}`, endLat: null, endLng: null })
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValue(trips as never);
    vi.mocked(reverseGeocodeDetailed).mockResolvedValue(unavailable);

    const res = await runGeocodeMissingAddresses({ pace: false });

    expect(reverseGeocodeDetailed).toHaveBeenCalledTimes(5);
    expect(res).toEqual({ scanned: 10, filled: 0, failed: 5, unnameable: 0, aborted: true });
    expect(logEvent).toHaveBeenCalledWith(
      "job.geocode_missing_addresses",
      null,
      { scanned: 10, filled: 0, failed: 5, unnameable: 0, aborted: true }
    );
  });

  it("does not let points the provider cannot name stop the run: the ten-day zero", async () => {
    // What production looked like 5-15 Sep 2026: offshore rows at the head
    // of the queue, each "Unable to geocode", then a real trip behind them.
    const trips = [
      ...Array.from({ length: 6 }, (_, i) =>
        trip({ id: `sea${i}`, startLat: 45.25, startLng: -13.78, endLat: null, endLng: null })
      ),
      trip({ id: "real", endLat: null, endLng: null }),
    ];
    vi.mocked(prisma.trip.findMany).mockResolvedValue(trips as never);
    vi.mocked(reverseGeocodeDetailed).mockImplementation(async (lat) =>
      lat > 50 ? found("Hessle Road, Hull") : nowhere
    );

    const res = await runGeocodeMissingAddresses({ pace: false });

    expect(reverseGeocodeDetailed).toHaveBeenCalledTimes(7);
    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: "real" },
      data: { startAddress: "Hessle Road, Hull" },
    });
    expect(res).toEqual({ scanned: 7, filled: 1, failed: 0, unnameable: 6, aborted: false });
  });

  it("a provider failure streak broken by a success resets the count", async () => {
    const trips = Array.from({ length: 9 }, (_, i) =>
      trip({ id: `t${i}`, endLat: null, endLng: null })
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValue(trips as never);
    let n = 0;
    vi.mocked(reverseGeocodeDetailed).mockImplementation(async () =>
      ++n % 5 === 0 ? found("Road") : unavailable
    );

    const res = await runGeocodeMissingAddresses({ pace: false });

    // 4 fail, 1 ok, 4 fail: never five in a row, so all nine are attempted.
    expect(reverseGeocodeDetailed).toHaveBeenCalledTimes(9);
    expect(res).toEqual({ scanned: 9, filled: 1, failed: 8, unnameable: 0, aborted: false });
  });

  it("paces only lookups that reached the provider; cache hits cost no wait", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(prisma.trip.findMany).mockResolvedValue([
        trip({ id: "a", endLat: null, endLng: null }),
        trip({ id: "b", endLat: null, endLng: null }),
      ] as never);
      vi.mocked(reverseGeocodeDetailed)
        .mockResolvedValueOnce({ address: "Cached Road", outcome: "found", cached: true })
        .mockResolvedValueOnce(found("Fresh Road"));

      const p = runGeocodeMissingAddresses({ pace: true });
      // First lookup was a cache hit: no sleep, second lookup is reached at once.
      await vi.advanceTimersByTimeAsync(0);
      expect(reverseGeocodeDetailed).toHaveBeenCalledTimes(2);
      // Second lookup went to Nominatim: the run waits its 1.1 s before ending.
      await vi.advanceTimersByTimeAsync(1100);
      const res = await p;
      expect(res.filled).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("runGeocodeMissingAddresses - saved locations come first", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reverseGeocodeDetailed).mockResolvedValue(found("South End, DN19 7NE"));
  });

  it("names a stop the way the driver named it, not the way the street is", async () => {
    // The end of a split leg lands at a client's house. Nominatim calls it
    // South End; every other trip in her list calls it Michelle Atkin.
    (prisma.savedLocation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { userId: "u1", name: "Michelle Atkin", latitude: 53.66861, longitude: -0.30651, radiusMeters: 100 },
    ]);
    (prisma.trip.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "t1", userId: "u1",
        startLat: 53.66866, startLng: -0.30666, startAddress: null,
        endLat: null, endLng: null, endAddress: "Home",
      },
    ]);

    await runGeocodeMissingAddresses({ pace: false });
    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { startAddress: "Michelle Atkin" } })
    );
    // and it cost no provider call at all
    expect(reverseGeocodeDetailed).not.toHaveBeenCalled();
  });

  it("falls back to the street when the point is nowhere they have named", async () => {
    (prisma.savedLocation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { userId: "u1", name: "Michelle Atkin", latitude: 53.66861, longitude: -0.30651, radiusMeters: 100 },
    ]);
    (prisma.trip.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "t1", userId: "u1",
        startLat: 53.6, startLng: -0.4, startAddress: null,
        endLat: null, endLng: null, endAddress: "Home",
      },
    ]);

    await runGeocodeMissingAddresses({ pace: false });
    expect(reverseGeocodeDetailed).toHaveBeenCalled();
    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { startAddress: "South End, DN19 7NE" } })
    );
  });

  it("prefers the nearer of two saved places when they overlap", async () => {
    (prisma.savedLocation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { userId: "u1", name: "Catherine Bradley", latitude: 53.6694, longitude: -0.31875, radiusMeters: 400 },
      { userId: "u1", name: "Claire Ramsey Mayes", latitude: 53.66907, longitude: -0.31673, radiusMeters: 400 },
    ]);
    (prisma.trip.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "t1", userId: "u1",
        startLat: 53.66905, startLng: -0.3167, startAddress: null,
        endLat: null, endLng: null, endAddress: "Home",
      },
    ]);

    await runGeocodeMissingAddresses({ pace: false });
    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { startAddress: "Claire Ramsey Mayes" } })
    );
  });
});
