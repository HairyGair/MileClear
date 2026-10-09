import { describe, it, expect } from "vitest";
import {
  shouldSendStuckRecordingAlert,
  isStartTripReminderOwned,
} from "../../services/stuckRecordingRule.js";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const base = {
  autoRecording: true as boolean | undefined,
  lastDrivingStr: String(NOW - 40 * MIN) as string | undefined,
  nowMs: NOW,
  trackingState: [{ key: "last_driving_speed_at", value: String(NOW - 40 * MIN) }],
  minElapsedMs: 15 * MIN,
  maxElapsedMs: 24 * 60 * MIN,
};

describe("shouldSendStuckRecordingAlert", () => {
  it("sends for a stuck automatic recording", () => {
    expect(shouldSendStuckRecordingAlert(base)).toBe(true);
  });
  it("skips when the Start Trip lock is held", () => {
    expect(
      shouldSendStuckRecordingAlert({
        ...base,
        trackingState: [...base.trackingState, { key: "active_shift_id", value: "__quick_trip__" }],
      })
    ).toBe(false);
  });
  it("skips when the parked reminder state row is present", () => {
    expect(
      shouldSendStuckRecordingAlert({
        ...base,
        trackingState: [...base.trackingState, { key: "start_trip_parked_reminder", value: "{}" }],
      })
    ).toBe(false);
  });
  it("the setting alone does not silence a stuck automatic recording", () => {
    expect(
      shouldSendStuckRecordingAlert({
        ...base,
        trackingState: [...base.trackingState, { key: "start_trip_until_arrived", value: "1" }],
      })
    ).toBe(true);
    expect(
      shouldSendStuckRecordingAlert({
        ...base,
        trackingState: [...base.trackingState, { key: "start_trip_until_arrived", value: "0" }],
      })
    ).toBe(true);
  });
  it("the setting with a Start Trip running: skipped", () => {
    expect(
      shouldSendStuckRecordingAlert({
        ...base,
        trackingState: [
          ...base.trackingState,
          { key: "start_trip_until_arrived", value: "1" },
          { key: "active_shift_id", value: "__quick_trip__" },
        ],
      })
    ).toBe(false);
  });
  it("a real shift id does not count as a Start Trip", () => {
    expect(isStartTripReminderOwned([{ key: "active_shift_id", value: "abc" }])).toBe(false);
  });
  it("respects the minimum elapsed time", () => {
    expect(
      shouldSendStuckRecordingAlert({ ...base, lastDrivingStr: String(NOW - 10 * MIN) })
    ).toBe(false);
    expect(
      shouldSendStuckRecordingAlert({ ...base, lastDrivingStr: String(NOW - 20 * MIN) })
    ).toBe(true);
    expect(
      shouldSendStuckRecordingAlert({
        ...base,
        minElapsedMs: 30 * MIN,
        lastDrivingStr: String(NOW - 20 * MIN),
      })
    ).toBe(false);
  });
  it("respects the 24 h ceiling only when given", () => {
    const old = String(NOW - 30 * 60 * MIN);
    expect(shouldSendStuckRecordingAlert({ ...base, lastDrivingStr: old })).toBe(false);
    expect(
      shouldSendStuckRecordingAlert({ ...base, lastDrivingStr: old, maxElapsedMs: undefined })
    ).toBe(true);
  });
  it("needs an automatic recording and a driving time", () => {
    expect(shouldSendStuckRecordingAlert({ ...base, autoRecording: false })).toBe(false);
    expect(shouldSendStuckRecordingAlert({ ...base, autoRecording: undefined })).toBe(false);
    expect(shouldSendStuckRecordingAlert({ ...base, lastDrivingStr: undefined })).toBe(false);
    expect(shouldSendStuckRecordingAlert({ ...base, lastDrivingStr: "abc" })).toBe(false);
  });
  it("handles a missing trackingState", () => {
    expect(shouldSendStuckRecordingAlert({ ...base, trackingState: undefined })).toBe(true);
  });
});
