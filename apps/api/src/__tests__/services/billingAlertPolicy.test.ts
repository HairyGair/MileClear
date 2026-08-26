import { describe, it, expect } from "vitest";
import { applyEnvironmentPolicy } from "../../services/billingAlertPolicy.js";

// The 21 Aug 2026 shape: App Review's sandbox subscription from the 1.3.7
// approval renewed nightly for a week and each renewal was celebrated as
// revenue. These pin the rule that stops that without touching production.

describe("applyEnvironmentPolicy", () => {
  it("passes production events through untouched", () => {
    const input = {
      kind: "subscription.renewed",
      tier: "celebrate" as const,
      title: "Pro subscription renewed 💚",
      environment: "production",
    };
    const r = applyEnvironmentPolicy(input);
    expect(r.action).toBe("send");
    if (r.action === "send") expect(r.input).toBe(input);
  });

  it("passes events with no environment through (Stripe never sets one)", () => {
    const input = { kind: "subscription.new", tier: "celebrate" as const, title: "New Pro subscriber via web 🎉" };
    const r = applyEnvironmentPolicy(input);
    expect(r.action).toBe("send");
    if (r.action === "send") expect(r.input).toBe(input);
  });

  it("suppresses sandbox renewals outright", () => {
    const r = applyEnvironmentPolicy({
      kind: "subscription.renewed",
      tier: "celebrate",
      title: "Pro subscription renewed 💚",
      environment: "sandbox",
    });
    expect(r).toEqual({ action: "suppress", reason: "sandbox_renewal" });
  });

  it("demotes a sandbox first purchase to aware and labels it", () => {
    const r = applyEnvironmentPolicy({
      kind: "subscription.new",
      tier: "celebrate",
      title: "New Pro subscriber 🎉",
      environment: "sandbox",
      userId: "u1",
    });
    expect(r.action).toBe("send");
    if (r.action === "send") {
      expect(r.input.tier).toBe("aware");
      expect(r.input.title).toBe("[Sandbox] New Pro subscriber 🎉");
      expect(r.input.userId).toBe("u1"); // other fields survive
    }
  });

  it("demotes sandbox act_now events too - sandbox never involves money", () => {
    const r = applyEnvironmentPolicy({
      kind: "subscription.validate_failed",
      tier: "act_now",
      title: "Apple IAP validate threw",
      environment: "sandbox",
    });
    expect(r.action).toBe("send");
    if (r.action === "send") expect(r.input.tier).toBe("aware");
  });

  it("does not double-prefix an already-labelled title", () => {
    const r = applyEnvironmentPolicy({
      kind: "subscription.new",
      tier: "celebrate",
      title: "[Sandbox] New Pro subscriber 🎉",
      environment: "sandbox",
    });
    if (r.action === "send") expect(r.input.title).toBe("[Sandbox] New Pro subscriber 🎉");
  });
});
