import { test, expect } from "@playwright/test";
import { mockSession, profile } from "./fixtures/api";
import { mockApi } from "./fixtures/insightsMoney";

const empty = { data: [] };
const proBase = {
  "GET /gamification/stats": { data: { taxYear: "2026-27", totalMiles: 0, businessMiles: 0, deductionPence: 0, currentStreakDays: 0, longestStreakDays: 0, totalTrips: 0, totalShifts: 0, todayMiles: 0, todayTrips: 0, weekMiles: 0, personalRecords: { mostMilesInDay: 0, mostMilesInDayDate: null, mostTripsInShift: 0, mostTripsInShiftDate: null, longestSingleTrip: 0, longestSingleTripDate: null, longestStreakDays: 0 }, drivingPatterns: { dayOfWeek: [0, 0, 0, 0, 0, 0, 0], timeOfDay: [0, 0, 0, 0, 0, 0], avgTripsPerWeek: 0, topPlaces: [] } } },
  "GET /gamification/achievements": empty,
  "GET /user/calendar": empty,
  "GET /fuel/logs": empty,
  "GET /business-insights/heatmap": { data: { weeksAnalyzed: 0, filteredPlatform: null, availablePlatforms: [], totalTrips: 0, totalEarningsPence: 0, cells: [] } },
  "GET /business-insights/platform-pnl": empty,
  "GET /business-insights/project-pnl": empty,
};

const insights = (over: Record<string, unknown> = {}) => ({
  totalEarningsPence: 1000, totalBusinessMiles: 520, totalShiftHours: 0, earningsPerMilePence: 2, earningsPerHourPence: 0, avgTripsPerShift: 0, deductionPence: 0,
  platformPerformance: [{ platform: "untagged", totalEarningsPence: 1000, tripCount: 1, totalMiles: 5, earningsPerMilePence: 200, earningsPerTripPence: 1000, avgTripMiles: 5 }],
  bestPlatform: "untagged",
  goldenHours: [
    { dayOfWeek: "Sunday", hour: 1, label: "Sunday 1–2 AM", avgEarningsPence: 9000, tripCount: 1 },
    { dayOfWeek: "Friday", hour: 18, label: "Friday 6–7 PM", avgEarningsPence: 2400, tripCount: 1 },
  ],
  busiestDay: null, avgShiftGrade: null, fuelCostPerMilePence: 23, actualMpg: null, estimatedFuelCostPence: null, recentShifts: [], earningsTrendPercent: 0, mileTrendPercent: 0,
  ...over,
});

test.describe("Insights formatting, QA round 2", () => {
  test("no hours means no £0.00 per hour; untagged is labelled; negatives read -£; fuel is estimated; date-only times and 1 trip", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, {
      ...proBase,
      "GET /business-insights": { data: insights() },
      "GET /business-insights/pnl": { data: { periodLabel: "28 Sep to 4 Oct", grossEarningsPence: 1000, estimatedFuelCostPence: 0, estimatedWearCostPence: 154, netProfitPence: -1454, hmrcDeductionPence: 0, businessMiles: 100, totalTrips: 1 } },
      "GET /business-insights/benchmarks": { data: { windowDays: 30, totalActiveDrivers: 1, national: { weeklyMiles: { available: false, contributors: 0, yourValue: null, median: 0, p25: 0, p75: 0, yourPercentile: null, unit: "miles" }, weeklyTrips: { available: false, contributors: 0, yourValue: null, median: 0, p25: 0, p75: 0, yourPercentile: null, unit: "trips" } }, platforms: [], limitedDataNote: null } },
      "GET /business-insights/benchmarks/local": { data: { available: false } },
      "GET /community/monthly": { data: { published: false } },
    });
    await page.goto("/dashboard/insights");
    const body = page.locator("main");
    await expect(page.getByRole("heading", { name: "Weekly profit and loss" })).toBeVisible();
    const text = await body.innerText();
    expect(text).not.toContain("£0.00");
    expect(text).not.toContain("£-");
    expect(text).not.toMatch(/untagged/);
    expect(text).toContain("No platform");
    expect(text).toContain("Not enough yet");
    expect(text).toContain("-£14.54");
    // 23p a mile over 100 miles
    expect(text).toContain("Fuel (estimate)");
    expect(text).toContain("-£23.00");
    // The 1am slot is a date-only earning, so only the real time is listed.
    expect(text).not.toContain("1–2 AM");
    expect(text).toContain("Friday 6–7 PM");
    expect(text).toContain("1 earning");
    expect(text).not.toContain("1 trips");
  });

  test("the two weekly mileage figures say what they measure", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, {
      ...proBase,
      "GET /business-insights": { data: insights({ totalEarningsPence: 0 }) },
      "GET /business-insights/benchmarks": { data: { windowDays: 30, totalActiveDrivers: 300, national: { weeklyMiles: { available: true, contributors: 200, yourValue: 72.7, median: 90, p25: 50, p75: 130, yourPercentile: 40, unit: "miles" }, weeklyTrips: { available: false, contributors: 0, yourValue: null, median: 0, p25: 0, p75: 0, yourPercentile: null, unit: "trips" } }, platforms: [], limitedDataNote: null } },
      "GET /business-insights/benchmarks/local": { data: { available: true, reason: null, level: "area", area: "NE", region: null, scopeLabel: "NE", peerCount: 12, mode: "work", window: { start: "", end: "", weeks: 4 }, youWeeksActive: 4, weeklyMiles: { you: 35, median: 40, low: 20, high: 60, youAheadOfPerTen: 4 }, weeklyClaimPence: null, weeklyTrips: null, classifiedPct: null, generatedAt: "" } },
      "GET /community/monthly": { data: { published: false } },
    });
    await page.goto("/dashboard/insights");
    await expect(page.getByText("Your average week, last 30 days")).toBeVisible();
    await expect(page.getByText("Your typical week, last 4 full weeks")).toBeVisible();
    await expect(page.getByText("Business miles", { exact: true })).toBeVisible();
  });

  test("the recap share text says 'to claim', not 'tax deduction'", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, {
      ...proBase,
      "GET /gamification/recap": { data: { period: "weekly", label: "This week", totalMiles: 181.7, businessMiles: 181.7, deductionPence: 7268, totalTrips: 1, busiestDayLabel: null, busiestDayMiles: 0, longestTripMiles: 8, longestTripDate: null, shareText: "My Weekly MileClear Recap\n\n💰 £72.68 tax deduction\n\nTrack your miles with MileClear" } },
    });
    await page.goto("/dashboard/insights");
    await page.getByRole("button", { name: "This week" }).click();
    const pre = page.locator("pre");
    await expect(pre).toContainText("£72.68 to claim");
    await expect(pre).not.toContainText("tax deduction");
  });
});

test.describe("Plan page and fuel prices, QA round 2", () => {
  test("Pro shows the date it runs to", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, {
      "GET /billing/status": { data: { isPremium: true, premiumExpiresAt: "2027-09-29T00:00:00.000Z", subscriptionStatus: "none", cancelAtPeriodEnd: false, currentPeriodEnd: null, subscriptionPlatform: "none", premiumSource: "none" } },
    });
    await page.goto("/dashboard/settings/plan");
    await expect(page.getByText(/You're on Pro until (Wed )?29 Sep 2027\./)).toBeVisible();
  });

  test("fuel prices: names title-cased without a repeated brand, duplicates merged, fuel type in the header", async ({ page }) => {
    await mockSession(page);
    const st = (siteId: string, over: Record<string, unknown>) => ({ siteId, brand: "ESSO", stationName: "ESSO DURHAM ROAD", address: "", postcode: "NE1 1AA", latitude: 0, longitude: 0, distanceMiles: 1.2, prices: { E10: 139.9, B7: 147.9 }, ...over });
    await mockApi(page, {
      "GET /fuel/logs": { data: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
      "GET /fuel/cheapest-today": { data: null },
      "GET /geocode/search": { data: [{ lat: 54.9, lng: -1.6 }] },
      "GET /fuel/prices": { stations: [st("a", {}), st("b", { distanceMiles: 1.5 }), st("c", { brand: "TESCO", stationName: "GATESHEAD", postcode: "NE8 2BB", prices: { E10: 138.9 } })], nationalAverage: null },
    });
    await page.goto("/dashboard/fuel");
    await page.getByLabel("Postcode").fill("NE1 4ST");
    await page.getByRole("button", { name: "Show prices" }).click();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    const text = await page.locator("main").innerText();
    expect(text).toContain("Esso Durham Road");
    expect(text).toContain("Tesco Gateshead");
    expect(text).not.toContain("ESSO DURHAM ROAD");
    expect(text).not.toMatch(/Petrol 1\d\d/);
    expect(text).not.toContain("Diesel no price");
    await expect(page.getByRole("columnheader", { name: /Petrol/ })).toBeVisible();
  });
});
