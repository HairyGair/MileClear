import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { mockApi } from "./fixtures/insightsMoney";

const stats = {
  taxYear: "2026-27", totalMiles: 740, businessMiles: 520, deductionPence: 28000, currentStreakDays: 3, longestStreakDays: 9,
  totalTrips: 61, totalShifts: 12, todayMiles: 14.2, todayTrips: 3, weekMiles: 88.4,
  personalRecords: { mostMilesInDay: 112, mostMilesInDayDate: "2026-09-12", mostTripsInShift: 9, mostTripsInShiftDate: null, longestSingleTrip: 48, longestSingleTripDate: "2026-08-01", longestStreakDays: 9 },
  drivingPatterns: { dayOfWeek: [4, 6, 5, 3, 9, 12, 2], timeOfDay: [0, 2, 8, 6, 9, 1], avgTripsPerWeek: 11, topPlaces: [] },
};

const insights = {
  totalEarningsPence: 245000, totalBusinessMiles: 520, totalShiftHours: 90, earningsPerMilePence: 471, earningsPerHourPence: 2722, avgTripsPerShift: 5, deductionPence: 28000,
  platformPerformance: [
    { platform: "uber", totalEarningsPence: 150000, tripCount: 40, totalMiles: 300, earningsPerMilePence: 500, earningsPerTripPence: 3750, avgTripMiles: 7 },
    { platform: "deliveroo", totalEarningsPence: 95000, tripCount: 30, totalMiles: 220, earningsPerMilePence: 431, earningsPerTripPence: 3166, avgTripMiles: 7 },
  ],
  bestPlatform: "uber",
  goldenHours: [{ dayOfWeek: "Friday", hour: 18, label: "Friday 6-7 PM", avgEarningsPence: 2400, tripCount: 14 }],
  busiestDay: "Friday", avgShiftGrade: "B", fuelCostPerMilePence: 14.2, actualMpg: 42.1, estimatedFuelCostPence: 9000, recentShifts: [], earningsTrendPercent: 4, mileTrendPercent: 2,
};

const common = {
  "GET /gamification/stats": { data: stats },
  "GET /gamification/achievements": { data: [{ id: "a1", type: "first_trip", achievedAt: "2026-09-01T10:00:00Z", label: "First trip", description: "d", emoji: "X" }] },
  "GET /user/weekly-progress": { data: { goalPence: 50000, currentWeekEarningsPence: 21000, progressPercent: 42, weekStart: "2026-10-05" } },
  "GET /user/calendar": { data: [{ date: "2026-10-02", earningsPence: 3000, miles: 40, businessMiles: 40, tripCount: 4, shiftMinutes: 200 }] },
  "GET /community/monthly": { data: { month: "2026-09", label: "September 2026", published: true, privacyFloor: 5, activeDrivers: 812, trips: 21000, totalMiles: 250000, businessMiles: 1, claimValuePence: 1, newDrivers: 40, busiestDay: { date: "2026-09-12", weekday: "Saturday", trips: 900, miles: 9000 }, topRegions: [], autoRecordedPct: 90, topPlatform: null, months: ["2026-09"], generatedAt: "2026-10-01" } },
  "GET /business-insights/benchmarks": { data: { windowDays: 30, totalActiveDrivers: 300, national: { weeklyMiles: { available: true, contributors: 200, yourValue: 120, median: 90, p25: 50, p75: 130, yourPercentile: 71, unit: "miles" }, weeklyTrips: { available: false, contributors: 0, yourValue: null, median: 0, p25: 0, p75: 0, yourPercentile: null, unit: "trips" } }, platforms: [], limitedDataNote: null } },
  "GET /business-insights/benchmarks/local": { data: { available: false, reason: "not_enough_drivers", level: null, area: null, region: null, scopeLabel: null, peerCount: null, mode: "work", window: { start: "", end: "", weeks: 4 }, youWeeksActive: 0, weeklyMiles: null, weeklyClaimPence: null, weeklyTrips: null, classifiedPct: null, generatedAt: "" } },
  "GET /business-insights/heatmap": { data: { weeksAnalyzed: 12, filteredPlatform: null, availablePlatforms: [], totalTrips: 30, totalEarningsPence: 1, cells: [{ dayOfWeek: 5, hour: 18, tripCount: 9, totalMiles: 40, totalEarningsPence: 4000 }, { dayOfWeek: 6, hour: 12, tripCount: 3, totalMiles: 10, totalEarningsPence: 900 }] } },
  "GET /gamification/recap": ({ url }: { url: URL }) => ({ data: { period: url.searchParams.get("period"), label: "Today", totalMiles: 14.2, businessMiles: 10, deductionPence: 470, totalTrips: 3, busiestDayLabel: null, busiestDayMiles: 0, longestTripMiles: 8, longestTripDate: null, shareText: "My Daily MileClear Recap\nToday\n\n14.2 mi total\n\nTrack your miles with MileClear" } }),
  "GET /fuel/logs": { data: [] },
};

for (const bad of []) void bad;

test.describe("Insights, free account", () => {
  test("Overview shows recaps and the Pro gate; Trends is gated with the right reason", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, common);
    await page.goto("/dashboard/insights");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Insights");
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("button", { name: "This week" })).toBeVisible();
    await expect(page.getByRole("button", { name: "This month" })).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(0);
    const gate = page.getByRole("link", { name: "Upgrade to Pro" }).first();
    await expect(gate).toHaveAttribute("href", "/dashboard/settings/plan?reason=insights");

    await page.getByRole("radio", { name: "Trends" }).click();
    await expect(page).toHaveURL(/view=trends/);
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/dashboard/settings/plan?reason=trends");
    const text = await page.locator("body").innerText();
    for (const b of BANNED_COPY) expect(text).not.toMatch(b);
  });

  test("the recap dialog loads the recap and links the share text to mileclear.com/app", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, common);
    await page.goto("/dashboard/insights");
    await page.getByRole("button", { name: "Today" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("14.2", { exact: false }).first()).toBeVisible();
    const share = dialog.locator("pre");
    await expect(share).toContainText("https://mileclear.com/app");
    await expect(share).not.toContainText("apps.apple.com");
    await expect(share).not.toContainText("—");
  });

  test("free drivers never call Pro endpoints", async ({ page }) => {
    await mockSession(page);
    const calls = await mockApi(page, common);
    await page.goto("/dashboard/insights");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Insights");
    await page.waitForTimeout(500);
    for (const p of ["/business-insights", "/business-insights/platform-pnl", "/business-insights/pnl", "/analytics/weekly-report", "/community-insights"]) {
      expect(calls.find("GET", p), p).toHaveLength(0);
    }
  });
});

test.describe("Insights, Pro account", () => {
  test("Work overview: business insights, platform comparison, profit lists and charts with data", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, {
      ...common,
      "GET /business-insights": { data: insights },
      "GET /business-insights/platform-pnl": { data: [{ platform: "uber", grossEarningsPence: 90000, expensesPence: 0, fuelPence: 9000, netPence: 81000, trips: 20, businessMiles: 150 }] },
      "GET /business-insights/pnl": { data: { periodLabel: "28 Sep to 4 Oct", grossEarningsPence: 50000, estimatedFuelCostPence: 5000, estimatedWearCostPence: 3000, netProfitPence: 42000, hmrcDeductionPence: 9000, businessMiles: 120, totalTrips: 30 } },
      "GET /business-insights/project-pnl": { data: [] },
    });
    await page.goto("/dashboard/insights");
    await expect(page.getByRole("heading", { name: "Business insights" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profit by platform, last 30 days" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weekly profit and loss" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profit by project" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Fuel economy" })).toBeVisible();
    await expect(page.getByTestId("heatmap")).toBeVisible();
    await expect(page.getByText("Your busiest time is Friday at 18:00", { exact: false })).toBeVisible();
    await expect(page.getByText("PRO", { exact: true })).toHaveCount(0);
    // Local benchmark has no area, so the card is not there at all.
    await expect(page.getByRole("heading", { name: "Drivers near you" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "How you compare" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Achievements" })).toBeVisible();
    await expect(page.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/dashboard/achievements");
  });

  test("Pro with no earnings gets the one empty state", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, {
      ...common,
      "GET /business-insights/heatmap": { data: { weeksAnalyzed: 12, filteredPlatform: null, availablePlatforms: [], totalTrips: 0, totalEarningsPence: 0, cells: [] } },
      "GET /business-insights": { data: { ...insights, totalEarningsPence: 0 } },
      "GET /business-insights/platform-pnl": { data: [] },
      "GET /business-insights/pnl": { data: {} },
      "GET /business-insights/project-pnl": { data: [] },
    });
    await page.goto("/dashboard/insights");
    await expect(page.getByRole("heading", { name: "Add your earnings to see this" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add earnings" })).toHaveAttribute("href", "/dashboard/earnings");
    // No heatmap when there is nothing to draw.
    await expect(page.getByTestId("heatmap")).toHaveCount(0);
  });

  test("Personal overview: weekly activity chart, milestone and fuel summary", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true, dashboardMode: "personal", workType: "employee" }) });
    await mockApi(page, {
      ...common,
      "GET /fuel/logs": { data: [{ id: "f1", litres: 40, costPence: 6200, stationName: "Shell", loggedAt: new Date().toISOString(), vehicle: { id: "v1", make: "Ford", model: "Focus", fuelType: "petrol" } }, { id: "f2", litres: 30, costPence: 900, stationName: null, loggedAt: new Date().toISOString(), vehicle: { id: "v2", make: "Kia", model: "EV6", fuelType: "electric" } }] },
    });
    await page.goto("/dashboard/insights");
    await expect(page.getByRole("heading", { name: "Weekly activity" })).toBeVisible();
    await expect(page.getByTestId("bar-chart").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Next milestone" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fuel this month" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Charging this month" })).toBeVisible();
    // Work-only cards are not shown in Personal.
    await expect(page.getByRole("heading", { name: "Working calendar" })).toHaveCount(0);
    await expect(page.getByTestId("heatmap")).toHaveCount(0);
  });

  const report = {
    weekLabel: "28 Sep to 4 Oct 2026",
    business: { miles: 120, trips: 20, deductionPence: 5400, earningsPence: 50000, shifts: 4, avgShiftHours: 6, bestShiftGrade: "B", fuelCostPence: 5000, topPlatform: "uber" },
    personal: { miles: 30, trips: 6, avgTripMiles: 5, longestTripMiles: 12 },
    totalMiles: 150, totalTrips: 26, streakDays: 4, newAchievements: [], milesDelta: 12, tripsDelta: -5, earningsDelta: 3,
  };

  test("Trends with data: week navigation, charts and takeaways", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockApi(page, {
      ...common,
      "GET /analytics/weekly-report": () => ({ data: report }),
      "GET /analytics/routes": { data: [{ startLat: 0, startLng: 0, endLat: 0, endLng: 0, startAddress: "Home", endAddress: "Depot", tripCount: 12, avgDurationMinutes: 25, fastestDurationMinutes: 19, avgDistanceMiles: 11, classification: "business", platformTag: null, dayBreakdown: [], timeBreakdown: [] }] },
      "GET /analytics/shift-sweet-spots": { data: [{ durationBucket: "4-6 hrs", shiftCount: 5, avgEarningsPerHourPence: 1800, avgTrips: 8, avgMiles: 40, totalEarningsPence: 9000 }, { durationBucket: "6-8 hrs", shiftCount: 4, avgEarningsPerHourPence: 2200, avgTrips: 9, avgMiles: 50, totalEarningsPence: 17600 }] },
      "GET /analytics/fuel-cost": { data: { actualMpg: 41, estimatedMpg: null, fuelCostPerMilePence: 13, totalFuelCostPence: 12000, totalMilesDriven: 900, perVehicle: [], recentFillUps: [] } },
      "GET /analytics/earnings-by-day": { data: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d, i) => ({ day: d, dayIndex: i, totalEarningsPence: i === 5 ? 9000 : 3000, avgEarningsPence: i === 5 ? 4500 : 1500, tripCount: 5, entryCount: 2 })) },
      "GET /analytics/commute-timing": { data: [{ routeLabel: "Home to Work", locationFrom: "Home", locationTo: "Work", avgDurationMinutes: 30, bestDurationMinutes: 22, worstDurationMinutes: 45, bestDepartureHour: 7, bestDepartureLabel: "Leave by 7am", byHour: [{ hour: 7, avgMinutes: 24, tripCount: 5 }, { hour: 8, avgMinutes: 35, tripCount: 6 }] }] },
    });
    await page.goto("/dashboard/insights?view=trends");
    await expect(page.getByRole("heading", { name: "Weekly report" })).toBeVisible();
    await expect(page.getByText("28 Sep to 4 Oct 2026")).toBeVisible();
    await expect(page.getByText("Your best day was Saturday.")).toBeVisible();
    await expect(page.getByText("You earn most an hour on shifts of 6-8 hrs.")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toHaveCount(2);
    await expect(page.getByTestId("line-chart")).toHaveCount(1);
    await page.getByRole("button", { name: "Previous week" }).click();
    await expect.poll(() => calls.find("GET", "/analytics/weekly-report").some((c) => c.search.includes("weeksBack=1"))).toBe(true);
    await expect(page.getByRole("button", { name: "Next week" })).toBeEnabled();
  });

  test("Trends with no data says there is not enough driving yet, and no chart is drawn", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, {
      ...common,
      "GET /analytics/weekly-report": { data: { ...report, totalMiles: 0, totalTrips: 0, business: { ...report.business, miles: 0, trips: 0 }, personal: { ...report.personal, miles: 0, trips: 0 } } },
      "GET /analytics/routes": { data: [] },
      "GET /analytics/shift-sweet-spots": { data: [] },
      "GET /analytics/fuel-cost": { data: { actualMpg: null, estimatedMpg: null, fuelCostPerMilePence: null, totalFuelCostPence: 0, totalMilesDriven: 0, perVehicle: [], recentFillUps: [] } },
      "GET /analytics/earnings-by-day": { data: [] },
      "GET /analytics/commute-timing": { data: [] },
    });
    await page.goto("/dashboard/insights?view=trends");
    await expect(page.getByRole("heading", { name: "Not enough driving yet" })).toBeVisible();
    await expect(page.getByText("Trends need a few weeks of trips. Check back soon.")).toBeVisible();
    await expect(page.getByTestId("bar-chart")).toHaveCount(0);
  });

  test("a failing card shows a retry line without breaking the others", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, {
      ...common,
      "GET /analytics/weekly-report": { data: report },
      "GET /analytics/routes": { status: 500, body: { error: "boom" } },
      "GET /analytics/shift-sweet-spots": { data: [] },
      "GET /analytics/fuel-cost": { data: { actualMpg: null, estimatedMpg: null, fuelCostPerMilePence: null, totalFuelCostPence: 5000, totalMilesDriven: 10, perVehicle: [], recentFillUps: [] } },
      "GET /analytics/earnings-by-day": { data: [] },
      "GET /analytics/commute-timing": { data: [] },
    });
    await page.goto("/dashboard/insights?view=trends");
    await expect(page.getByText("Couldn't load this.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fuel cost" })).toBeVisible();
  });
});

test.describe("Home cards", () => {
  test("a card that gets an odd response shows a quiet line and never crashes Home", async ({ page }) => {
    await mockSession(page, { profile: profile({ dashboardMode: "personal", workType: "employee" }) });
    await mockApi(page, {
      "GET /gamification/stats": { data: { totalTrips: 3 } },
      "GET /community/monthly": { data: null },
      "GET /gamification/recap": { data: {} },
    });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sam");
    await expect(page.getByText("Application error")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: /^Insights/ })).toBeVisible();
  });
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const url of ["/dashboard/insights", "/dashboard/insights?view=trends"]) {
    test(`${url} has no horizontal scroll`, async ({ page }) => {
      await mockSession(page, { profile: profile({ isPremium: true }) });
      await mockApi(page, {
        ...common,
        "GET /business-insights": { data: insights },
        "GET /business-insights/platform-pnl": { data: [] },
        "GET /business-insights/pnl": { data: { periodLabel: "x", grossEarningsPence: 1, estimatedFuelCostPence: 0, estimatedWearCostPence: 0, netProfitPence: 1, hmrcDeductionPence: 0, businessMiles: 1, totalTrips: 1 } },
        "GET /business-insights/project-pnl": { data: [] },
        "GET /analytics/weekly-report": { data: { weekLabel: "w", business: { miles: 1, trips: 1, deductionPence: 0, earningsPence: 0, shifts: 0, avgShiftHours: 0, bestShiftGrade: null, fuelCostPence: null, topPlatform: null }, personal: { miles: 1, trips: 1, avgTripMiles: 1, longestTripMiles: 1 }, totalMiles: 2, totalTrips: 2, streakDays: 1, newAchievements: [], milesDelta: null, tripsDelta: null, earningsDelta: null } },
        "GET /analytics/routes": { data: [] },
        "GET /analytics/shift-sweet-spots": { data: [{ durationBucket: "4-6 hrs", shiftCount: 5, avgEarningsPerHourPence: 1800, avgTrips: 8, avgMiles: 40, totalEarningsPence: 9000 }] },
        "GET /analytics/fuel-cost": { data: { actualMpg: null, estimatedMpg: null, fuelCostPerMilePence: null, totalFuelCostPence: 0, totalMilesDriven: 0, perVehicle: [], recentFillUps: [] } },
        "GET /analytics/earnings-by-day": { data: [] },
        "GET /analytics/commute-timing": { data: [] },
      });
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Insights");
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
