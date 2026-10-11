import { describe, it, expect } from "vitest";
import { moreStatus } from "../problem";
import { selectStatusLine } from "../../home/statusLine";

const now = Date.UTC(2026, 9, 11, 10);
const fine = {
  loaded: true,
  recording: null,
  blocker: null,
  failedSyncCount: 0,
  pausedUntil: null,
  now,
  automaticOff: false,
  lowPowerMode: false,
  platform: "ios" as const,
  setup: null,
  recovered: null,
  notifications: "granted" as const,
};

describe("More's problem strip", () => {
  it("nothing when all is well, or before the phone has answered", () => {
    expect(moreStatus(fine)).toEqual({ problem: null, recordingNote: null });
    expect(moreStatus({ ...fine, loaded: false, blocker: "no_location" }).problem).toBeNull();
  });

  it("uses Home's own words and Fix for a recording blocker", () => {
    const s = moreStatus({ ...fine, blocker: "permission_lost" });
    const home = selectStatusLine({ ...fine, blocker: "permission_lost" });
    expect(s.problem!.model.title).toBe(home.title);
    expect(s.problem!.model.title).toMatch(/Trips aren't recording/);
    expect(s.problem!.model.action).toBe("Fix");
    expect(s.problem!.tap).toBe("fix_location");
  });

  it("Background App Refresh opens the phone's settings", () => {
    expect(moreStatus({ ...fine, blocker: "bg_refresh_off" }).problem!.tap).toBe("fix_background_refresh");
  });

  it("failed uploads: Retry, opening Uploads", () => {
    const s = moreStatus({ ...fine, failedSyncCount: 2 });
    expect(s.problem!.model.title).toBe("2 trips couldn't upload");
    expect(s.problem!.model.action).toBe("Retry");
    expect(s.problem!.tap).toBe("sync_status");
  });

  it("blocked notifications are red on Settings, so they show here too", () => {
    const s = moreStatus({ ...fine, notifications: "denied" });
    expect(s.problem!.model.title).toBe("Notifications are blocked on this phone");
    expect(s.problem!.model.look).toBe("blocking");
    expect(s.problem!.tap).toBe("fix_notifications");
  });

  it("a recording blocker wins over blocked notifications", () => {
    expect(moreStatus({ ...fine, blocker: "no_location", notifications: "denied" }).problem!.tap).toBe("fix_location");
  });

  it("pause, Automatic trips off and Low Power are not red: they go on the Settings row", () => {
    const paused = moreStatus({ ...fine, pausedUntil: now + 3_600_000 });
    expect(paused.problem).toBeNull();
    expect(paused.recordingNote).toMatch(/^Paused until/);
    expect(moreStatus({ ...fine, automaticOff: true }).recordingNote).toBe("Automatic trips off. Only Start Trip records");
    expect(moreStatus({ ...fine, lowPowerMode: true }).recordingNote).toMatch(/Low Power Mode/);
  });

  it("a trip recording right now does not hide a problem", () => {
    const s = moreStatus({ ...fine, recording: { miles: 2, elapsedMs: 60000, mode: "auto" }, failedSyncCount: 1 });
    expect(s.problem!.tap).toBe("sync_status");
  });
});
