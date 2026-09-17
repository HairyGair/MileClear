// When the app is allowed to switch itself off the native engine, and when it
// has to switch back.
//
// The self-heal exists because a small class of iPhones never hear motion:
// RNBG reports isMoving:false forever, no recording ever opens, and the device
// thinks it is healthy while every drive is missed (Norman Boomer + tjdfsr66f9,
// 10 Jun 2026). On iOS the app can drop back to the old expo-location JS
// engine, which ran the fleet for months, and keep capturing.
//
// On ANDROID there is no such fallback. Capture there depends on the native
// foreground service; the JS expo-location path cannot stand in for it. Healing
// an Android phone therefore does not rescue it, it silences it. Becky O'Neill
// (moto g55 5G, runtime 1.3.9-build87, 17 Sep 2026) self-healed on 10 Sep and
// captured nothing at all for the next week: zero auto trips, one 0.17 mile
// discarded recording, alert.task_not_running twice. And because the old reset
// only re-armed the engine when the RUNTIME VERSION changed, and her fleet gets
// OTAs rather than new runtimes, she would have stayed dead indefinitely.
//
// So: heal on iOS only, and roll a heal back when it demonstrably did not help.
// Pure module, like orphanRoute.ts and batteryOptimisationRule.ts, so the test
// runner can reason about it without importing the native stack.

/** How long a healed phone gets to prove the fallback engine works before the
 *  heal is judged a failure and undone. Long enough to cover a weekend off the
 *  road, short enough that nobody loses a working week. */
export const SELF_HEAL_ROLLBACK_MS = 48 * 60 * 60 * 1000;

/** After a rollback the native engine owns the device again. Without a cooling
 *  off period the very next detection tick would look at the same unchanged
 *  evidence and heal straight back, so the phone would flip engines (and fire
 *  two notifications) in a single foreground. */
export const SELF_HEAL_RETRY_AFTER_ROLLBACK_MS = 14 * 24 * 60 * 60 * 1000;

/** The engine has had a fair chance: its earliest start event is this old. */
export const SELF_HEAL_MIN_ENGINE_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/** Window that counts as "drives are being missed right now". */
export const SELF_HEAL_RECENT_TRIP_MS = 3 * 24 * 60 * 60 * 1000;

export type SelfHealReason =
  /** Android: healing would leave the phone with no working engine at all. */
  | "no_js_fallback_on_platform"
  | "engine_never_started"
  | "engine_too_new"
  | "engine_hears_motion"
  | "not_an_established_driver"
  | "captured_recently"
  /** Permissions have not been read yet; the caller should read them and ask
   *  again. Everything cheaper than a permission read has already passed. */
  | "permissions_unknown"
  | "background_permission_missing"
  | "motion_permission_denied"
  | "rollback_cooldown"
  | "engine_is_deaf";

export interface SelfHealEvidence {
  /** Platform.OS. */
  platform: string;
  /** Age of the earliest native_engine_started event, or null if the engine
   *  has never started on this device. */
  engineAgeMs: number | null;
  /** Recordings started, speed force-starts and isMoving:true motionchanges.
   *  Any one of them means the engine can hear. */
  motionSigns: number;
  /** Auto-captured trips ever. Below a handful this is a new or manual-only
   *  user, not a broken engine. */
  lifetimeAutoTrips: number;
  /** Auto-captured trips inside SELF_HEAL_RECENT_TRIP_MS. */
  recentAutoTrips: number;
  /** expo-location background permission status, or null if not read yet. */
  backgroundPermission: string | null;
  /** Motion and Fitness permission, or null if not read yet. */
  motionPermission: string | null;
  /** When a previous heal on this device was undone, if it was. */
  rolledBackAt: number | null;
  now: number;
}

export interface SelfHealDecision {
  heal: boolean;
  reason: SelfHealReason;
}

/**
 * Is the native engine demonstrably deaf on this device, and is switching to
 * the JS engine actually an improvement?
 *
 * Checks run cheapest first, and the two permission reads are last, so a caller
 * can pass nulls for the permissions, get "permissions_unknown" back, and only
 * pay for the permission reads when everything else already points at a heal.
 */
export function shouldSelfHeal(e: SelfHealEvidence): SelfHealDecision {
  // Android has no JS fallback. Healing there is not a repair, it is an
  // off switch (Becky O'Neill, 10 to 17 Sep 2026: zero trips).
  if (e.platform !== "ios") return { heal: false, reason: "no_js_fallback_on_platform" };

  if (e.rolledBackAt !== null && e.now - e.rolledBackAt < SELF_HEAL_RETRY_AFTER_ROLLBACK_MS) {
    return { heal: false, reason: "rollback_cooldown" };
  }

  if (e.engineAgeMs === null || !Number.isFinite(e.engineAgeMs)) {
    return { heal: false, reason: "engine_never_started" };
  }
  if (e.engineAgeMs < SELF_HEAL_MIN_ENGINE_AGE_MS) {
    return { heal: false, reason: "engine_too_new" };
  }
  if (e.motionSigns > 0) return { heal: false, reason: "engine_hears_motion" };
  if (e.lifetimeAutoTrips < 3) return { heal: false, reason: "not_an_established_driver" };
  if (e.recentAutoTrips > 0) return { heal: false, reason: "captured_recently" };

  if (e.backgroundPermission === null || e.motionPermission === null) {
    return { heal: false, reason: "permissions_unknown" };
  }
  // A permission problem is the nudges' job, and the JS engine would be just
  // as blind without these.
  if (e.backgroundPermission !== "granted") {
    return { heal: false, reason: "background_permission_missing" };
  }
  if (e.motionPermission === "denied") return { heal: false, reason: "motion_permission_denied" };

  return { heal: true, reason: "engine_is_deaf" };
}

export type RollbackReason =
  | "not_healed"
  /** Android should never have healed; undo it on sight, whenever it happened
   *  and whatever the phone has captured since. */
  | "no_js_fallback_on_platform"
  | "fallback_is_capturing"
  | "within_grace_period"
  | "fallback_captured_nothing";

export interface RollbackEvidence {
  platform: string;
  /** Epoch ms from tracking_state.native_self_heal_at, or null when this
   *  device has not healed. Only a heal sets that key, so a user or server
   *  switching the engine off by hand is never undone by this. */
  healedAt: number | null;
  /** Auto-captured trips since healedAt: whether the fallback engine works. */
  autoTripsSinceHeal: number;
  now: number;
}

export interface RollbackDecision {
  rollBack: boolean;
  reason: RollbackReason;
}

/** Should a previous self-heal be undone and the native engine given back? */
export function shouldRollBackHeal(e: RollbackEvidence): RollbackDecision {
  if (e.healedAt === null || !Number.isFinite(e.healedAt)) {
    return { rollBack: false, reason: "not_healed" };
  }
  if (e.platform !== "ios") return { rollBack: true, reason: "no_js_fallback_on_platform" };
  if (e.autoTripsSinceHeal > 0) return { rollBack: false, reason: "fallback_is_capturing" };
  if (e.now - e.healedAt < SELF_HEAL_ROLLBACK_MS) {
    return { rollBack: false, reason: "within_grace_period" };
  }
  return { rollBack: true, reason: "fallback_captured_nothing" };
}
