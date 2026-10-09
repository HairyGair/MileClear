import { describe, it, expect } from "vitest";
import {
  allocateEarningsToHours,
  goldenHoursFromSlots,
  odometerMpg,
  percentChange,
  rankPlatforms,
  runningCostPerMile,
  summarisePeriod,
  type PeriodTrip,
} from "../../lib/insightsMath.js";
import { periodClaimPence } from "../../lib/mileageRates.js";
import { buildPlatformLeague } from "../../services/profitabilityRollups.js";
import { computeStreak } from "../../services/gamification.js";

// The demo account (demo@mileclear.com): works for an employer at 40p/25p
// and also drives for the gig apps.
const demoUser = { workType: "both", employerMileageRatePence: 40, employerMileageRatePenceAfter10k: 25 };
const gigOnly = { workType: "self_employed", employerMileageRatePence: null, employerMileageRatePenceAfter10k: null };

function trip(miles: number, startedAt: string, extra: Partial<PeriodTrip> = {}): PeriodTrip {
  return {
    distanceMiles: miles,
    classification: "business",
    platformTag: null,
    startedAt: new Date(startedAt),
    vehicle: { vehicleType: "car", providedByOthers: false },
    ...extra,
  };
}

describe("item 1: one weekly mileage claim", () => {
  // Week of 5 to 11 Oct 2026 on the demo: 181.7 business miles, all work
  // trips with no platform. Trends said £72.68, Weekly P&L said £99.94.
  const week = [trip(80, "2026-10-05T08:00:00Z"), trip(60, "2026-10-06T08:00:00Z"), trip(41.7, "2026-10-07T08:00:00Z")];

  it("values untagged work trips at the employer's rate (the £72.68 figure)", () => {
    const totals = summarisePeriod({ trips: week, earlierThisTaxYear: [], earnings: [], user: demoUser, fallbackType: "car" });
    expect(totals.claimPence).toBe(7268);
    expect(totals.businessMiles).toBe(181.7);
  });

  it("values gig trips at the approved rate, whatever the employer pays", () => {
    const totals = summarisePeriod({
      trips: [trip(10, "2026-10-05T08:00:00Z", { platformTag: "uber" }), trip(10, "2026-10-05T09:00:00Z")],
      earlierThisTaxYear: [],
      earnings: [],
      user: demoUser,
      fallbackType: "car",
    });
    expect(totals.claimPence).toBe(550 + 400);
  });

  it("counts a week past the 10,000 mile line at 25p, not from zero", () => {
    const before = [{ distanceMiles: 9950, vehicleType: "car" as const, platformTag: "uber", startedAt: new Date("2026-06-01T08:00:00Z") }];
    const during = [{ distanceMiles: 100, vehicleType: "car" as const, platformTag: "uber", startedAt: new Date("2026-10-05T08:00:00Z") }];
    expect(periodClaimPence(before, during, gigOnly)).toBe(50 * 55 + 50 * 25);
  });

  it("ignores trips from last tax year when placing the threshold", () => {
    const before = [{ distanceMiles: 9950, vehicleType: "car" as const, platformTag: "uber", startedAt: new Date("2026-03-01T08:00:00Z") }];
    const during = [{ distanceMiles: 100, vehicleType: "car" as const, platformTag: "uber", startedAt: new Date("2026-04-07T08:00:00Z") }];
    expect(periodClaimPence(before, during, gigOnly)).toBe(100 * 55);
  });

  it("leaves out phantom trips, personal trips and vehicles someone else pays for", () => {
    const totals = summarisePeriod({
      trips: [
        trip(10, "2026-10-05T08:00:00Z", { platformTag: "uber" }),
        trip(50, "2026-10-05T09:00:00Z", { isPhantomTrip: true }),
        trip(5, "2026-10-05T10:00:00Z", { classification: "personal" }),
        trip(20, "2026-10-05T11:00:00Z", { vehicle: { vehicleType: "van", providedByOthers: true } }),
      ],
      earlierThisTaxYear: [],
      earnings: [{ amountPence: 1000 }],
      user: gigOnly,
      fallbackType: "car",
    });
    expect(totals.claimPence).toBe(550);
    expect(totals.totalMiles).toBe(35);
    expect(totals.totalTrips).toBe(3);
    expect(totals.businessMiles).toBe(30);
    expect(totals.earningsPence).toBe(1000);
  });
});

describe("item 3: vs last week", () => {
  it("is null with nothing to compare", () => {
    expect(percentChange(10, 0)).toBeNull();
  });
  it("rounds to a whole percent", () => {
    expect(percentChange(181.7, 51.8)).toBe(251);
  });
});

describe("item 4: running cost per mile", () => {
  it("uses fill-up spend over miles driven when both exist (demo: 23p)", () => {
    const r = runningCostPerMile({ fuelSpendPence: 7355, litres: 54.5, milesDriven: 320, odometerMpg: 45.3, vehicleMpg: 60, fuelType: "hybrid" });
    expect(r.source).toBe("fill_ups");
    expect(r.pencePerMile).toBe(23);
    expect(r.mpgSource).toBe("odometer");
  });
  it("estimates from MPG and price per litre below 100 miles", () => {
    const r = runningCostPerMile({ fuelSpendPence: 4000, litres: 28.4, milesDriven: 20, odometerMpg: null, vehicleMpg: 50, fuelType: "petrol" });
    expect(r.source).toBe("estimate");
    // 140.8p/l x 4.54609 l/gal / 50 mpg
    expect(r.pencePerMile).toBe(12.8);
  });
  it("estimates with no fill-ups at a typical pump price", () => {
    const r = runningCostPerMile({ fuelSpendPence: 0, litres: 0, milesDriven: 500, odometerMpg: null, vehicleMpg: null, fuelType: "diesel" });
    expect(r).toMatchObject({ source: "estimate", mpg: 35, mpgSource: "typical", pencePerLitre: 145 });
  });
  it("has no fuel rate for an electric vehicle", () => {
    expect(runningCostPerMile({ fuelSpendPence: 0, litres: 0, milesDriven: 500, odometerMpg: null, vehicleMpg: null, fuelType: "electric" }).pencePerMile).toBeNull();
  });
  it("reads MPG from odometer readings (demo: 45.3)", () => {
    expect(odometerMpg([{ odometerReading: 41250, litres: 28.4 }, { odometerReading: 41510, litres: 26.1 }])).toBe(45.3);
    expect(odometerMpg([{ odometerReading: 41250, litres: 28.4 }])).toBeNull();
  });
});

describe("item 5: one platform league, by pay per mile", () => {
  const t = (platformTag: string, miles: number, start: string, mins = 20) => ({
    platformTag,
    distanceMiles: miles,
    startedAt: new Date(start),
    endedAt: new Date(new Date(start).getTime() + mins * 60_000),
  });
  // Demo, last 30 days: Uber £142.50 over 23 mi, Deliveroo £88.20 over 12.9 mi.
  const earnings = [
    { platform: "uber", amountPence: 14250 },
    { platform: "deliveroo", amountPence: 8820 },
  ];
  const trips = [
    t("uber", 10, "2026-10-01T18:00:00Z"),
    t("uber", 8, "2026-10-02T18:00:00Z"),
    t("uber", 5, "2026-10-03T18:00:00Z"),
    t("deliveroo", 5, "2026-10-01T12:00:00Z"),
    t("deliveroo", 4.9, "2026-10-02T12:00:00Z"),
    t("deliveroo", 3, "2026-10-03T12:00:00Z"),
  ];

  it("ranks Deliveroo above Uber: £6.84/mi beats £6.20/mi, though Uber nets more", () => {
    const league = rankPlatforms(earnings, trips);
    expect(league.map((r) => r.platform)).toEqual(["deliveroo", "uber"]);
    expect(league[0].earningsPerMilePence).toBe(684);
    expect(league[1].earningsPerMilePence).toBe(620);
    expect(league[0].trips).toBe(3);
    expect(league[0].drivingHours).toBe(1);
    expect(league[0].fewTrips).toBe(true);
  });

  it("platform-pnl uses the same order, with ranks, net and pay per mile", () => {
    const rows = buildPlatformLeague(earnings, trips, [{ costPence: 1000 }], []);
    expect(rows.map((r) => [r.rank, r.platform])).toEqual([[1, "deliveroo"], [2, "uber"]]);
    expect(rows[1].netPence).toBe(14250 - Math.round(1000 * (14250 / 23070)));
    expect(rows[0].earningsPerMilePence).toBe(684);
  });

  it("puts platforms with 5+ trips first, then few-trip ones, then ones with no miles", () => {
    const many = Array.from({ length: 5 }, (_, i) => t("stuart", 2, `2026-10-0${i + 1}T09:00:00Z`));
    const league = rankPlatforms(
      [...earnings, { platform: "stuart", amountPence: 5000 }, { platform: "freelance", amountPence: 99999 }],
      [...trips, ...many],
    );
    expect(league.map((r) => r.platform)).toEqual(["stuart", "deliveroo", "uber", "freelance"]);
    expect(league[3].earningsPerMilePence).toBeNull();
  });

  it("matches platform names whatever their case", () => {
    const league = rankPlatforms([{ platform: "Uber", amountPence: 1000 }], [t("uber", 10, "2026-10-01T18:00:00Z")]);
    expect(league).toHaveLength(1);
    expect(league[0].earningsPerMilePence).toBe(100);
  });
});

describe("item 6: earnings with only a date are never placed at midnight", () => {
  // Prisma returns a DATE column as UTC midnight.
  const day = (d: string) => new Date(`${d}T00:00:00Z`);

  it("spreads a one-day earning over that day's trips, in UK hours", () => {
    const { slots, unplacedPence } = allocateEarningsToHours({
      earnings: [{ periodStart: day("2026-10-04"), periodEnd: day("2026-10-04"), amountPence: 13125, platform: "uber" }],
      shifts: [],
      // Sunday 4 Oct, 18:00 to 19:00 BST
      businessTrips: [{ start: new Date("2026-10-04T17:00:00Z"), end: new Date("2026-10-04T18:00:00Z"), platformTag: "uber" }],
    });
    expect(unplacedPence).toBe(0);
    expect(slots).toEqual([{ dow: 0, hour: 18, totalPence: 13125, days: 1 }]);
    const golden = goldenHoursFromSlots(slots);
    expect(golden[0].label).toBe("Sunday 6 PM to 7 PM");
    expect(golden.some((g) => g.hour === 0 || g.hour === 1)).toBe(false);
  });

  it("splits by minutes worked across hours, preferring shifts", () => {
    const { slots } = allocateEarningsToHours({
      earnings: [{ periodStart: day("2026-01-10"), periodEnd: day("2026-01-10"), amountPence: 9000, platform: "deliveroo" }],
      // Saturday 10 Jan (GMT), 17:30 to 19:00
      shifts: [{ start: new Date("2026-01-10T17:30:00Z"), end: new Date("2026-01-10T19:00:00Z") }],
      businessTrips: [{ start: new Date("2026-01-10T09:00:00Z"), end: new Date("2026-01-10T09:30:00Z"), platformTag: "deliveroo" }],
    });
    const byHour = Object.fromEntries(slots.map((s) => [s.hour, s.totalPence]));
    expect(byHour).toEqual({ 17: 3000, 18: 6000 });
  });

  it("leaves out earnings covering several days, and days with no recorded work", () => {
    const { slots, unplacedPence, placedPence } = allocateEarningsToHours({
      earnings: [
        { periodStart: day("2026-10-05"), periodEnd: day("2026-10-11"), amountPence: 50000, platform: "uber" },
        { periodStart: day("2026-10-03"), periodEnd: day("2026-10-03"), amountPence: 6000, platform: "uber" },
      ],
      shifts: [],
      businessTrips: [],
    });
    expect(slots).toEqual([]);
    expect(placedPence).toBe(0);
    expect(unplacedPence).toBe(56000);
  });

  it("averages a slot over the days it was worked", () => {
    const { slots } = allocateEarningsToHours({
      earnings: [
        { periodStart: day("2026-10-04"), periodEnd: day("2026-10-04"), amountPence: 1000, platform: "uber" },
        { periodStart: day("2026-10-11"), periodEnd: day("2026-10-11"), amountPence: 3000, platform: "uber" },
      ],
      shifts: [],
      businessTrips: [
        { start: new Date("2026-10-04T17:00:00Z"), end: new Date("2026-10-04T17:30:00Z") },
        { start: new Date("2026-10-11T17:00:00Z"), end: new Date("2026-10-11T17:30:00Z") },
      ],
    });
    const [g] = goldenHoursFromSlots(slots);
    expect(g).toMatchObject({ dayOfWeek: "Sunday", hour: 18, avgEarningsPence: 2000, tripCount: 2 });
  });
});

describe("current streak uses the UK date", () => {
  it("00:30 BST on 9 Oct counts 9 Oct as today", () => {
    const now = new Date("2026-10-08T23:30:00Z");
    expect(computeStreak(["2026-10-09", "2026-10-08"], now)).toEqual({ current: 2, longest: 2 });
  });
  it("a streak that ended two days ago is not current", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(computeStreak(["2026-10-07", "2026-10-06"], now).current).toBe(0);
  });
});
