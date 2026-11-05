/**
 * A shift the server still calls running after this phone ended it (5 Nov
 * 2026: Home hid it, Start Shift was refused, a driver stuck for two weeks).
 */
import { describe, it, expect } from "vitest";
import {
  blockingShiftFromRefusal,
  canAttemptResend,
  phoneEndedShift,
  resendEndedAt,
  RESEND_RETRY_MS,
  shiftStartLabel,
  shouldResendEnd,
  startBlockedAction,
  type LocalShiftView,
} from "../staleServerShiftRule";

const view = (over: Partial<LocalShiftView> = {}): LocalShiftView => ({
  row: null,
  autoEnded: false,
  ending: false,
  ...over,
});
const active = { status: "active" };

describe("phoneEndedShift / shouldResendEnd", () => {
  it("ended on its own here, even with the row still reading active", () => {
    const v = view({ autoEnded: true, row: { status: "active", endedAt: null } });
    expect(phoneEndedShift(v)).toBe(true);
    expect(shouldResendEnd(active, v)).toBe(true);
  });

  it("ended by the button here (the row is completed)", () => {
    const v = view({ row: { status: "completed", endedAt: "2026-10-22T12:00:00.000Z" } });
    expect(shouldResendEnd(active, v)).toBe(true);
  });

  it("a shift the phone has running, or does not hold at all, is left alone", () => {
    expect(shouldResendEnd(active, view({ row: { status: "active", endedAt: null } }))).toBe(false);
    expect(shouldResendEnd(active, view())).toBe(false);
  });

  it("not while the phone is ending it right now (that end is on its way)", () => {
    expect(shouldResendEnd(active, view({ autoEnded: true, ending: true }))).toBe(false);
  });

  it("not when the server already has it ended", () => {
    expect(shouldResendEnd({ status: "completed" }, view({ autoEnded: true }))).toBe(false);
  });
});

describe("resendEndedAt", () => {
  const start = "2026-10-22T08:00:00.000Z";
  const nowMs = Date.parse("2026-11-05T10:00:00.000Z");
  const base = { serverStartedAt: start, localEndedAt: null, lastActivityAt: null, nowMs };

  it("the phone's own end time first", () => {
    expect(
      resendEndedAt({ ...base, localEndedAt: "2026-10-22T14:00:00.000Z", lastActivityAt: "2026-10-22T13:00:00.000Z" })
    ).toBe("2026-10-22T14:00:00.000Z");
  });

  it("else the last thing seen in the shift", () => {
    expect(resendEndedAt({ ...base, lastActivityAt: "2026-10-22T13:00:00.000Z" })).toBe("2026-10-22T13:00:00.000Z");
  });

  it("else the start itself, never an invented length (the server moves it to the last trip)", () => {
    expect(resendEndedAt(base)).toBe(start);
  });

  it("never before the start or after now", () => {
    expect(resendEndedAt({ ...base, localEndedAt: "2026-10-21T08:00:00.000Z" })).toBe(start);
    expect(resendEndedAt({ ...base, localEndedAt: "2026-12-01T08:00:00.000Z" })).toBe(start);
    expect(
      resendEndedAt({ ...base, localEndedAt: "garbage", lastActivityAt: "2026-10-22T09:00:00.000Z" })
    ).toBe("2026-10-22T09:00:00.000Z");
  });

  it("an unreadable start: nothing, the server ends it now", () => {
    expect(resendEndedAt({ ...base, serverStartedAt: "garbage" })).toBeUndefined();
  });
});

describe("canAttemptResend", () => {
  it("first time yes; after a success never; after a failure only once the wait is over", () => {
    expect(canAttemptResend(undefined, 1000)).toBe(true);
    expect(canAttemptResend({ atMs: 0, done: true }, RESEND_RETRY_MS * 10)).toBe(false);
    expect(canAttemptResend({ atMs: 0, done: false }, RESEND_RETRY_MS - 1)).toBe(false);
    expect(canAttemptResend({ atMs: 0, done: false }, RESEND_RETRY_MS)).toBe(true);
  });
});

describe("startBlockedAction", () => {
  it("one this phone ended: end it again and retry the start", () => {
    expect(startBlockedAction(view({ autoEnded: true }))).toBe("end_and_retry");
    expect(startBlockedAction(view({ row: { status: "completed", endedAt: null } }))).toBe("end_and_retry");
  });

  it("one it does not know, or has running: ask the driver", () => {
    expect(startBlockedAction(view())).toBe("ask");
    expect(startBlockedAction(view({ row: { status: "active", endedAt: null } }))).toBe("ask");
  });
});

describe("blockingShiftFromRefusal", () => {
  it("reads the shift the server names", () => {
    expect(
      blockingShiftFromRefusal(400, "You already have an active shift", {
        error: "You already have an active shift",
        activeShift: { id: "s-1", startedAt: "2026-10-22T08:00:00.000Z" },
      })
    ).toEqual({ id: "s-1", startedAt: "2026-10-22T08:00:00.000Z" });
  });

  it("an older API sends only the message", () => {
    expect(blockingShiftFromRefusal(400, "You already have an active shift", { error: "x" })).toEqual({
      id: null,
      startedAt: null,
    });
  });

  it("any other refusal is not this one", () => {
    expect(blockingShiftFromRefusal(404, "Vehicle not found", undefined)).toBeNull();
    expect(blockingShiftFromRefusal(500, "You already have an active shift", undefined)).toBeNull();
  });
});

describe("shiftStartLabel", () => {
  it("day, date, month and time", () => {
    const d = new Date(2026, 9, 22, 8, 5);
    expect(shiftStartLabel(d.toISOString())).toBe("Thu 22 Oct, 08:05");
  });

  it("an unreadable time", () => {
    expect(shiftStartLabel("nope")).toBe("earlier");
  });
});
