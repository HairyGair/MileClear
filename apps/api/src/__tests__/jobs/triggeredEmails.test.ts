/**
 * Lifecycle and retention emails: who hears what. Pure functions, no mocks.
 */
import { describe, it, expect } from "vitest";

import {
  taxAudience,
  isAndroidUser,
  londonDayLabel,
  decideGoneQuiet,
  winBackGroup,
  winBackChanges,
  isHeldBack,
  appDeletedSince,
  winBackSinceLabel,
  type WinBackFacts,
  GONE_QUIET_MIN_SILENCE_MS,
  GONE_QUIET_MAX_SILENCE_MS,
  type GoneQuietFacts,
} from "../../jobs/triggeredEmails.js";

const NOW = new Date("2026-10-18T16:15:00Z"); // Sunday 17:15 BST
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe("taxAudience", () => {
  it("sends Self Assessment wording to gig drivers", () => {
    expect(taxAudience({ workType: "gig", dashboardMode: "work" })).toBe("self_employed");
  });

  it("never tells a both driver the whole claim goes on the return", () => {
    // Their claim blends gig trips with untagged trips at the employer's rate.
    expect(taxAudience({ workType: "both", dashboardMode: "both" })).toBe("mixed");
  });

  it("keeps employees off Self Assessment", () => {
    expect(taxAudience({ workType: "employee", dashboardMode: "work" })).toBe("employee");
  });

  it("gives Personal-mode and company-car drivers no tax emails", () => {
    expect(taxAudience({ workType: "gig", dashboardMode: "personal" })).toBeNull();
    expect(taxAudience({ workType: "company", dashboardMode: "work" })).toBeNull();
  });
});

describe("isAndroidUser", () => {
  it("is Android only when the phone is", () => {
    expect(isAndroidUser({ platformsSeen: "android", signupPlatform: null })).toBe(true);
    expect(isAndroidUser({ platformsSeen: "ios", signupPlatform: "android" })).toBe(false);
    expect(isAndroidUser({ platformsSeen: "android,web", signupPlatform: "web" })).toBe(true);
  });

  it("uses the sign-up platform when both phones were seen", () => {
    expect(isAndroidUser({ platformsSeen: "android,ios", signupPlatform: "android" })).toBe(true);
    expect(isAndroidUser({ platformsSeen: "android,ios", signupPlatform: "ios" })).toBe(false);
  });

  it("falls back to the sign-up platform with nothing seen", () => {
    expect(isAndroidUser({ platformsSeen: null, signupPlatform: "android" })).toBe(true);
    expect(isAndroidUser({ platformsSeen: null, signupPlatform: null })).toBe(false);
  });
});

describe("londonDayLabel", () => {
  it("names the London day, not the UTC one", () => {
    // 23:30 UTC on 5 Oct is 00:30 BST on 6 Oct.
    expect(londonDayLabel(new Date("2026-10-05T23:30:00Z"))).toBe("Tuesday 6 October");
  });
});

describe("decideGoneQuiet", () => {
  const facts = (over: Partial<GoneQuietFacts> = {}): GoneQuietFacts => ({
    now: NOW,
    createdAt: ago(40),
    lastTripAt: ago(12),
    totalTrips: 20,
    lastGoneQuietAt: null,
    lastCaptureLapsedAt: null,
    capturedLapsedWillCover: false,
    appDeleted: false,
    ...over,
  });

  it("sends after 10 to 21 days without a drive", () => {
    expect(decideGoneQuiet(facts())).toBe(true);
    expect(decideGoneQuiet(facts({ lastTripAt: new Date(NOW.getTime() - GONE_QUIET_MIN_SILENCE_MS) }))).toBe(true);
    expect(decideGoneQuiet(facts({ lastTripAt: new Date(NOW.getTime() - GONE_QUIET_MAX_SILENCE_MS) }))).toBe(true);
  });

  it("waits until 10 days and stops after 21", () => {
    expect(decideGoneQuiet(facts({ lastTripAt: ago(9) }))).toBe(false);
    expect(decideGoneQuiet(facts({ lastTripAt: ago(22) }))).toBe(false);
    expect(decideGoneQuiet(facts({ lastTripAt: null }))).toBe(false);
  });

  it("needs a real habit to have stopped: 3+ trips and an account at least two weeks old", () => {
    expect(decideGoneQuiet(facts({ totalTrips: 2 }))).toBe(false);
    expect(decideGoneQuiet(facts({ createdAt: ago(13), lastTripAt: ago(11) }))).toBe(false);
  });

  it("sends at most once every 90 days", () => {
    expect(decideGoneQuiet(facts({ lastGoneQuietAt: ago(30) }))).toBe(false);
    expect(decideGoneQuiet(facts({ lastGoneQuietAt: ago(91) }))).toBe(true);
  });

  it("leaves a driver who deleted the app to the win-back email", () => {
    expect(decideGoneQuiet(facts({ appDeleted: true }))).toBe(false);
  });

  it("stands aside when the capture-lapsed push will name the real cause", () => {
    expect(decideGoneQuiet(facts({ capturedLapsedWillCover: true }))).toBe(false);
  });

  it("stays quiet for two weeks after the capture-lapsed push", () => {
    expect(decideGoneQuiet(facts({ lastCaptureLapsedAt: ago(5) }))).toBe(false);
    expect(decideGoneQuiet(facts({ lastCaptureLapsedAt: ago(15) }))).toBe(true);
  });
});

describe("winBackGroup", () => {
  const facts = (over: Partial<WinBackFacts> = {}): WinBackFacts => ({
    now: NOW,
    createdAt: ago(90),
    lastTripAt: ago(40),
    totalTrips: 25,
    lastHeartbeatAt: ago(30),
    alreadySent: false,
    lastGoneQuietAt: null,
    lastCaptureLapsedAt: null,
    appDeletedAt: null,
    ...over,
  });

  it("treats a deleted app as stopped after 3 days, not 30", () => {
    expect(winBackGroup(facts({ lastTripAt: ago(5), lastHeartbeatAt: ago(5), appDeletedAt: ago(2) }))).toBe("stopped");
    expect(winBackGroup(facts({ lastTripAt: ago(2), lastHeartbeatAt: ago(2), appDeletedAt: ago(1) }))).toBeNull();
    expect(winBackGroup(facts({ lastTripAt: ago(5), appDeletedAt: ago(2), totalTrips: 2 }))).toBeNull();
  });

  it("picks out a driver who has clearly stopped", () => {
    expect(winBackGroup(facts())).toBe("stopped");
    expect(winBackGroup(facts({ lastHeartbeatAt: null }))).toBe("stopped");
  });

  it("leaves alone anyone still opening the app, or only recently quiet", () => {
    expect(winBackGroup(facts({ lastHeartbeatAt: ago(3) }))).toBeNull();
    expect(winBackGroup(facts({ lastTripAt: ago(25) }))).toBeNull();
    expect(winBackGroup(facts({ totalTrips: 2 }))).toBeNull();
  });

  it("picks out someone who never recorded, once the setup nudges have had their turn", () => {
    expect(winBackGroup(facts({ lastTripAt: null, totalTrips: 0, createdAt: ago(20) }))).toBe("never");
    expect(winBackGroup(facts({ lastTripAt: null, totalTrips: 0, createdAt: ago(10) }))).toBeNull();
  });

  it("skips anyone older than six months", () => {
    expect(winBackGroup(facts({ lastTripAt: null, totalTrips: 0, createdAt: ago(200) }))).toBeNull();
    expect(winBackGroup(facts({ lastTripAt: ago(200) }))).toBeNull();
  });

  it("sends once ever, and not on top of gone quiet or the capture-lapsed push", () => {
    expect(winBackGroup(facts({ alreadySent: true }))).toBeNull();
    expect(winBackGroup(facts({ lastGoneQuietAt: ago(20) }))).toBeNull();
    expect(winBackGroup(facts({ lastCaptureLapsedAt: ago(5) }))).toBeNull();
  });
});

describe("winBackChanges", () => {
  it("lists only what changed after the driver's last drive, four at most, best first", () => {
    const all = winBackChanges("stopped", new Date("2026-10-01T00:00:00Z"));
    expect(all).toHaveLength(4);
    expect(all[0]).toMatch(/saved twice/);
    expect(winBackChanges("stopped", new Date("2026-10-16T12:00:00Z"))).toEqual([
      "Add a whole past shift in one go, with its trips and earnings",
      "Each trip lists any roadworks on its route",
    ]);
    expect(winBackChanges("stopped", new Date("2026-10-18T00:00:00Z"))).toEqual([]);
  });

  it("gives never-recorded drivers the getting-started changes", () => {
    const never = winBackChanges("never", new Date("2026-08-01T00:00:00Z"));
    expect(never).toHaveLength(3);
    expect(never.join(" ")).not.toMatch(/saved twice/);
  });

  it("labels the date the way each email reads", () => {
    expect(winBackSinceLabel("stopped", new Date("2026-10-06T10:00:00Z"))).toBe("6 October");
    expect(winBackSinceLabel("never", new Date("2026-08-14T10:00:00Z"))).toBe("August");
  });
});

describe("isHeldBack", () => {
  it("always gives the same answer for the same driver and email", () => {
    expect(isHeldBack("user-1", "email.win_back_sent")).toBe(isHeldBack("user-1", "email.win_back_sent"));
  });

  it("holds back about one in ten", () => {
    let held = 0;
    for (let i = 0; i < 10_000; i++) if (isHeldBack(`user-${i}`, "email.gone_quiet_sent")) held++;
    expect(held).toBeGreaterThan(900);
    expect(held).toBeLessThan(1100);
  });

  it("draws a separate one in ten for each email", () => {
    let both = 0;
    for (let i = 0; i < 10_000; i++) {
      if (isHeldBack(`user-${i}`, "email.week_one_sent") && isHeldBack(`user-${i}`, "email.win_back_sent")) both++;
    }
    expect(both).toBeLessThan(200); // ~100 if independent, 1,000 if the same people
  });
});

describe("appDeletedSince", () => {
  it("counts a removal only until the phone checks in again", () => {
    expect(appDeletedSince(ago(3), ago(10))).toEqual(ago(3));
    expect(appDeletedSince(ago(3), null)).toEqual(ago(3));
    expect(appDeletedSince(ago(3), ago(1))).toBeNull(); // reinstalled
    expect(appDeletedSince(null, ago(1))).toBeNull();
  });
});
