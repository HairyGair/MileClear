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
