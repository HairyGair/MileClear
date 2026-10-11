import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/stripe.js", () => ({ stripe: null }));

import {
  runUpstreamRevocation,
  type UpstreamDeps,
  type UpstreamUserData,
} from "../../services/accountDeletion.js";

// GDPR audit H6 (14 Aug 2026): deleting an account left every upstream grant
// alive. These pin down the orchestration: each provider is asked, a failure
// in one never stops the others, and nothing throws.

function deps(overrides: Partial<UpstreamDeps> = {}): UpstreamDeps {
  return {
    cancelStripeSubscription: vi.fn().mockResolvedValue(undefined),
    deleteStripeCustomer: vi.fn().mockResolvedValue(undefined),
    revokeQuickBooks: vi.fn().mockResolvedValue(undefined),
    revokeXero: vi.fn().mockResolvedValue(undefined),
    revokeTrueLayer: vi.fn().mockResolvedValue(undefined),
    deleteWaitlistEntry: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

const full: UpstreamUserData = {
  email: "driver@example.com",
  stripeCustomerId: "cus_123",
  stripeSubscriptionId: "sub_123",
  quickBooks: [{ id: "qb1", refreshTokenEncrypted: "enc:v1:qb" }],
  xero: [{ id: "x1", refreshTokenEncrypted: "enc:v1:x" }],
  trueLayer: [
    { id: "tl1", accessToken: "enc:v1:a", refreshToken: "enc:v1:r", status: "active" },
    { id: "tl2", accessToken: "enc:v1:b", refreshToken: null, status: "disconnected" },
  ],
  hasHmrcConnection: true,
};

describe("runUpstreamRevocation", () => {
  it("revokes every upstream grant and deletes the Stripe customer", async () => {
    const d = deps();
    const results = await runUpstreamRevocation(full, d);

    expect(d.cancelStripeSubscription).toHaveBeenCalledWith("sub_123");
    expect(d.deleteStripeCustomer).toHaveBeenCalledWith("cus_123");
    expect(d.revokeQuickBooks).toHaveBeenCalledWith("enc:v1:qb");
    expect(d.revokeXero).toHaveBeenCalledWith("enc:v1:x");
    expect(d.revokeTrueLayer).toHaveBeenCalledTimes(2);
    expect(d.deleteWaitlistEntry).toHaveBeenCalledWith("driver@example.com");
    expect(results.filter((r) => r.outcome === "done")).toHaveLength(7);
    expect(results.find((r) => r.step === "hmrc.revoke")?.outcome).toBe("skipped");
  });

  it("carries on past a failing provider and reports it", async () => {
    const d = deps({
      deleteStripeCustomer: vi.fn().mockRejectedValue(new Error("stripe down")),
      revokeQuickBooks: vi.fn().mockRejectedValue(new Error("intuit 500")),
    });
    const results = await runUpstreamRevocation(full, d);

    expect(d.revokeXero).toHaveBeenCalled();
    expect(d.revokeTrueLayer).toHaveBeenCalledTimes(2);
    expect(d.deleteWaitlistEntry).toHaveBeenCalled();
    expect(results.find((r) => r.step === "stripe.customer_delete")).toEqual({
      step: "stripe.customer_delete",
      outcome: "failed",
      detail: "stripe down",
    });
    expect(results.find((r) => r.step === "quickbooks.revoke")?.outcome).toBe("failed");
  });

  it("asks nothing of providers the driver never connected", async () => {
    const d = deps();
    const results = await runUpstreamRevocation(
      {
        email: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        quickBooks: [],
        xero: [],
        trueLayer: [],
        hasHmrcConnection: false,
      },
      d
    );
    expect(results).toEqual([]);
    for (const fn of Object.values(d)) expect(fn).not.toHaveBeenCalled();
  });
});
