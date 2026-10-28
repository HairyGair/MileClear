import { beforeEach, describe, expect, it } from "vitest";
import {
  ARRIVE_REQUEST_TTL_MS,
  OPEN_START_TRIP_DEBOUNCE_MS,
  START_TRIP_RESUME_MAX_MS,
  arriveRequestLive,
  openStartTripDue,
  openStartTripPlan,
  startTripCardModel,
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
  lock: "quick",
  autoRecording: false,
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
    expect(startTripCardModel(base({ lock: "other" }))).toBeNull();
  });

  it("shows with no lock when the start row remains (the screen still resumes it), unless an automatic recording is open", () => {
    expect(startTripCardModel(base({ lock: "none" }))).not.toBeNull();
    expect(startTripCardModel(base({ lock: "none", autoRecording: true }))).toBeNull();
    // With the Start Trip's own lock an auto flag does not hide it.
    expect(startTripCardModel(base({ lock: "quick", autoRecording: true }))).not.toBeNull();
  });

  it("is hidden without a readable start row: the screen would open a fresh trip", () => {
    expect(startTripCardModel(base({ startedAtMs: null }))).toBeNull();
    expect(startTripCardModel(base({ startedAtMs: NaN }))).toBeNull();
  });

  it("is hidden for a start row the screen would clear as stale, or one in the future", () => {
    expect(startTripCardModel(base({ startedAtMs: now - START_TRIP_RESUME_MAX_MS - 1 }))).toBeNull();
    expect(startTripCardModel(base({ startedAtMs: now - START_TRIP_RESUME_MAX_MS }))).not.toBeNull();
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
    expect(openStartTripPlan(state, ["form-A"])).toEqual({ kind: "pop", count: 1 });
  });

  it("skips a different trip screen nearer the top (one being viewed or typed in)", () => {
    const state = {
      index: 4,
      routes: [r("tabs-1", "(tabs)"), r("form-A", "trip-form"), r("tabs-2", "(tabs)"), r("form-B", "trip-form"), r("tabs-3", "(tabs)")],
    };
    expect(openStartTripPlan(state, ["form-A"])).toEqual({ kind: "pop", count: 3 });
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
    expect(openStartTripPlan(state, ["form-A", "form-C"])).toEqual({ kind: "pop", count: 1 });
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
