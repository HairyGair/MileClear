import { describe, expect, it } from "vitest";
import { pickHeadlessLocation, readHeadlessIsMoving, routeHeadlessEvent } from "../headlessFinalizeRule";

describe("readHeadlessIsMoving", () => {
  it("reads the motionchange flag and nothing else", () => {
    expect(readHeadlessIsMoving("motionchange", { isMoving: false, location: {} })).toBe(false);
    expect(readHeadlessIsMoving("motionchange", { isMoving: true })).toBe(true);
    expect(readHeadlessIsMoving("motionchange", {})).toBeNull();
    expect(readHeadlessIsMoving("motionchange", undefined)).toBeNull();
    expect(readHeadlessIsMoving("location", { isMoving: false })).toBeNull();
    expect(readHeadlessIsMoving("motionchange", { isMoving: "false" })).toBeNull();
  });
});

describe("routeHeadlessEvent", () => {
  const android = { platform: "android" };

  it("finalises when the car parks with a recording open (the 90-minute gap)", () => {
    expect(routeHeadlessEvent({ ...android, name: "motionchange", isMoving: false, recordingOpen: true })).toBe(
      "finalize"
    );
  });

  it("does not treat a 'moving' or a flag-less motionchange as a stop", () => {
    expect(routeHeadlessEvent({ ...android, name: "motionchange", isMoving: true, recordingOpen: true })).toBe("ignore");
    expect(routeHeadlessEvent({ ...android, name: "motionchange", isMoving: null, recordingOpen: true })).toBe("ignore");
  });

  it("buffers a fix while a recording is open", () => {
    expect(routeHeadlessEvent({ ...android, name: "location", isMoving: null, recordingOpen: true })).toBe("buffer");
  });

  it("leaves the no-recording case to the existing speed-wake rule", () => {
    expect(routeHeadlessEvent({ ...android, name: "location", isMoving: null, recordingOpen: false })).toBe("wake");
    expect(routeHeadlessEvent({ ...android, name: "motionchange", isMoving: false, recordingOpen: false })).toBe("wake");
    expect(routeHeadlessEvent({ ...android, name: "motionchange", isMoving: true, recordingOpen: false })).toBe("wake");
  });

  it("hands the fix itself to the handler for a location event, the nested one for motionchange", () => {
    const loc = { coords: { latitude: 1, longitude: 2, speed: 9 } };
    expect(pickHeadlessLocation("location", loc)).toBe(loc);
    expect(pickHeadlessLocation("motionchange", { isMoving: true, location: loc })).toBe(loc);
  });

  it("hands nothing to the handler when there is no fix to hand", () => {
    expect(pickHeadlessLocation("heartbeat", { location: { coords: {} } })).toBeNull();
    expect(pickHeadlessLocation("location", {})).toBeNull();
    expect(pickHeadlessLocation("motionchange", { isMoving: true })).toBeNull();
  });

  it("ignores every other event and every other platform", () => {
    for (const name of ["heartbeat", "boot", "terminate", "geofence", "providerchange", ""]) {
      expect(routeHeadlessEvent({ ...android, name, isMoving: null, recordingOpen: true })).toBe("ignore");
    }
    expect(routeHeadlessEvent({ platform: "ios", name: "motionchange", isMoving: false, recordingOpen: true })).toBe(
      "ignore"
    );
    expect(routeHeadlessEvent({ platform: "web", name: "location", isMoving: null, recordingOpen: true })).toBe("ignore");
  });
});
