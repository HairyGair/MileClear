import { describe, it, expect } from "vitest";
import { selectStatusLine, durationText, type StatusInputs } from "../statusLine";

const NOW = new Date(2026, 9, 10, 12, 0).getTime();

const base: StatusInputs = {
  recording: null,
  blocker: null,
  failedSyncCount: 0,
  pausedUntil: null,
  now: NOW,
  automaticOff: false,
  lowPowerMode: false,
  platform: "ios",
  setup: null,
  recovered: null,
};
const withIn = (over: Partial<StatusInputs>): StatusInputs => ({ ...base, ...over });

describe("selectStatusLine priority", () => {
  it("is green and still when all is fine", () => {
    const s = selectStatusLine(base);
    expect(s.kind).toBe("fine");
    expect(s.look).toBe("fine");
    expect(s.title).toBe("Recording automatically");
    expect(s.red).toBe(false);
  });

  it("recording beats everything, including a blocker", () => {
    const s = selectStatusLine(
      withIn({
        recording: { miles: 3.14, elapsedMs: 6 * 60000, mode: "auto" },
        blocker: "no_location",
        failedSyncCount: 2,
        pausedUntil: NOW + 1000,
        automaticOff: true,
        lowPowerMode: true,
        setup: { done: 1, total: 4 },
      })
    );
    expect(s.kind).toBe("recording");
    expect(s.look).toBe("live");
    expect(s.title).toBe("Recording · 3.1 mi · 6 min");
    expect(s.tap).toBe("live_trip");
  });

  it("a blocker beats sync, pause, off, low power, setup and the recovered note", () => {
    const s = selectStatusLine(
      withIn({
        blocker: "permission_lost",
        failedSyncCount: 2,
        pausedUntil: NOW + 5000,
        automaticOff: true,
        lowPowerMode: true,
        setup: { done: 1, total: 4 },
        recovered: { trips: 3, miles: 12.4 },
      })
    );
    expect(s.kind).toBe("cant_record");
    expect(s.look).toBe("blocking");
    expect(s.action).toBe("Fix");
    expect(s.tap).toBe("fix");
    expect(s.red).toBe(true);
    expect(s.a11yLabel).toBe("Trips aren't recording. Fix.");
  });

  it("failed uploads come next, red, with Retry", () => {
    const s = selectStatusLine(withIn({ failedSyncCount: 2, pausedUntil: NOW + 5000 }));
    expect(s.kind).toBe("sync_failed");
    expect(s.title).toBe("2 trips couldn't upload");
    expect(s.action).toBe("Retry");
    expect(s.tap).toBe("sync_status");
    expect(s.red).toBe(true);
    expect(selectStatusLine(withIn({ failedSyncCount: 1 })).title).toBe("1 trip couldn't upload");
  });

  it("paused is amber with Resume and opens the sheet", () => {
    const s = selectStatusLine(withIn({ pausedUntil: new Date(2026, 9, 10, 18, 0).getTime(), automaticOff: true }));
    expect(s.kind).toBe("paused");
    expect(s.look).toBe("warning");
    expect(s.title).toBe("Paused until 18:00 today");
    expect(s.action).toBe("Resume");
    expect(s.tap).toBe("recording_sheet");
    expect(s.red).toBe(false);
  });

  it("a pause that has ended is not paused", () => {
    expect(selectStatusLine(withIn({ pausedUntil: NOW - 1 })).kind).toBe("fine");
  });

  it("automatic trips off is grey", () => {
    const s = selectStatusLine(withIn({ automaticOff: true, lowPowerMode: true }));
    expect(s.kind).toBe("auto_off");
    expect(s.look).toBe("neutral");
    expect(s.title).toBe("Automatic trips off. Only Start Trip records");
  });

  it("low power wording follows the platform", () => {
    expect(selectStatusLine(withIn({ lowPowerMode: true })).title).toBe(
      "Low Power Mode is on. Drives may not record"
    );
    expect(selectStatusLine(withIn({ lowPowerMode: true, platform: "android" })).title).toBe(
      "Battery Saver is on. Drives may not record"
    );
    expect(selectStatusLine(withIn({ lowPowerMode: true })).tap).toBe("low_power_sheet");
  });

  it("setup shows the count and beats the recovered note", () => {
    const s = selectStatusLine(withIn({ setup: { done: 2, total: 4 }, recovered: { trips: 1, miles: 2 } }));
    expect(s.kind).toBe("setup");
    expect(s.title).toBe("Finish setting up · 2 of 4 done");
    expect(s.tap).toBe("setup_sheet");
  });

  it("the one-time recovered note beats all fine and opens Trips", () => {
    const s = selectStatusLine(withIn({ recovered: { trips: 3, miles: 12.44 } }));
    expect(s.kind).toBe("recovered");
    expect(s.title).toBe("We recovered 12.4 miles on 3 trips");
    expect(s.tap).toBe("trips");
    expect(selectStatusLine(withIn({ recovered: { trips: 1, miles: 1 } })).title).toBe(
      "We recovered 1 mile on 1 trip"
    );
  });

  it("only blocking looks are red", () => {
    const reds = [
      withIn({ blocker: "no_location" }),
      withIn({ failedSyncCount: 1 }),
    ].map((i) => selectStatusLine(i).red);
    expect(reds).toEqual([true, true]);
    const calm = [
      base,
      withIn({ pausedUntil: NOW + 1 }),
      withIn({ automaticOff: true }),
      withIn({ lowPowerMode: true }),
      withIn({ setup: { done: 0, total: 3 } }),
    ].map((i) => selectStatusLine(i).red);
    expect(calm.every((r) => r === false)).toBe(true);
  });
});

describe("durationText", () => {
  it("reads in minutes then hours", () => {
    expect(durationText(0)).toBe("0 min");
    expect(durationText(6 * 60000)).toBe("6 min");
    expect(durationText(60 * 60000)).toBe("1 h");
    expect(durationText(65 * 60000)).toBe("1 h 5 min");
  });
});
