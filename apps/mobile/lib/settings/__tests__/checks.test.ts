import { describe, it, expect } from "vitest";
import { selectStatusLine } from "../../home/statusLine";
import {
  recordingCheck,
  lastTripCheck,
  notificationsCheck,
  uploadsCheck,
  settingsHeadline,
  checkingRow,
  type RecordingCheckInputs,
} from "../checks";
import type { LastTripData } from "../../home/lastTrip";

const NOW = new Date("2026-10-10T12:00:00Z").getTime();

const base: RecordingCheckInputs = {
  blocker: null,
  pausedUntil: null,
  now: NOW,
  automaticOff: false,
  lowPowerMode: false,
  platform: "ios",
  setup: null,
  recording: null,
};

describe("recordingCheck uses Home's words and rules", () => {
  it("says Recording automatically when all is well", () => {
    const r = recordingCheck(base);
    expect(r.look).toBe("ok");
    expect(r.title).toBe("Recording automatically");
  });

  it("never says on or fine when a blocker exists, and matches Home's title", () => {
    for (const blocker of ["no_location", "bg_refresh_off", "permission_lost"] as const) {
      const r = recordingCheck({ ...base, blocker });
      const home = selectStatusLine({
        recording: null, blocker, failedSyncCount: 0, pausedUntil: null, now: NOW,
        automaticOff: false, lowPowerMode: false, platform: "ios", setup: null, recovered: null,
      });
      expect(r.title).toBe(home.title);
      expect(r.look).toBe("bad");
      expect(r.action).toBe("Fix");
      expect(r.hint).toBeNull();
    }
  });

  it("sends a Background App Refresh blocker to the phone's settings", () => {
    expect(recordingCheck({ ...base, blocker: "bg_refresh_off" }).tap).toBe("fix_background_refresh");
    expect(recordingCheck({ ...base, blocker: "no_location" }).tap).toBe("fix_location");
  });

  it("shows a pause with Resume", () => {
    const r = recordingCheck({ ...base, pausedUntil: NOW + 3_600_000 });
    expect(r.look).toBe("warn");
    expect(r.action).toBe("Resume");
    expect(r.tap).toBe("resume");
  });

  it("shows automatic trips off as neutral", () => {
    const r = recordingCheck({ ...base, automaticOff: true });
    expect(r.look).toBe("neutral");
    expect(r.title).toBe("Automatic trips off. Only Start Trip records");
  });

  it("warns on Low Power Mode and on unfinished setup", () => {
    expect(recordingCheck({ ...base, lowPowerMode: true }).look).toBe("warn");
    const s = recordingCheck({ ...base, setup: { done: 1, total: 4 } });
    expect(s.look).toBe("warn");
    expect(s.title).toBe("Finish setting up · 1 of 4 done");
  });

  it("a blocker outranks a pause, like Home", () => {
    const r = recordingCheck({ ...base, blocker: "no_location", pausedUntil: NOW + 1000 });
    expect(r.statusKind).toBe("cant_record");
  });
});

describe("lastTripCheck", () => {
  const trip = {
    startedAt: new Date(NOW - 2 * 3_600_000).toISOString(),
    endedAt: new Date(NOW - 2 * 3_600_000 + 20 * 60_000).toISOString(),
    distanceMiles: 12.4,
    startLabel: "Home",
    endLabel: "Sunderland Depot",
  } as LastTripData;

  it("shows when and how far", () => {
    const r = lastTripCheck({ trip, totalTrips: 5, loading: false, now: NOW });
    expect(r.look).toBe("ok");
    expect(r.title.startsWith("Last trip: ")).toBe(true);
    expect(r.hint).toContain("12.4");
    expect(r.hint).toContain("Home to Sunderland Depot");
  });

  it("is grey, not red, for a new driver", () => {
    const r = lastTripCheck({ trip: null, totalTrips: 0, loading: false, now: NOW });
    expect(r.look).toBe("neutral");
    expect(r.title).toBe("No trips yet");
    expect(r.hint).toBe("Just drive, it starts at 15 mph");
  });
});

describe("notificationsCheck", () => {
  it("shows the count only when the phone allows them", () => {
    expect(notificationsCheck({ permission: "granted", counts: { on: 12, total: 15 } }).hint).toBe("12 of 15 on");
    const blocked = notificationsCheck({ permission: "denied", counts: { on: 12, total: 15 } });
    expect(blocked.look).toBe("bad");
    expect(blocked.hint).not.toContain("12 of 15");
    expect(blocked.action).toBe("Fix");
  });

  it("asks when never asked", () => {
    const r = notificationsCheck({ permission: "undetermined", counts: null });
    expect(r.look).toBe("warn");
    expect(r.action).toBe("Turn on");
  });
});

describe("uploadsCheck", () => {
  it("is fine with nothing waiting", () => {
    expect(uploadsCheck({ failedCount: 0, allTrips: true }).look).toBe("ok");
  });
  it("uses Home's sentence", () => {
    const r = uploadsCheck({ failedCount: 2, allTrips: true });
    expect(r.title).toBe("2 trips couldn't upload");
    expect(r.action).toBe("Retry");
    expect(uploadsCheck({ failedCount: 1, allTrips: false }).title).toBe("1 item couldn't upload");
  });
  it("never says saved while something is still waiting to upload", () => {
    const r = uploadsCheck({ failedCount: 0, allTrips: true, pendingCount: 3 });
    expect(r.look).toBe("neutral");
    expect(r.title).toBe("3 waiting to upload");
  });
  it("a failure outranks waiting", () => {
    expect(uploadsCheck({ failedCount: 1, allTrips: true, pendingCount: 3 }).look).toBe("bad");
  });
});

describe("checkingRow", () => {
  it("is never green, so nothing is ticked before the phone has answered", () => {
    expect(checkingRow("recording").look).toBe("neutral");
    expect(checkingRow("notifications").look).toBe("neutral");
    expect(settingsHeadline([checkingRow("recording")])).toEqual({ text: "Checking recording...", red: false });
  });
});

describe("settingsHeadline", () => {
  it("leads with the first red problem", () => {
    const rows = [
      recordingCheck({ ...base, blocker: "no_location" }),
      notificationsCheck({ permission: "denied", counts: null }),
    ];
    expect(settingsHeadline(rows)).toEqual({ text: rows[0].title, red: true });
  });
  it("is calm when all is well", () => {
    expect(settingsHeadline([recordingCheck(base)])).toEqual({ text: "Recording automatically", red: false });
  });
});
