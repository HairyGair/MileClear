import { describe, it, expect } from "vitest";
import { isNewSubscriberAlert, slackEscape } from "../../services/slack.js";

describe("isNewSubscriberAlert", () => {
  it("passes a first subscription and a resubscription", () => {
    expect(isNewSubscriberAlert({ tier: "celebrate", title: "New Pro subscriber 🎉" })).toBe(true);
    expect(isNewSubscriberAlert({ tier: "celebrate", title: "Pro resubscribed 🎉" })).toBe(true);
    expect(isNewSubscriberAlert({ tier: "celebrate", title: "Pro subscription validated (Android) 🎉" })).toBe(true);
  });
  it("keeps renewals, payment failures and refunds out of Slack", () => {
    expect(isNewSubscriberAlert({ tier: "celebrate", title: "Pro subscription renewed 💚" })).toBe(false);
    expect(isNewSubscriberAlert({ tier: "act_now", title: "Payment failed" })).toBe(false);
    expect(isNewSubscriberAlert({ tier: "aware", title: "Refund issued" })).toBe(false);
  });
});

describe("slackEscape", () => {
  it("escapes the characters Slack reads as markup", () => {
    expect(slackEscape("Jo <jo@x.com> & co")).toBe("Jo &lt;jo@x.com&gt; &amp; co");
  });
});

import { planFromAppleProductId } from "../../services/appleIap.js";
import { planFromGoogleSubscription } from "../../services/googlePlayBilling.js";

describe("plan detection for the subscriber alert", () => {
  it("reads Apple product ids", () => {
    expect(planFromAppleProductId("com.mileclear.premium.annual")).toBe("annual");
    expect(planFromAppleProductId("com.mileclear.premium.monthly")).toBe("monthly");
    expect(planFromAppleProductId(undefined)).toBeNull();
  });
  it("reads Google base plans", () => {
    const sub = (id: string) => ({ lineItems: [{ offerDetails: { basePlanId: id } }] }) as never;
    expect(planFromGoogleSubscription(sub("annual"))).toBe("annual");
    expect(planFromGoogleSubscription(sub("monthly"))).toBe("monthly");
    expect(planFromGoogleSubscription({ lineItems: [] } as never)).toBeNull();
  });
});
