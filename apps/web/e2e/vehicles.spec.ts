import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { callsTo, drivingState, hasHorizontalScroll, mockDriving, VEHICLE } from "./fixtures/driving";

test.use({ viewport: { width: 1440, height: 900 } });

const SECOND = { ...VEHICLE, id: "33333333-3333-4333-8333-333333333333", make: "Vauxhall", model: "Vivaro", isPrimary: false, registrationPlate: "VX20ABC", cleanAirZones: { ...VEHICLE.cleanAirZones, verdict: "compliant" } };

test.describe("vehicles list", () => {
  test("cards show plate, chips, odometer estimate and MOT / tax dates", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({ vehicles: [VEHICLE, { ...SECOND, providedByOthers: true }] });
    await mockDriving(page, state);
    await page.goto("/dashboard/vehicles");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vehicles");
    const card = page.getByRole("link", { name: /Ford Focus/ });
    await expect(card).toContainText("AB12CDE");
    await expect(card).toContainText("Primary");
    await expect(card).toContainText("Clean air zone: may be charged");
    await expect(card).toContainText("45,262 mi est.");
    await expect(card).toContainText("MOT due");
    await expect(card).toContainText("Tax due");
    await expect(card).toContainText("London £12.50 a day");
    const other = page.getByRole("link", { name: /Vauxhall Vivaro/ });
    await expect(other).toContainText("Someone else pays");
    await expect(other).toContainText("Clean air zone: ready");
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
  });

  test("empty account sees Add your vehicle", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState({ vehicles: [] }));
    await page.goto("/dashboard/vehicles");
    await expect(page.getByText("Add your vehicle")).toBeVisible();
    await expect(page.getByText("We use it for the right mileage rate and your odometer.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add vehicle" })).toHaveAttribute("href", "/dashboard/vehicles/new");
  });

  test("free account at the 1-vehicle limit gets the Pro dialog, Pro goes to the form", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: false }) });
    await mockDriving(page, drivingState());
    await page.goto("/dashboard/vehicles");
    await page.getByRole("button", { name: "Add vehicle" }).click();
    const dialog = page.getByRole("dialog", { name: "Add more vehicles" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", /\/dashboard\/settings\/plan\?reason=vehicles/);

    const pro = await page.context().newPage();
    await mockSession(pro, { profile: profile({ isPremium: true }) });
    await mockDriving(pro, drivingState());
    await pro.goto("/dashboard/vehicles");
    await expect(pro.getByRole("link", { name: "Add vehicle" })).toHaveAttribute("href", "/dashboard/vehicles/new");
  });

  test("free limit also applies on the form: second own vehicle opens the dialog and nothing is sent", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: false }) });
    const state = drivingState();
    await mockDriving(page, state);
    await page.goto("/dashboard/vehicles/new");
    await page.getByLabel("Make").fill("Skoda");
    await page.getByLabel("Model").fill("Octavia");
    await page.getByRole("button", { name: "Add vehicle" }).click();
    await expect(page.getByRole("dialog", { name: "Add more vehicles" })).toBeVisible();
    expect(callsTo(state, "POST", "/vehicles").filter(([, p]) => p === "/vehicles")).toHaveLength(0);
  });
});

test.describe("add and edit", () => {
  test("DVLA look up fills the form, the odometer now field saves a reading, then the vehicle page opens", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const state = drivingState({ vehicles: [] });
    await mockDriving(page, state);
    await page.goto("/dashboard/vehicles/new");
    await page.getByLabel("Registration").fill("nu71 abc");
    await page.getByRole("button", { name: "Look up" }).click();
    await expect(page.getByLabel("Make")).toHaveValue("VOLKSWAGEN");
    await expect(page.getByLabel("Year")).toHaveValue("2021");
    await expect(page.getByLabel("Fuel")).toHaveValue("electric");
    await page.getByLabel("Model").fill("ID.3");
    await expect(page.getByLabel("Efficiency (miles per kWh)")).toBeVisible();
    await page.getByLabel("Odometer now (optional)").fill("12000");
    await page.getByRole("button", { name: "Add vehicle" }).click();
    await expect(page).toHaveURL(/\/dashboard\/vehicles\/22222222-2222-4222-8222-222222222222$/);
    const create = state.calls.find(([m, p]) => m === "POST" && p === "/vehicles");
    expect(create?.[2]).toMatchObject({ make: "VOLKSWAGEN", model: "ID.3", registrationPlate: "NU71ABC", fuelType: "electric", providedByOthers: false });
    const reading = callsTo(state, "POST", "/odometer-readings");
    expect(reading).toHaveLength(1);
    expect(reading[0][2]).toMatchObject({ readingMiles: 12000 });
  });

  test("edit saves with PATCH, delete asks first then calls DELETE", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({ mot: null });
    await mockDriving(page, state);
    await page.goto(`/dashboard/vehicles/${VEHICLE.id}`);
    await expect(page.getByLabel("Make")).toHaveValue("Ford");
    await page.getByLabel("Estimated MPG").fill("52.5");
    await page.getByRole("switch", { name: "Someone else pays for this vehicle" }).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible();
    const patch = callsTo(state, "PATCH", `/vehicles/${VEHICLE.id}`);
    expect(patch).toHaveLength(1);
    expect(patch[0][2]).toMatchObject({ estimatedMpg: 52.5, providedByOthers: true, registrationPlate: "AB12CDE" });

    await page.getByRole("button", { name: "Delete vehicle" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this vehicle?" });
    await expect(confirm).toBeVisible();
    expect(callsTo(state, "DELETE", `/vehicles/${VEHICLE.id}`)).toHaveLength(0);
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/dashboard\/vehicles$/);
    expect(callsTo(state, "DELETE", `/vehicles/${VEHICLE.id}`)).toHaveLength(1);
  });

  test("MOT history lists tests newest first; none gives the empty state", async ({ page }) => {
    await mockSession(page);
    const state = drivingState({
      mot: {
        registrationNumber: "AB12CDE", make: "FORD", model: "FOCUS", firstUsedDate: null, fuelType: null, primaryColour: null,
        motTests: [
          { completedDate: "2025-12-01T10:00:00.000Z", testResult: "FAILED", expiryDate: null, odometerValue: 41000, odometerUnit: "mi", motTestNumber: "1", defects: [{ text: "Tyre worn", type: "MAJOR", dangerous: false }] },
          { completedDate: "2026-03-12T10:00:00.000Z", testResult: "PASSED", expiryDate: "2027-03-11", odometerValue: 41230, odometerUnit: "mi", motTestNumber: "2", defects: [] },
        ],
      },
    });
    await mockDriving(page, state);
    await page.goto(`/dashboard/vehicles/${VEHICLE.id}`);
    const mot = page.locator("section").filter({ has: page.getByRole("heading", { name: "MOT history" }) });
    await expect(mot.getByText("Passed")).toBeVisible();
    await expect(mot.getByText("Failed")).toBeVisible();
    await expect(mot.getByText(/41,230 miles/)).toBeVisible();
    const order = await mot.locator(".mc-status").allInnerTexts();
    expect(order).toEqual(["Passed", "Failed"]);
    await expect(mot.getByText("1 note from this test")).toBeVisible();

    state.mot = null;
    await page.reload();
    await expect(page.getByText("No MOT history found")).toBeVisible();
    await expect(page.getByText("New cars don't need an MOT for 3 years.")).toBeVisible();
  });
});

test.describe("390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("vehicle list and vehicle page do not scroll sideways", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState());
    await page.goto("/dashboard/vehicles");
    await expect(page.getByRole("link", { name: /Ford Focus/ })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.goto(`/dashboard/vehicles/${VEHICLE.id}`);
    await expect(page.getByLabel("Make")).toBeVisible();
    await expect(page.getByTestId("odometer-figure")).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
