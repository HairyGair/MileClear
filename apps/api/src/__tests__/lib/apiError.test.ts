/**
 * Tests for the standardised error taxonomy (audit item #4).
 */
import { describe, it, expect } from "vitest";
import {
  ApiError,
  badRequest,
  invalidInput,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  premiumRequired,
  tooManyRequests,
  serverError,
} from "../../lib/apiError.js";

describe("ApiError", () => {
  it("uses sensible default status codes for common error codes", () => {
    expect(new ApiError("INVALID_INPUT", "x").statusCode).toBe(400);
    expect(new ApiError("UNAUTHORIZED", "x").statusCode).toBe(401);
    expect(new ApiError("PREMIUM_REQUIRED", "x").statusCode).toBe(403);
    expect(new ApiError("NOT_FOUND", "x").statusCode).toBe(404);
    expect(new ApiError("CONFLICT", "x").statusCode).toBe(409);
    expect(new ApiError("TOO_MANY_REQUESTS", "x").statusCode).toBe(429);
    expect(new ApiError("INTERNAL", "x").statusCode).toBe(500);
    expect(new ApiError("SERVICE_UNAVAILABLE", "x").statusCode).toBe(503);
  });

  it("marks 5xx and 429 as retryable, others as non-retryable", () => {
    expect(new ApiError("INTERNAL", "x").retryable).toBe(true);
    expect(new ApiError("SERVICE_UNAVAILABLE", "x").retryable).toBe(true);
    expect(new ApiError("TOO_MANY_REQUESTS", "x").retryable).toBe(true);
    expect(new ApiError("INVALID_INPUT", "x").retryable).toBe(false);
    expect(new ApiError("UNAUTHORIZED", "x").retryable).toBe(false);
    expect(new ApiError("FORBIDDEN", "x").retryable).toBe(false);
    expect(new ApiError("NOT_FOUND", "x").retryable).toBe(false);
  });

  it("respects explicit overrides for statusCode and retryable", () => {
    const e = new ApiError("INTERNAL", "x", {
      statusCode: 502,
      retryable: false,
      hint: "give up",
    });
    expect(e.statusCode).toBe(502);
    expect(e.retryable).toBe(false);
    expect(e.hint).toBe("give up");
  });

  it("toBody includes hint only when provided", () => {
    expect(new ApiError("BAD_REQUEST", "x").toBody().error.hint).toBeUndefined();
    expect(
      new ApiError("BAD_REQUEST", "x", { hint: "fix it" }).toBody().error.hint
    ).toBe("fix it");
  });

  it("toBody includes requestId only when provided", () => {
    const e = new ApiError("BAD_REQUEST", "x");
    expect(e.toBody()).not.toHaveProperty("requestId");
    expect(e.toBody("req-abc").requestId).toBe("req-abc");
  });

  it("emits the canonical body shape", () => {
    const body = new ApiError("INVALID_INPUT", "Email required.", {
      hint: "Provide a valid email.",
    }).toBody("req-1");
    expect(body).toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "Email required.",
        retryable: false,
        hint: "Provide a valid email.",
      },
      requestId: "req-1",
    });
  });
});

describe("ApiError helpers", () => {
  it("badRequest", () => {
    const e = badRequest("bad");
    expect(e.code).toBe("BAD_REQUEST");
    expect(e.statusCode).toBe(400);
  });

  it("invalidInput", () => {
    const e = invalidInput("bad input", "fix it");
    expect(e.code).toBe("INVALID_INPUT");
    expect(e.hint).toBe("fix it");
  });

  it("unauthorized has a sensible default message", () => {
    const e = unauthorized();
    expect(e.code).toBe("UNAUTHORIZED");
    expect(e.message).toMatch(/authentication/i);
  });

  it("forbidden", () => {
    const e = forbidden("nope");
    expect(e.code).toBe("FORBIDDEN");
    expect(e.statusCode).toBe(403);
  });

  it("notFound", () => {
    const e = notFound("missing");
    expect(e.code).toBe("NOT_FOUND");
    expect(e.statusCode).toBe(404);
  });

  it("conflict", () => {
    const e = conflict("clash");
    expect(e.code).toBe("CONFLICT");
    expect(e.statusCode).toBe(409);
  });

  it("premiumRequired ships a default upgrade hint", () => {
    const e = premiumRequired();
    expect(e.code).toBe("PREMIUM_REQUIRED");
    expect(e.statusCode).toBe(403);
    expect(e.hint).toMatch(/upgrade/i);
  });

  it("tooManyRequests is retryable", () => {
    const e = tooManyRequests("slow down");
    expect(e.code).toBe("TOO_MANY_REQUESTS");
    expect(e.retryable).toBe(true);
  });

  it("serverError is retryable", () => {
    const e = serverError();
    expect(e.code).toBe("INTERNAL");
    expect(e.retryable).toBe(true);
  });
});
