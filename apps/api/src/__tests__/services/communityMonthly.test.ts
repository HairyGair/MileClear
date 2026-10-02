import { describe, it, expect } from "vitest";
import {
  PRIVACY_FLOOR,
  availableMonths,
  buildCommunityPosts,
  busiestDayLabel,
  formatClaimForPost,
  latestCompleteMonth,
  londonTaxYear,
  marginalClaimPence,
  monthBounds,
  monthLabel,
  priorKey,
  rollupCommunityMonth,
  taxYearStart,
  type CommunityRollupInput,
  type CommunityTrip,
} from "../../services/communityMonthly.js";
import { resolveCommunityMonth } from "../../routes/community/index.js";

const NOW = new Date("2026-10-02T09:00:00Z");

function trip(over: Partial<CommunityTrip> & { userId: string }): CommunityTrip {
  return {
    startedAt: new Date("2026-09-15T12:00:00Z"),
    distanceMiles: 10,
    classification: "personal",
    platformTag: null,
    isManualEntry: false,
    isPhantomTrip: false,
    possibleDuplicateOfId: null,
    vehicleType: "car",
    ...over,
  };
}

/** n drivers, one trip each, built from `over`. */
function drivers(n: number, over: Partial<CommunityTrip> = {}, prefix = "u"): CommunityTrip[] {
  return Array.from({ length: n }, (_, i) => trip({ userId: `${prefix}${i}`, ...over }));
}

function input(over: Partial<CommunityRollupInput>): CommunityRollupInput {
  return {
    month: "2026-09",
    trips: [],
    priorBusinessMiles: new Map(),
    newDrivers: 0,
    regionByUser: new Map(),
    now: NOW,
    ...over,
  };
}

describe("months (Europe/London)", () => {
  it("a BST month starts and ends at UK midnight, an hour before UTC midnight", () => {
    const { start, end } = monthBounds("2026-09");
    expect(start.toISOString()).toBe("2026-08-31T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T23:00:00.000Z");
  });

  it("a GMT month starts at UTC midnight", () => {
    const { start, end } = monthBounds("2026-01");
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("months that contain a clock change have one GMT and one BST edge", () => {
    // Clocks go forward 29 Mar 2026 and back 25 Oct 2026.
    expect(monthBounds("2026-03").start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(monthBounds("2026-03").end.toISOString()).toBe("2026-03-31T23:00:00.000Z");
    expect(monthBounds("2026-10").start.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(monthBounds("2026-10").end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("a trip at 00:30 BST on 1 October is October's, not September's", () => {
    const sept = drivers(PRIVACY_FLOOR);
    const late = trip({ userId: "late", startedAt: new Date("2026-09-30T23:30:00Z") });
    const early = trip({ userId: "early", startedAt: new Date("2026-08-31T23:30:00Z") }); // 00:30 BST 1 Sep
    const r = rollupCommunityMonth(input({ trips: [...sept, late, early] }));
    expect(r.trips).toBe(PRIVACY_FLOOR + 1);
    expect(r.activeDrivers).toBe(PRIVACY_FLOOR + 1);
  });

  it("the latest complete month follows the UK calendar", () => {
    expect(latestCompleteMonth(NOW)).toBe("2026-09");
    // 23:30 UTC on 31 Aug is 00:30 BST on 1 Sep: August is over.
    expect(latestCompleteMonth(new Date("2026-08-31T23:30:00Z"))).toBe("2026-08");
    // 23:30 UTC on 31 Oct is still 31 Oct in GMT: September is the latest.
    expect(latestCompleteMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-09");
    expect(latestCompleteMonth(new Date("2027-01-10T10:00:00Z"))).toBe("2026-12");
  });

  it("offers every month from March 2026 to the latest complete one, newest first", () => {
    const months = availableMonths(NOW);
    expect(months[0]).toBe("2026-09");
    expect(months[months.length - 1]).toBe("2026-03");
    expect(months).toHaveLength(7);
  });

  it("only offers complete months from March 2026", () => {
    expect(resolveCommunityMonth(undefined, NOW)).toBe("2026-09");
    expect(resolveCommunityMonth("2026-05", NOW)).toBe("2026-05");
    expect(resolveCommunityMonth("2026-10", NOW)).toBeNull();
    expect(resolveCommunityMonth("2026-02", NOW)).toBeNull();
  });

  it("labels months in words", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
  });

  it("puts 6 April in the new tax year on UK time", () => {
    expect(londonTaxYear(new Date("2026-04-05T22:59:00Z"))).toBe("2025-26"); // 23:59 BST 5 Apr
    expect(londonTaxYear(new Date("2026-04-05T23:30:00Z"))).toBe("2026-27"); // 00:30 BST 6 Apr
    expect(taxYearStart("2026-27").toISOString()).toBe("2026-04-05T23:00:00.000Z");
  });
});

describe("privacy floor", () => {
  it("publishes nothing below 10 active drivers", () => {
    const r = rollupCommunityMonth(input({ trips: drivers(PRIVACY_FLOOR - 1, { classification: "business" }), newDrivers: 50 }));
    expect(r.published).toBe(false);
    expect(r.activeDrivers).toBeNull();
    expect(r.trips).toBeNull();
    expect(r.totalMiles).toBeNull();
    expect(r.claimValuePence).toBeNull();
    expect(r.newDrivers).toBeNull();
    expect(r.busiestDay).toBeNull();
    expect(r.topRegions).toEqual([]);
    expect(r.topPlatform).toBeNull();
    expect(buildCommunityPosts(r)).toEqual([]);
  });

  it("many trips by few drivers still do not publish", () => {
    const trips = Array.from({ length: 200 }, (_, i) => trip({ userId: `u${i % 3}` }));
    expect(rollupCommunityMonth(input({ trips })).published).toBe(false);
  });

  it("publishes at exactly 10 drivers", () => {
    const r = rollupCommunityMonth(input({ trips: drivers(PRIVACY_FLOOR) }));
    expect(r.published).toBe(true);
    expect(r.activeDrivers).toBe(10);
    expect(r.trips).toBe(10);
    expect(r.totalMiles).toBe(100);
  });

  it("hides business miles and claim value when fewer than 10 drivers had business trips", () => {
    const trips = [...drivers(20), ...drivers(9, { classification: "business" }, "b")];
    const r = rollupCommunityMonth(input({ trips }));
    expect(r.published).toBe(true);
    expect(r.businessMiles).toBeNull();
    expect(r.claimValuePence).toBeNull();
  });

  it("hides new drivers below 10 sign-ups", () => {
    expect(rollupCommunityMonth(input({ trips: drivers(12), newDrivers: 9 })).newDrivers).toBeNull();
    expect(rollupCommunityMonth(input({ trips: drivers(12), newDrivers: 10 })).newDrivers).toBe(10);
  });

  it("lists only regions with 10 active drivers, at most five", () => {
    const trips = drivers(60);
    const regionByUser = new Map<string, string | null>();
    const plan: Array<[string, number]> = [
      ["North East", 15],
      ["London", 12],
      ["Scotland", 9],
      ["Wales", 10],
      ["South East", 10],
      ["South West", 4],
    ];
    let i = 0;
    for (const [region, n] of plan) for (let k = 0; k < n; k++) regionByUser.set(`u${i++}`, region);
    const r = rollupCommunityMonth(input({ trips, regionByUser }));
    expect(r.topRegions).toEqual([
      { region: "North East", drivers: 15 },
      { region: "London", drivers: 12 },
      { region: "South East", drivers: 10 },
      { region: "Wales", drivers: 10 },
    ]);
  });

  it("names the busiest day only when 10 drivers drove that day", () => {
    const spread = drivers(10, { startedAt: new Date("2026-09-11T12:00:00Z") });
    // 12 trips on the 12th by only 3 drivers: busiest by trips, but too few people.
    const few = Array.from({ length: 12 }, (_, i) => trip({ userId: `f${i % 3}`, startedAt: new Date("2026-09-12T12:00:00Z") }));
    expect(rollupCommunityMonth(input({ trips: [...spread, ...few] })).busiestDay).toBeNull();

    const r = rollupCommunityMonth(input({ trips: [...spread, ...drivers(1, { startedAt: new Date("2026-09-12T12:00:00Z") }, "x")] }));
    expect(r.busiestDay).toEqual({ date: "2026-09-11", weekday: "Friday", trips: 10, miles: 100 });
    expect(busiestDayLabel(r.busiestDay!)).toBe("Friday 11 September");
  });

  it("names the top platform only with 10 drivers, and never 'other'", () => {
    const trips = [
      ...drivers(12, { platformTag: "other" }, "o"),
      ...drivers(10, { platformTag: "deliveroo" }, "d"),
      ...drivers(9, { platformTag: "uber" }, "x"),
      // One driver tagging Uber many times does not make Uber the top platform.
      ...Array.from({ length: 30 }, () => trip({ userId: "x0", platformTag: "uber" })),
    ];
    const r = rollupCommunityMonth(input({ trips }));
    expect(r.topPlatform).toEqual({ platform: "deliveroo", label: "Deliveroo", drivers: 10, trips: 10 });
  });
});

describe("what counts", () => {
  it("excludes phantom trips and the newer half of a possible double-count", () => {
    const real = drivers(10);
    const phantom = drivers(5, { isPhantomTrip: true }, "p");
    const dupe = trip({ userId: "u0", possibleDuplicateOfId: "other-trip" });
    const r = rollupCommunityMonth(input({ trips: [...real, ...phantom, dupe] }));
    expect(r.activeDrivers).toBe(10);
    expect(r.trips).toBe(10);
    expect(r.totalMiles).toBe(100);
  });

  it("phantom-only drivers do not lift a month over the floor", () => {
    const r = rollupCommunityMonth(input({ trips: [...drivers(9), ...drivers(5, { isPhantomTrip: true }, "p")] }));
    expect(r.published).toBe(false);
  });

  it("works out the share recorded automatically", () => {
    const trips = [...drivers(3, { isManualEntry: true }, "m"), ...drivers(9)];
    expect(rollupCommunityMonth(input({ trips })).autoRecordedPct).toBe(75);
  });
});

describe("claim value", () => {
  it("prices business miles at the trip's tax-year rate", () => {
    // 2026-27: cars and vans 55p for the first 10,000.
    const r = rollupCommunityMonth(input({ trips: drivers(10, { classification: "business", distanceMiles: 100 }) }));
    expect(r.businessMiles).toBe(1000);
    expect(r.claimValuePence).toBe(10 * 100 * 55);
  });

  it("applies the 10,000-mile step using miles earlier in the tax year", () => {
    const trips = drivers(10, { classification: "business", distanceMiles: 100 });
    const prior = new Map([[priorKey("u0", "2026-27", "car"), 9950]]);
    const r = rollupCommunityMonth(input({ trips, priorBusinessMiles: prior }));
    // u0: 50 mi at 55p + 50 mi at 25p = 4,000p. The other nine: 100 x 55p.
    expect(r.claimValuePence).toBe(4000 + 9 * 5500);
  });

  it("counts prior miles per vehicle type, and motorbikes are a flat 24p", () => {
    const trips = [
      ...drivers(9, { classification: "business", distanceMiles: 100 }),
      trip({ userId: "bike", classification: "business", distanceMiles: 100, vehicleType: "motorbike" }),
    ];
    // Prior car miles do not move a motorbike's rate.
    const prior = new Map([[priorKey("bike", "2026-27", "car"), 20000]]);
    const r = rollupCommunityMonth(input({ trips, priorBusinessMiles: prior }));
    expect(r.claimValuePence).toBe(9 * 5500 + 2400);
  });

  it("prices a trip with no vehicle as a car, and personal miles at nothing", () => {
    const trips = [
      ...drivers(10, { classification: "business", distanceMiles: 10, vehicleType: null }),
      ...drivers(10, { classification: "personal", distanceMiles: 500 }, "p"),
    ];
    const r = rollupCommunityMonth(input({ trips }));
    expect(r.claimValuePence).toBe(10 * 10 * 55);
    expect(r.totalMiles).toBe(5100);
  });

  it("splits April across the two tax years (45p before 6 April, 55p from it)", () => {
    const before = drivers(5, { classification: "business", distanceMiles: 100, startedAt: new Date("2026-04-03T12:00:00Z") }, "a");
    const after = drivers(5, { classification: "business", distanceMiles: 100, startedAt: new Date("2026-04-20T12:00:00Z") }, "b");
    // a0 had already done 10,000 business car miles in 2025-26.
    const prior = new Map([[priorKey("a0", "2025-26", "car"), 10000]]);
    const r = rollupCommunityMonth(input({ month: "2026-04", trips: [...before, ...after], priorBusinessMiles: prior }));
    expect(r.claimValuePence).toBe(2500 + 4 * 4500 + 5 * 5500);
  });

  it("marginalClaimPence matches the deduction difference", () => {
    expect(marginalClaimPence("car", 0, 0, "2026-27")).toBe(0);
    expect(marginalClaimPence("van", 9000, 2000, "2026-27")).toBe(1000 * 55 + 1000 * 25);
    expect(marginalClaimPence("car", 12000, 100, "2025-26")).toBe(2500);
  });
});

describe("social posts", () => {
  function published() {
    const trips = [
      ...drivers(30, { classification: "business", distanceMiles: 40, platformTag: "uber" }),
      ...drivers(20, { classification: "personal", distanceMiles: 12, isManualEntry: true }, "p"),
    ];
    const regionByUser = new Map<string, string | null>();
    for (let i = 0; i < 30; i++) regionByUser.set(`u${i}`, i < 18 ? "North East" : "London");
    return rollupCommunityMonth(input({ trips, regionByUser, newDrivers: 14 }));
  }

  it("builds two or three plain variants from the numbers", () => {
    const posts = buildCommunityPosts(published());
    expect(posts.length).toBeGreaterThanOrEqual(2);
    expect(posts.length).toBeLessThanOrEqual(3);
    expect(posts[0].text).toContain("In September, 50 MileClear drivers logged 1,440 miles across 50 trips.");
    expect(posts[0].text).toContain("1,200 of those miles were for work, worth about £660 in mileage claims at the HMRC mileage rates.");
    expect(posts.map((p) => p.key)).toEqual(["full", "short", "community"]);
    expect(posts[2].text).toContain("North East and London");
    expect(posts[2].text).toContain("14 drivers who joined in September");
  });

  it("never uses em dashes or hashtags, and HMRC only as the rates' owner", () => {
    for (const p of buildCommunityPosts(published())) {
      expect(p.text).not.toMatch(/[—–]/);
      expect(p.text).not.toContain("#");
      expect(p.text).not.toMatch(/HMRC[- ]?(ready|compliant|approved|accepted|recogni[sz]ed)/i);
      const hmrc = p.text.match(/.{0,4}HMRC.{0,14}/g) ?? [];
      for (const m of hmrc) expect(m).toContain("the HMRC mileage rates");
    }
  });

  it("rounds the claim value because it is an estimate", () => {
    expect(formatClaimForPost(12_345_678)).toBe("£123,000");
    expect(formatClaimForPost(1_234_567)).toBe("£12,300");
    expect(formatClaimForPost(66_000)).toBe("£660");
  });
});
