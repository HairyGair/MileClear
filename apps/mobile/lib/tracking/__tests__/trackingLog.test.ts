import { describe, it, expect } from "vitest";
import {
  buildReportSnapshot,
  clampTrackingLogData,
  isTrackingLogEvent,
  shouldWriteTrackingLog,
  TRACKING_LOG_DATA_MAX,
  type LogRow,
} from "../trackingLog";
import { mergeDumpEvents } from "../lifecycleEvents";

const DEPART = Date.parse("2026-10-09T08:15:00.000Z");
const MIN = 60 * 1000;

function row(minutesFromDepart: number, event: string, data: string | null = null): LogRow {
  return { recorded_at: new Date(DEPART + minutesFromDepart * MIN).toISOString(), event, data };
}

describe("isTrackingLogEvent", () => {
  it("keeps the events that tell the engine's story", () => {
    for (const name of [
      "native_engine_started",
      "native_engine_stopped",
      "native_engine_boot_on_launch",
      "native_power_mode",
      "native_motionchange",
      "native_motion_start_skipped_on_foot",
      "native_headless_rearmed",
      "native_headless_lifecycle",
      "native_recording_started",
      "finalize_too_short",
      "recording_dropped",
      "permission_lost",
      "provider_change",
      "power_save_change",
      "app_state_change",
      "background_upkeep",
      "drive_paused",
    ]) {
      expect(isTrackingLogEvent(name), name).toBe(true);
    }
  });

  it("leaves out the routine traffic", () => {
    for (const name of ["detection_skipped", "la_progress_update", "coord_dropped_low_accuracy", "routing_call", "", "keep_going_prompt"]) {
      expect(isTrackingLogEvent(name), name).toBe(false);
    }
  });
});

describe("shouldWriteTrackingLog", () => {
  it("keeps app_state_change only for moves to the front or away", () => {
    expect(shouldWriteTrackingLog("app_state_change", JSON.stringify({ from: "background", to: "active" }))).toBe(true);
    expect(shouldWriteTrackingLog("app_state_change", JSON.stringify({ from: "active", to: "background" }))).toBe(true);
    expect(shouldWriteTrackingLog("app_state_change", JSON.stringify({ from: "active", to: "inactive" }))).toBe(false);
    expect(shouldWriteTrackingLog("app_state_change", null)).toBe(false);
    expect(shouldWriteTrackingLog("app_state_change", "not json")).toBe(false);
  });

  it("decides every other event on its name", () => {
    expect(shouldWriteTrackingLog("native_motionchange", null)).toBe(true);
    expect(shouldWriteTrackingLog("detection_skipped", JSON.stringify({ reason: "x" }))).toBe(false);
  });
});

describe("clampTrackingLogData", () => {
  it("trims long payloads and leaves short ones and null alone", () => {
    expect(clampTrackingLogData(null)).toBeNull();
    expect(clampTrackingLogData("{}")).toBe("{}");
    expect(clampTrackingLogData("x".repeat(TRACKING_LOG_DATA_MAX + 50))).toHaveLength(TRACKING_LOG_DATA_MAX);
  });
});

describe("buildReportSnapshot", () => {
  it("keeps rows from two hours before to four hours after, oldest first", () => {
    const snap = buildReportSnapshot(
      DEPART,
      [row(300, "native_motionchange"), row(30, "finalize_saved"), row(-5, "native_recording_started"), row(-200, "native_engine_started")],
      []
    );
    expect(snap.rows.map((r) => r[1])).toEqual(["native_recording_started", "finalize_saved"]);
    expect(snap.from).toBe(new Date(DEPART - 120 * MIN).toISOString());
    expect(snap.to).toBe(new Date(DEPART + 240 * MIN).toISOString());
    expect(snap.truncated).toBe(false);
  });

  it("reports the oldest row the phone held, in or out of the window", () => {
    const snap = buildReportSnapshot(DEPART, [row(-600, "native_engine_started")], [row(-2000, "finalize_saved")]);
    expect(snap.rows).toHaveLength(0);
    expect(snap.oldestHeld).toBe(new Date(DEPART - 2000 * MIN).toISOString());
  });

  it("says nothing was held when both logs are empty", () => {
    expect(buildReportSnapshot(DEPART, [], []).oldestHeld).toBeNull();
  });

  it("merges the lifecycle log and drops identical rows", () => {
    const a = row(1, "native_recording_started", '{"reason":"motion"}');
    const snap = buildReportSnapshot(DEPART, [a], [a, row(20, "finalize_saved")]);
    expect(snap.rows.map((r) => r[1])).toEqual(["native_recording_started", "finalize_saved"]);
  });

  it("keeps the start and the end of a busy window", () => {
    const rows = Array.from({ length: 50 }, (_, i) => row(i, `native_motionchange`, String(i)));
    const snap = buildReportSnapshot(DEPART, rows, [], { cap: 10 });
    expect(snap.truncated).toBe(true);
    expect(snap.rows).toHaveLength(10);
    expect(snap.rows[0][2]).toBe("0");
    expect(snap.rows[4][2]).toBe("4");
    expect(snap.rows[5][2]).toBe("45");
    expect(snap.rows[9][2]).toBe("49");
  });

  it("shortens long payloads", () => {
    const snap = buildReportSnapshot(DEPART, [row(0, "finalize_saved", "y".repeat(500))], [], { dataMax: 20 });
    expect(snap.rows[0][2]).toHaveLength(20);
  });

  it("skips rows with an unreadable time", () => {
    const snap = buildReportSnapshot(DEPART, [{ recorded_at: "nope", event: "finalize_saved", data: null }], []);
    expect(snap.rows).toHaveLength(0);
    expect(snap.oldestHeld).toBeNull();
  });
});

describe("dump merge with the tracking log", () => {
  it("adds tracking-log rows the dump did not already carry", () => {
    const now = DEPART + 60 * MIN;
    const recent = [row(50, "detection_skipped")];
    const tracking = [row(10, "native_motionchange", '{"isMoving":true}'), row(50, "detection_skipped")];
    const merged = mergeDumpEvents(recent, tracking, now, {
      windowMs: 24 * 60 * MIN,
      cap: 100,
      keep: isTrackingLogEvent,
    });
    expect(merged.map((e) => e.event)).toEqual(["detection_skipped", "native_motionchange"]);
  });
});
