import { describe, it, expect } from "vitest";
import { isTransientAppleError, validateFailureAlert } from "../../services/appleValidateFailure.js";

const NOW = new Date("2026-10-01T19:24:27Z");

describe("isTransientAppleError", () => {
  it("retries auth hiccups, rate limits and server errors", () => {
    expect(isTransientAppleError({ httpStatusCode: 401 })).toBe(true);
    expect(isTransientAppleError({ httpStatusCode: 429 })).toBe(true);
    expect(isTransientAppleError({ httpStatusCode: 503 })).toBe(true);
  });
  it("does not retry a genuine refusal or a non-HTTP error", () => {
    expect(isTransientAppleError({ httpStatusCode: 404 })).toBe(false);
    expect(isTransientAppleError({ httpStatusCode: 400 })).toBe(false);
    expect(isTransientAppleError(new Error("boom"))).toBe(false);
    expect(isTransientAppleError(null)).toBe(false);
  });
});

describe("validateFailureAlert", () => {
  it("is an email-only note for an active Apple subscriber (Agnieszka, 1 Oct 2026)", () => {
    const a = validateFailureAlert("a5b071ac", { isPremium: true, premiumExpiresAt: new Date("2026-10-04T10:28:09Z"), appleOriginalTransactionId: "460003333773136" }, NOW);
    expect(a.tier).toBe("aware");
    expect(a.body).toContain("2026-10-04");
    expect(a.body).toContain("nothing was lost");
  });
  it("stays urgent for someone with no Apple subscription on file", () => {
    expect(validateFailureAlert("x", { isPremium: false, premiumExpiresAt: null, appleOriginalTransactionId: null }, NOW).tier).toBe("act_now");
  });
  it("stays urgent when the Apple subscription has expired", () => {
    expect(validateFailureAlert("x", { isPremium: true, premiumExpiresAt: new Date("2026-09-01T00:00:00Z"), appleOriginalTransactionId: "1" }, NOW).tier).toBe("act_now");
  });
  it("stays urgent for Pro that is not from Apple (comp, Stripe)", () => {
    expect(validateFailureAlert("x", { isPremium: true, premiumExpiresAt: null, appleOriginalTransactionId: null }, NOW).tier).toBe("act_now");
  });
  it("stays urgent when the user can't be read", () => {
    expect(validateFailureAlert(null, null, NOW).tier).toBe("act_now");
  });
});
