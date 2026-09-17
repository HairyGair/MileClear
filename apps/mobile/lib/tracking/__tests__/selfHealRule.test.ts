/**
 * The engine self-heal, checked against the two phones that shaped it: the
 * iPhones whose native engine never heard motion (Norman Boomer, 10 Jun 2026),
 * and Becky O'Neill's moto g55 5G, which healed on 10 Sep 2026 and then logged
 * nothing at all for a week because Android has no JS fallback to heal to.
 */
import { describe, it, expect } from "vitest";
import {
  shouldSelfHeal,
  shouldRollBackHeal,
  SELF_HEAL_ROLLBACK_MS,
  SELF_HEAL_RETRY_AFTER_ROLLBACK_MS,
  SELF_HEAL_MIN_ENGINE_AGE_MS,
  type SelfHealEvidence,
} from "../selfHealRule";

const NOW = new Date("2026-09-17T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

/** A phone that ticks every box for a heal: old deaf engine, real driver,
 *  permissions fine. Only the platform is left to argue about. */
function deafEngine(over: Partial<SelfHealEvidence> = {}): SelfHealEvidence {
  return {
    platform: "ios",
    engineAgeMs: SELF_HEAL_MIN_ENGINE_AGE_MS + HOUR,
    motionSigns: 0,
    lifetimeAutoTrips: 40,
    recentAutoTrips: 0,
    backgroundPermission: "granted",
    motionPermission: "granted",
    rolledBackAt: null,
    now: NOW,
    ...over,
  };
}

describe("shouldSelfHeal", () => {
  it("heals a deaf iPhone, as before", () => {
    expect(shouldSelfHeal(deafEngine())).toEqual({ heal: true, reason: "engine_is_deaf" });
  });

  it("never heals on Android, however deaf the engine looks", () => {
    // Becky's phone. The JS engine cannot capture on Android, so healing here
    // is an off switch, not a repair.
    const d = shouldSelfHeal(deafEngine({ platform: "android" }));
    expect(d).toEqual({ heal: false, reason: "no_js_fallback_on_platform" });
  });

  it("leaves an engine that has heard motion alone", () => {
    expect(shouldSelfHeal(deafEngine({ motionSigns: 1 }))).toEqual({
      heal: false,
      reason: "engine_hears_motion",
    });
  });

  it("gives a young engine more time", () => {
    expect(shouldSelfHeal(deafEngine({ engineAgeMs: HOUR }))).toEqual({
      heal: false,
      reason: "engine_too_new",
    });
  });

  it("asks the caller for permissions only once everything else points at a heal", () => {
    expect(
      shouldSelfHeal(deafEngine({ backgroundPermission: null, motionPermission: null }))
    ).toEqual({ heal: false, reason: "permissions_unknown" });
    // ...and a phone that fails an earlier check never costs a permission read.
    expect(
      shouldSelfHeal(
        deafEngine({ backgroundPermission: null, motionPermission: null, recentAutoTrips: 2 })
      ).reason
    ).toBe("captured_recently");
  });

  it("treats missing permissions as the nudges' problem, not the engine's", () => {
    expect(shouldSelfHeal(deafEngine({ backgroundPermission: "denied" })).heal).toBe(false);
    expect(shouldSelfHeal(deafEngine({ motionPermission: "denied" })).heal).toBe(false);
  });

  it("will not heal straight back after a rollback", () => {
    // Otherwise a rolled-back iPhone would flip engines, and fire two
    // notifications, inside a single foreground.
    const justUndone = shouldSelfHeal(deafEngine({ rolledBackAt: NOW - HOUR }));
    expect(justUndone).toEqual({ heal: false, reason: "rollback_cooldown" });
    const longAgo = shouldSelfHeal(
      deafEngine({ rolledBackAt: NOW - SELF_HEAL_RETRY_AFTER_ROLLBACK_MS - HOUR })
    );
    expect(longAgo.heal).toBe(true);
  });
});

describe("shouldRollBackHeal", () => {
  it("undoes an Android heal on sight", () => {
    const d = shouldRollBackHeal({
      platform: "android",
      healedAt: NOW - HOUR,
      autoTripsSinceHeal: 0,
      now: NOW,
    });
    expect(d).toEqual({ rollBack: true, reason: "no_js_fallback_on_platform" });
  });

  it("undoes an Android heal even if something was captured since", () => {
    // A manual start or an orphan sweep can still produce a trip; it is not
    // evidence that background capture works on Android.
    const d = shouldRollBackHeal({
      platform: "android",
      healedAt: NOW - 10 * 24 * HOUR,
      autoTripsSinceHeal: 3,
      now: NOW,
    });
    expect(d.rollBack).toBe(true);
  });

  it("leaves a working iOS fallback alone", () => {
    const d = shouldRollBackHeal({
      platform: "ios",
      healedAt: NOW - 30 * 24 * HOUR,
      autoTripsSinceHeal: 7,
      now: NOW,
    });
    expect(d).toEqual({ rollBack: false, reason: "fallback_is_capturing" });
  });

  it("gives an iOS fallback its grace period before judging it", () => {
    const d = shouldRollBackHeal({
      platform: "ios",
      healedAt: NOW - SELF_HEAL_ROLLBACK_MS + HOUR,
      autoTripsSinceHeal: 0,
      now: NOW,
    });
    expect(d).toEqual({ rollBack: false, reason: "within_grace_period" });
  });

  it("undoes an iOS heal that captured nothing in 48 hours", () => {
    const d = shouldRollBackHeal({
      platform: "ios",
      healedAt: NOW - SELF_HEAL_ROLLBACK_MS - HOUR,
      autoTripsSinceHeal: 0,
      now: NOW,
    });
    expect(d).toEqual({ rollBack: true, reason: "fallback_captured_nothing" });
  });

  it("rolls back exactly at the boundary", () => {
    const d = shouldRollBackHeal({
      platform: "ios",
      healedAt: NOW - SELF_HEAL_ROLLBACK_MS,
      autoTripsSinceHeal: 0,
      now: NOW,
    });
    expect(d).toEqual({ rollBack: true, reason: "fallback_captured_nothing" });
  });

  it("never touches a device that did not self-heal", () => {
    // The diagnostics toggle and the server push switch the engine without
    // writing native_self_heal_at, and must not be fought with.
    for (const platform of ["ios", "android"]) {
      expect(
        shouldRollBackHeal({ platform, healedAt: null, autoTripsSinceHeal: 0, now: NOW })
      ).toEqual({ rollBack: false, reason: "not_healed" });
    }
  });

  it("rolls back at 3am the same as at noon", () => {
    // Quiet hours hold back the notification in detection.ts, never the engine
    // switch: a driver asleep at 3am still wants capture working by morning.
    const threeAm = new Date("2026-09-17T03:00:00").getTime();
    const d = shouldRollBackHeal({
      platform: "android",
      healedAt: threeAm - 4 * HOUR,
      autoTripsSinceHeal: 0,
      now: threeAm,
    });
    expect(d.rollBack).toBe(true);
  });

  it("ignores an unreadable heal stamp rather than rolling back blindly", () => {
    expect(
      shouldRollBackHeal({ platform: "android", healedAt: NaN, autoTripsSinceHeal: 0, now: NOW })
    ).toEqual({ rollBack: false, reason: "not_healed" });
  });
});
