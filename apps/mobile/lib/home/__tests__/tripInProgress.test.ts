import { describe, expect, it } from "vitest";
import { arrivedUnsavedCardModel, automaticCardModel, selectTripCard } from "../tripInProgress";
import { PENDING_ARRIVED_MAX_AGE_MS, type PendingArrivedFacts } from "../../tracking/arrivedRecovery";

const now = 1_800_000_000_000;
const min = 60_000;

const facts = (over: Partial<PendingArrivedFacts> = {}): PendingArrivedFacts => ({
  startLat: 51.5,
  startLng: -0.1,
  startAddress: null,
  endLat: 51.6,
  endLng: -0.2,
  endAddress: null,
  startedAt: new Date(now - 90 * min).toISOString(),
  endedAt: new Date(now - 30 * min).toISOString(),
  distanceMiles: 12.44,
  arrivedAtMs: now - 30 * min,
  ...over,
});

describe("arrivedUnsavedCardModel", () => {
  it("shows an arrived trip that is not saved yet, with a Save trip button", () => {
    const m = arrivedUnsavedCardModel({ facts: facts(), now });
    expect(m?.title).toBe("Trip ready to save");
    expect(m?.detail).toBe("12.4 mi · 1 h");
    expect(m?.actionLabel).toBe("Save trip");
  });

  it("is hidden with nothing waiting", () => {
    expect(arrivedUnsavedCardModel({ facts: null, now })).toBeNull();
  });

  it("is hidden once the trip is too old for the trip screen to put back", () => {
    const old = facts({ arrivedAtMs: now - PENDING_ARRIVED_MAX_AGE_MS - min });
    expect(arrivedUnsavedCardModel({ facts: old, now })).toBeNull();
  });

  it("still shows with a broken stamp (offering costs one tap, hiding costs a drive)", () => {
    expect(arrivedUnsavedCardModel({ facts: facts({ arrivedAtMs: Number.NaN }), now })).not.toBeNull();
  });

  it("shows time only when the distance is not known yet", () => {
    const m = arrivedUnsavedCardModel({ facts: facts({ distanceMiles: null }), now });
    expect(m?.detail).toBe("1 h");
  });

  it("uses kilometres when asked", () => {
    const m = arrivedUnsavedCardModel({ facts: facts({ distanceMiles: 10 }), now, unit: "km" });
    expect(m?.detail).toContain("km");
  });
});

describe("automaticCardModel", () => {
  it("shows an automatic recording", () => {
    const m = automaticCardModel({ recording: { miles: 3.2, elapsedMs: 9 * min, mode: "auto" } });
    expect(m?.detail).toBe("3.2 mi · 9 min");
    expect(m?.actionLabel).toBe("See trip");
  });

  it("leaves a Start Trip to its own card", () => {
    expect(automaticCardModel({ recording: { miles: 1, elapsedMs: min, mode: "quick" } })).toBeNull();
  });

  it("is hidden when nothing records", () => {
    expect(automaticCardModel({ recording: null })).toBeNull();
  });
});

describe("selectTripCard", () => {
  const a = { title: "a", detail: "", a11yLabel: "" };
  const b = { title: "b", detail: "", a11yLabel: "" };
  const c = { title: "c", detail: "", a11yLabel: "" };

  it("puts a trip waiting to be saved first, then Start Trip, then automatic", () => {
    expect(selectTripCard({ arrived: a, startTrip: b, automatic: c })?.kind).toBe("arrived_unsaved");
    expect(selectTripCard({ arrived: null, startTrip: b, automatic: c })?.kind).toBe("start_trip");
    expect(selectTripCard({ arrived: null, startTrip: null, automatic: c })?.kind).toBe("automatic");
  });

  it("is null when no trip is unfinished", () => {
    expect(selectTripCard({ arrived: null, startTrip: null, automatic: null })).toBeNull();
  });
});
