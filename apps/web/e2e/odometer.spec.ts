import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { callsTo, CURRENT_ESTIMATED, drivingState, hasHorizontalScroll, mockDriving, reading, VEHICLE } from "./fixtures/driving";

test.use({ viewport: { width: 1440, height: 900 } });

const VEHICLE_URL = `/dashboard/vehicles/${VEHICLE.id}`;

async function openDialog(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Update reading" }).first().click();
  return page.getByRole("dialog", { name: /Update odometer|lower than|higher than|more than|Couldn't save/ });
}

test.describe("odometer on the vehicle page", () => {
  test("shows the figure as one labelled element with the Estimated chip and how it was worked out", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState());
    await page.goto(VEHICLE_URL);
    await expect(page.getByRole("img", { name: "Odometer about 45,262 miles, estimated" })).toBeVisible();
    await expect(page.getByText("Estimated", { exact: true })).toBeVisible();
    await expect(page.getByText("Your reading of 45,100 on Thu 8 Oct, plus 162 miles of trips since.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Daily log" })).toHaveAttribute("href", `/dashboard/odometer?vehicle=${VEHICLE.id}`);
  });

  test("a recorded figure says Recorded and has no trips-since text", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({
      odometer: { [VEHICLE.id]: { current: { ...CURRENT_ESTIMATED, miles: 45100, isEstimated: false, tripMilesSince: 0 }, readings: [reading()] } },
    });
    await mockDriving(page, state);
    await page.goto(VEHICLE_URL);
    await expect(page.getByRole("img", { name: "Odometer 45,100 miles, recorded" })).toBeVisible();
    await expect(page.getByText("Recorded", { exact: true })).toBeVisible();
  });

  test("no reading yet: empty copy and Add reading", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ odometer: {} }));
    await page.goto(VEHICLE_URL);
    await expect(page.getByText("Keep a running odometer")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add reading" })).toBeVisible();
  });

  test("saving a reading sends miles and time, then shows the app's outcome line", async ({ page }) => {
    await mockSession(page);
    const state = drivingState();
    await mockDriving(page, state);
    await page.goto(VEHICLE_URL);
    const dialog = await openDialog(page);
    await expect(dialog.getByText("Best read when the car is parked.")).toBeVisible();
    await dialog.getByLabel("Reading").fill("45270");
    await expect(dialog.getByText(/Close to our estimate|more than we estimated/)).toBeVisible();
    await dialog.getByRole("button", { name: "Save reading" }).click();
    await expect(page.getByText("Saved. That's 8 miles more than your trips. Your log uses it from then on.")).toBeVisible();
    const posts = callsTo(state, "POST", "/odometer-readings");
    expect(posts).toHaveLength(1);
    expect(posts[0][2]).toMatchObject({ readingMiles: 45270 });
    expect((posts[0][2] as { readAt: string }).readAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("checks before saving: empty, lower than earlier reading (nothing sent), more than 1,000 above the estimate (confirm)", async ({ page }) => {
    await mockSession(page);
    const state = drivingState();
    await mockDriving(page, state);
    await page.goto(VEHICLE_URL);
    let dialog = await openDialog(page);
    await dialog.getByRole("button", { name: "Save reading" }).click();
    await expect(dialog.getByText("Type the reading from your dashboard.")).toBeVisible();

    await dialog.getByLabel("Reading").fill("45000");
    await dialog.getByRole("button", { name: "Save reading" }).click();
    dialog = page.getByRole("dialog", { name: "That's lower than an earlier reading" });
    await expect(dialog.getByText(/You recorded 45,100 on Thu 8 Oct\. Odometers don't go backwards/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "See readings" })).toBeVisible();
    await dialog.getByRole("button", { name: "Check the number" }).click();

    dialog = page.getByRole("dialog", { name: "Update odometer" });
    await dialog.getByLabel("Reading").fill("451600");
    await dialog.getByRole("button", { name: "Save reading" }).click();
    dialog = page.getByRole("dialog", { name: "That's 406,338 miles more than we expected" });
    await expect(dialog.getByText("We estimated about 45,262. Is 451,600 right?")).toBeVisible();
    await dialog.getByRole("button", { name: "Fix it" }).click();
    expect(callsTo(state, "POST", "/odometer-readings")).toHaveLength(0);
  });

  test("the API's LOWER_THAN_EARLIER 409 is shown as a refusal", async ({ page }) => {
    await mockSession(page);
    // The page has no earlier reading on file, so the form passes and the server refuses.
    const state = drivingState({
      odometer: { [VEHICLE.id]: { current: CURRENT_ESTIMATED, readings: [] } },
      readingResponse: {
        status: 409,
        body: { code: "LOWER_THAN_EARLIER", error: "That's lower than an earlier reading", earlier: reading({ readingMiles: 45200, readAt: "2026-10-08T17:40:00.000Z" }) },
      },
    });
    await mockDriving(page, state);
    await page.goto(VEHICLE_URL);
    const dialog = await openDialog(page);
    await dialog.getByLabel("Reading").fill("45250");
    await dialog.getByRole("button", { name: "Save reading" }).click();
    const refusal = page.getByRole("dialog", { name: "That's lower than an earlier reading" });
    await expect(refusal.getByText("You recorded 45,200 on Thu 8 Oct. Odometers don't go backwards. If the earlier reading was wrong, delete it first.")).toBeVisible();
    expect(callsTo(state, "POST", "/odometer-readings")).toHaveLength(1);
  });

  test("the API's HIGHER_THAN_LATER 409 shows the API's sentence as given", async ({ page }) => {
    await mockSession(page);
    const sentence = "That's higher than your reading of 45,300 on Thu 9 Oct, which was taken later. Check the reading or the time.";
    const state = drivingState({
      odometer: { [VEHICLE.id]: { current: CURRENT_ESTIMATED, readings: [] } },
      readingResponse: {
        status: 409,
        body: { code: "HIGHER_THAN_LATER", error: sentence, later: reading({ id: "r9", readingMiles: 45300, readAt: "2026-10-09T08:00:00.000Z" }) },
      },
    });
    await mockDriving(page, state);
    await page.goto(VEHICLE_URL);
    const dialog = await openDialog(page);
    await dialog.getByLabel("Reading").fill("45400");
    await dialog.getByRole("button", { name: "Save reading" }).click();
    const refusal = page.getByRole("dialog", { name: "That's higher than a later reading" });
    await expect(refusal.getByText(sentence)).toBeVisible();
  });

  test("a reading from a trip that failed the sanity check is listed as not used; typed ones can be deleted", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({
      odometer: {
        [VEHICLE.id]: {
          current: CURRENT_ESTIMATED,
          readings: [
            reading(),
            reading({ id: "x1", source: "trip", sourceId: "trip-9", readingMiles: 4530, used: false, rejectReason: "Lower than your reading of 45,100 the day before." }),
            reading({ id: "f1", source: "fuel", sourceId: "fuel-1", readingMiles: 45150 }),
          ],
        },
      },
    });
    await mockDriving(page, state);
    await page.goto(VEHICLE_URL);
    await page.getByRole("button", { name: "All readings" }).click();
    await expect(page.getByText("Odometer readings")).toBeVisible();
    await expect(page.getByText("Not used: looks wrong. Lower than your reading of 45,100 the day before.")).toBeVisible();
    await expect(page.getByText("From a fuel log", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Change it on the trip" })).toBeVisible();
    await page.getByRole("button", { name: "Delete reading of 45,100 miles" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this reading?" });
    await expect(confirm.getByText("Your daily log will be worked out again from your other readings and trips.")).toBeVisible();
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect.poll(() => callsTo(state, "DELETE", "/odometer-readings/r1").length).toBe(1);
  });
});

// The log: opening 45,100 recorded (typed reading) and 45,146 recorded at the close of Thu 9 Oct,
// trips 30.2 + 5.0 + 3.0 = 38.2, readings differ by +8: 45,100 + 38.2 + 8 = 45,146.2.
const DAYS = [
  { vehicleId: VEHICLE.id, date: "2026-10-09", opening: 45100, openingRecorded: true, closing: 45146, closingRecorded: true, businessMiles: 30.2, personalMiles: 5.0, notSortedMiles: 3.0, tripCount: 3, difference: 8, openingDifference: 0 },
  { vehicleId: VEHICLE.id, date: "2026-10-08", opening: null, openingRecorded: false, closing: null, closingRecorded: false, businessMiles: 12.5, personalMiles: 1.2, notSortedMiles: 0, tripCount: 2, difference: 0, openingDifference: 0 },
  { vehicleId: VEHICLE.id, date: "2026-10-10", opening: 45146, openingRecorded: true, closing: 45160, closingRecorded: true, businessMiles: 20.0, personalMiles: 0, notSortedMiles: 0, tripCount: 1, difference: -6, openingDifference: 0 },
];

test.describe("odometer log", () => {
  test("day table: start, end, Recorded vs est., miles split and the difference all match the data", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ days: DAYS }));
    await page.goto("/dashboard/odometer");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Odometer log");
    await expect(page.getByRole("heading", { name: "Now about 45,262 miles" })).toBeVisible();
    await expect(page.getByText("Recorded = a reading you or a trip gave us. est. = worked out from your trips.")).toBeVisible();
    await expect(page.getByText("Figures marked est. can change if you edit, add or delete trips.")).toBeVisible();

    const rows = page.getByRole("table", { name: "Odometer by day" }).locator("tbody tr");
    await expect(rows).toHaveCount(3);
    // Newest first.
    const sat = rows.nth(0);
    const fri = rows.nth(1);
    const thu = rows.nth(2);
    await expect(sat).toContainText("Sat 10 Oct");
    await expect(sat).toContainText("45,146");
    await expect(sat).toContainText("45,160");
    await expect(sat.getByText("Recorded")).toHaveCount(2);
    await expect(sat).toContainText("-6 mi");
    await expect(fri).toContainText("Fri 9 Oct");
    await expect(fri).toContainText("45,100");
    await expect(fri).toContainText("45,146");
    await expect(fri.getByText("Recorded")).toHaveCount(2);
    await expect(fri).toContainText("30.2 mi");
    await expect(fri).toContainText("5.0 mi");
    await expect(fri).toContainText("3.0 mi");
    await expect(fri).toContainText("+8 mi");
    await expect(thu).toContainText("Thu 8 Oct");
    await expect(thu).toContainText("No reading yet");

    // Arithmetic: closing - opening = business + personal + not sorted + difference, for every day with both figures.
    for (const d of DAYS) {
      if (d.opening == null || d.closing == null) continue;
      const trips = d.businessMiles + d.personalMiles + d.notSortedMiles;
      expect(Math.abs(d.closing - d.opening - (trips + d.difference - d.openingDifference))).toBeLessThan(0.5);
    }
  });

  test("the difference opens an explanation", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ days: DAYS }));
    await page.goto("/dashboard/odometer");
    await page.getByRole("button", { name: "+8 mi" }).click();
    const d = page.getByRole("dialog", { name: "Why the difference?" });
    await expect(d.getByText("Your odometer reading was 8 miles more than your recorded trips. Usually a short drive that wasn't recorded, or GPS measuring a little differently to your car.")).toBeVisible();
    await d.getByRole("button", { name: "OK" }).click();
    await expect(d).toBeHidden();
  });

  test("no vehicle, no reading and no driving each have their own empty state", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ vehicles: [] }));
    await page.goto("/dashboard/odometer");
    await expect(page.getByText("Add a vehicle first")).toBeVisible();

    const a = await page.context().newPage();
    await mockSession(a);
    await mockDriving(a, drivingState({ odometer: {} }));
    await a.goto("/dashboard/odometer");
    await expect(a.getByText("Add your odometer reading")).toBeVisible();

    const b = await page.context().newPage();
    await mockSession(b);
    await mockDriving(b, drivingState({ days: [] }));
    await b.goto("/dashboard/odometer");
    await expect(b.getByText("No driving in these dates")).toBeVisible();
    await expect(b.getByText("Pick other dates, or check back after your next trip.")).toBeVisible();
  });

  test("period chips ask for the matching dates; Choose dates shows two date fields and refuses over 366 days", async ({ page }) => {
    await mockSession(page);
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/odometer/days")) requests.push(r.url());
    });
    await mockDriving(page, drivingState({ days: DAYS }));
    await page.goto("/dashboard/odometer");
    await expect(page.getByRole("button", { name: "This week" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Last week" }).click();
    await page.getByRole("button", { name: "Choose dates" }).click();
    await page.getByLabel("From", { exact: true }).fill("2024-01-01");
    await page.getByLabel("To", { exact: true }).fill("2026-10-01");
    await expect(page.getByText("Pick a range of 366 days or fewer.")).toBeVisible();
    await page.getByLabel("From", { exact: true }).fill("2026-09-01");
    await expect(page.getByText("Pick a range of 366 days or fewer.")).toHaveCount(0);
    expect(requests.some((u) => u.includes("from=2026-09-01") && u.includes("to=2026-10-01"))).toBe(true);
  });

  test("two vehicles show vehicle chips and switching asks for that vehicle's days", async ({ page }) => {
    await mockSession(page);
    const second = { ...VEHICLE, id: "33333333-3333-4333-8333-333333333333", make: "Vauxhall", model: "Vivaro", isPrimary: false };
    const state = drivingState({ vehicles: [VEHICLE, second], days: DAYS });
    state.odometer[second.id] = { current: { ...CURRENT_ESTIMATED, miles: 80000 }, readings: [reading({ id: "v2r", readingMiles: 79900 })] };
    await mockSession(page);
    await mockDriving(page, state);
    const seen: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.pathname === "/odometer/days") seen.push(u.searchParams.get("vehicleId") ?? "");
    });
    await page.goto("/dashboard/odometer");
    await expect(page.getByRole("button", { name: "Ford Focus" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Vauxhall Vivaro" }).click();
    await expect(page.getByRole("heading", { name: "Now about 80,000 miles" })).toBeVisible();
    expect(seen).toContain(second.id);
  });

  test("?date= scrolls to the day and outlines it", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ days: DAYS }));
    await page.goto("/dashboard/odometer?date=2026-10-09");
    const row = page.locator("#day-2026-10-09");
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/dayCardFlash/);
    await expect(row).not.toHaveClass(/dayCardFlash/, { timeout: 5000 });
  });

  test("free Download as CSV goes to the plan page for odometer_log_csv; Pro downloads for the chosen vehicle and dates", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ days: DAYS }));
    await page.goto("/dashboard/odometer");
    const link = page.getByRole("link", { name: /Download as CSV/ });
    await expect(link).toHaveAttribute("href", "/dashboard/settings/plan?reason=odometer_log_csv");
    await expect(page.getByText("PRO", { exact: true })).toBeVisible();

    const pro = await page.context().newPage();
    await mockSession(pro, { profile: profile({ isPremium: true }) });
    await mockDriving(pro, drivingState({ days: DAYS }));
    await pro.goto("/dashboard/odometer");
    await expect(pro.getByText("PRO", { exact: true })).toHaveCount(0);
    const [req] = await Promise.all([
      pro.waitForRequest((r) => r.url().includes("/exports/odometer-log")),
      pro.getByRole("button", { name: "Download as CSV" }).click(),
    ]);
    const u = new URL(req.url());
    expect(u.searchParams.get("vehicleId")).toBe(VEHICLE.id);
    expect(u.searchParams.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(u.searchParams.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("copy sweep", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ days: DAYS }));
    await page.goto("/dashboard/odometer");
    await expect(page.getByRole("table")).toBeVisible();
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
  });
});

test.describe("odometer log at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("day cards instead of a table, same figures, no sideways scroll", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ days: DAYS }));
    await page.goto("/dashboard/odometer");
    await expect(page.getByRole("table")).toHaveCount(0);
    const card = page.locator("#day-2026-10-09");
    await expect(card).toContainText("Start");
    await expect(card).toContainText("45,100");
    await expect(card).toContainText("45,146");
    await expect(card).toContainText("Business 30.2 mi");
    await expect(card).toContainText("Personal 5.0 mi");
    await expect(card).toContainText("Not sorted 3.0 mi");
    await expect(card).toContainText("Readings differ from trips by +8 mi");
    await expect(page.locator("#day-2026-10-08")).toContainText("No reading yet");
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
