import { describe, it, expect } from "vitest";
import { connectionLine, describeMtdLoadError, isConnectionExpired, isMtdLive, isMtdTest, isNothingSubmittedError, obligationsErrorText } from "./mtdCopy";
import { ApiError } from "../api/apiError";

const now = new Date("2026-10-10T12:00:00Z");
describe("mtdCopy", () => {
  it("detects an expired token", () => {
    expect(isConnectionExpired("2026-10-09T23:28:00Z", now)).toBe(true);
    expect(isConnectionExpired("2026-10-11T00:00:00Z", now)).toBe(false);
  });
  it("treats missing and placeholder dates as unknown", () => {
    expect(isConnectionExpired(undefined, now)).toBe(false);
    expect(isConnectionExpired("1970-01-01T00:00:00Z", now)).toBe(false);
    expect(isConnectionExpired("nonsense", now)).toBe(false);
  });
  it("only treats HMRC's nothing-there answers as an empty history", () => {
    const err = (code: string, statusCode: number) =>
      new ApiError({ code, message: "m", statusCode, retryable: false });
    expect(isNothingSubmittedError(err("MATCHING_RESOURCE_NOT_FOUND", 404))).toBe(true);
    expect(isNothingSubmittedError(err("RULE_TAX_YEAR_NOT_SUPPORTED", 400))).toBe(true);
    expect(isNothingSubmittedError(err("DEVICE_MODEL_UNAVAILABLE", 400))).toBe(false);
    expect(isNothingSubmittedError(err("BAD_REQUEST", 400))).toBe(false);
    expect(isNothingSubmittedError(err("HMRC_API_ERROR", 502))).toBe(false);
    expect(isNothingSubmittedError(new Error("Network error"))).toBe(false);
  });
  it("shows the server's message and only offers a retry when it could work", () => {
    const device = new ApiError({
      code: "DEVICE_MODEL_UNAVAILABLE",
      message: "Please update MileClear to the latest version and try again.",
      statusCode: 400,
      retryable: false,
    });
    expect(describeMtdLoadError(device, "fallback")).toEqual({
      message: "Please update MileClear to the latest version and try again.",
      canRetry: false,
    });
    const down = new ApiError({ code: "HMRC_API_ERROR", message: "HMRC is down", statusCode: 502, retryable: true });
    expect(describeMtdLoadError(down, "fallback")).toEqual({ message: "HMRC is down", canRetry: true });
    expect(describeMtdLoadError(new Error("Network error"), "fallback")).toEqual({ message: "fallback", canRetry: true });
  });
  it("words the failed quarterly updates card", () => {
    expect(obligationsErrorText({ message: "Please update MileClear.", canRetry: false })).toBe(
      "Please update MileClear. Until then we can't tell you whether anything is due. This does not mean you have nothing to file.",
    );
    expect(obligationsErrorText({ message: "HMRC is down.", canRetry: true })).toContain("Pull down to try again.");
    expect(obligationsErrorText(null)).toContain("We couldn't load your quarterly updates just now. Pull down to try again.");
  });
  it("words the line", () => {
    expect(connectionLine("2026-10-09T23:28:00Z", "x", now)).toBe("Your test connection has expired. Connect again to carry on.");
    expect(connectionLine("2026-10-11T00:00:00Z", "11 Oct 2026, 01:00", now)).toBe("Your test connection renews by itself while you use it.");
  });
  it("never says test on HMRC's real service", () => {
    expect(connectionLine("2026-10-09T23:28:00Z", "x", now, "production")).toBe("Your connection to HMRC has expired. Connect again to carry on.");
    expect(connectionLine("2026-10-11T00:00:00Z", "x", now, "production")).toBe("Your connection renews by itself while you use it.");
    expect(connectionLine("2026-10-11T00:00:00Z", "x", now, "sandbox")).toBe("Your test connection renews by itself while you use it.");
  });
  it("only calls it live or test when the server has said which", () => {
    expect(isMtdLive("production")).toBe(true);
    expect(isMtdTest("production")).toBe(false);
    expect(isMtdLive("sandbox")).toBe(false);
    expect(isMtdTest("sandbox")).toBe(true);
    for (const unknown of [null, undefined]) {
      expect(isMtdLive(unknown)).toBe(false);
      expect(isMtdTest(unknown)).toBe(false);
    }
  });
});
