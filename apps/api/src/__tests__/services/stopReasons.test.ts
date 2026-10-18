import { describe, it, expect, beforeAll } from "vitest";
import { signStopReasonToken, verifyStopReasonToken, stopReasonLabel, STOP_REASONS } from "../../services/stopReasons.js";
import { signUnsubscribeToken } from "../../lib/unsubscribeToken.js";

beforeAll(() => {
  process.env.JWT_SECRET ||= "test-secret-at-least-32-characters-long!!";
});

describe("stop-reason tokens", () => {
  it("round-trips the driver and the email group", () => {
    expect(verifyStopReasonToken(signStopReasonToken("stopped", "user-1"))).toEqual({ group: "stopped", userId: "user-1" });
    expect(verifyStopReasonToken(signStopReasonToken("never", "user-2"))).toEqual({ group: "never", userId: "user-2" });
  });

  it("rejects a tampered or swapped token", () => {
    const t = signStopReasonToken("stopped", "user-1");
    const otherUser = Buffer.from("stopped:user-9").toString("base64url");
    expect(verifyStopReasonToken(`${otherUser}.${t.split(".")[1]}`)).toBeNull();
    expect(verifyStopReasonToken(signUnsubscribeToken("user-1"))).toBeNull();
    expect(verifyStopReasonToken("nonsense")).toBeNull();
    expect(verifyStopReasonToken(undefined)).toBeNull();
  });
});

describe("stop reasons", () => {
  it("only accepts a reason from the driver's own list", () => {
    expect(stopReasonLabel("stopped", "missed_drives")).toBe("It missed some of my drives");
    expect(stopReasonLabel("never", "missed_drives")).toBeNull();
    expect(stopReasonLabel("never", "never_recorded")).toBe("It never recorded a drive");
  });

  it("uses no dashes in any label", () => {
    for (const r of [...STOP_REASONS.stopped, ...STOP_REASONS.never]) expect(r.label).not.toMatch(/[—–]| - /);
  });
});
