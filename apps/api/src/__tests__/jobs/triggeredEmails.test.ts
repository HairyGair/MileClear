/**
 * Lifecycle and retention emails: who hears what. Pure functions, no mocks.
 */
import { describe, it, expect } from "vitest";

import {
  taxAudience,
  isAndroidUser,
  londonDayLabel,
  decideGoneQuiet,
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

  it("stands aside when the capture-lapsed push will name the real cause", () => {
    expect(decideGoneQuiet(facts({ capturedLapsedWillCover: true }))).toBe(false);
  });

  it("stays quiet for two weeks after the capture-lapsed push", () => {
    expect(decideGoneQuiet(facts({ lastCaptureLapsedAt: ago(5) }))).toBe(false);
    expect(decideGoneQuiet(facts({ lastCaptureLapsedAt: ago(15) }))).toBe(true);
  });
});
