import { describe, it, expect, vi } from "vitest";

vi.mock("../db/index", () => ({ getDatabase: vi.fn() }));

import { isNotSignedUpError, NOT_SIGNED_UP_CODE, GOVUK_MTD_SIGN_UP } from "./mtdSignUp";
import { ApiError } from "../api/apiError";

describe("mtdSignUp", () => {
  it("spots HMRC's not-signed-up refusal and nothing else", () => {
    const err = (code: string) => new ApiError({ code, message: "m", statusCode: 403, retryable: false });
    expect(isNotSignedUpError(err(NOT_SIGNED_UP_CODE))).toBe(true);
    expect(isNotSignedUpError(err("HMRC_REAUTH_REQUIRED"))).toBe(false);
    expect(isNotSignedUpError(new Error(NOT_SIGNED_UP_CODE))).toBe(false);
  });
  it("points at HMRC's own sign-up page", () => {
    expect(GOVUK_MTD_SIGN_UP).toMatch(/^https:\/\/www\.gov\.uk\//);
  });
});
