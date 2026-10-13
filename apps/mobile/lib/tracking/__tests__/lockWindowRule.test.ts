import { describe, it, expect } from "vitest";
import {
  earlierDriveToSave,
  openRecordingGate,
  partitionBufferByWindow,
  RECENT_CANCEL_MS,
  windowStartMs,
} from "../lockWindowRule";
import { buildDropEvent, dropIsLost, isLostReason } from "../recordingDropRule";

const T = (hhmmss: string) => `2026-10-12T${hhmmss}.000Z`;
const ms = (hhmmss: string) => Date.parse(T(hhmmss));

/** One fix every `stepSec` between two clock times. */
function fixes(from: string, to: string, stepSec: number) {
  const out: { id: number; recorded_at: string }[] = [];
  let id = 1;
  for (let t = ms(from); t <= ms(to); t += stepSec * 1000) {
    out.push({ id: id++, recorded_at: new Date(t).toISOString() });
  }
  return out;
}

describe("partitionBufferByWindow (12 Oct incident shape)", () => {
  it("keeps the earlier drive and discards only the Start Trip's duplicate copy", () => {
    // Auto recording 16:36-16:57 (the drive), parked, Start Trip tapped 17:01,
    // the engine kept copying until Arrived at 17:51.
    const earlierDrive = fixes("16:36:00", "16:57:00", 7);
    const duplicate = fixes("17:01:00", "17:51:00", 30);
    const { earlier, inWindow } = partitionBufferByWindow([...earlierDrive, ...duplicate], ms("17:01:00"));
    expect(earlier).toHaveLength(earlierDrive.length);
    expect(inWindow).toHaveLength(duplicate.length);
    expect(earlier.every((r) => Date.parse(r.recorded_at) < ms("17:01:00"))).toBe(true);
  });

  it("treats a fix exactly at the window start as the duplicate copy", () => {
    const { earlier, inWindow } = partitionBufferByWindow(
      [{ recorded_at: T("17:00:59") }, { recorded_at: T("17:01:00") }],
      ms("17:01:00")
    );
    expect(earlier).toHaveLength(1);
    expect(inWindow).toHaveLength(1);
  });

  it("keeps a fix whose time cannot be read (never delete what cannot be dated)", () => {
    const { earlier, inWindow } = partitionBufferByWindow(
      [{ recorded_at: "garbage" }, { recorded_at: T("17:30:00") }],
      ms("17:01:00")
    );
    expect(earlier).toHaveLength(1);
    expect(inWindow).toHaveLength(1);
  });

  it("with no known window start falls back to the old behaviour (all duplicate)", () => {
    const rows = fixes("16:36:00", "16:40:00", 60);
    const { earlier, inWindow } = partitionBufferByWindow(rows, null);
    expect(earlier).toHaveLength(0);
    expect(inWindow).toHaveLength(rows.length);
  });

  it("a buffer wholly inside the window is all duplicate, as before", () => {
    const rows = fixes("17:05:00", "17:50:00", 60);
    expect(partitionBufferByWindow(rows, ms("17:01:00")).earlier).toHaveLength(0);
  });

  it("a shift that began before the buffer discards nothing older than it", () => {
    const rows = fixes("08:00:00", "08:20:00", 30);
    expect(partitionBufferByWindow(rows, ms("09:00:00")).inWindow).toHaveLength(0);
  });
});

describe("windowStartMs", () => {
  it("takes the earliest marker: a promoted drive reaches back before the lock", () => {
    expect(
      windowStartMs({
        quickTripStartIso: T("16:36:00"),
        lockTakenAtMs: ms("16:40:00"),
        firstBreadcrumbIso: T("16:36:05"),
      })
    ).toBe(ms("16:36:00"));
  });

  it("a resumed Start Trip that re-stamped the lock is rescued by the first breadcrumb", () => {
    expect(
      windowStartMs({ quickTripStartIso: null, lockTakenAtMs: ms("17:30:00"), firstBreadcrumbIso: T("17:01:10") })
    ).toBe(ms("17:01:10"));
  });

  it("is null when nothing is known, and ignores junk", () => {
    expect(windowStartMs({})).toBeNull();
    expect(windowStartMs({ quickTripStartIso: "nope", lockTakenAtMs: Number.NaN, firstBreadcrumbIso: null })).toBeNull();
  });
});

describe("earlierDriveToSave", () => {
  it("fires for a buffered drive or a drive's worth of native fixes", () => {
    expect(earlierDriveToSave({ jsCount: 168, nativeCount: 0 })).toBe(true);
    expect(earlierDriveToSave({ jsCount: 0, nativeCount: 168 })).toBe(true);
  });
  it("does not fire for nothing, or for stray stationary fixes", () => {
    expect(earlierDriveToSave({ jsCount: 0, nativeCount: null })).toBe(false);
    expect(earlierDriveToSave({ jsCount: 1, nativeCount: 3 })).toBe(false);
  });
});

describe("openRecordingGate (13 Oct incident shape)", () => {
  const now = ms("10:13:02");
  const base = { nowMs: now, notDrivingUntilMs: null, shiftLocked: false, cancelledAtMs: null };

  it("opens when nothing is in the way", () => {
    expect(openRecordingGate(base)).toEqual({ open: true });
  });

  it("refuses inside the cooldown and opens after it", () => {
    expect(openRecordingGate({ ...base, notDrivingUntilMs: now + 60_000 })).toEqual({ open: false, refusal: "cooldown" });
    expect(openRecordingGate({ ...base, notDrivingUntilMs: now })).toEqual({ open: true });
  });

  it("refuses a recording one second after Not driving even when the cooldown row never landed", () => {
    // The cancel stamped memory at 10:13:01; the SQLite write is still in flight.
    expect(openRecordingGate({ ...base, cancelledAtMs: ms("10:13:01") })).toEqual({
      open: false,
      refusal: "recent_cancel",
    });
  });

  it("the recent-cancel guard expires, and ignores a stamp from the future (clock change)", () => {
    expect(openRecordingGate({ ...base, cancelledAtMs: now - RECENT_CANCEL_MS })).toEqual({ open: true });
    expect(openRecordingGate({ ...base, cancelledAtMs: now + 5_000 })).toEqual({ open: true });
  });

  it("refuses through a shift / Start Trip lock first", () => {
    expect(openRecordingGate({ ...base, shiftLocked: true, notDrivingUntilMs: now + 1 })).toEqual({
      open: false,
      refusal: "shift_lock",
    });
  });

  it("ignores a non-numeric cooldown value", () => {
    expect(openRecordingGate({ ...base, notDrivingUntilMs: Number.NaN })).toEqual({ open: true });
  });
});

describe("duplicate_cleared drop reason", () => {
  it("is honest: not lost, so it is never counted as a Not driving or a missing drive", () => {
    expect(isLostReason("duplicate_cleared")).toBe(false);
    expect(dropIsLost("duplicate_cleared", null)).toBe(false);
    const ev = buildDropEvent(
      { reason: "duplicate_cleared", detail: "start_trip_end", coords: 30, startedAt: T("17:01:00"), endedAt: T("17:51:00") },
      ms("17:51:01"),
      "ios"
    );
    expect(ev.lost).toBe(false);
    expect(ev.detail).toBe("start_trip_end");
    expect(ev.reason).not.toBe("cancelled");
  });

  it("a real Not driving is still lost", () => {
    expect(isLostReason("cancelled")).toBe(true);
  });
});
