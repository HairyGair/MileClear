import { describe, it, expect } from "vitest";
import {
  overlappingTrips,
  firstOverlappingTrip,
  tripSpan,
  sharedMs,
  overlapLookupWindow,
  NO_END_TRIP_MS,
  OVERLAP_LOOKBACK_MS,
} from "./tripOverlap";

const at = (hm: string, day = "2026-10-03") => new Date(`${day}T${hm}:00Z`);
const trip = (id: string, start: string, end: string | null, day = "2026-10-03") => ({
  id,
  startedAt: at(start, day).toISOString(),
  endedAt: end ? at(end, day).toISOString() : null,
});

describe("tripSpan", () => {
  it("reads start and end", () => {
    expect(tripSpan(trip("a", "08:40", "09:05"))).toEqual({
      start: at("08:40").getTime(),
      end: at("09:05").getTime(),
    });
  });

  it("treats no end, or an end before the start, as one minute", () => {
    expect(tripSpan(trip("a", "08:40", null))!.end - at("08:40").getTime()).toBe(NO_END_TRIP_MS);
    expect(tripSpan(trip("a", "08:40", "08:00"))!.end - at("08:40").getTime()).toBe(NO_END_TRIP_MS);
  });

  it("is null for an unreadable start", () => {
    expect(tripSpan({ id: "x", startedAt: "not a date", endedAt: null })).toBeNull();
  });
});

describe("sharedMs", () => {
  it("is zero for touching ends", () => {
    expect(sharedMs(0, 10, 10, 20)).toBe(0);
  });
  it("is the shared part", () => {
    expect(sharedMs(0, 10, 5, 20)).toBe(5);
  });
});

describe("overlappingTrips", () => {
  const recorded = trip("rec", "08:40", "09:05");

  it("finds a recording inside the trip being added, whatever its ends", () => {
    // Home to Depot 08:35 to 09:01 against Home to Tesco Extra 08:40 to 09:05.
    expect(firstOverlappingTrip([recorded], at("08:35"), at("09:01"))?.id).toBe("rec");
  });

  it("ignores back-to-back drives", () => {
    expect(firstOverlappingTrip([recorded], at("09:05"), at("09:30"))).toBeNull();
    expect(firstOverlappingTrip([recorded], at("08:10"), at("08:40"))).toBeNull();
  });

  it("ignores other times of day", () => {
    expect(firstOverlappingTrip([recorded], at("13:20"), at("13:45"))).toBeNull();
  });

  it("reads a missing end on the new trip as one minute at its start", () => {
    expect(firstOverlappingTrip([recorded], at("08:50"), null)?.id).toBe("rec");
    expect(firstOverlappingTrip([recorded], at("08:35"), null)).toBeNull();
  });

  it("puts the biggest overlap first, then the earliest", () => {
    const small = trip("small", "08:00", "08:40");
    const big = trip("big", "08:45", "09:30");
    const same = trip("same", "08:20", "08:40");
    const hits = overlappingTrips([small, big, same], at("08:30"), at("09:30"));
    expect(hits.map((t) => t.id)).toEqual(["big", "small", "same"]);
  });

  it("skips excluded ids and duplicates of the same trip", () => {
    expect(overlappingTrips([recorded, recorded], at("08:35"), at("09:01"))).toHaveLength(1);
    expect(overlappingTrips([recorded], at("08:35"), at("09:01"), { excludeIds: ["rec"] })).toEqual([]);
  });

  it("finds a trip with no end that starts inside the window", () => {
    expect(firstOverlappingTrip([trip("noend", "08:50", null)], at("08:35"), at("09:01"))?.id).toBe("noend");
  });
});

describe("overlapLookupWindow", () => {
  it("reaches a day back and up to the end", () => {
    const w = overlapLookupWindow(at("08:35"), at("09:01"));
    expect(at("08:35").getTime() - w.from.getTime()).toBe(OVERLAP_LOOKBACK_MS);
    expect(w.to).toEqual(at("09:01"));
  });
  it("uses one minute when there is no end", () => {
    const w = overlapLookupWindow(at("08:35"), null);
    expect(w.to.getTime() - at("08:35").getTime()).toBe(NO_END_TRIP_MS);
  });
});
