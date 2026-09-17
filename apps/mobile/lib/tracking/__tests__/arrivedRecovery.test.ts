import { describe, expect, it } from "vitest";
import {
  buildDiscardReport,
  DISCARD_REPORT_MAX_MILES,
  parsePendingArrived,
  pendingArrivedAction,
  qualifiesForDiscardReport,
  shouldPersistArrivedTrip,
  type PendingArrivedFacts,
} from "../arrivedRecovery";

// Thu 17 Sep 2026 17:00 local.
const NOW = new Date(2026, 8, 17, 17, 0).getTime();

function facts(over: Partial<PendingArrivedFacts> = {}): PendingArrivedFacts {
  return {
    startLat: 51.5074,
    startLng: -0.1278,
    startAddress: "Old Street",
    endLat: 51.4545,
    endLng: -2.5879,
    endAddress: "Bristol",
    startedAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
    endedAt: new Date(NOW).toISOString(),
    distanceMiles: 118.4,
    arrivedAtMs: NOW,
    ...over,
  };
}

describe("shouldPersistArrivedTrip", () => {
  it("keeps a trip that has both endpoints and a trail", () => {
    expect(
      shouldPersistArrivedTrip({
        startLat: 51.5,
        startLng: -0.12,
        endLat: 51.45,
        endLng: -2.58,
        crumbCount: 940,
        distanceMiles: 118.4,
      })
    ).toBe(true);
  });

  it("keeps a trip with no trail but a measured distance, because that is still the only copy", () => {
    expect(
      shouldPersistArrivedTrip({
        startLat: 51.5,
        startLng: -0.12,
        endLat: 51.45,
        endLng: -2.58,
        crumbCount: 0,
        distanceMiles: 4.2,
      })
    ).toBe(true);
  });

  it("keeps nothing when there is no end fix to restore or report", () => {
    expect(
      shouldPersistArrivedTrip({
        startLat: 51.5,
        startLng: -0.12,
        endLat: null,
        endLng: null,
        crumbCount: 940,
        distanceMiles: 118.4,
      })
    ).toBe(false);
  });

  it("keeps nothing when nothing was recorded at all", () => {
    expect(
      shouldPersistArrivedTrip({
        startLat: 51.5,
        startLng: -0.12,
        endLat: 51.5,
        endLng: -0.12,
        crumbCount: 1,
        distanceMiles: 0,
      })
    ).toBe(false);
  });
});

describe("parsePendingArrived", () => {
  it("reads back what was written", () => {
    const f = facts();
    expect(parsePendingArrived(JSON.stringify(f))).toEqual(f);
  });

  it("treats a missing, malformed or half-written record as nothing rather than throwing", () => {
    expect(parsePendingArrived(null)).toBeNull();
    expect(parsePendingArrived("{oops")).toBeNull();
    expect(parsePendingArrived(JSON.stringify({ startLat: 51.5 }))).toBeNull();
    // End before start: the record cannot be trusted.
    expect(
      parsePendingArrived(
        JSON.stringify(facts({ endedAt: new Date(NOW - 4 * 60 * 60 * 1000).toISOString() }))
      )
    ).toBeNull();
  });
});

describe("pendingArrivedAction", () => {
  it("offers one from this afternoon and expires one from yesterday", () => {
    expect(pendingArrivedAction(facts(), NOW)).toBe("offer");
    expect(pendingArrivedAction(facts({ arrivedAtMs: NOW - 13 * 60 * 60 * 1000 }), NOW)).toBe("expire");
  });

  it("offers rather than expires when the stamp is broken or in the future", () => {
    // Offering costs a driver one tap; expiring costs them the drive.
    expect(pendingArrivedAction(facts({ arrivedAtMs: Number.NaN }), NOW)).toBe("offer");
    expect(pendingArrivedAction(facts({ arrivedAtMs: NOW + 60 * 60 * 1000 }), NOW)).toBe("offer");
  });

  it("does nothing when there is no stored trip", () => {
    expect(pendingArrivedAction(null, NOW)).toBe("none");
  });
});

describe("buildDiscardReport", () => {
  it("reports a long drive that was thrown away", () => {
    const report = buildDiscardReport(facts());
    expect(report).not.toBeNull();
    expect(report!.reason).toBe("start_trip_discarded");
    expect(report!.recordedMiles).toBe(118.4);
    expect(report!.fromLat).toBe(51.5074);
    expect(report!.toLng).toBe(-2.5879);
  });

  it("reports on either test: ten minutes, or a mile", () => {
    // Twelve minutes crawling half a mile through town.
    const slow = facts({
      startedAt: new Date(NOW - 12 * 60 * 1000).toISOString(),
      distanceMiles: 0.5,
    });
    expect(qualifiesForDiscardReport(slow)).toBe(true);
    // Two minutes, but a mile and a half of it.
    const quick = facts({
      startedAt: new Date(NOW - 2 * 60 * 1000).toISOString(),
      distanceMiles: 1.5,
    });
    expect(qualifiesForDiscardReport(quick)).toBe(true);
  });

  it("stays quiet about a short hop the driver meant to throw away", () => {
    const shuffle = facts({
      startedAt: new Date(NOW - 90 * 1000).toISOString(),
      distanceMiles: 0.3,
    });
    expect(buildDiscardReport(shuffle)).toBeNull();
    expect(qualifiesForDiscardReport(shuffle)).toBe(false);
  });

  it("clamps an absurd distance instead of sending one the server refuses", () => {
    const corrupt = facts({ distanceMiles: 99999 });
    expect(buildDiscardReport(corrupt)!.recordedMiles).toBe(DISCARD_REPORT_MAX_MILES);
  });

  it("refuses a trip that took no time, which the endpoint would reject anyway", () => {
    expect(buildDiscardReport(facts({ startedAt: facts().endedAt }))).toBeNull();
    expect(buildDiscardReport(null)).toBeNull();
  });
});
