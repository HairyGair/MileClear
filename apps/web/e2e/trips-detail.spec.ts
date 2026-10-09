import { test, expect, type Page } from "@playwright/test";
import { BANNED_COPY, mockSession, profile, type Profile } from "./fixtures/api";
import { at, calls, mockTrips, newState, trip, type TripsState } from "./fixtures/tripsApi";

// Trip summary, edit, add, merge, split, projects and import (package B).

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function open(page: Page, state: TripsState, path: string, p: Partial<Profile> = {}) {
  const session = await mockSession(page, { profile: profile(p), unclassified: state.trips.filter((t) => t.classification === "unclassified").length });
  await mockTrips(page, state);
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto(path);
  return session;
}

function route(n = 14) {
  return Array.from({ length: n }, (_, i) => ({
    lat: 51.5 + i * 0.002,
    lng: -0.12 + i * 0.002,
    speed: 8,
    accuracy: 5,
    recordedAt: new Date(Date.now() - 3_600_000 + i * 60_000).toISOString(),
  }));
}

const yesterdayYmd = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test.describe("summary", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("shows the route facts and one tap saves Personal with a toast", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID, classification: "unclassified", platformTag: null })] });
    await open(page, state, `/dashboard/trips/${ID}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home Road to Tesco Extra");
    await expect(page).toHaveTitle("Home Road to Tesco Extra · MileClear");
    await expect(page.getByTestId("trip-facts")).toContainText("12.4 mi");
    await expect(page.getByText("No route recorded for this trip")).toBeVisible();
    const how = page.getByRole("group", { name: "How was this trip?" });
    await expect(how.getByRole("button", { name: "Business" })).toHaveAttribute("aria-pressed", "false");
    await how.getByRole("button", { name: "Personal" }).click();
    await expect(page.getByText("Saved as Personal")).toBeVisible();
    await expect(how.getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "true");
    expect(calls(state, "PATCH", `/trips/${ID}`)[0].body).toEqual({ classification: "personal" });
    // Personal trips get categories, not platforms.
    await expect(page.getByRole("group", { name: "Category" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Platform" })).toHaveCount(0);
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
  });

  test("a business trip offers platform chips that save on tap", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID })] });
    await open(page, state, `/dashboard/trips/${ID}`);
    await page.getByRole("group", { name: "Platform" }).getByRole("button", { name: "Uber / Uber Eats" }).click();
    await expect.poll(() => calls(state, "PATCH", `/trips/${ID}`).length).toBe(1);
    expect(calls(state, "PATCH", `/trips/${ID}`)[0].body).toEqual({ platformTag: "uber" });
  });

  test("a failed one-tap change goes back and says so", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID, classification: "business" })] });
    state.fail[`PATCH /trips/${ID}`] = 500;
    await open(page, state, `/dashboard/trips/${ID}`);
    const how = page.getByRole("group", { name: "How was this trip?" });
    await how.getByRole("button", { name: "Personal" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /./ }).first()).toBeVisible();
    await expect(how.getByRole("button", { name: "Business" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a company driver has no platform row", async ({ page }) => {
    await mockSession(page, { team: { orgId: "o1", orgName: "Acme", role: "driver" } });
    await mockTrips(page, newState({ trips: [trip({ id: ID })] }));
    await page.goto(`/dashboard/trips/${ID}`);
    await expect(page.getByRole("group", { name: "How was this trip?" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Platform" })).toHaveCount(0);
  });

  test("the merge notice merges the pair and opens the new trip", async ({ page }) => {
    const state = newState({
      trips: [trip({ id: ID }), trip({ id: OTHER, startedAt: at(0, "08:44"), endedAt: at(0, "09:00") })],
      detail: { [ID]: { mergeSuggestion: { otherTripId: OTHER, direction: "after", gapMinutes: 3, gapMeters: 20 } } },
    });
    await open(page, state, `/dashboard/trips/${ID}`);
    await expect(page.getByTestId("merge-notice")).toContainText("Next trip started 3 min later at the same place.");
    await page.getByRole("button", { name: "Merge with it" }).click();
    await expect(page).toHaveURL(/\/dashboard\/trips\/22222222-2222-4222-8222-222222222222$/);
    const m = calls(state, "POST", "/trips/merge")[0].body as { tripIds: string[]; classification: string };
    expect(m.tripIds).toEqual([ID, OTHER]);
    expect(m.classification).toBe("business");
  });

  test("a clean air zone charge can be logged as an expense", async ({ page }) => {
    const state = newState({
      trips: [trip({ id: ID })],
      detail: {
        [ID]: {
          cleanAirZones: { compliant: false, confidence: "high", charges: [{ zoneId: "birmingham", name: "Birmingham CAZ", city: "Birmingham", chargePence: 800, url: "" }] },
        },
      },
    });
    await open(page, state, `/dashboard/trips/${ID}`);
    const caz = page.getByTestId("caz-notice");
    await expect(caz).toContainText("You drove through Birmingham CAZ. Charge £8.00.");
    await expect(caz.getByRole("button", { name: "Mark paid" })).toHaveCount(0); // Pro only
    await caz.getByRole("button", { name: "Log the charge" }).click();
    await expect(caz.getByRole("button", { name: "Charge logged" })).toBeDisabled();
    const exp = calls(state, "POST", "/expenses")[0].body as Record<string, unknown>;
    expect(exp.category).toBe("congestion");
    expect(exp.amountPence).toBe(800);
    expect(exp.vendor).toBe("Birmingham CAZ");
  });

  test("Pro drivers can mark a clean air zone charge paid", async ({ page }) => {
    const state = newState({
      trips: [trip({ id: ID })],
      detail: {
        [ID]: { cleanAirZones: { compliant: false, confidence: "high", charges: [{ zoneId: "bristol", name: "Bristol CAZ", city: "Bristol", chargePence: 900, url: "" }] } },
      },
    });
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockTrips(page, state);
    await page.goto(`/dashboard/trips/${ID}`);
    await page.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByRole("button", { name: "Paid" })).toBeDisabled();
    expect(calls(state, "POST", `/ticket-defender/caz-charges/${ID}/paid`)[0].body).toEqual({ zoneId: "bristol", paid: true });
  });

  test("recalculate asks first, then updates the miles", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID })] });
    await open(page, state, `/dashboard/trips/${ID}`);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Recalculate distance" }).click();
    const dialog = page.getByRole("dialog", { name: "Recalculate distance?" });
    await expect(dialog).toContainText("Work out the distance again from the route? Your current figure is 12.4 mi.");
    expect(calls(state, "POST", `/trips/${ID}/recalc`)).toHaveLength(0);
    await dialog.getByRole("button", { name: "Recalculate" }).click();
    await expect(page.getByText("Distance is now 14.2 mi")).toBeVisible();
    expect(calls(state, "POST", `/trips/${ID}/recalc`)).toHaveLength(1);
  });

  test("delete asks first, removes the trip and goes back to the list", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID })] });
    await open(page, state, `/dashboard/trips/${ID}`);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Delete trip" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this trip?" });
    await expect(dialog).toContainText("It goes from your records and any totals. This can't be undone.");
    expect(calls(state, "DELETE", `/trips/${ID}`)).toHaveLength(0);
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/dashboard\/trips$/);
    expect(calls(state, "DELETE", `/trips/${ID}`)).toHaveLength(1);
  });

  test("More lists split only for recorded trips and links to new trips from here", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID, isManualEntry: true }), trip({ id: OTHER })] });
    await open(page, state, `/dashboard/trips/${ID}`);
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Split this trip" })).toHaveCount(0);
    const from = await page.getByRole("menuitem", { name: "New trip from here" }).getAttribute("href");
    expect(from).toContain("/dashboard/trips/new?fromLat=51.5");
    await page.keyboard.press("Escape");
    await page.goto(`/dashboard/trips/${OTHER}`);
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Split this trip" })).toHaveAttribute("href", `/dashboard/trips/${OTHER}/split`);
  });

  test("speed and stops appear for a recorded route", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID })], detail: { [ID]: { coordinates: route() } } });
    await open(page, state, `/dashboard/trips/${ID}`);
    await page.getByRole("button", { name: "Speed and stops" }).click();
    await expect(page.getByRole("img", { name: /Speed over the trip/ })).toBeVisible();
  });

  test("a trip that is gone shows Trip not found", async ({ page }) => {
    await open(page, newState(), `/dashboard/trips/${ID}`);
    await expect(page.getByRole("heading", { name: "Trip not found" })).toBeVisible();
    await expect(page.getByText("It may have been deleted or merged.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to trips" })).toHaveAttribute("href", "/dashboard/trips");
  });

  test("a load failure offers Try again", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID })] });
    state.fail[`GET /trips/${ID}`] = 500;
    await open(page, state, `/dashboard/trips/${ID}`);
    await expect(page.getByRole("heading", { name: "Couldn't load this trip" })).toBeVisible();
    delete state.fail[`GET /trips/${ID}`];
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("trip-facts")).toBeVisible();
  });
});

test.describe("summary at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("stacks with no horizontal scroll", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID, notes: "A long note that should wrap and never push the page wider than the phone screen allows" })], detail: { [ID]: { coordinates: route() } } });
    await open(page, state, `/dashboard/trips/${ID}`);
    await expect(page.getByTestId("trip-facts")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("add a trip", () => {
  test("validation: nothing is sent until the form is right", async ({ page }) => {
    const state = newState();
    await open(page, state, "/dashboard/trips/new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add a trip");
    await page.getByRole("button", { name: "Save trip" }).click();
    for (const msg of [
      "Add where the trip started.",
      "Add where the trip ended.",
      "Add the start time.",
      "Add the end time.",
      "Add the distance in miles.",
      "Choose Business or Personal.",
    ]) {
      await expect(page.getByText(msg).first()).toBeVisible();
    }
    expect(calls(state, "POST", "/trips")).toHaveLength(0);
    // End before start
    await page.getByLabel("Start time").fill("10:00");
    await page.getByLabel("End time").fill("09:00");
    await page.getByLabel("Date").fill(yesterdayYmd());
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page.getByText("End time can't be before the start time.")).toBeVisible();
    expect(calls(state, "POST", "/trips")).toHaveLength(0);
  });

  test("pick places from our API, measure by road, warn on odometer, then save", async ({ page }) => {
    const state = newState();
    const session = await open(page, state, "/dashboard/trips/new");
    await page.getByRole("combobox", { name: "From" }).fill("SW1A 2AA");
    await page.getByRole("option", { name: /10 Downing Street/ }).click();
    await page.getByRole("combobox", { name: "To" }).fill("SW1A 1AA");
    await page.getByRole("option", { name: /10 Downing Street/ }).click();
    await expect(page.getByText("12.4 mi")).toBeVisible();
    await expect(page.getByText("by road")).toBeVisible();

    await page.getByLabel("Date").fill(yesterdayYmd());
    await page.getByLabel("Start time").fill("09:00");
    await page.getByLabel("End time").fill("09:30");
    await page.getByRole("group", { name: "Business or personal" }).getByRole("button", { name: "Business" }).click();
    await page.getByRole("group", { name: "Platform" }).getByRole("button", { name: "Deliveroo" }).click();
    await page.getByLabel("Odometer at the start").fill("1000");
    await page.getByLabel("Odometer at the end").fill("1030");
    await expect(page.getByText("Your odometer difference is 30 mi but the trip measures 12.4 mi. Check the readings.")).toBeVisible();

    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page).toHaveURL(/\/dashboard\/trips\/11111111-1111-4111-8111-111111111111$/);
    const body = calls(state, "POST", "/trips")[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      startLat: 51.5034,
      endLat: 51.5034,
      distanceMiles: 12.4,
      classification: "business",
      platformTag: "deliveroo",
      odometerStart: 1000,
      odometerEnd: 1030,
      vehicleId: "v1",
    });
    expect(new Date(body.endedAt as string).getTime()).toBeGreaterThan(new Date(body.startedAt as string).getTime());
    // Geocoding and routing only ever go through our API.
    for (const host of session.hosts) expect(host).not.toMatch(/postcodes\.io|nominatim|unpkg\.com/);
  });

  test("typed text with no pin is accepted and the distance is typed", async ({ page }) => {
    const state = newState();
    await open(page, state, "/dashboard/trips/new");
    await page.getByRole("combobox", { name: "From" }).fill("My yard");
    await page.getByRole("combobox", { name: "To" }).fill("Customer site");
    await page.getByRole("button", { name: "Type it instead" }).click();
    await page.getByLabel("Distance").fill("7.5");
    await page.getByLabel("Date").fill(yesterdayYmd());
    await page.getByLabel("Start time").fill("09:00");
    await page.getByLabel("End time").fill("09:20");
    await page.getByRole("group", { name: "Business or personal" }).getByRole("button", { name: "Personal" }).click();
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page).toHaveURL(/\/dashboard\/trips\/1111/);
    const body = calls(state, "POST", "/trips")[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ startLat: 0, startLng: 0, startAddress: "My yard", endAddress: "Customer site", distanceMiles: 7.5, classification: "personal" });
    expect(body.endLat).toBeUndefined();
  });

  test("a journey to check prefills the form and is marked added after saving", async ({ page }) => {
    const state = newState();
    const q = new URLSearchParams({
      missedId: "p-9",
      fromLat: "51.5",
      fromLng: "-0.12",
      fromAddress: "Depot Way, London",
      toLat: "51.6",
      toLng: "-0.2",
      toAddress: "Station Road, Watford",
      start: at(1, "07:07"),
      end: at(1, "07:40"),
      windowStart: at(1, "07:07"),
      windowEnd: at(1, "17:30"),
      gap: "1",
    });
    await open(page, state, `/dashboard/trips/new?${q}`);
    await expect(page.getByRole("combobox", { name: "From" })).toHaveValue("Depot Way, London");
    await expect(page.getByRole("combobox", { name: "To" })).toHaveValue("Station Road, Watford");
    await expect(page.getByText(/We think this journey happened sometime between/)).toBeVisible();
    await expect(page.getByText("12.4 mi")).toBeVisible();
    await page.getByRole("group", { name: "Business or personal" }).getByRole("button", { name: "Business" }).click();
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page).toHaveURL(/\/dashboard\/trips\/1111/);
    await expect.poll(() => calls(state, "POST", "/trips/missed-journeys/p-9/resolve").length).toBe(1);
    const r = calls(state, "POST", "/trips/missed-journeys/p-9/resolve")[0].body as Record<string, string>;
    expect(r.action).toBe("accept");
    expect(r.startedAt).toBeTruthy();
  });

  test("a server message shows inline and keeps the form", async ({ page }) => {
    const state = newState();
    state.fail["POST /trips"] = 400;
    await open(page, state, "/dashboard/trips/new");
    await page.getByRole("combobox", { name: "From" }).fill("A");
    await page.getByRole("combobox", { name: "To" }).fill("B");
    await page.getByRole("button", { name: "Type it instead" }).click();
    await page.getByLabel("Distance").fill("3");
    await page.getByLabel("Date").fill(yesterdayYmd());
    await page.getByLabel("Start time").fill("09:00");
    await page.getByLabel("End time").fill("09:10");
    await page.getByRole("group", { name: "Business or personal" }).getByRole("button", { name: "Personal" }).click();
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Something went wrong on our side" })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/trips\/new/);
  });

  test.describe("390px", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("fits the phone", async ({ page }) => {
      await open(page, newState(), "/dashboard/trips/new");
      await expect(page.getByRole("button", { name: "Save trip" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});

test.describe("edit a trip", () => {
  test("loads the trip and sends only what changed", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID, notes: null })] });
    await open(page, state, `/dashboard/trips/${ID}/edit`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit trip");
    await expect(page.getByRole("combobox", { name: "From" })).toHaveValue("1 Home Road, London, N1 1AA");
    await expect(page.getByLabel("Distance")).toHaveValue("12.4");
    await page.getByLabel("Notes").fill("Added a note");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/trips/${ID}$`));
    expect(calls(state, "PATCH", `/trips/${ID}`)[0].body).toEqual({ notes: "Added a note" });
  });

  test("a missing trip says so", async ({ page }) => {
    await open(page, newState(), `/dashboard/trips/${ID}/edit`);
    await expect(page.getByRole("heading", { name: "Trip not found" })).toBeVisible();
  });
});

test.describe("split", () => {
  const stops = [
    { cutIndex: 10, timestamp: at(0, "09:02"), lat: 51.51, lng: -0.11, dwellSec: 840 },
    { cutIndex: 20, timestamp: at(0, "09:30"), lat: 51.52, lng: -0.1, dwellSec: 300 },
  ];

  test("suggests stops, splits at the ones kept and goes back to the list", async ({ page }) => {
    const state = newState({ trips: [trip({ id: ID })], splitSuggestions: { [ID]: stops } });
    await open(page, state, `/dashboard/trips/${ID}/split`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Split trip");
    await expect(page.getByText("Stopped 14 min")).toBeVisible();
    await expect(page.getByRole("button", { name: "Split into 3 trips" })).toBeVisible();
    await page.getByLabel(/Stopped 5 min/).uncheck();
    const go = page.getByRole("button", { name: "Split into 2 trips" });
    await go.click();
    const dialog = page.getByRole("dialog", { name: "Split into 2 trips?" });
    await dialog.getByRole("button", { name: "Split" }).click();
    await expect(page).toHaveURL(/\/dashboard\/trips$/);
    expect(calls(state, "POST", `/trips/${ID}/split`)[0].body).toEqual({ cutTimestamps: [stops[0].timestamp] });
  });

  test("no stops shows the empty state", async ({ page }) => {
    await open(page, newState({ trips: [trip({ id: ID })] }), `/dashboard/trips/${ID}/split`);
    await expect(page.getByRole("heading", { name: "No stops to split at" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to trip" })).toHaveAttribute("href", `/dashboard/trips/${ID}`);
  });
});

test.describe("miles by project", () => {
  test("lists projects with miles and deduction", async ({ page }) => {
    const state = newState({
      projectTotals: {
        taxYear: "2026-27",
        projects: [
          { label: "Acme refit", trips: 4, miles: 120.5, valuePence: 6628 },
          { label: null, trips: 2, miles: 20, valuePence: 1100 },
        ],
        totals: { trips: 6, miles: 140.5, valuePence: 7728 },
        labels: ["Acme refit"],
      },
    });
    await open(page, state, "/dashboard/trips/projects");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Miles by project");
    await expect(page.getByRole("row", { name: /Acme refit/ })).toContainText("120.5 mi");
    await expect(page.getByRole("row", { name: /Acme refit/ })).toContainText("£66.28");
    await expect(page.getByRole("row", { name: /No project/ })).toBeVisible();
  });

  test("no projects shows the empty state", async ({ page }) => {
    await open(page, newState(), "/dashboard/trips/projects");
    await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
    await expect(page.getByText("Add a project name to a trip and its miles add up here.")).toBeVisible();
  });
});

test.describe("import trips", () => {
  test("previews the file and imports on confirm", async ({ page }) => {
    const state = newState({
      importPreview: {
        detectedSource: "MileIQ",
        columns: {},
        convertedFromKm: false,
        totalRows: 3,
        totalMiles: 40.2,
        duplicateCount: 1,
        errors: [{ line: 5, reason: "No date" }],
        rows: [
          { date: "2026-09-01", startTime: null, endTime: null, from: "A", to: "B", distanceMiles: 10, classification: "business", purpose: null, isDuplicate: false },
          { date: "2026-09-02", startTime: null, endTime: null, from: "B", to: "C", distanceMiles: 20.5, classification: "personal", purpose: null, isDuplicate: false },
          { date: "2026-09-03", startTime: null, endTime: null, from: "C", to: "D", distanceMiles: 9.7, classification: "business", purpose: null, isDuplicate: true },
        ],
      },
    });
    await open(page, state, "/dashboard/trips/import");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Import trips");
    await page.getByLabel("Choose a CSV file of trips").setInputFiles({ name: "trips.csv", mimeType: "text/csv", buffer: Buffer.from("date,from,to,miles\n2026-09-01,A,B,10\n") });
    await expect(page.getByText("from MileIQ")).toBeVisible();
    await expect(page.getByText("1 row could not be read")).toBeVisible();
    await expect(page.getByText("Already added")).toBeVisible();
    expect((calls(state, "POST", "/trips/import/preview")[0].body as { csvContent: string }).csvContent).toContain("2026-09-01");
    await page.getByRole("button", { name: "Import 2 trips" }).click();
    await expect(page.getByText("2 trips", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sort your imported trips" })).toBeVisible();
    expect((calls(state, "POST", "/trips/import/confirm")[0].body as { rows: unknown[] }).rows).toHaveLength(3);
  });

  test("a file that cannot be read shows the message", async ({ page }) => {
    const state = newState();
    state.fail["POST /trips/import/preview"] = 400;
    await open(page, state, "/dashboard/trips/import");
    await page.getByLabel("Choose a CSV file of trips").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("nope") });
    await expect(page.locator(".mc-formerror")).toBeVisible();
  });
});
