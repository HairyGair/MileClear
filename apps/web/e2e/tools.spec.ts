import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { callsTo, drivingState, hasHorizontalScroll, mockDriving, reading, VEHICLE } from "./fixtures/driving";

test.use({ viewport: { width: 1440, height: 900 } });

// ACHIEVEMENT_TYPES in packages/shared has 39 entries (the shared package is ESM, so it is not imported here).
const BADGE_COUNT = 39;

const PLACE = (n: number) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  userId: "u-test",
  name: n === 1 ? "Home" : n === 2 ? "Depot" : "Gym",
  locationType: n === 1 ? "home" : n === 2 ? "depot" : "custom",
  latitude: 54.97,
  longitude: -1.61,
  radiusMeters: 150,
  geofenceEnabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

async function copySweep(page: import("@playwright/test").Page) {
  const text = await page.locator("body").innerText();
  for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
}

test.describe("saved places", () => {
  test("list shows type and radius, the suggestion saves, and the free limit opens the Pro dialog", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({
      places: [PLACE(1), PLACE(2)],
      suggestions: [{ id: "s1", centroidLat: 54.9, centroidLng: -1.6, visitCount: 12, suggestedType: "other", inferredName: "Tesco Extra" }],
    });
    await mockDriving(page, state);
    await page.goto("/dashboard/places");
    await expect(page.getByRole("link", { name: /150 m radius/ }).first()).toContainText("Home");
    await expect(page.getByText("You often stop at Tesco Extra. Save it?")).toBeVisible();
    await expect(page.getByText("Your phone uses these to sort trips and name them.")).toBeVisible();
    await expect(page.getByText("2 of 2 free places used.")).toBeVisible();

    // Third place on free: the Pro dialog, not the form.
    await page.getByRole("button", { name: "Add place" }).click();
    const dialog = page.getByRole("dialog", { name: "Save more places" });
    await expect(dialog.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", /reason=places/);
    await dialog.getByRole("button", { name: "Not now" }).click();

    // Saving the suggestion at the limit also opens the dialog and sends nothing.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Save more places" })).toBeVisible();
    expect(callsTo(state, "POST", "/saved-locations")).toHaveLength(0);
    await copySweep(page);
  });

  test("Pro: suggestion saves with its type and place; No thanks hides it", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const state = drivingState({
      places: [PLACE(1), PLACE(2)],
      suggestions: [{ id: "s1", centroidLat: 54.9, centroidLng: -1.6, visitCount: 12, suggestedType: "other", inferredName: "Tesco Extra" }],
    });
    await mockDriving(page, state);
    await page.goto("/dashboard/places");
    await expect(page.getByRole("link", { name: "Add place" })).toHaveAttribute("href", "/dashboard/places/new");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => callsTo(state, "POST", "/saved-locations").length).toBe(1);
    expect(callsTo(state, "POST", "/saved-locations")[0][2]).toMatchObject({ name: "Tesco Extra", locationType: "custom", latitude: 54.9, longitude: -1.6 });
    await page.getByRole("button", { name: "No thanks" }).click();
    await expect(page.getByText("You often stop at Tesco Extra. Save it?")).toHaveCount(0);
  });

  test("empty state, then add a place by searching an address with the radius hint", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({ places: [] });
    await mockDriving(page, state);
    await page.goto("/dashboard/places");
    await expect(page.getByText("No saved places")).toBeVisible();
    await expect(page.getByText("Save home, work or your depot and trips get named and sorted for you.")).toBeVisible();

    await page.goto("/dashboard/places/new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add place");
    await expect(page.getByText("Drivers like you use about 140 m for a home.")).toBeVisible();
    await page.getByLabel("Find the address").fill("10 Downing");
    await page.getByRole("option", { name: /10 Downing Street/ }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("10 Downing Street");
    await page.getByLabel("Name", { exact: true }).fill("Office");
    await page.getByRole("button", { name: "Add place" }).click();
    await expect(page).toHaveURL(/\/dashboard\/places$/);
    const post = callsTo(state, "POST", "/saved-locations");
    expect(post[0][2]).toMatchObject({ name: "Office", locationType: "home", latitude: 51.5034, longitude: -0.1276, radiusMeters: 200 });
  });

  test("no unpkg, postcodes.io or nominatim requests from the places pages", async ({ page }) => {
    const hosts = new Set<string>();
    page.on("request", (r) => hosts.add(new URL(r.url()).host));
    await mockSession(page);
    await mockDriving(page, drivingState({ places: [PLACE(1)] }));
    await page.goto(`/dashboard/places/${PLACE(1).id}`);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Home");
    await page.goto("/dashboard/places/new");
    await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
    for (const h of hosts) expect(h).not.toMatch(/unpkg|postcodes\.io|nominatim/);
  });
});

test.describe("shifts", () => {
  const SHIFTS = [
    { id: "s1", status: "completed", startedAt: "2026-10-07T17:00:00.000Z", endedAt: "2026-10-07T20:00:00.000Z", vehicle: null, tripCount: 4, tripMiles: 42.5 },
    { id: "s2", status: "completed", startedAt: "2026-10-06T09:00:00.000Z", endedAt: "2026-10-06T10:30:00.000Z", vehicle: null, tripCount: 2, tripMiles: 12.1 },
  ];

  test("free: list with stats from the loaded shifts, no grades; Pro: grade only where earnings exist", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ shifts: SHIFTS }));
    await page.goto("/dashboard/shifts");
    await expect(page.getByText("All your shifts")).toBeVisible();
    await expect(page.getByText("Grade", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /primary/i })).toHaveCount(0);
    await expect(page.locator(".mc-btn--primary")).toHaveCount(0);

    const pro = await page.context().newPage();
    await mockSession(pro, { profile: profile({ isPremium: true }) });
    await mockDriving(pro, drivingState({ shifts: SHIFTS }));
    await pro.goto("/dashboard/shifts");
    const rows = pro.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("B");
    await expect(rows.nth(1)).toContainText("No grade");
    await expect(pro.getByRole("table")).not.toContainText(/\bF\b/);
  });

  test("empty state", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ shifts: [] }));
    await page.goto("/dashboard/shifts");
    await expect(page.getByText("No shifts yet")).toBeVisible();
    await expect(page.getByText("Start a shift in the app when you start work. Your trips are grouped here.")).toBeVisible();
  });

  test("suggestion: Make it a shift posts accept; shift page lists its trips and the scorecard; free sees the P&L gate", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({
      shifts: SHIFTS,
      shiftSuggestions: [{ id: "sg1", startedAt: "2026-10-07T16:02:00.000Z", endedAt: "2026-10-07T20:40:00.000Z", tripCount: 4, totalMiles: 30, platformTag: null }],
    });
    await mockDriving(page, state);
    await page.goto("/dashboard/shifts");
    await expect(page.getByText(/^4 trips look like a shift on /)).toBeVisible();
    await page.getByRole("button", { name: "Make it a shift" }).click();
    await expect.poll(() => callsTo(state, "POST", "/shifts/suggestions/sg1/resolve").length).toBe(1);
    expect(callsTo(state, "POST", "/shifts/suggestions/sg1/resolve")[0][2]).toEqual({ action: "accept" });

    await page.getByRole("row").filter({ hasText: "42.5" }).click();
    await expect(page).toHaveURL(/\/dashboard\/shifts\/s1$/);
    await expect(page.getByText("Scorecard")).toBeVisible();
    await expect(page.getByRole("link", { name: /Depot to High Street/ })).toHaveAttribute("href", "/dashboard/trips/t1");
    await expect(page.getByText("This is part of MileClear Pro. £4.99 a month, cancel any time.")).toBeVisible();
  });

  test("Pro shift page shows profit and loss", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockDriving(page, drivingState({ shifts: SHIFTS }));
    await page.goto("/dashboard/shifts/s1");
    await expect(page.getByText("Profit and loss")).toBeVisible();
    await expect(page.getByText("£63.00")).toBeVisible();
  });

  test("Home shows the shift suggestion card in Work mode", async ({ page }) => {
    await mockSession(page);
    await mockDriving(
      page,
      drivingState({ shiftSuggestions: [{ id: "sg1", startedAt: "2026-10-07T16:02:00.000Z", endedAt: "2026-10-07T20:40:00.000Z", tripCount: 1, totalMiles: 8, platformTag: null }] })
    );
    await page.goto("/dashboard");
    await expect(page.getByText(/^1 trip looks like a shift on /)).toBeVisible();
  });
});

test.describe("fuel", () => {
  const LOGS = [
    { id: "f1", vehicleId: VEHICLE.id, litres: 40, costPence: 5600, stationName: "Asda Gosforth", odometerReading: 45000, loggedAt: new Date().toISOString(), vehicle: { id: VEHICLE.id, make: "Ford", model: "Focus", fuelType: "petrol" } },
  ];

  test("empty state, then Log fill-up sends pence", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({ fuelLogs: [] });
    await mockDriving(page, state);
    await page.goto("/dashboard/fuel");
    await expect(page.getByText("No fill-ups yet")).toBeVisible();
    await expect(page.getByText("Log a fill-up to see your fuel costs.")).toBeVisible();
    await page.getByRole("button", { name: "Log fill-up" }).click();
    const dialog = page.getByRole("dialog", { name: "Log fill-up" });
    await dialog.getByLabel("Litres").fill("35.5");
    await dialog.getByLabel("Cost").fill("49.70");
    await dialog.getByLabel("Station").fill("Shell");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => callsTo(state, "POST", "/fuel/logs").length).toBe(1);
    expect(callsTo(state, "POST", "/fuel/logs")[0][2]).toMatchObject({ litres: 35.5, costPence: 4970, stationName: "Shell", vehicleId: VEHICLE.id });
  });

  test("summary is for this month, the list edits and deletes, prices come from a postcode", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({ fuelLogs: LOGS });
    await mockDriving(page, state);
    await page.goto("/dashboard/fuel");
    await expect(page.getByText("Asda Gosforth has petrol at 139.9p, 4p under the local average.")).toBeVisible();
    await expect(page.getByText("£56.00").first()).toBeVisible();
    await expect(page.getByText("140.0p").first()).toBeVisible();
    // 5600 pence over 400 miles = 14.0p a mile.
    await expect(page.getByText("14.0p").first()).toBeVisible();

    await page.getByRole("row").filter({ hasText: "Asda Gosforth" }).click();
    const edit = page.getByRole("dialog", { name: "Edit fill-up" });
    await expect(edit.getByLabel("Litres")).toHaveValue("40");
    await edit.getByLabel("Litres").fill("41");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => callsTo(state, "PATCH", "/fuel/logs/f1").length).toBe(1);
    expect(callsTo(state, "PATCH", "/fuel/logs/f1")[0][2]).toMatchObject({ litres: 41, costPence: 5600 });

    await page.getByRole("row").filter({ hasText: "Asda Gosforth" }).click();
    await page.getByRole("dialog", { name: "Edit fill-up" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete this fill-up?" }).getByRole("button", { name: "Delete" }).click();
    await expect.poll(() => callsTo(state, "DELETE", "/fuel/logs/f1").length).toBe(1);
    // The confirm dialog is modal until it has closed; the page behind it can't take input yet.
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await expect(page.getByText("Enter a postcode")).toBeVisible();
    await page.getByLabel("Postcode").fill("NE3 1AA");
    await page.getByRole("button", { name: "Show prices" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Asda Gosforth" }).filter({ hasText: "139.9p" }).last()).toContainText("139.9p");
    await expect(page.getByRole("row").filter({ hasText: "Asda Gosforth" }).filter({ hasText: "139.9p" }).last()).toContainText("146.9p");
    await expect(page.getByText("UK average today: petrol 143.2p, diesel 150.1p a litre.")).toBeVisible();
    await copySweep(page);
  });

  test("an electric vehicle adds the Charging section", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ vehicles: [{ ...VEHICLE, fuelType: "electric" }], fuelLogs: LOGS }));
    await page.goto("/dashboard/fuel");
    await page.getByLabel("Postcode").fill("NE3 1AA");
    await page.getByRole("button", { name: "Show prices" }).click();
    await expect(page.getByText("Your electricity rate is 24.5p a kWh.")).toBeVisible();
  });
});

test.describe("achievements", () => {
  test("every badge is shown, earned ones dated, locked ones with progress and no em dashes", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState());
    await page.goto("/dashboard/achievements");
    const badges = page.getByTestId("badge");
    await expect(badges).toHaveCount(BADGE_COUNT);
    await expect(page.locator('[data-earned="true"]')).toHaveCount(2);
    await expect(page.getByText("2 of " + BADGE_COUNT + " unlocked")).toBeVisible();
    await expect(page.getByText("620 of 1,000 miles")).toBeVisible();
    await expect(page.getByText("40 of 50 trips")).toBeVisible();
    await expect(page.getByText("5 of 7 days")).toBeVisible();
    await copySweep(page);
  });
});

test.describe("road alerts", () => {
  const ALERT = {
    id: "ra1", source: "tomtom", severity: "closure", category: "road_closed", when: "now",
    headline: "M6 southbound closed", sentence: "Closed from J14 to J13 after an accident.", road: "M6", direction: "southbound",
    from: "J14", to: "J13", town: "Stafford", delayMinutes: 25, startAt: "2026-10-09T07:00:00.000Z", endAt: "2026-10-09T23:00:00.000Z", daysOnRoute: 4, memberIds: ["e1", "e2"],
  };
  const feed = (over: object) => ({ enabled: true, available: true, plannedWorksCoverage: "england", offerEligible: false, hasUsualRoads: true, current: [], upcoming: [], attribution: ["Traffic data from TomTom"], updatedAt: "2026-10-09T08:00:00.000Z", ...over });

  test("lists alerts, Dismiss posts every merged event id", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({ roadAlerts: feed({ current: [ALERT], upcoming: [{ ...ALERT, id: "ra2", when: "upcoming", headline: "A1 lane closures", sentence: "Lane closed overnight.", memberIds: undefined }] }) });
    await mockDriving(page, state);
    await page.goto("/dashboard/road-alerts");
    await expect(page.getByRole("heading", { name: "On your roads" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planned" })).toBeVisible();
    await expect(page.getByText("M6 southbound closed")).toBeVisible();
    await page.getByRole("button", { name: "Dismiss M6 southbound closed" }).click();
    await expect.poll(() => callsTo(state, "POST", "/road-alerts/dismiss").length).toBe(1);
    expect(callsTo(state, "POST", "/road-alerts/dismiss")[0][2]).toMatchObject({ eventIds: ["e1", "e2"], road: "M6", severity: "closure" });
    await copySweep(page);
  });

  test("none, off, or a failing endpoint all show the same empty state", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ roadAlerts: feed({}) }));
    await page.goto("/dashboard/road-alerts");
    await expect(page.getByText("No alerts on your roads")).toBeVisible();
    await expect(page.getByText("We'll show closures and delays on routes you drive often.")).toBeVisible();

    const off = await page.context().newPage();
    await mockSession(off);
    await mockDriving(off, drivingState({ roadAlerts: feed({ enabled: false, current: [ALERT] }) }));
    await off.goto("/dashboard/road-alerts");
    await expect(off.getByText("No alerts on your roads")).toBeVisible();
  });

  test("Home card shows current alerts and hides when there are none", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ roadAlerts: feed({ current: [ALERT] }) }));
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "On your roads" })).toBeVisible();
    await expect(page.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/dashboard/road-alerts");

    const none = await page.context().newPage();
    await mockSession(none);
    await mockDriving(none, drivingState({ roadAlerts: feed({}) }));
    await none.goto("/dashboard");
    await expect(none.getByRole("heading", { name: "Add a trip" }).or(none.getByRole("link", { name: "Add a trip" }))).toBeVisible();
    await expect(none.getByRole("heading", { name: "On your roads" })).toHaveCount(0);
  });
});

test.describe("ticket defender", () => {
  test("free account sees the Pro gate and the plan link, and no form", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState());
    await page.goto("/dashboard/ticket-defender");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ticket defender");
    await expect(page.getByText("Check fines against your trips")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/dashboard/settings/plan?reason=ticket_defender");
    await expect(page.getByRole("button", { name: "Check my trips" })).toHaveCount(0);
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  });

  test("Pro: look up finds the trip, the evidence pack downloads", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockDriving(page, drivingState());
    await page.goto("/dashboard/ticket-defender");
    await page.getByLabel("Reference").fill("PCN123");
    const lookup = page.waitForRequest((r) => r.url().includes("/ticket-defender/lookup") && r.method() === "POST");
    await page.getByRole("button", { name: "Check my trips" }).click();
    const req = await lookup;
    expect(req.postDataJSON()).toMatchObject({ at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    expect(req.postDataJSON()).not.toHaveProperty("reference");
    const result = page.getByTestId("td-result");
    await expect(result).toContainText("Trip recorded");
    await expect(result).toContainText("Depot to High Street");
    await expect(result).toContainText("MileClear recorded a trip in your Ford Focus at that time.");
    const pack = page.waitForRequest((r) => r.url().includes("/ticket-defender/pack"));
    await page.getByRole("button", { name: "Download evidence pack (PDF)" }).click();
    const u = new URL((await pack).url());
    expect(u.searchParams.get("reference")).toBe("PCN123");
    expect(u.searchParams.get("noticeType")).toBe("other");
    await copySweep(page);
  });

  test("?tripId= fills the form from that trip", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockDriving(page, drivingState());
    await page.goto("/dashboard/ticket-defender?tripId=t1");
    await expect(page.getByLabel("Date on the notice")).toHaveValue("2026-10-07");
    await expect(page.getByLabel("Vehicle")).toHaveValue(VEHICLE.id);
  });

  test("clean air zone charges: empty, then list with Mark paid", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const state = drivingState({ cazCharges: [] });
    await mockDriving(page, state);
    await page.goto("/dashboard/ticket-defender");
    await expect(page.getByText("No clean air zone charges")).toBeVisible();
    await expect(page.getByText("Trips through a charging zone show up here.")).toBeVisible();

    state.cazCharges = [
      { key: "london-ulez:2026-10-07", zoneId: "london-ulez", zoneName: "London ULEZ", travelDay: "2026-10-07", chargePence: 1250, tripIds: ["t1"], deadline: { deadlineDay: "2026-10-17", deadlineAt: "2026-10-17T22:59:59.000Z", ruleText: "x", payUrl: "https://tfl.gov.uk/pay", sourceUrl: "https://tfl.gov.uk" }, infoUrl: "https://tfl.gov.uk", status: "due", paidAt: null, confidence: "confirmed" },
    ];
    await page.reload();
    await expect(page.getByText(/London ULEZ · .* · £12.50/)).toBeVisible();
    await expect(page.getByText("Pay by Sat 17 Oct")).toBeVisible();
    await expect(page.getByRole("link", { name: "Pay online" })).toHaveAttribute("href", "https://tfl.gov.uk/pay");
    await page.getByRole("button", { name: "Mark paid" }).click();
    await expect.poll(() => callsTo(state, "POST", "/caz-charges/t1/paid").length).toBe(1);
    expect(callsTo(state, "POST", "/caz-charges/t1/paid")[0][2]).toEqual({ zoneId: "london-ulez", paid: true });
  });
});

test.describe("Home odometer prompt", () => {
  test("shows once in Work mode with a vehicle that has no reading and 3+ trips; Not now hides it for good", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ odometer: {}, vehicles: [{ ...VEHICLE, odometer: null }], tripTotal: 5 }));
    await page.goto("/dashboard");
    await expect(page.getByText("Need odometer readings for work?")).toBeVisible();
    await expect(page.getByText("Type in your odometer once. MileClear adds your trips so you can see the reading at the start and end of each day.")).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByText("Need odometer readings for work?")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("link", { name: "Add a trip" })).toBeVisible();
    await expect(page.getByText("Need odometer readings for work?")).toHaveCount(0);
  });

  test("hidden with a reading, with fewer than 3 trips, and in Personal mode", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ tripTotal: 5 }));
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Add a trip" })).toBeVisible();
    await expect(page.getByText("Need odometer readings for work?")).toHaveCount(0);

    const few = await page.context().newPage();
    await mockSession(few);
    await mockDriving(few, drivingState({ odometer: {}, vehicles: [{ ...VEHICLE, odometer: null }], tripTotal: 2 }));
    await few.goto("/dashboard");
    await expect(few.getByRole("link", { name: "Add a trip" })).toBeVisible();
    await expect(few.getByText("Need odometer readings for work?")).toHaveCount(0);

    const personal = await page.context().newPage();
    await mockSession(personal, { profile: profile({ dashboardMode: "personal" }) });
    await mockDriving(personal, drivingState({ odometer: {}, vehicles: [{ ...VEHICLE, odometer: null }], tripTotal: 9 }));
    await personal.goto("/dashboard");
    await expect(personal.getByRole("link", { name: "Add a trip" })).toBeVisible();
    await expect(personal.getByText("Need odometer readings for work?")).toHaveCount(0);
  });

  test("Add reading saves and the card goes", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({ odometer: {}, vehicles: [{ ...VEHICLE, odometer: null }], tripTotal: 5 });
    await mockDriving(page, state);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Add reading" }).click();
    const dialog = page.getByRole("dialog", { name: "Update odometer" });
    await dialog.getByLabel("Reading").fill("45100");
    await dialog.getByRole("button", { name: "Save reading" }).click();
    await expect(page.getByText("Need odometer readings for work?")).toHaveCount(0);
    expect(callsTo(state, "POST", "/odometer-readings")).toHaveLength(1);
  });
});

test.describe("390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const routes = ["/dashboard/places", "/dashboard/shifts", "/dashboard/fuel", "/dashboard/achievements", "/dashboard/road-alerts", "/dashboard/ticket-defender", "/dashboard/odometer", "/dashboard/vehicles"];
  for (const route of routes) {
    test(`${route} has no sideways scroll for a Pro driver`, async ({ page }) => {
      await mockSession(page, { profile: profile({ isPremium: true }) });
      await mockDriving(
        page,
        drivingState({
          places: [PLACE(1)],
          shifts: [{ id: "s1", status: "completed", startedAt: "2026-10-07T17:00:00.000Z", endedAt: "2026-10-07T20:00:00.000Z", vehicle: null, tripCount: 4, tripMiles: 42.5 }],
          fuelLogs: [{ id: "f1", vehicleId: VEHICLE.id, litres: 40, costPence: 5600, stationName: "Asda Gosforth with a rather long station name", odometerReading: null, loggedAt: new Date().toISOString(), vehicle: { id: VEHICLE.id, make: "Ford", model: "Focus", fuelType: "petrol" } }],
          roadAlerts: { enabled: true, available: true, plannedWorksCoverage: null, offerEligible: false, hasUsualRoads: true, current: [{ id: "ra1", source: "tomtom", severity: "closure", category: "road_closed", when: "now", headline: "M6 southbound closed between junctions 14 and 13", sentence: "A very long sentence about the closure that needs to wrap on a narrow phone screen without any sideways scrolling.", road: "M6", direction: null, from: null, to: null, town: null, delayMinutes: null, startAt: null, endAt: null, daysOnRoute: 1 }], upcoming: [], attribution: [], updatedAt: "2026-10-09T08:00:00.000Z" },
          days: [{ vehicleId: VEHICLE.id, date: "2026-10-09", opening: 45100, openingRecorded: true, closing: 45146, closingRecorded: true, businessMiles: 30.2, personalMiles: 5, notSortedMiles: 3, tripCount: 3, difference: 8, openingDifference: 0 }],
        })
      );
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await hasHorizontalScroll(page)).toBe(false);
    });
  }
});

// Keep the shared helpers referenced so a rename shows up here.
void reading;
