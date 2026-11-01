import { describe, expect, it } from "vitest";
import { ARRIVED_CARD_MARGIN_MS, arrivedCardOffered, cardTapPlan } from "../tripInProgress";
import {
  openStartTripPlan,
  registersAsRecording,
  resumeSecondCopyPlan,
  type StackStateLike,
} from "../startTripCard";
import { PENDING_ARRIVED_MAX_AGE_MS, type PendingArrivedFacts } from "../../tracking/arrivedRecovery";

const now = 1_800_000_000_000;
const min = 60_000;

const facts = (arrivedAtMs: number): PendingArrivedFacts => ({
  startLat: 51.5,
  startLng: -0.1,
  startAddress: null,
  endLat: 51.6,
  endLng: -0.2,
  endAddress: null,
  startedAt: new Date(now - 90 * min).toISOString(),
  endedAt: new Date(now - 30 * min).toISOString(),
  distanceMiles: 5,
  arrivedAtMs,
});

describe("arrivedCardOffered", () => {
  it("stops a margin before the trip screen's 12 hours", () => {
    const edge = PENDING_ARRIVED_MAX_AGE_MS - ARRIVED_CARD_MARGIN_MS;
    expect(arrivedCardOffered(facts(now - edge + min), now)).toBe(true);
    expect(arrivedCardOffered(facts(now - edge - min), now)).toBe(false);
  });

  it("keeps a future-dated stamp offered, like the trip screen does", () => {
    expect(arrivedCardOffered(facts(now + 5 * min), now)).toBe(true);
  });
});

describe("cardTapPlan", () => {
  const base = { button: true, startTripStartedAtMs: now - 5 * min, nowMs: now };

  it("Save trip never asks the screen to arrive", () => {
    const plan = cardTapPlan({ ...base, kind: "arrived_unsaved", facts: facts(now - min) });
    expect(plan).toEqual({ go: "open_start_trip", arrive: false });
  });

  it("rechecks at tap time: a card left on screen past the limit does nothing", () => {
    const f = facts(now - (PENDING_ARRIVED_MAX_AGE_MS - 5 * min));
    expect(arrivedCardOffered(f, now - 10 * min)).toBe(true); // when it rendered
    expect(cardTapPlan({ ...base, kind: "arrived_unsaved", facts: f })).toEqual({ go: "none" });
  });

  it("a future-dated stamp still opens", () => {
    expect(cardTapPlan({ ...base, kind: "arrived_unsaved", facts: facts(now + min) }).go).toBe("open_start_trip");
  });

  it("I've Arrived on a running Start Trip arrives and carries the start time", () => {
    expect(cardTapPlan({ ...base, kind: "start_trip", facts: null })).toEqual({
      go: "open_start_trip",
      arrive: true,
      fromCardStartedAtMs: now - 5 * min,
    });
    expect(cardTapPlan({ ...base, button: false, kind: "start_trip", facts: null })).toMatchObject({ arrive: false });
  });

  it("an automatic recording goes to its recording screen", () => {
    expect(cardTapPlan({ ...base, kind: "automatic", facts: null })).toEqual({ go: "active_recording" });
  });
});

describe("registersAsRecording", () => {
  it("registers while driving", () => {
    expect(registersAsRecording("driving", false, false, false)).toBe(true);
  });
  it("registers an unsaved arrived trip only", () => {
    expect(registersAsRecording("arrived", false, false, true)).toBe(true);
    expect(registersAsRecording("arrived", true, false, true)).toBe(false);
    expect(registersAsRecording("arrived", false, true, true)).toBe(false);
    expect(registersAsRecording("arrived", false, false, false)).toBe(false);
    expect(registersAsRecording("viewing", false, false, true)).toBe(false);
  });
});

describe("an arrived screen as the open copy", () => {
  const state: StackStateLike = {
    index: 2,
    routes: [
      { key: "home", name: "(tabs)" },
      { key: "arrivedScreen", name: "trip-form" },
      { key: "fuel", name: "fuel" },
    ],
  };

  it("openStartTripPlan goes back to it", () => {
    expect(openStartTripPlan(state, ["arrivedScreen"])).toEqual({ kind: "pop", count: 1, key: "arrivedScreen" });
  });

  it("a second copy restoring the same trip gives way to it", () => {
    const withCopy: StackStateLike = { index: 3, routes: [...state.routes, { key: "copy", name: "trip-form" }] };
    expect(resumeSecondCopyPlan(withCopy, ["arrivedScreen"], "copy", false)).toEqual({
      kind: "pop",
      count: 2,
      key: "arrivedScreen",
    });
  });
});
