/**
 * Tests for the shared sync error classifiers. These guard the distinction
 * that the whole offline-first layer hinges on: "the network failed / preserve
 * and retry" vs "the server rejected this / stop". Getting "Network error"
 * (apiRequest's own 401-refresh message) on the wrong side of that line is
 * what deleted captured trips and burned queued trips' retries to death.
 */
import { describe, it, expect } from "vitest";
import { ApiError } from "../../api/apiError";
import {
  isNetworkError,
  isLocalSystemError,
  isSessionExpired,
  isRateLimited,
  isAuthError,
  isDefiniteClientRejection,
  isKnownGarbageRejection,
  isKeepAndBackOffRejection,
} from "../errors";

const apiErr = (statusCode: number) =>
  new ApiError({ code: "X", message: "rejected", statusCode, retryable: false });

describe("isNetworkError", () => {
  it("matches RN's raw fetch failure", () => {
    expect(isNetworkError(new TypeError("Network request failed"))).toBe(true);
  });
  it("matches apiRequest's own 401-refresh-network message", () => {
    expect(isNetworkError(new Error("Network error"))).toBe(true);
  });
  it("matches refresh + fetch + timeout signatures", () => {
    expect(isNetworkError(new Error("REFRESH_NETWORK_ERROR"))).toBe(true);
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("The request timed out"))).toBe(true);
  });
  it("matches a web page in place of our reply (Wi-Fi sign-in, filter)", () => {
    expect(isNetworkError(new SyntaxError("JSON Parse error: Unexpected character: <"))).toBe(true);
    expect(isNetworkError(new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"))).toBe(true);
    expect(isNetworkError(new SyntaxError("JSON Parse error: Unexpected end of input"))).toBe(false);
  });
  it("does not match a server rejection", () => {
    expect(isNetworkError(apiErr(400))).toBe(false);
    expect(isNetworkError(new Error("Validation failed"))).toBe(false);
  });
});

describe("isSessionExpired / isRateLimited", () => {
  it("session expired", () => {
    expect(isSessionExpired(new Error("Session expired"))).toBe(true);
    expect(isSessionExpired(new Error("Network error"))).toBe(false);
  });
  it("rate limited is the 429 ApiError", () => {
    expect(isRateLimited(apiErr(429))).toBe(true);
    expect(isRateLimited(apiErr(400))).toBe(false);
  });
});

describe("isAuthError (401/403 — preserve-and-stop, data-loss fix)", () => {
  it("true for 401 and 403 ApiErrors", () => {
    expect(isAuthError(apiErr(401))).toBe(true);
    expect(isAuthError(apiErr(403))).toBe(true);
  });
  it("false for other 4xx, 5xx, and non-ApiError", () => {
    expect(isAuthError(apiErr(400))).toBe(false);
    expect(isAuthError(apiErr(404))).toBe(false);
    expect(isAuthError(apiErr(500))).toBe(false);
    expect(isAuthError(new Error("Network error"))).toBe(false);
  });
});

describe("isDefiniteClientRejection", () => {
  it("true for real payload rejections (400/404/409/422)", () => {
    expect(isDefiniteClientRejection(apiErr(400))).toBe(true);
    expect(isDefiniteClientRejection(apiErr(404))).toBe(true);
    expect(isDefiniteClientRejection(apiErr(409))).toBe(true);
    expect(isDefiniteClientRejection(apiErr(422))).toBe(true);
  });
  it("false for 401/403 — recoverable auth, must preserve-and-retry (data-loss fix)", () => {
    // A 401 that survives a successful token refresh (clock skew / momentary
    // auth hiccup / locked-keychain background path) and a 403 that clears once
    // a subscription re-syncs are NOT malformed data. Parking either as
    // permanently_failed destroyed real trips (16 Jun 2026).
    expect(isDefiniteClientRejection(apiErr(401))).toBe(false);
    expect(isDefiniteClientRejection(apiErr(403))).toBe(false);
  });
  it("false for 429, 5xx, network, unknown (all retryable/preserve)", () => {
    expect(isDefiniteClientRejection(apiErr(429))).toBe(false);
    expect(isDefiniteClientRejection(apiErr(500))).toBe(false);
    expect(isDefiniteClientRejection(new Error("Network error"))).toBe(false);
    expect(isDefiniteClientRejection(new Error("anything"))).toBe(false);
  });
});

describe("isLocalSystemError (superset preserves legacy create-handler behaviour)", () => {
  it("matches SecureStore + session + refresh strings", () => {
    expect(isLocalSystemError(new Error("User interaction is not allowed"))).toBe(true);
    expect(isLocalSystemError(new Error("SecureStore unavailable"))).toBe(true);
    expect(isLocalSystemError(new Error("Session expired"))).toBe(true);
    expect(isLocalSystemError(new Error("REFRESH_NETWORK_ERROR"))).toBe(true);
  });
});

const apiErrMsg = (statusCode: number, message: string) =>
  new ApiError({ code: "X", message, statusCode, retryable: false });

describe("isKnownGarbageRejection (the only verdict that clears a recording)", () => {
  it("is true for the 400 distance verdict", () => {
    expect(isKnownGarbageRejection(apiErrMsg(400, "Distance exceeds reasonable limit"))).toBe(true);
  });
  it("is false for every other 400, so a real drive is never cleared", () => {
    for (const m of [
      "Start date cannot be in the future",
      "Array must contain at most 20000 element(s)",
      "Invalid enum value. Expected 'uber' | 'deliveroo', received 'newplatform'",
      "Invalid date",
    ]) {
      expect(isKnownGarbageRejection(apiErrMsg(400, m)), m).toBe(false);
    }
  });
  it("is false for other statuses and non-API errors", () => {
    expect(isKnownGarbageRejection(apiErrMsg(413, "Distance exceeds reasonable limit"))).toBe(false);
    expect(isKnownGarbageRejection(new Error("Distance exceeds reasonable limit"))).toBe(false);
    expect(isKnownGarbageRejection(null)).toBe(false);
  });
});

describe("isKeepAndBackOffRejection (a refusal that must not delete the drive)", () => {
  it("is true for a payload verdict that is not known garbage", () => {
    for (const s of [400, 410, 413, 422]) expect(isKeepAndBackOffRejection(apiErrMsg(s, "Start date cannot be in the future")), String(s)).toBe(true);
  });
  it("is false for known garbage (it has its own path)", () => {
    expect(isKeepAndBackOffRejection(apiErrMsg(400, "Distance exceeds reasonable limit"))).toBe(false);
  });
  it("is false for every 4xx that means not now or not this way", () => {
    for (const s of [401, 403, 404, 408, 409, 429]) expect(isKeepAndBackOffRejection(apiErr(s)), String(s)).toBe(false);
  });
  it("is false for 5xx, network errors, the web-page-instead-of-us error and unknowns", () => {
    for (const s of [500, 502, 503, 504]) expect(isKeepAndBackOffRejection(apiErr(s)), String(s)).toBe(false);
    expect(isKeepAndBackOffRejection(new TypeError("Network request failed"))).toBe(false);
    expect(isKeepAndBackOffRejection(new SyntaxError("JSON Parse error: Unexpected character: <"))).toBe(false);
    expect(isKeepAndBackOffRejection(new Error("Session expired"))).toBe(false);
    expect(isKeepAndBackOffRejection(null)).toBe(false);
  });
});
