import { beforeEach, describe, expect, it } from "vitest";
import {
  ARRIVE_REQUEST_TTL_MS,
  OPEN_START_TRIP_DEBOUNCE_MS,
  START_TRIP_RESUME_MAX_MS,
  arriveRequestLive,
  openStartTripAction,
  openStartTripDue,
  startTripCardModel,
} from "../startTripCard";
import {
  __resetStartTripRequest,
  dropArriveRequest,
  drivingStartTripScreens,
  hasArriveRequest,
  newestDrivingScreenParams,
  registerDrivingStartTripScreen,
  requestArriveFromHome,
  stringParams,
  takeArriveRequest,
} from "../startTripRequest";

const now = 1_800_000_000_000;
const min = 60_000;

describe("startTripCardModel", () => {
  it("shows a running Start Trip with its distance and time", () => {
    const m = startTripCardModel({ quickLockHeld: true, startedAtMs: now - 24 * min, miles: 12.44, now });
    expect(m).toEqual({
      title: "Trip in progress",
      detail: "12.4 mi · 24 min",
      a11yLabel: "Trip in progress, 12.4 mi, 24 min",
    });
  });

  it("uses the driver's unit and rounds long trips", () => {
    expect(startTripCardModel({ quickLockHeld: true, startedAtMs: now - 65 * min, miles: 10, now, unit: "km" })?.detail).toBe(
      "16.1 km · 1 h 5 min"
    );
    expect(startTripCardModel({ quickLockHeld: true, startedAtMs: now - 3 * 60 * min, miles: 127.64, now })?.detail).toBe(
      "128 mi · 3 h"
    );
  });

  it("is hidden with no Start Trip lock (none running, Arrived pending, auto recording, a shift)", () => {
    expect(startTripCardModel({ quickLockHeld: false, startedAtMs: now - min, miles: 1, now })).toBeNull();
  });

  it("is hidden without a readable start row: the screen would open a fresh trip", () => {
    expect(startTripCardModel({ quickLockHeld: true, startedAtMs: null, miles: 1, now })).toBeNull();
    expect(startTripCardModel({ quickLockHeld: true, startedAtMs: NaN, miles: 1, now })).toBeNull();
  });

  it("is hidden for a start row the screen would clear as stale, or one in the future", () => {
    expect(startTripCardModel({ quickLockHeld: true, startedAtMs: now - START_TRIP_RESUME_MAX_MS - 1, miles: 1, now })).toBeNull();
    expect(startTripCardModel({ quickLockHeld: true, startedAtMs: now - START_TRIP_RESUME_MAX_MS, miles: 1, now })).not.toBeNull();
    expect(startTripCardModel({ quickLockHeld: true, startedAtMs: now + min, miles: 1, now })).toBeNull();
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

describe("openStartTripAction / openStartTripDue", () => {
  it("goes back to a mounted Start Trip screen instead of opening a second", () => {
    expect(openStartTripAction(0)).toBe("open_screen");
    expect(openStartTripAction(1)).toBe("back_to_screen");
  });
  it("treats two quick taps as one", () => {
    expect(openStartTripDue(null, now)).toBe(true);
    expect(openStartTripDue(now - OPEN_START_TRIP_DEBOUNCE_MS + 1, now)).toBe(false);
    expect(openStartTripDue(now - OPEN_START_TRIP_DEBOUNCE_MS, now)).toBe(true);
  });
});

describe("startTripRequest", () => {
  beforeEach(() => __resetStartTripRequest());

  it("counts driving screens, and an unregister runs once", () => {
    const a = registerDrivingStartTripScreen();
    const b = registerDrivingStartTripScreen();
    expect(drivingStartTripScreens()).toBe(2);
    a();
    a();
    expect(drivingStartTripScreens()).toBe(1);
    b();
    expect(drivingStartTripScreens()).toBe(0);
  });

  it("hands back the newest driving screen's own params", () => {
    expect(newestDrivingScreenParams()).toEqual({});
    const a = registerDrivingStartTripScreen({ chain: "1" });
    const b = registerDrivingStartTripScreen({});
    expect(newestDrivingScreenParams()).toEqual({});
    b();
    expect(newestDrivingScreenParams()).toEqual({ chain: "1" });
    a();
    expect(newestDrivingScreenParams()).toEqual({});
  });

  it("keeps only string params", () => {
    expect(stringParams({ a: "1", b: ["x"], c: undefined, d: 2 })).toEqual({ a: "1" });
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
