import { beforeEach, describe, expect, it } from "vitest";
import {
  ARRIVE_REQUEST_TTL_MS,
  OPEN_START_TRIP_DEBOUNCE_MS,
  START_TRIP_CARD_MAX_MS,
  START_TRIP_RESUME_MAX_MS,
  arriveRequestLive,
  openStartTripDue,
  openStartTripPlan,
  popLanded,
  resumeSecondCopyPlan,
  startTripCardModel,
  startTripCardTapAllowed,
  type StartTripCardInputs,
} from "../startTripCard";
import {
  __resetStartTripRequest,
  dropArriveRequest,
  hasArriveRequest,
  recordingStartTripScreens,
  registerRecordingStartTripScreen,
  requestArriveFromHome,
  takeArriveRequest,
} from "../startTripRequest";

const now = 1_800_000_000_000;
const min = 60_000;

const base = (over: Partial<StartTripCardInputs> = {}): StartTripCardInputs => ({
  quickLockHeld: true,
  startedAtMs: now - 24 * min,
  miles: 12.44,
  now,
  ...over,
});

describe("startTripCardModel", () => {
  it("shows a running Start Trip with its distance and time", () => {
    expect(startTripCardModel(base())).toEqual({
      title: "Trip in progress",
      detail: "12.4 mi · 24 min",
      a11yLabel: "Trip in progress, 12.4 mi, 24 min",
    });
  });

  it("uses the driver's unit and rounds long trips", () => {
    expect(startTripCardModel(base({ startedAtMs: now - 65 * min, miles: 10, unit: "km" }))?.detail).toBe("16.1 km · 1 h 5 min");
    expect(startTripCardModel(base({ startedAtMs: now - 3 * 60 * min, miles: 127.64 }))?.detail).toBe("128 mi · 3 h");
  });

  it("never shows over a shift or an Arrived waiting to be saved", () => {
    // No lock (a self-heal stopped the GPS), a shift, or an Arrived pending.
    expect(startTripCardModel(base({ quickLockHeld: false }))).toBeNull();
  });

  it("is hidden without a readable start row: the screen would open a fresh trip", () => {
    expect(startTripCardModel(base({ startedAtMs: null }))).toBeNull();
    expect(startTripCardModel(base({ startedAtMs: NaN }))).toBeNull();
  });

  it("is hidden for a start row the screen would clear as stale, or one in the future", () => {
    expect(START_TRIP_CARD_MAX_MS).toBeLessThan(START_TRIP_RESUME_MAX_MS);
    expect(startTripCardModel(base({ startedAtMs: now - START_TRIP_CARD_MAX_MS }))).toBeNull();
    expect(startTripCardModel(base({ startedAtMs: now - START_TRIP_CARD_MAX_MS + 1 }))).not.toBeNull();
    expect(startTripCardModel(base({ startedAtMs: now - START_TRIP_RESUME_MAX_MS }))).toBeNull();
    expect(startTripCardModel(base({ startedAtMs: now + min }))).toBeNull();
  });
});

describe("arriveRequestLive", () => {
  it("is fresh for the TTL only", () => {
    expect(arriveRequestLive(null, now)).toBe(false);
    expect(arriveRequestLive(now, now)).toBe(true);
    expect(arriveRequestLive(now - ARRIVE_REQUEST_TTL_MS, now)).toBe(true);
    expect(arriveRequestLive(now - ARRIVE_REQUEST_TTL_MS - 1, now)).toBe(false);
    expect(arriveRequestLive(now + 1, now)).toBe(false);
  });
});

describe("openStartTripPlan", () => {
  const r = (key: string, name: string) => ({ key, name });

  it("pops exactly to the recording screen below the tabs a notification opened", () => {
    const state = { index: 2, routes: [r("tabs-1", "(tabs)"), r("form-A", "trip-form"), r("tabs-2", "(tabs)")] };
    expect(openStartTripPlan(state, ["form-A"])).toEqual({ kind: "pop", count: 1, key: "form-A" });
  });

  it("skips a different trip screen nearer the top (one being viewed or typed in)", () => {
    const state = {
      index: 4,
      routes: [r("tabs-1", "(tabs)"), r("form-A", "trip-form"), r("tabs-2", "(tabs)"), r("form-B", "trip-form"), r("tabs-3", "(tabs)")],
    };
    expect(openStartTripPlan(state, ["form-A"])).toEqual({ kind: "pop", count: 3, key: "form-A" });
  });

  it("opens a fresh screen when the registered one has left the stack (still closing)", () => {
    const state = { index: 0, routes: [r("tabs-1", "(tabs)")] };
    expect(openStartTripPlan(state, ["form-A"])).toEqual({ kind: "open" });
  });

  it("opens a fresh screen when only an unregistered trip screen is in the stack", () => {
    const state = { index: 2, routes: [r("tabs-1", "(tabs)"), r("form-B", "trip-form"), r("tabs-2", "(tabs)")] };
    expect(openStartTripPlan(state, [])).toEqual({ kind: "open" });
  });

  it("does nothing when the recording screen is already on top", () => {
    const state = { index: 1, routes: [r("tabs-1", "(tabs)"), r("form-A", "trip-form")] };
    expect(openStartTripPlan(state, ["form-A"])).toEqual({ kind: "here" });
  });

  it("goes to the nearest of two recording screens", () => {
    const state = { index: 3, routes: [r("tabs-1", "(tabs)"), r("form-A", "trip-form"), r("form-C", "trip-form"), r("tabs-2", "(tabs)")] };
    expect(openStartTripPlan(state, ["form-A", "form-C"])).toEqual({ kind: "pop", count: 1, key: "form-C" });
  });
});

describe("startTripCardTapAllowed", () => {
  it("allows a tap only well inside the resume guard, checked at the tap", () => {
    expect(startTripCardTapAllowed(now - min, now)).toBe(true);
    expect(startTripCardTapAllowed(now - START_TRIP_CARD_MAX_MS + 1, now)).toBe(true);
    expect(startTripCardTapAllowed(now - START_TRIP_CARD_MAX_MS, now)).toBe(false);
    expect(startTripCardTapAllowed(null, now)).toBe(false);
    expect(startTripCardTapAllowed(now + min, now)).toBe(false);
  });
});

describe("resumeSecondCopyPlan", () => {
  const r = (key: string, name: string) => ({ key, name });
  // A trip screen (B) opened from Trips while A records below.
  const state = { index: 3, routes: [r("tabs-1", "(tabs)"), r("A", "trip-form"), r("tabs-2", "(tabs)"), r("B", "trip-form")] };

  it("resumes when no other screen is recording", () => {
    expect(resumeSecondCopyPlan(state, [], "B", false)).toEqual({ kind: "resume" });
    expect(resumeSecondCopyPlan(state, ["B"], "B", false)).toEqual({ kind: "resume" });
  });

  it("gives way to the recording screen by popping back to it", () => {
    expect(resumeSecondCopyPlan(state, ["A"], "B", false)).toEqual({ kind: "pop", count: 2, key: "A" });
  });

  it("a past-trip form stays a past-trip form", () => {
    expect(resumeSecondCopyPlan(state, ["A"], "B", true)).toEqual({ kind: "stay_manual" });
  });

  it("resumes when the registered screen is no longer in the stack", () => {
    const gone = { index: 1, routes: [r("tabs-1", "(tabs)"), r("B", "trip-form")] };
    expect(resumeSecondCopyPlan(gone, ["A"], "B", false)).toEqual({ kind: "resume" });
  });
});

describe("popLanded", () => {
  const r = (key: string, name: string) => ({ key, name });
  it("is true only when the aimed-at screen is on top", () => {
    expect(popLanded({ index: 1, routes: [r("t", "(tabs)"), r("A", "trip-form")] }, "A")).toBe(true);
    // "Keep editing": the screen in between stayed.
    expect(popLanded({ index: 2, routes: [r("t", "(tabs)"), r("A", "trip-form"), r("B", "trip-form")] }, "A")).toBe(false);
    expect(popLanded(null, "A")).toBe(false);
  });

  it("ignores routes above the focused index, and a missing or empty state", () => {
    const state = { index: 0, routes: [r("tabs-1", "(tabs)"), r("form-A", "trip-form")] };
    expect(openStartTripPlan(state, ["form-A"])).toEqual({ kind: "open" });
    expect(openStartTripPlan(null, ["form-A"])).toEqual({ kind: "open" });
    expect(openStartTripPlan({ index: 0, routes: [] }, ["form-A"])).toEqual({ kind: "open" });
  });
});

describe("openStartTripDue", () => {
  it("treats two quick taps as one", () => {
    expect(openStartTripDue(null, now)).toBe(true);
    expect(openStartTripDue(now - OPEN_START_TRIP_DEBOUNCE_MS + 1, now)).toBe(false);
    expect(openStartTripDue(now - OPEN_START_TRIP_DEBOUNCE_MS, now)).toBe(true);
  });
});

describe("startTripRequest", () => {
  beforeEach(() => __resetStartTripRequest());

  const screen = (key: string) => ({ key, getState: () => null, pop: () => {} });

  it("keeps the recording screens in order, and an unregister runs once", () => {
    const a = registerRecordingStartTripScreen(screen("A"));
    const b = registerRecordingStartTripScreen(screen("B"));
    expect(recordingStartTripScreens().map((s) => s.key)).toEqual(["A", "B"]);
    a();
    a();
    expect(recordingStartTripScreens().map((s) => s.key)).toEqual(["B"]);
    b();
    expect(recordingStartTripScreens()).toEqual([]);
  });

  it("an Arrived request is taken once", () => {
    requestArriveFromHome(now);
    expect(hasArriveRequest()).toBe(true);
    expect(takeArriveRequest(now + 1000)).toBe(true);
    expect(takeArriveRequest(now + 1000)).toBe(false);
    expect(hasArriveRequest()).toBe(false);
  });

  it("a stale request is dropped, not acted on", () => {
    requestArriveFromHome(now);
    expect(takeArriveRequest(now + ARRIVE_REQUEST_TTL_MS + 1)).toBe(false);
    expect(hasArriveRequest()).toBe(false);
  });

  it("drop forgets a request", () => {
    requestArriveFromHome(now);
    dropArriveRequest();
    expect(takeArriveRequest(now)).toBe(false);
  });
});
