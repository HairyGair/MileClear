/**
 * Background-location nudge selection and copy (23 Sep 2026).
 *
 * Who gets told "MileClear can't record your drives yet", on which channel,
 * and with which phone's settings path. Pure functions, no mocks.
 */
import { describe, it, expect } from "vitest";

import {
  bgLocationPushCopy,
  bgLocationSettingsPath,
  decideBgLocationNudge,
  devicePlatformOf,
  openSettingsLocationSteps,
  type BgNudgeInput,
} from "../../jobs/activationBgLocation.js";

const NOW = new Date("2026-09-23T16:30:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function user(over: Partial<BgNudgeInput> = {}): BgNudgeInput {
  const createdAt = over.createdAt ?? ago(2 * DAY);
  return {
    createdAt,
    // A heartbeat an hour after signup: past the first-launch grace.
    lastHeartbeatAt: new Date(createdAt.getTime() + HOUR),
    bgLocationPermission: "undetermined",
    dump: null,
    platformsSeen: "android",
    signupPlatform: "android",
    pushToken: "ExponentPushToken[abc]",
    emailVerified: true,
    marketingEmailsEnabled: true,
    autoTripCount: 0,
    alreadySent: false,
    lastSetupMessageAt: null,
    ...over,
  };
}

describe("devicePlatformOf", () => {
  it("reads platformsSeen first", () => {
    expect(devicePlatformOf("android", "ios")).toBe("android");
    expect(devicePlatformOf("ios", null)).toBe("ios");
    expect(devicePlatformOf("android,ios", null)).toBe("both");
    expect(devicePlatformOf("android,web", "web")).toBe("android");
  });
  it("falls back to the signup platform", () => {
    expect(devicePlatformOf(null, "android")).toBe("android");
    expect(devicePlatformOf("web", "ios")).toBe("ios");
    expect(devicePlatformOf(null, "web")).toBe("unknown");
    expect(devicePlatformOf(null, null)).toBe("unknown");
  });
});

describe("decideBgLocationNudge", () => {
  it("sends to an Android driver a day in with undetermined location and no auto trip", () => {
    expect(decideBgLocationNudge(user(), NOW)).toEqual({
      send: true,
      channel: "push",
      permission: "undetermined",
      platform: "android",
    });
  });

  it("sends for denied as well as undetermined, on iPhone too", () => {
    const d = decideBgLocationNudge(user({ bgLocationPermission: "denied", platformsSeen: "ios" }), NOW);
    expect(d).toMatchObject({ send: true, permission: "denied", platform: "ios" });
  });

  it("waits until the account is a day old", () => {
    const d = decideBgLocationNudge(user({ createdAt: ago(23 * HOUR) }), NOW);
    expect(d).toMatchObject({ send: false, reason: "too_new" });
    expect(decideBgLocationNudge(user({ createdAt: ago(25 * HOUR) }), NOW).send).toBe(true);
  });

  it("leaves accounts older than a month to the capture-lapsed job", () => {
    expect(decideBgLocationNudge(user({ createdAt: ago(31 * DAY) }), NOW)).toMatchObject({
      send: false,
      reason: "too_old",
    });
  });

  it("skips anyone the phone has already recorded a drive for", () => {
    expect(decideBgLocationNudge(user({ autoTripCount: 1 }), NOW)).toMatchObject({
      send: false,
      reason: "has_auto_trip",
    });
  });

  it("goes once only", () => {
    expect(decideBgLocationNudge(user({ alreadySent: true }), NOW)).toMatchObject({
      send: false,
      reason: "already_sent",
    });
  });

  it("skips granted, and the older 'always' spelling", () => {
    expect(decideBgLocationNudge(user({ bgLocationPermission: "granted" }), NOW)).toMatchObject({
      send: false,
      reason: "granted",
    });
    expect(decideBgLocationNudge(user({ bgLocationPermission: "always" }), NOW)).toMatchObject({
      send: false,
      reason: "granted",
    });
  });

  it("skips when there is no reading at all", () => {
    const d = decideBgLocationNudge(user({ bgLocationPermission: null, lastHeartbeatAt: null }), NOW);
    expect(d).toMatchObject({ send: false, reason: "no_reading" });
  });

  it("believes a newer dump that says granted over a stale heartbeat", () => {
    const u = user();
    const d = decideBgLocationNudge(
      { ...u, dump: { capturedAt: new Date(u.lastHeartbeatAt!.getTime() + HOUR), backgroundPermission: "granted" } },
      NOW
    );
    expect(d).toMatchObject({ send: false, reason: "granted" });
  });

  it("ignores an older dump that says granted when the heartbeat is newer", () => {
    const u = user();
    const d = decideBgLocationNudge(
      { ...u, dump: { capturedAt: new Date(u.lastHeartbeatAt!.getTime() - 30 * 60_000), backgroundPermission: "granted" } },
      NOW
    );
    expect(d.send).toBe(true);
  });

  it("does not trust a reading taken before the permission prompts", () => {
    const createdAt = ago(2 * DAY);
    const d = decideBgLocationNudge(
      user({ createdAt, lastHeartbeatAt: new Date(createdAt.getTime() + 30_000) }),
      NOW
    );
    expect(d).toMatchObject({ send: false, reason: "first_launch_reading" });
  });

  it("a later dump rescues a first-launch heartbeat", () => {
    const createdAt = ago(2 * DAY);
    const d = decideBgLocationNudge(
      user({
        createdAt,
        lastHeartbeatAt: new Date(createdAt.getTime() + 30_000),
        dump: { capturedAt: new Date(createdAt.getTime() + 5 * HOUR), backgroundPermission: "denied" },
      }),
      NOW
    );
    expect(d).toMatchObject({ send: true, permission: "denied" });
  });

  it("holds back for 48 hours after another setup message", () => {
    expect(decideBgLocationNudge(user({ lastSetupMessageAt: ago(47 * HOUR) }), NOW)).toMatchObject({
      send: false,
      reason: "quiet_period",
    });
    expect(decideBgLocationNudge(user({ lastSetupMessageAt: ago(49 * HOUR) }), NOW).send).toBe(true);
  });

  it("falls back to email without a push token, only with consent and a verified address", () => {
    expect(decideBgLocationNudge(user({ pushToken: null }), NOW)).toMatchObject({ send: true, channel: "email" });
    expect(decideBgLocationNudge(user({ pushToken: null, marketingEmailsEnabled: false }), NOW)).toMatchObject({
      send: false,
      reason: "unreachable",
    });
    expect(decideBgLocationNudge(user({ pushToken: null, emailVerified: false }), NOW)).toMatchObject({
      send: false,
      reason: "unreachable",
    });
  });
});

describe("copy", () => {
  const allCopy = [
    ...(["android", "ios", "both", "unknown"] as const).flatMap((p) => [
      bgLocationPushCopy(p).title,
      bgLocationPushCopy(p).body,
      ...bgLocationSettingsPath(p),
      openSettingsLocationSteps(p),
    ]),
  ];

  it("gives Android its own path", () => {
    expect(bgLocationSettingsPath("android")).toEqual([
      "Settings > Apps > MileClear > Permissions > Location > Allow all the time",
    ]);
    expect(bgLocationPushCopy("android").body).toContain("Allow all the time");
    expect(bgLocationPushCopy("android").body).not.toContain("Always");
    expect(openSettingsLocationSteps("android")).toContain("Permissions");
  });

  it("gives iPhone its own path, and keeps the day 1/3/7 iPhone sentence unchanged", () => {
    expect(bgLocationSettingsPath("ios")).toEqual(["Settings > MileClear > Location > Always"]);
    expect(bgLocationPushCopy("ios").body).not.toContain("Allow all the time");
    expect(openSettingsLocationSteps("ios")).toBe("Tap to open Settings, then Location, and choose Always.");
  });

  it("names both when the phone is unknown", () => {
    expect(bgLocationSettingsPath("unknown")).toHaveLength(2);
    expect(bgLocationPushCopy("both").body).toContain("Allow all the time");
    expect(bgLocationPushCopy("both").body).toContain("Always");
  });

  it("has no em dashes", () => {
    for (const s of allCopy) expect(s).not.toMatch(/[—–]/);
  });
});
