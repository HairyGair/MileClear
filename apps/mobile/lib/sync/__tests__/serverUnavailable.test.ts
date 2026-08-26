/**
 * 502/503/504 must never cost the user data.
 *
 * Found 13 Aug 2026: our OWN deploy opens this window. `pm2 restart` leaves
 * Apache serving 503 for a few seconds while Node boots, so anything syncing at
 * that moment met a 5xx. Two separate things went wrong with that:
 *
 *   1. The queue engine treated 5xx as a generic transient failure and burned a
 *      retry; MAX_RETRIES parks the item as permanently_failed.
 *   2. The create wrappers for earnings, fuel logs, saved locations and shifts
 *      DELETED the user's local row on any non-network error. The trip path was
 *      fixed after the golf-club loss; its siblings were not.
 */
import { describe, it, expect } from "vitest";
import {
  isServerUnavailable,
  isRateLimited,
  isNetworkError,
  isDefiniteClientRejection,
} from "../errors";
import { ApiError } from "../../api/apiError";

const err = (statusCode: number) =>
  new ApiError({ code: "ERR", message: "boom", statusCode, retryable: false });

describe("isServerUnavailable", () => {
  it("covers the codes infrastructure emits when it is briefly away", () => {
    expect(isServerUnavailable(err(502))).toBe(true);
    expect(isServerUnavailable(err(503))).toBe(true);
    expect(isServerUnavailable(err(504))).toBe(true);
  });

  it("leaves 500 on the retry-then-park path", () => {
    // A 500 can be a real fault on this specific payload. Preserving it forever
    // would mean retrying a poison item for good.
    expect(isServerUnavailable(err(500))).toBe(false);
  });

  it("does not swallow genuine payload rejections", () => {
    for (const s of [400, 409, 422]) {
      expect(isServerUnavailable(err(s))).toBe(false);
      expect(isDefiniteClientRejection(err(s))).toBe(true);
    }
  });

  it("keeps 5xx out of the definite-rejection set, so a row is never discarded for it", () => {
    for (const s of [502, 503, 504]) {
      expect(isDefiniteClientRejection(err(s))).toBe(false);
    }
  });

  it("sits alongside the other preserve-and-stop classes rather than replacing them", () => {
    expect(isRateLimited(err(429))).toBe(true);
    expect(isServerUnavailable(err(429))).toBe(false);
    expect(isNetworkError(new Error("Network request failed"))).toBe(true);
    expect(isServerUnavailable(new Error("Network request failed"))).toBe(false);
  });

  it("ignores non-errors and plain errors rather than throwing", () => {
    expect(isServerUnavailable(null)).toBe(false);
    expect(isServerUnavailable("503")).toBe(false);
    expect(isServerUnavailable(new Error("503"))).toBe(false);
  });
});
