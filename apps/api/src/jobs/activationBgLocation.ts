// Background-location nudge for new drivers (23 Sep 2026).
//
// Of 25 Android users who signed up 21-23 Sep, 15 had no automatic trip and
// five of those had background location "undetermined" or "denied". The
// day 1/3/7 nudges only speak to accounts with ZERO trips (one hand-typed
// trip makes them go quiet), and until today their permission copy only
// described the iPhone settings path. This nudge speaks to anyone in their
// first month who has never had a drive recorded automatically and whose
// phone says background location is not allowed, and gives the steps for
// the phone they actually have.
//
// Kept free of imports so the selection and the copy can be unit-tested
// without mocking Prisma, push or email. The job itself lives in
// activation.ts (runActivationBgLocationNudgeJob) and only sends when
// ACTIVATION_BG_LOCATION_NUDGE=1.

export type DevicePlatform = "ios" | "android" | "both" | "unknown";

/** "ios", "android", "both" from users.platformsSeen, falling back to the
 *  signup platform for accounts that predate platformsSeen. */
export function devicePlatformOf(platformsSeen: string | null, signupPlatform: string | null): DevicePlatform {
  const seen = new Set(
    (platformsSeen ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
  );
  if (seen.has("ios") && seen.has("android")) return "both";
  if (seen.has("ios")) return "ios";
  if (seen.has("android")) return "android";
  if (signupPlatform === "ios" || signupPlatform === "android") return signupPlatform;
  return "unknown";
}

export const BG_NUDGE_PUSH_EVENT = "notification.activation_bg_location";
export const BG_NUDGE_EMAIL_EVENT = "email.activation_bg_location";

/** Earliest and latest account age for this nudge. */
export const BG_NUDGE_MIN_AGE_HOURS = 24;
export const BG_NUDGE_MAX_AGE_DAYS = 30;
/** No two setup messages within this long of each other. */
export const BG_NUDGE_QUIET_HOURS = 48;
/**
 * A heartbeat or dump sent this soon after signup was taken before the
 * permission prompts were answered, so its "undetermined" means nothing
 * (the Scott Lough class, 2 Aug 2026). Same grace as the heartbeat alert.
 */
export const FIRST_LAUNCH_GRACE_MS = 10 * 60 * 1000;

export interface BgNudgeInput {
  createdAt: Date;
  lastHeartbeatAt: Date | null;
  /** users.bgLocationPermission, from the last heartbeat. */
  bgLocationPermission: string | null;
  /** The diagnostic dump's own snapshot, when one exists. */
  dump: { capturedAt: Date; backgroundPermission: unknown } | null;
  platformsSeen: string | null;
  signupPlatform: string | null;
  pushToken: string | null;
  emailVerified: boolean;
  marketingEmailsEnabled: boolean;
  /** Trips recorded by the phone itself: not typed in, not phantom. */
  autoTripCount: number;
  /** This nudge has already gone out on either channel. */
  alreadySent: boolean;
  /** Most recent other setup or permission message (activation day 1/3/7,
   *  welcome nudge, capture-lapsed, heartbeat location alert). */
  lastSetupMessageAt: Date | null;
}

export type BgNudgeSkip =
  | "too_new"
  | "too_old"
  | "has_auto_trip"
  | "already_sent"
  | "no_reading"
  | "granted"
  | "first_launch_reading"
  | "quiet_period"
  | "unreachable";

export type BgNudgeDecision =
  | {
      send: true;
      channel: "push" | "email";
      permission: "undetermined" | "denied";
      platform: DevicePlatform;
    }
  | { send: false; reason: BgNudgeSkip; permission: string | null; platform: DevicePlatform };

/** The fresher of the heartbeat and dump readings, with when it was taken. */
export function latestBgReading(u: BgNudgeInput): { value: string | null; at: Date | null } {
  const dump = u.dump;
  if (dump && (!u.lastHeartbeatAt || dump.capturedAt > u.lastHeartbeatAt)) {
    return {
      value: typeof dump.backgroundPermission === "string" ? dump.backgroundPermission : null,
      at: dump.capturedAt,
    };
  }
  return { value: u.bgLocationPermission, at: u.lastHeartbeatAt };
}

export function decideBgLocationNudge(u: BgNudgeInput, now: Date): BgNudgeDecision {
  const platform = devicePlatformOf(u.platformsSeen, u.signupPlatform);
  const reading = latestBgReading(u);
  const skip = (reason: BgNudgeSkip): BgNudgeDecision => ({
    send: false,
    reason,
    permission: reading.value,
    platform,
  });

  const ageMs = now.getTime() - u.createdAt.getTime();
  if (ageMs < BG_NUDGE_MIN_AGE_HOURS * 3_600_000) return skip("too_new");
  if (ageMs > BG_NUDGE_MAX_AGE_DAYS * 86_400_000) return skip("too_old");
  if (u.autoTripCount > 0) return skip("has_auto_trip");
  if (u.alreadySent) return skip("already_sent");

  // "always" is an older spelling some builds reported for granted.
  if (reading.value === "granted" || reading.value === "always") return skip("granted");
  if (reading.value !== "undetermined" && reading.value !== "denied") return skip("no_reading");
  // Only the first-launch reading on file: it predates the prompts, so the
  // message could be telling someone to do what they already did.
  if (!reading.at || reading.at.getTime() - u.createdAt.getTime() < FIRST_LAUNCH_GRACE_MS) {
    return skip("first_launch_reading");
  }

  if (u.lastSetupMessageAt && now.getTime() - u.lastSetupMessageAt.getTime() < BG_NUDGE_QUIET_HOURS * 3_600_000) {
    return skip("quiet_period");
  }

  const channel = u.pushToken ? "push" : u.emailVerified && u.marketingEmailsEnabled ? "email" : null;
  if (!channel) return skip("unreachable");

  return { send: true, channel, permission: reading.value, platform };
}

// ── Copy ────────────────────────────────────────────────────────────────

/** The full settings path, for email and anywhere the path is spelled out. */
export function bgLocationSettingsPath(platform: DevicePlatform): string[] {
  const android = "Settings > Apps > MileClear > Permissions > Location > Allow all the time";
  const iphone = "Settings > MileClear > Location > Always";
  if (platform === "android") return [android];
  if (platform === "ios") return [iphone];
  return [`On Android: ${android}`, `On iPhone: ${iphone}`];
}

/**
 * Push copy. The data.action is open_settings, which calls
 * Linking.openSettings(): on iPhone that lands on MileClear's own page in
 * Settings, on Android on MileClear's App info page. The body starts from
 * wherever the tap lands.
 */
export function bgLocationPushCopy(platform: DevicePlatform): { title: string; body: string } {
  const title = "MileClear can't record your drives yet";
  if (platform === "android") {
    return {
      title,
      body: "It needs your location all the time to record drives by itself. Tap here, then Permissions, then Location, and choose Allow all the time.",
    };
  }
  if (platform === "ios") {
    return {
      title,
      body: "It needs your location set to Always to record drives by itself. Tap here, then Location, and choose Always.",
    };
  }
  return {
    title,
    body: "It needs background location to record drives by itself. Tap here, then Location. Choose Always on iPhone, or Permissions then Allow all the time on Android.",
  };
}

/**
 * The permission steps the day 1/3/7 and capture-lapsed pushes give, per
 * platform. The iPhone sentence is the one those pushes have always used.
 */
export function openSettingsLocationSteps(platform: DevicePlatform): string {
  if (platform === "android") {
    return "Tap to open Settings, then Permissions, then Location, and choose Allow all the time.";
  }
  if (platform === "unknown" || platform === "both") {
    return "Tap to open Settings, then Location, and choose Always (Allow all the time on Android).";
  }
  return "Tap to open Settings, then Location, and choose Always.";
}
