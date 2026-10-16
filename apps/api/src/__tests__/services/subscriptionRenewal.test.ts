import { describe, expect, it } from "vitest";
import { decideRenewal, expiringMessage } from "../../services/subscriptionRenewal.js";

describe("decideRenewal", () => {
  it("an Apple subscription renews unless the driver turned renewal off", () => {
    expect(decideRenewal({ hasApple: true, hasGoogle: false, hasStripe: false })).toEqual({ source: "apple", willRenew: true });
    expect(decideRenewal({ hasApple: true, hasGoogle: false, hasStripe: false, appleLatestSubtype: "AUTO_RENEW_ENABLED" }).willRenew).toBe(true);
    expect(decideRenewal({ hasApple: true, hasGoogle: false, hasStripe: false, appleLatestSubtype: "AUTO_RENEW_DISABLED" }).willRenew).toBe(false);
  });

  it("a Google subscription stops renewing only when Play says it was cancelled", () => {
    expect(decideRenewal({ hasApple: false, hasGoogle: true, hasStripe: false, googleLatestState: "SUBSCRIPTION_STATE_ACTIVE" }).willRenew).toBe(true);
    expect(decideRenewal({ hasApple: false, hasGoogle: true, hasStripe: false, googleLatestState: "SUBSCRIPTION_STATE_CANCELED" }).willRenew).toBe(false);
  });

  it("a Stripe subscription follows cancel_at_period_end, and an unknown answer counts as renewing", () => {
    expect(decideRenewal({ hasApple: false, hasGoogle: false, hasStripe: true, stripeCancelAtPeriodEnd: true }).willRenew).toBe(false);
    expect(decideRenewal({ hasApple: false, hasGoogle: false, hasStripe: true, stripeCancelAtPeriodEnd: false }).willRenew).toBe(true);
    expect(decideRenewal({ hasApple: false, hasGoogle: false, hasStripe: true, stripeCancelAtPeriodEnd: null }).willRenew).toBe(true);
  });

  it("granted Pro with no store subscription never renews", () => {
    expect(decideRenewal({ hasApple: false, hasGoogle: false, hasStripe: false })).toEqual({ source: "none", willRenew: false });
  });
});

describe("expiringMessage", () => {
  it("never says Pro is ending to someone whose subscription renews, and names the day", () => {
    expect(expiringMessage(1, "none").title).toBe("Your Pro ends tomorrow");
    expect(expiringMessage(3, "apple").title).toBe("Your Pro ends in 3 days");
    expect(expiringMessage(3, "apple").body).toContain("set not to renew");
    expect(expiringMessage(3, "none").body).not.toContain("renewal");
  });
});
