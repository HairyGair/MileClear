import { describe, it, expect } from "vitest";
import {
  extractEventReason,
  summariseDetectionEvents,
} from "../activitySummaryRule";

describe("extractEventReason", () => {
  it("reads an identifier-shaped reason", () => {
    expect(extractEventReason('{"reason":"active_shift"}')).toBe("active_shift");
  });

  it("returns null for a row with no data at all", () => {
    expect(extractEventReason(null)).toBeNull();
    expect(extractEventReason(undefined)).toBeNull();
    expect(extractEventReason("")).toBeNull();
  });

  it("returns null for malformed JSON instead of throwing", () => {
    expect(extractEventReason("{not json")).toBeNull();
    expect(extractEventReason("[1,2,3]")).toBeNull();
    expect(extractEventReason('"a string"')).toBeNull();
  });

  it("returns null when data carries no reason", () => {
    expect(extractEventReason('{"distance":4.2}')).toBeNull();
    expect(extractEventReason('{"reason":17}')).toBeNull();
  });

  it("rejects high-cardinality values that would explode the key space", () => {
    // A UUID, a fix and a timestamp all fail the identifier test, so an event
    // that puts one of those in `reason` still counts under its bare name.
    expect(
      extractEventReason('{"reason":"3f1a0c2e-7b44-4d0e-9c11-2a8f6b5d9e77"}')
    ).toBeNull();
    expect(extractEventReason('{"reason":"51.5074,-0.1278"}')).toBeNull();
    expect(extractEventReason('{"reason":"2026-09-21T08:14:02.000Z"}')).toBeNull();
  });
});

describe("summariseDetectionEvents", () => {
  it("counts a skip under both its event name and its reason", () => {
    const summary = summariseDetectionEvents([
      { event: "detection_skipped", data: '{"reason":"active_shift"}' },
      { event: "detection_skipped", data: '{"reason":"active_shift"}' },
      { event: "detection_skipped", data: '{"reason":"disabled"}' },
    ]);

    expect(summary.detection_skipped).toBe(3);
    expect(summary["detection_skipped:active_shift"]).toBe(2);
    expect(summary["detection_skipped:disabled"]).toBe(1);
  });

  it("counts an event with no reason under its bare name only", () => {
    const summary = summariseDetectionEvents([
      { event: "native_motionchange", data: null },
      { event: "native_motionchange", data: '{"isMoving":true}' },
    ]);

    expect(summary.native_motionchange).toBe(2);
    expect(Object.keys(summary)).toEqual(["native_motionchange"]);
  });

  it("keeps the per-event total correct when a row is malformed", () => {
    const summary = summariseDetectionEvents([
      { event: "detection_skipped", data: '{"reason":"disabled"}' },
      { event: "detection_skipped", data: "{oops" },
      { event: "detection_skipped", data: null },
    ]);

    // Every existing reader depends on the bare total, so a broken payload
    // must cost us the reason and nothing else.
    expect(summary.detection_skipped).toBe(3);
    expect(summary["detection_skipped:disabled"]).toBe(1);
  });

  it("keeps the bare totals equal to the sum of their reasons plus the unattributed", () => {
    const rows = [
      { event: "detection_skipped", data: '{"reason":"recording_active"}' },
      { event: "detection_skipped", data: '{"reason":"recording_active"}' },
      { event: "detection_skipped", data: '{"reason":"active_quick_trip"}' },
      { event: "detection_skipped", data: null },
      { event: "recording_started", data: '{"source":"force_start"}' },
    ];
    const summary = summariseDetectionEvents(rows);

    const reasonTotal = Object.entries(summary)
      .filter(([k]) => k.startsWith("detection_skipped:"))
      .reduce((sum, [, n]) => sum + n, 0);

    expect(summary.detection_skipped).toBe(4);
    expect(reasonTotal).toBe(3);
    expect(summary.recording_started).toBe(1);
  });

  it("folds overflow reasons into :other rather than growing without limit", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      event: "watch_mode_skipped",
      data: JSON.stringify({ reason: `r${i}` }),
    }));
    const summary = summariseDetectionEvents(rows);

    const reasonKeys = Object.keys(summary).filter((k) =>
      k.startsWith("watch_mode_skipped:")
    );
    expect(summary.watch_mode_skipped).toBe(20);
    expect(reasonKeys).toHaveLength(13); // 12 distinct + :other
    expect(summary["watch_mode_skipped:other"]).toBe(8);
  });

  it("orders events by total with each event's reasons underneath it", () => {
    const summary = summariseDetectionEvents([
      { event: "app_state_change", data: null },
      { event: "app_state_change", data: null },
      { event: "app_state_change", data: null },
      { event: "detection_skipped", data: '{"reason":"disabled"}' },
      { event: "detection_skipped", data: '{"reason":"disabled"}' },
    ]);

    expect(Object.keys(summary)).toEqual([
      "app_state_change",
      "detection_skipped",
      "detection_skipped:disabled",
    ]);
  });

  it("returns an empty summary for no events", () => {
    expect(summariseDetectionEvents([])).toEqual({});
  });
});
