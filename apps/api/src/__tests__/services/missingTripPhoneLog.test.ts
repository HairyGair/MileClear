import { describe, it, expect } from "vitest";
import {
  dropsInWindow,
  isResidueDrop,
  readRecordingDrop,
  parsePhoneLog,
  readStoredPhoneLog,
  summarisePhoneLog,
  PHONE_LOG_MAX_ROWS,
  type PhoneLog,
} from "../../services/missingTripPhoneLog.js";

const FROM = "2026-10-09T06:15:00.000Z";
const TO = "2026-10-09T12:15:00.000Z";

function log(rows: Array<[string, string, string | null]>, extra: Partial<PhoneLog> = {}) {
  return { from: FROM, to: TO, oldestHeld: "2026-10-08T20:00:00.000Z", truncated: false, rows, ...extra };
}

describe("parsePhoneLog", () => {
  it("accepts a well-formed log and scrubs coordinates from payloads and state", () => {
    const parsed = parsePhoneLog(
      log([["2026-10-09T08:16:00.000Z", "native_recording_started", JSON.stringify({ reason: "motion", lat: 51.5, lng: -0.12 })]], {
        state: { backgroundPermission: "granted", lat: 51.5 },
      })
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.rows).toHaveLength(1);
    expect(parsed!.rows[0][2]).not.toContain("51.5");
    expect(JSON.parse(parsed!.rows[0][2]!).reason).toBe("motion");
    expect(JSON.stringify(parsed!.state)).not.toContain("51.5");
    expect(parsed!.state!.backgroundPermission).toBe("granted");
  });

  it("returns null for anything malformed, so the report still goes through", () => {
    expect(parsePhoneLog(undefined)).toBeNull();
    expect(parsePhoneLog("nope")).toBeNull();
    expect(parsePhoneLog({ from: "yesterday", to: TO, rows: [] })).toBeNull();
    expect(parsePhoneLog(log([["t", "e", null, "extra"] as unknown as [string, string, string | null]]))).toBeNull();
    const tooMany = Array.from({ length: PHONE_LOG_MAX_ROWS + 1 }, () => ["2026-10-09T08:00:00.000Z", "x", null] as [string, string, null]);
    expect(parsePhoneLog(log(tooMany))).toBeNull();
  });

  it("drops an oversized state but keeps the rows", () => {
    const parsed = parsePhoneLog(log([], { state: { big: "x".repeat(5000) } }));
    expect(parsed).not.toBeNull();
    expect(parsed!.state).toBeNull();
  });
});

describe("readStoredPhoneLog", () => {
  it("reads what the route stored and ignores rows without one", () => {
    expect(readStoredPhoneLog({ note: "hi" })).toBeNull();
    expect(readStoredPhoneLog(null)).toBeNull();
    const stored = readStoredPhoneLog({ phoneLog: log([]) });
    expect(stored?.from).toBe(FROM);
  });
});

describe("summarisePhoneLog", () => {
  it("counts the moments that explain a drive", () => {
    const s = summarisePhoneLog(
      log([
        ["2026-10-09T08:10:00.000Z", "native_headless_lifecycle", '{"event":"terminate"}'],
        ["2026-10-09T08:15:00.000Z", "native_motionchange", '{"isMoving":true}'],
        ["2026-10-09T08:15:01.000Z", "native_recording_started", '{"reason":"motion"}'],
        ["2026-10-09T08:40:00.000Z", "native_motionchange", '{"isMoving":false}'],
        ["2026-10-09T08:40:05.000Z", "recording_dropped", '{"reason":"walk"}'],
        ["2026-10-09T09:00:00.000Z", "recording_dropped", '{"reason":"walk"}'],
        ["2026-10-09T09:30:00.000Z", "finalize_saved", null],
      ])
    );
    expect(s.movingSignals).toBe(1);
    expect(s.recordingsStarted).toBe(1);
    expect(s.tripsSaved).toBe(1);
    expect(s.dropped).toBe(2);
    expect(s.dropReasons).toEqual({ walk: 2 });
    expect(s.appKilled).toBe(1);
    expect(s.covered).toBe(true);
    expect(s.line).toContain("2 dropped (walk x2)");
    expect(s.line).toContain("app ended by Android 1x");
  });

  it("says when the log does not reach back to the drive", () => {
    const s = summarisePhoneLog(log([], { oldestHeld: "2026-10-09T10:00:00.000Z" }));
    expect(s.covered).toBe(false);
    expect(s.line).toContain("no phone events in the window");
    expect(s.line).toContain("does not reach back");
  });
});

describe("dropsInWindow", () => {
  it("matches drops on the drive's own time, not when they arrived", () => {
    const fromMs = Date.parse(FROM);
    const toMs = Date.parse(TO);
    const drops = dropsInWindow(
      [
        { createdAt: new Date("2026-10-10T07:00:00Z"), metadata: { reason: "too_short", endedAt: "2026-10-09T08:30:00.000Z", distanceMiles: 0.2 } },
        { createdAt: new Date("2026-10-09T13:00:00Z"), metadata: { reason: "walk", endedAt: "2026-10-09T13:00:00.000Z" } },
        { createdAt: new Date("2026-10-09T07:00:00Z"), metadata: { reason: "no_coords", startedAt: "2026-10-09T06:59:00.000Z" } },
      ],
      fromMs,
      toMs
    );
    expect(drops.map((d) => d.reason)).toEqual(["no_coords", "too_short"]);
    expect(drops[1].distanceMiles).toBe(0.2);
    expect(drops[1].receivedAt).toBe("2026-10-10T07:00:00.000Z");
    expect(drops[1].lost).toBe(false);
  });

  it("reads the phone's own lost flag", () => {
    const [d] = dropsInWindow(
      [{ createdAt: new Date("2026-10-09T08:31:00Z"), metadata: { reason: "walk", lost: true, endedAt: "2026-10-09T08:30:00.000Z" } }],
      Date.parse(FROM),
      Date.parse(TO)
    );
    expect(d.lost).toBe(true);
  });
});

describe("isResidueDrop", () => {
  it("treats a sweep's stationary leftovers as housekeeping and real drops as explanations", () => {
    const at = new Date("2026-10-09T09:00:00Z");
    expect(isResidueDrop(readRecordingDrop(at, { reason: "phantom", lost: false, source: "orphan_app_open" }))).toBe(true);
    expect(isResidueDrop(readRecordingDrop(at, { reason: "phantom", lost: true }))).toBe(false);
    expect(isResidueDrop(readRecordingDrop(at, { reason: "too_short", lost: true, source: "orphan_app_open" }))).toBe(false);
    expect(isResidueDrop(readRecordingDrop(at, { reason: "error", lost: false, source: "orphan_app_open" }))).toBe(false);
  });
});
