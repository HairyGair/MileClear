/**
 * Elisa Barone, 28 Sep 2026: a gap offer from 07:07 (she had just got to
 * work) to 17:45 (her next trip) was saved at 07:07. The drive was at 17:30.
 * The app now sends the time she picks, and the server checks it lies in the
 * window the drive must have happened in.
 */
import { describe, it, expect } from "vitest";
import { checkAcceptedTimes, ACCEPT_WINDOW_SLACK_MS } from "../../services/missedJourneyAcceptRule.js";

const at = (hhmmss: string) => new Date(`2026-09-28T${hhmmss}Z`);
const window = { departedAt: at("07:07:43"), arrivedAt: at("17:45:10") };

describe("checkAcceptedTimes", () => {
  it("accepts no times at all, as older apps send", () => {
    expect(checkAcceptedTimes(window, {})).toEqual({ ok: true, given: false });
  });

  it("accepts a drive inside the window", () => {
    expect(checkAcceptedTimes(window, { startedAt: at("17:30:00"), endedAt: at("17:44:00") })).toEqual({
      ok: true,
      given: true,
    });
  });

  it("allows the minute a picker rounds the window's edges to", () => {
    expect(checkAcceptedTimes(window, { startedAt: at("07:07:00"), endedAt: at("07:20:00") }).ok).toBe(true);
    expect(checkAcceptedTimes(window, { startedAt: at("17:30:00"), endedAt: at("17:46:00") }).ok).toBe(true);
  });

  it("refuses a start before the previous trip ended", () => {
    const early = new Date(window.departedAt.getTime() - ACCEPT_WINDOW_SLACK_MS - 1000);
    expect(checkAcceptedTimes(window, { startedAt: early, endedAt: at("08:00:00") })).toEqual({
      ok: false,
      reason: "starts_before_window",
    });
  });

  it("refuses an end after the next trip started", () => {
    expect(checkAcceptedTimes(window, { startedAt: at("17:40:00"), endedAt: at("18:10:00") })).toEqual({
      ok: false,
      reason: "ends_after_window",
    });
  });

  it("refuses a start after the window has closed", () => {
    expect(checkAcceptedTimes(window, { startedAt: at("19:00:00") })).toEqual({ ok: false, reason: "outside_window" });
  });

  it("refuses an end before the window opened", () => {
    expect(checkAcceptedTimes(window, { endedAt: at("06:00:00") })).toEqual({ ok: false, reason: "outside_window" });
  });

  it("refuses an end before the start", () => {
    expect(checkAcceptedTimes(window, { startedAt: at("17:30:00"), endedAt: at("17:00:00") })).toEqual({
      ok: false,
      reason: "end_before_start",
    });
  });

  it("checks whichever single time is given", () => {
    expect(checkAcceptedTimes(window, { startedAt: at("12:00:00") })).toEqual({ ok: true, given: true });
    expect(checkAcceptedTimes(window, { endedAt: at("12:00:00") })).toEqual({ ok: true, given: true });
  });
});
