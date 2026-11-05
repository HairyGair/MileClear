/**
 * Sending again an end that never reached the server, and clearing a Start
 * Shift refused because of it (5 Nov 2026).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  shiftRow: null as { status: string | null; ended_at: string | null } | null,
  lock: null as string | null,
  autoEnded: false,
  ending: false,
  endShift: vi.fn(),
  fetchActiveShift: vi.fn(),
  finishShift: vi.fn(),
  events: [] as Array<[string, Record<string, unknown>]>,
  runAsync: vi.fn(),
}));

vi.mock("../../db/index", () => ({
  getDatabase: () =>
    Promise.resolve({
      getFirstAsync: async (sql: string) => {
        if (sql.startsWith("SELECT status, ended_at FROM shifts")) return h.shiftRow;
        if (sql.includes("key = 'active_shift_id'")) return h.lock ? { value: h.lock } : null;
        return { at: null };
      },
      runAsync: h.runAsync,
    }),
}));
vi.mock("../../api/shifts", () => ({ endShift: h.endShift, fetchActiveShift: h.fetchActiveShift }));
vi.mock("../../tracking/recordingDrops", () => ({
  queueAppEvent: async (type: string, data: Record<string, unknown>) => {
    h.events.push([type, data]);
  },
}));
vi.mock("../../tracking/shiftEnd", () => ({
  finishShift: h.finishShift,
  isShiftEnding: () => h.ending,
  wasShiftAutoEnded: async () => h.autoEnded,
}));

import { clearBlockingShift, hideAndResendIfEndedHere, resendShiftEnd } from "../staleServerShift";
import { ApiError } from "../../api/apiError";

const START = "2026-10-22T08:00:00.000Z";
const flush = () => new Promise((r) => setTimeout(r, 0));
const apiErr = (statusCode: number, message: string, body?: Record<string, unknown>) =>
  new ApiError({ code: "ERR", message, statusCode, retryable: false, body });
const blocked = (body?: Record<string, unknown>) => apiErr(400, "You already have an active shift", body);

let n = 0;
const freshId = () => `shift-${++n}`;

beforeEach(() => {
  vi.clearAllMocks();
  h.shiftRow = null;
  h.lock = null;
  h.autoEnded = false;
  h.ending = false;
  h.events.length = 0;
  h.endShift.mockResolvedValue({ data: {} });
});

describe("Home: a server shift this phone already ended", () => {
  it("is hidden and its end is sent once, at the last time the phone recorded", async () => {
    h.autoEnded = true;
    h.shiftRow = { status: "active", ended_at: null };
    const shift = { id: freshId(), startedAt: START, status: "active" };
    expect(await hideAndResendIfEndedHere(shift)).toBe(true);
    expect(await hideAndResendIfEndedHere(shift)).toBe(true);
    await flush();
    expect(h.endShift).toHaveBeenCalledTimes(1);
    expect(h.endShift).toHaveBeenCalledWith(shift.id, { endedAt: START });
    await flush();
    expect(h.events.map((e) => [e[0], e[1].result])).toEqual([["shift.end_resent", "ended"]]);
    // The phone's copy and any parked end are marked done.
    expect(h.runAsync.mock.calls.some((c) => String(c[0]).startsWith("UPDATE sync_queue SET status = 'synced'"))).toBe(true);
  });

  it("a shift the phone has running, or never saw, is shown and left alone", async () => {
    h.shiftRow = { status: "active", ended_at: null };
    expect(await hideAndResendIfEndedHere({ id: freshId(), startedAt: START, status: "active" })).toBe(false);
    h.shiftRow = null;
    expect(await hideAndResendIfEndedHere({ id: freshId(), startedAt: START, status: "active" })).toBe(false);
    await flush();
    expect(h.endShift).not.toHaveBeenCalled();
  });

  it("'already completed' counts as done", async () => {
    h.shiftRow = { status: "completed", ended_at: "2026-10-22T12:00:00.000Z" };
    h.endShift.mockRejectedValueOnce(apiErr(400, "Shift is already completed"));
    const r = await resendShiftEnd({ id: freshId(), startedAt: START }, "home", { useLocalEndTime: true });
    expect(r).toBe("already_ended");
  });

  it("an end time the server refuses: ended now instead", async () => {
    h.shiftRow = { status: "completed", ended_at: "2026-10-22T12:00:00.000Z" };
    h.endShift.mockRejectedValueOnce(apiErr(400, "A shift can't end in the future"));
    const id = freshId();
    const r = await resendShiftEnd({ id, startedAt: START }, "home", { useLocalEndTime: true });
    expect(r).toBe("ended");
    expect(h.endShift.mock.calls).toEqual([[id, { endedAt: "2026-10-22T12:00:00.000Z" }], [id]]);
  });

  it("a failure is reported and not marked done", async () => {
    h.shiftRow = { status: "completed", ended_at: "2026-10-22T12:00:00.000Z" };
    h.endShift.mockRejectedValueOnce(new Error("Network request failed"));
    const r = await resendShiftEnd({ id: freshId(), startedAt: START }, "home", { useLocalEndTime: true });
    expect(r).toBe("failed");
    expect(h.runAsync).not.toHaveBeenCalled();
    await flush();
    expect(h.events[0][1].result).toBe("failed");
  });

  it("two callers at once share one send", async () => {
    h.shiftRow = { status: "completed", ended_at: "2026-10-22T12:00:00.000Z" };
    const s = { id: freshId(), startedAt: START };
    const [a, b] = await Promise.all([
      resendShiftEnd(s, "home", { useLocalEndTime: true }),
      resendShiftEnd(s, "start_blocked", { useLocalEndTime: true }),
    ]);
    expect([a, b]).toEqual(["ended", "ended"]);
    expect(h.endShift).toHaveBeenCalledTimes(1);
  });
});

describe("Start Shift refused because a shift is running", () => {
  const ask = vi.fn();

  it("one this phone ended: ended again without asking", async () => {
    h.autoEnded = true;
    const id = freshId();
    const r = await clearBlockingShift(blocked({ activeShift: { id, startedAt: START } }), ask);
    expect(r).toBe("cleared");
    expect(ask).not.toHaveBeenCalled();
    expect(h.endShift).toHaveBeenCalledWith(id, { endedAt: START });
  });

  it("one this phone never saw: asked first, and left running on Cancel", async () => {
    ask.mockResolvedValueOnce(false);
    const r = await clearBlockingShift(blocked({ activeShift: { id: freshId(), startedAt: START } }), ask);
    expect(r).toBe("declined");
    expect(ask).toHaveBeenCalledWith(START);
    expect(h.endShift).not.toHaveBeenCalled();
  });

  it("one this phone never saw, open for days, the driver says end it: ended at its last record, not now", async () => {
    ask.mockResolvedValueOnce(true);
    const id = freshId();
    const r = await clearBlockingShift(blocked({ activeShift: { id, startedAt: START } }), ask);
    expect(r).toBe("cleared");
    expect(h.endShift).toHaveBeenCalledWith(id, { endedAt: START });
  });

  it("one this phone never saw, started an hour ago (maybe another phone): ended now", async () => {
    ask.mockResolvedValueOnce(true);
    const id = freshId();
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const r = await clearBlockingShift(blocked({ activeShift: { id, startedAt: recent } }), ask);
    expect(r).toBe("cleared");
    expect(h.endShift).toHaveBeenCalledWith(id, undefined);
  });

  it("an active row this phone is not recording (copied from the server): not put through End Shift", async () => {
    h.shiftRow = { status: "active", ended_at: null };
    ask.mockResolvedValueOnce(true);
    const id = freshId();
    expect(await clearBlockingShift(blocked({ activeShift: { id, startedAt: START } }), ask)).toBe("cleared");
    expect(h.finishShift).not.toHaveBeenCalled();
    expect(h.endShift).toHaveBeenCalledWith(id, { endedAt: START });
  });

  it("one this phone has running: ended properly through End Shift's steps", async () => {
    h.shiftRow = { status: "active", ended_at: null };
    ask.mockResolvedValueOnce(true);
    h.finishShift.mockResolvedValueOnce({ data: {} });
    const id = freshId();
    h.lock = id;
    expect(await clearBlockingShift(blocked({ activeShift: { id, startedAt: START } }), ask)).toBe("cleared");
    expect(h.finishShift).toHaveBeenCalledWith({ shiftId: id });
    expect(h.endShift).not.toHaveBeenCalled();
  });

  it("an older API that names no shift: looked up", async () => {
    h.autoEnded = true;
    const id = freshId();
    h.fetchActiveShift.mockResolvedValueOnce({ data: [{ id, startedAt: START }] });
    expect(await clearBlockingShift(blocked({ error: "You already have an active shift" }), ask)).toBe("cleared");
    expect(h.endShift).toHaveBeenCalledWith(id, { endedAt: START });
  });

  it("any other refusal is not this one", async () => {
    expect(await clearBlockingShift(apiErr(404, "Vehicle not found"), ask)).toBe("not_blocked");
    expect(await clearBlockingShift(new Error("Network request failed"), ask)).toBe("not_blocked");
    expect(h.endShift).not.toHaveBeenCalled();
  });
});
