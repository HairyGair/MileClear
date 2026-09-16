/**
 * tripDuplicates: a hand-added drive whose recording lands later, or a
 * missed-journey gap the app then fills, should be marked as a possible
 * double-count. Two trips match when they overlap in time by at least half
 * the shorter one AND start and end within 0.5 mi of each other.
 */
import { describe, it, expect } from "vitest";
import { findDuplicateCandidate, type DuplicateCheckTrip } from "../../services/tripDuplicates.js";

// Leeds city centre to Headingley, about 2.5 miles.
const HOME = { lat: 53.7997, lng: -1.5492 };
const WORK = { lat: 53.8197, lng: -1.5787 };

const t = (
  id: string,
  startMin: number,
  endMin: number | null,
  o: Partial<DuplicateCheckTrip> = {}
): DuplicateCheckTrip => ({
  id,
  startedAt: new Date(Date.UTC(2026, 8, 14, 9, startMin)),
  endedAt: endMin == null ? null : new Date(Date.UTC(2026, 8, 14, 9, endMin)),
  startLat: HOME.lat,
  startLng: HOME.lng,
  endLat: WORK.lat,
  endLng: WORK.lng,
  isManualEntry: false,
  ...o,
});

// A point about 2 miles from HOME, where a typed "Leeds" might geocode.
const TOWN_CENTRE = { lat: 53.7997, lng: -1.5000 };

describe("findDuplicateCandidate - hand-added trips", () => {
  it("matches a hand-added trip against the recording that landed later, pins 2 miles apart", () => {
    const manual = t("m", 0, 30, { isManualEntry: true, startLat: TOWN_CENTRE.lat, startLng: TOWN_CENTRE.lng });
    const auto = t("a", 2, 31);
    expect(findDuplicateCandidate(auto, [manual])?.id).toBe("m");
    expect(findDuplicateCandidate(manual, [auto])?.id).toBe("a");
  });

  it("keeps the tight radius when both trips were recorded", () => {
    const a = t("a", 0, 30, { startLat: TOWN_CENTRE.lat, startLng: TOWN_CENTRE.lng });
    const b = t("b", 2, 31);
    expect(findDuplicateCandidate(a, [b])).toBeNull();
  });

  it("never pairs two hand-added trips, since merging them would double the miles", () => {
    const a = t("a", 0, 30, { isManualEntry: true });
    const b = t("b", 0, 30, { isManualEntry: true });
    expect(findDuplicateCandidate(a, [b])).toBeNull();
  });
});

describe("findDuplicateCandidate - a hand-added drive that spans two split legs (Terry Lamb, 16 Sep 2026)", () => {
  // NEC to Spitfire Island to home, 17.5 miles. The recording was auto-split
  // at the roundabout; the hand-added entry covers the whole drive.
  const NEC = { lat: 52.453, lng: -1.718 };
  const SPITFIRE = { lat: 52.5139, lng: -1.7983 };
  const HOME_TAMWORTH = { lat: 52.59, lng: -1.81 };
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 8, 15, h, m));
  const leg = (
    id: string,
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    start: Date,
    end: Date
  ): DuplicateCheckTrip => ({
    id,
    startedAt: start,
    endedAt: end,
    startLat: from.lat,
    startLng: from.lng,
    endLat: to.lat,
    endLng: to.lng,
    isManualEntry: false,
  });
  const leg1 = leg("leg1", NEC, SPITFIRE, at(16, 0), at(16, 23));
  const leg2 = leg("leg2", SPITFIRE, HOME_TAMWORTH, at(16, 27), at(16, 50));
  const manual: DuplicateCheckTrip = {
    ...leg("manual", NEC, HOME_TAMWORTH, at(16, 2), at(16, 49)),
    isManualEntry: true,
  };

  it("matches the joined legs and points at the first leg", () => {
    // Leg by leg, nothing matches: leg 1 ends nine miles short of home and
    // leg 2 starts seven miles from the NEC.
    expect(findDuplicateCandidate(manual, [leg1])).toBeNull();
    expect(findDuplicateCandidate(manual, [leg2])).toBeNull();
    expect(findDuplicateCandidate(manual, [leg2, leg1])?.id).toBe("leg1");
  });

  it("does not join two recorded legs with two hours between them", () => {
    const later = leg("leg2", SPITFIRE, HOME_TAMWORTH, at(18, 27), at(18, 50));
    expect(findDuplicateCandidate(manual, [leg1, later])).toBeNull();
  });

  it("does not join legs whose ends are miles apart", () => {
    const elsewhere = leg("leg2", { lat: 52.53, lng: -1.86 }, HOME_TAMWORTH, at(16, 27), at(16, 50));
    expect(findDuplicateCandidate(manual, [leg1, elsewhere])).toBeNull();
  });

  it("never joins a hand-added leg with anything", () => {
    const manualLeg1: DuplicateCheckTrip = { ...leg1, isManualEntry: true };
    expect(findDuplicateCandidate(manual, [manualLeg1, leg2])).toBeNull();
  });

  it("only joins legs for a hand-added trip", () => {
    const recordedWhole = leg("whole", NEC, HOME_TAMWORTH, at(16, 2), at(16, 49));
    expect(findDuplicateCandidate(recordedWhole, [leg1, leg2])).toBeNull();
  });
});

describe("findDuplicateCandidate", () => {
  it("matches the exact same journey", () => {
    const recorded = t("recorded", 0, 20);
    const manual = t("manual", 0, 20);
    expect(findDuplicateCandidate(manual, [recorded])?.id).toBe("recorded");
  });

  it("matches a journey shifted by a few minutes with the pins a street away", () => {
    const recorded = t("recorded", 0, 20);
    const manual = t("manual", 5, 22, {
      startLat: HOME.lat + 0.002,
      startLng: HOME.lng - 0.002,
      endLat: WORK.lat - 0.002,
      endLng: WORK.lng + 0.002,
    });
    expect(findDuplicateCandidate(manual, [recorded])?.id).toBe("recorded");
  });

  it("does not match when the time overlap is under half the shorter trip", () => {
    const recorded = t("recorded", 0, 20);
    // 20 to 30 overlaps the recorded trip by nothing; 15 to 35 overlaps by 5
    // of its 20 minutes, a quarter.
    const manual = t("manual", 15, 35);
    expect(findDuplicateCandidate(manual, [recorded])).toBeNull();
  });

  it("does not match the same time with a different destination", () => {
    const recorded = t("recorded", 0, 20);
    const manual = t("manual", 0, 20, { endLat: 53.95, endLng: -1.08 });
    expect(findDuplicateCandidate(manual, [recorded])).toBeNull();
  });

  it("does not match the same time with a different start", () => {
    const recorded = t("recorded", 0, 20);
    const manual = t("manual", 0, 20, { startLat: 53.95, startLng: -1.08 });
    expect(findDuplicateCandidate(manual, [recorded])).toBeNull();
  });

  it("skips a trip with no end time", () => {
    const open = t("open", 0, null);
    const manual = t("manual", 0, 20);
    expect(findDuplicateCandidate(manual, [open])).toBeNull();
    expect(findDuplicateCandidate(open, [t("recorded", 0, 20)])).toBeNull();
  });

  it("skips a trip with no end point", () => {
    const noEnd = t("noEnd", 0, 20, { endLat: null, endLng: null });
    expect(findDuplicateCandidate(t("manual", 0, 20), [noEnd])).toBeNull();
  });

  it("never matches a trip against itself", () => {
    const same = t("same", 0, 20);
    expect(findDuplicateCandidate(same, [same])).toBeNull();
  });

  it("prefers the candidate that overlaps most", () => {
    const partial = t("partial", 8, 28);
    const full = t("full", 0, 20);
    expect(findDuplicateCandidate(t("manual", 0, 20), [partial, full])?.id).toBe("full");
  });
});
