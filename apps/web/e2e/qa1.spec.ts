import { test, expect, type Page } from "@playwright/test";
import { API, mockSession, profile, type Profile } from "./fixtures/api";
import { drivingState, mockDriving, VEHICLE } from "./fixtures/driving";
import { mockTrips, newState, trip } from "./fixtures/tripsApi";
import { formatDay, fixSep } from "../src/lib/dashboard/dates";
import { shortPlaceLabel } from "../src/components/dashboard/trips/lib/placeLabel";
import { fixRangeText } from "../src/components/dashboard/tax/tax-utils";

// Live-QA round 1: dialogs, menus, titles, dates, button colour, MOT, personal mode.

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLACE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

async function openTrip(page: Page, p: Partial<Profile> = {}) {
  const state = newState({ trips: [trip({ id: ID, classification: "business" })] });
  await mockSession(page, { profile: profile(p) });
  await mockTrips(page, state);
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto(`/dashboard/trips/${ID}`);
}

test.describe("dialog and menu placement", () => {
  test("a dialog opens centred on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTrip(page);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Delete trip" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this trip?" });
    await expect(dialog).toBeVisible();
    // Centred in the visible page, not the raw window: while a dialog is open
    // the page keeps its scrollbar strip (scrollbar-gutter: stable) so nothing
    // jumps. Linux/Windows draw that strip (~15px), macOS does not, so the
    // window centre is the wrong target there. clientWidth/Height exclude it.
    await expect
      .poll(async () => {
        const b = await dialog.boundingBox();
        if (!b) return "no box";
        const view = await page.evaluate(() => ({
          w: document.documentElement.clientWidth,
          h: document.documentElement.clientHeight,
        }));
        const dx = Math.round(b.x + b.width / 2 - view.w / 2);
        const dy = Math.round(b.y + b.height / 2 - view.h / 2);
        return Math.abs(dx) < 3 && Math.abs(dy) < 6
          ? "centred"
          : `off by ${dx},${dy} (box ${JSON.stringify(b)}, page ${view.w}x${view.h})`;
      })
      .toBe("centred");
  });

  test("a dialog is a bottom sheet on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openTrip(page);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Delete trip" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this trip?" });
    await expect(dialog).toBeVisible();
    await expect
      .poll(async () => {
        const b = await dialog.boundingBox();
        return !!b && b.x < 1 && Math.abs(b.y + b.height - 800) < 3;
      })
      .toBe(true);
  });

  test("the More menu stays inside a short window", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 520 });
    await openTrip(page);
    await page.getByRole("button", { name: "More" }).click();
    const menu = page.getByRole("menu", { name: "More" });
    await expect(menu).toBeVisible();
    const b = (await menu.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(520);
    // Still open after the page scrolls.
    await page.mouse.wheel(0, 300);
    await expect(menu).toBeVisible();
  });
});

test.describe("titles", () => {
  test("a direct load of a place page says the place name and keeps the page title", async ({ page }) => {
    await mockSession(page);
    await page.route(`${API}/saved-locations/recommended-radius**`, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ data: { recommendedRadiusMeters: null, fallbackRadiusMeters: 200, sampleSize: 0 } }) })
    );
    await page.route(`${API}/saved-locations/${PLACE}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ data: { id: PLACE, userId: "u", name: "Depot North", locationType: "depot", latitude: 51.5, longitude: -0.12, radiusMeters: 200, geofenceEnabled: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } }),
      })
    );
    await page.goto(`/dashboard/places/${PLACE}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Depot North");
    await expect(page).toHaveTitle("Depot North · MileClear");
    await expect(page.getByRole("combobox").first()).not.toHaveValue("Saved spot");
    // The marketing title must not come back after the page settles.
    await page.waitForTimeout(1200);
    await expect(page).toHaveTitle("Depot North · MileClear");
  });

  test("the trip page keeps its title after a classify tap", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTrip(page);
    await expect(page).toHaveTitle(/· MileClear$/);
    await page.getByRole("group", { name: "How was this trip?" }).getByRole("button", { name: "Personal" }).click();
    await expect(page.getByText("Saved as Personal")).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page).toHaveTitle(/· MileClear$/);
    await expect(page).not.toHaveTitle(/Mileage Tracker App UK/);
  });
});

test.describe("dates and wording", () => {
  test("September is Sep, never Sept", () => {
    expect(fixSep("Thu 3 Sept 2026")).toBe("Thu 3 Sep 2026");
    expect(formatDay("2026-09-03T12:00:00Z", new Date("2026-10-09T12:00:00Z"))).not.toMatch(/Sept/);
    expect(formatDay("2026-09-03T12:00:00Z", new Date("2026-10-09T12:00:00Z"))).toMatch(/Sep/);
  });

  test("tax year ranges read from ... to", () => {
    expect(fixRangeText("No trips logged between 6 April 2025 to 5 April 2026.")).toBe("No trips logged from 6 April 2025 to 5 April 2026.");
  });

  test("a bare London is not a place name", () => {
    expect(shortPlaceLabel("London N1 1AA")).toBe("N1 1AA");
    expect(shortPlaceLabel("London, UK, N1 1AA")).toBe("N1 1AA");
    expect(shortPlaceLabel("12 Kenton Lane, London, N1 1AA")).toBe("Kenton Lane");
  });
});

test("primary buttons use dark text on amber", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSession(page);
  await page.goto("/dashboard");
  const btn = page.getByRole("link", { name: "Add a trip" }).first();
  await expect(btn).toBeVisible();
  expect(await btn.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(3, 7, 18)");
  expect(await btn.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(245, 166, 35)");
});

test.describe("MOT history", () => {
  test("a plate with no DVSA record shows a friendly message, not an error", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState());
    await page.route(`${API}/vehicles/${VEHICLE.id}/mot-history`, (r) =>
      r.fulfill({ status: 502, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "DVSA unavailable" }) })
    );
    await page.goto(`/dashboard/vehicles/${VEHICLE.id}`);
    await expect(page.getByText("No MOT history found for this vehicle")).toBeVisible();
    await expect(page.getByText("Couldn't load this")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ford Focus");
  });

  test("other errors keep the retry", async ({ page }) => {
    await mockSession(page);
    await mockDriving(page, drivingState());
    await page.route(`${API}/vehicles/${VEHICLE.id}/mot-history`, (r) =>
      r.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "Boom" }) })
    );
    await page.goto(`/dashboard/vehicles/${VEHICLE.id}`);
    await expect(page.getByRole("button", { name: /try again|retry/i }).first()).toBeVisible();
  });
});

test.describe("personal mode", () => {
  test("Home hides the manager card and weekly earnings goal in Personal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const stats = { data: { totalTrips: 5, businessMiles: 300, deductionPence: 0 } };
    for (const mode of ["personal", "work"] as const) {
      const p = await page.context().newPage();
      await p.setViewportSize({ width: 1440, height: 900 });
      await mockSession(p, { profile: profile({ workType: "employee", dashboardMode: mode }) });
      await p.route(`${API}/gamification/stats`, (r) =>
        r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(stats) })
      );
      await p.goto("/dashboard");
      await expect(p.getByRole("link", { name: "Add a trip" }).first()).toBeVisible();
      if (mode === "personal") {
        await p.waitForTimeout(800);
        await expect(p.getByText("Nominate my manager")).toHaveCount(0);
        await expect(p.getByText(/weekly (earnings )?goal/i)).toHaveCount(0);
      } else {
        await expect(p.getByText("Nominate my manager")).toBeVisible();
      }
      await p.close();
    }
  });
});

test("Personal trips offer no CAZ expense button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = newState({
    trips: [trip({ id: ID, classification: "personal" })],
    detail: { [ID]: { cleanAirZones: { compliant: false, confidence: "high", charges: [{ zoneId: "birmingham", name: "Birmingham CAZ", city: "Birmingham", chargePence: 800, url: "" }] } } },
  });
  await mockSession(page);
  await mockTrips(page, state);
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto(`/dashboard/trips/${ID}`);
  await expect(page.getByTestId("caz-notice")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log the charge" })).toHaveCount(0);
});
