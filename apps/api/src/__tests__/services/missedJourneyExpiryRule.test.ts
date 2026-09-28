/**
 * Offers stop being offered 14 days after the journey (28 Sep 2026: 49% of
 * the 4,916 open offers were already older than that), except a discarded
 * Start Trip, which keeps 30.
 */
import { describe, it, expect } from "vitest";
import {
  isOfferExpired,
  offerExpiresAt,
  offerMaxAgeDays,
  OFFER_MAX_AGE_DAYS,
} from "../../services/missedJourneyExpiryRule.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T12:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * DAY);

describe("offerMaxAgeDays", () => {
  it("is 14 days for every source but a discarded Start Trip", () => {
    for (const s of ["gap", "trip_start", "recorded", "dropped_walk", "dropped_phantom", "anything_new"]) {
      expect(offerMaxAgeDays(s)).toBe(OFFER_MAX_AGE_DAYS);
    }
    expect(OFFER_MAX_AGE_DAYS).toBe(14);
    expect(offerMaxAgeDays("dropped_start_trip")).toBe(30);
  });
});

describe("isOfferExpired", () => {
  it("keeps an offer up to and including its last moment", () => {
    expect(isOfferExpired({ source: "gap", arrivedAt: daysAgo(13.9) }, NOW)).toBe(false);
    expect(isOfferExpired({ source: "gap", arrivedAt: daysAgo(14) }, NOW)).toBe(false);
  });

  it("expires it once the journey is more than 14 days old", () => {
    expect(isOfferExpired({ source: "gap", arrivedAt: daysAgo(14.01) }, NOW)).toBe(true);
    expect(isOfferExpired({ source: "recorded", arrivedAt: daysAgo(20) }, NOW)).toBe(true);
  });

  it("measures from arrivedAt, the latest the drive could have been, not the start of a long gap", () => {
    // A 20-hour gap that opened 14.5 days ago but closed 13.7 days ago.
    const p = { source: "gap", departedAt: daysAgo(14.5), arrivedAt: daysAgo(13.7) };
    expect(isOfferExpired(p, NOW)).toBe(false);
  });

  it("gives a discarded Start Trip 30 days", () => {
    expect(isOfferExpired({ source: "dropped_start_trip", arrivedAt: daysAgo(20) }, NOW)).toBe(false);
    expect(isOfferExpired({ source: "dropped_start_trip", arrivedAt: daysAgo(31) }, NOW)).toBe(true);
  });

  it("never expires on an unreadable date", () => {
    expect(isOfferExpired({ source: "gap", arrivedAt: new Date("nonsense") }, NOW)).toBe(false);
    expect(isOfferExpired({ source: "gap", arrivedAt: daysAgo(40) }, Number.NaN)).toBe(false);
  });
});

describe("offerExpiresAt", () => {
  it("is the journey date plus the source's window", () => {
    const arrivedAt = new Date("2026-09-01T17:30:00Z");
    expect(offerExpiresAt({ source: "gap", arrivedAt }).toISOString()).toBe("2026-09-15T17:30:00.000Z");
    expect(offerExpiresAt({ source: "dropped_start_trip", arrivedAt }).toISOString()).toBe(
      "2026-10-01T17:30:00.000Z",
    );
  });
});
