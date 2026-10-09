import { test, expect, type Page } from "@playwright/test";
import { BANNED_COPY, mockSession, profile, type Profile } from "./fixtures/api";
import { at, calls, dayText, mockTrips, newState, trip, proposal, type TripsState } from "./fixtures/tripsApi";

// Trips list (package B): segments, filters, summary, review strip, rows, paging, empty and error states.

async function open(page: Page, state: TripsState, path = "/dashboard/trips", p: Partial<Profile> = {}) {
  const unclassified = state.trips.filter((t) => t.classification === "unclassified").length;
  const session = await mockSession(page, { profile: profile(p), unclassified });
  await mockTrips(page, state);
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto(path);
  return session;
}

const londonDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));

test.describe("list", () => {
  test("groups trips by day and shows words, platform and a note icon only when there is a note", async ({ page }) => {
    const state = newState({
      trips: [
        trip({ startedAt: at(0, "12:00"), endedAt: at(0, "12:20"), classification: "personal", distanceMiles: 3 }),
        trip({ startedAt: at(0, "08:12"), endedAt: at(0, "08:41"), platformTag: "uber", notes: "Parcel left with neighbour" }),
        trip({ startedAt: at(1, "09:00"), endedAt: at(1, "09:30"), classification: "unclassified" }),
      ],
    });
    await open(page, state);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trips");
    await expect(page.getByRole("heading", { level: 2, name: dayText(0) })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: dayText(1) })).toBeVisible();
    const rows = page.getByTestId("trip-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Personal");
    await expect(rows.nth(1)).toContainText("Business");
    await expect(rows.nth(1)).toContainText("Uber / Uber Eats");
    await expect(rows.nth(1)).toContainText("12.4 mi");
    await expect(rows.nth(1)).toContainText("Home Road");
    await expect(rows.nth(1)).toContainText("Tesco Extra");
    await expect(rows.nth(2)).toContainText("Not sorted");
    await expect(rows.nth(1).getByText("Has a note")).toHaveCount(1);
    await expect(rows.nth(0).getByText("Has a note")).toHaveCount(0);
    await expect(rows.nth(2).getByText("Has a note")).toHaveCount(0);
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
    // One amber button in the view.
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Add a trip" })).toHaveAttribute("href", "/dashboard/trips/new");
  });

  test("a row opens the trip", async ({ page }) => {
    const t = trip();
    await open(page, newState({ trips: [t] }));
    await page.getByTestId("trip-row").first().getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/trips/${t.id}$`));
  });

  test("segments change the URL and the list, and the Inbox count matches", async ({ page }) => {
    const state = newState({
      trips: [
        trip({ classification: "business", startedAt: at(0, "08:00"), endedAt: at(0, "08:20") }),
        trip({ classification: "personal", startedAt: at(0, "09:00"), endedAt: at(0, "09:20") }),
        trip({ classification: "unclassified", startedAt: at(0, "10:00"), endedAt: at(0, "10:20") }),
      ],
      missed: [proposal()],
    });
    await open(page, state);
    // 1 unsorted trip + 1 journey to check
    await expect(page.getByRole("radio", { name: /^Inbox/ })).toContainText("2");
    await page.getByRole("radio", { name: "Business" }).click();
    await expect(page).toHaveURL(/view=business/);
    await expect(page.getByTestId("trip-row")).toHaveCount(1);
    await expect(page.getByTestId("trip-row").first()).toContainText("Business");
    await page.getByRole("radio", { name: "Personal" }).click();
    await expect(page).toHaveURL(/view=personal/);
    await expect(page.getByTestId("trip-row")).toHaveCount(1);
    await expect(page.getByTestId("trip-row").first()).toContainText("Personal");
    await page.getByRole("radio", { name: "All" }).click();
    await expect(page).not.toHaveURL(/view=/);
    await expect(page.getByTestId("trip-row")).toHaveCount(3);
  });

  test("filters show chips and a summary that matches the API, and Clear filters resets", async ({ page }) => {
    const state = newState({
      trips: [
        trip({ platformTag: "uber", distanceMiles: 12.4, startedAt: at(0, "08:00"), endedAt: at(0, "08:20") }),
        trip({ platformTag: "uber", distanceMiles: 8, startedAt: at(1, "08:00"), endedAt: at(1, "08:20") }),
        trip({ platformTag: "deliveroo", distanceMiles: 5, startedAt: at(1, "11:00"), endedAt: at(1, "11:20") }),
      ],
    });
    await open(page, state);
    await expect(page.getByTestId("trip-summary")).toHaveCount(0);
    await page.getByRole("button", { name: "Filters" }).click();
    const dialog = page.getByRole("dialog", { name: "Filters" });
    await dialog.getByRole("button", { name: "Uber / Uber Eats" }).click();
    await dialog.getByRole("button", { name: "This tax year" }).click();
    await dialog.getByRole("button", { name: "Show trips" }).click();
    await expect(page).toHaveURL(/platform=uber/);
    await expect(page.getByRole("button", { name: "Remove filter Uber / Uber Eats" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove filter This tax year" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filters (2)" })).toBeVisible();
    await expect(page.getByTestId("trip-row")).toHaveCount(2);
    const summary = page.getByTestId("trip-summary");
    await expect(summary).toContainText("2");
    await expect(summary).toContainText("20.4 mi");
    // Removing one chip keeps the other.
    await page.getByRole("button", { name: "Remove filter This tax year" }).click();
    await expect(page).not.toHaveURL(/from=/);
    await expect(page).toHaveURL(/platform=uber/);
  });

  test("review strip keeps the same height when everything is sorted", async ({ page }) => {
    const state = newState({
      trips: [trip({ classification: "unclassified" }), trip({ classification: "unclassified", startedAt: at(0, "09:00") })],
      missed: [proposal()],
    });
    await open(page, state);
    const strip = page.getByTestId("review-strip");
    await expect(strip).toContainText("2 trips to classify");
    await expect(strip).toContainText("1 journey to check");
    await expect(strip.getByRole("link", { name: /Review/ })).toHaveAttribute("href", "/dashboard/trips?view=inbox");
    const before = (await strip.boundingBox())!.height;
    state.trips.forEach((t) => (t.classification = "business"));
    state.missed = [];
    await page.reload();
    await expect(strip).toContainText("All sorted");
    await expect(strip.getByRole("link", { name: /Review/ })).toHaveCount(0);
    const after = (await strip.boundingBox())!.height;
    expect(Math.abs(before - after)).toBeLessThanOrEqual(1);
  });

  test("Missing a trip you made? sends the report and shows the thanks line", async ({ page }) => {
    const state = newState({ trips: [trip()] });
    await open(page, state);
    await page.getByTestId("review-strip").getByRole("button", { name: /Missing a trip you made\?/ }).click();
    const dialog = page.getByRole("dialog", { name: "Missing a trip you made?" });
    await expect(dialog).toContainText("Tell us when and where. We check what your phone recorded and add the trip if we can.");
    await dialog.getByLabel("Anything else?").fill("Left the depot about six");
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog.getByText("Thanks. We'll look into it and email you.")).toBeVisible();
    const sent = calls(state, "POST", "/trips/report-missing");
    expect(sent).toHaveLength(1);
    const body = sent[0].body as Record<string, string>;
    expect(body.note).toContain("Left the depot about six");
    expect(body.reportedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("the odometer day line appears under a day and links to the odometer log", async ({ page }) => {
    const t = trip({ startedAt: at(0, "08:12"), endedAt: at(0, "08:41"), vehicleId: "v1" });
    const day = londonDay(t.startedAt);
    const state = newState({
      trips: [t],
      odometerDays: [{ date: day, vehicleId: "v1", opening: 45210, openingRecorded: false, closing: 45262, closingRecorded: false }],
    });
    await open(page, state);
    const line = page.getByRole("link", { name: /Odometer at the start of the day 45,210/ });
    await expect(line).toHaveText("Odometer 45,210 to 45,262 est.");
    await expect(line).toHaveAttribute("href", `/dashboard/odometer?date=${day}&vehicleId=v1`);
  });

  test("Load more adds the next page", async ({ page }) => {
    const many = Array.from({ length: 25 }, (_, i) =>
      trip({ startedAt: at(Math.floor(i / 5), `${String(8 + (i % 5)).padStart(2, "0")}:00`), endedAt: at(Math.floor(i / 5), `${String(8 + (i % 5)).padStart(2, "0")}:20`) })
    );
    await open(page, newState({ trips: many }));
    await expect(page.getByTestId("trip-row")).toHaveCount(20);
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(page.getByTestId("trip-row")).toHaveCount(25);
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
    await expect(page).toHaveURL(/page=2/);
  });

  test("undo an automatic sort puts the trip back in the Inbox", async ({ page }) => {
    const t = trip({ classification: "business", autoClassifiedAt: new Date().toISOString() });
    const state = newState({ trips: [t] });
    await open(page, state);
    const row = page.getByTestId("trip-row").first();
    await expect(row).toContainText("Sorted automatically.");
    await row.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => calls(state, "POST", `/trips/${t.id}/undo-classification`).length).toBe(1);
    await expect(page.getByTestId("trip-row").first()).toContainText("Not sorted");
    await expect(page.getByTestId("trip-row").first().getByText("Sorted automatically.")).toHaveCount(0);
  });

  test("a possible copy offers Merge and Keep both", async ({ page }) => {
    const older = trip({ startedAt: at(0, "08:00"), endedAt: at(0, "08:30") });
    const newer = trip({ startedAt: at(0, "08:05"), endedAt: at(0, "08:31"), possibleDuplicateOfId: older.id });
    const state = newState({ trips: [older, newer] });
    await open(page, state);
    const row = page.getByTestId("trip-row").filter({ hasText: "Looks like a copy" });
    await expect(row).toContainText("Looks like a copy of the trip below.");
    await row.getByRole("button", { name: "Keep both" }).click();
    await expect.poll(() => calls(state, "PATCH", `/trips/${newer.id}`).length).toBe(1);
    expect(calls(state, "PATCH", `/trips/${newer.id}`)[0].body).toEqual({ possibleDuplicateOfId: null });
    await expect(page.getByText("Looks like a copy")).toHaveCount(0);

    // And Merge, on a fresh page load.
    newer.possibleDuplicateOfId = older.id;
    await page.reload();
    await page.getByTestId("trip-row").filter({ hasText: "Looks like a copy" }).getByRole("button", { name: "Merge" }).click();
    await expect.poll(() => calls(state, "POST", "/trips/merge").length).toBe(1);
    const merge = calls(state, "POST", "/trips/merge")[0].body as { tripIds: string[]; classification: string };
    expect(merge.tripIds).toEqual([newer.id, older.id]);
    expect(merge.classification).toBe("business");
  });
});

test.describe("empty and error states", () => {
  test("no trips at all: one amber action", async ({ page }) => {
    await open(page, newState());
    await expect(page.getByRole("heading", { name: "No trips yet" })).toBeVisible();
    await expect(page.getByText("Trips record by themselves on your phone. You can also add one you made.")).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Add a trip" })).toBeVisible();
    await expect(page.getByTestId("review-strip")).toContainText("All sorted");
  });

  test("filters that match nothing offer Clear filters", async ({ page }) => {
    await open(page, newState({ trips: [trip({ platformTag: "deliveroo" })] }), "/dashboard/trips?platform=uber");
    await expect(page.getByRole("heading", { name: "No trips match" })).toBeVisible();
    await expect(page.getByText("Try other dates or clear the filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/dashboard\/trips$/);
    await expect(page.getByTestId("trip-row")).toHaveCount(1);
  });

  test("a failed load shows the error state and Try again recovers", async ({ page }) => {
    const state = newState({ trips: [trip()] });
    state.fail["GET /trips"] = 500;
    await open(page, state);
    await expect(page.getByRole("heading", { name: "Couldn't load your trips" })).toBeVisible();
    await expect(page.getByText("Check your connection and try again.")).toBeVisible();
    delete state.fail["GET /trips"];
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("trip-row")).toHaveCount(1);
  });

  test("the More menu links to projects, import and downloads", async ({ page }) => {
    await open(page, newState({ trips: [trip()] }));
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Miles by project" })).toHaveAttribute("href", "/dashboard/trips/projects");
    await expect(page.getByRole("menuitem", { name: "Import trips from CSV" })).toHaveAttribute("href", "/dashboard/trips/import");
    await expect(page.getByRole("menuitem", { name: "Download trips" })).toHaveAttribute("href", "/dashboard/tax/exports");
  });

  test("company drivers do not see the platform filter", async ({ page }) => {
    const session = await mockSession(page, { team: { orgId: "o1", orgName: "Acme", role: "driver" } });
    void session;
    await mockTrips(page, newState({ trips: [trip()] }));
    await page.goto("/dashboard/trips");
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(page.getByRole("dialog", { name: "Filters" }).getByText("Platform")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Filters" }).getByText("This tax year")).toBeVisible();
  });
});

test.describe("390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the list has no horizontal scroll and rows are two lines", async ({ page }) => {
    const state = newState({
      trips: [
        trip({ platformTag: "uber", notes: "x", startedAt: at(0, "08:12"), endedAt: at(0, "08:41"), confidence: { level: "low", reasons: [] } }),
        trip({ classification: "unclassified", startedAt: at(1, "09:00"), endedAt: at(1, "09:30"), autoClassifiedAt: null }),
      ],
    });
    await open(page, state);
    await expect(page.getByTestId("trip-row")).toHaveCount(2);
    await expect(page.getByTestId("trip-row").first()).toContainText("Check this");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("link", { name: "Add a trip" })).toBeVisible();
  });
});

test.describe("Home cards", () => {
  test("a free driver sees the Pro teaser for Recent journeys", async ({ page }) => {
    const state = newState({ trips: [trip({ startedAt: new Date(Date.now() - 3_600_000).toISOString(), endedAt: new Date(Date.now() - 3_000_000).toISOString() })] });
    await open(page, state, "/dashboard");
    const gate = page.locator("a[href='/dashboard/settings/plan?reason=journey_map']");
    await expect(gate.first()).toBeVisible();
    await expect(page.getByText("See your journeys on a map")).toBeVisible();
  });

  test("a Pro driver sees the map card and the monthly business mileage", async ({ page }) => {
    const t = trip({ startedAt: new Date(Date.now() - 3_600_000).toISOString(), endedAt: new Date(Date.now() - 3_000_000).toISOString(), distanceMiles: 12.4 });
    const coordinates = Array.from({ length: 12 }, (_, i) => ({
      lat: 51.5 + i * 0.002,
      lng: -0.12 + i * 0.002,
      speed: 10,
      accuracy: 5,
      recordedAt: new Date(Date.now() - 3_600_000 + i * 60_000).toISOString(),
    }));
    const state = newState({ trips: [t], detail: { [t.id]: { coordinates } } });
    await open(page, state, "/dashboard", { isPremium: true });
    await expect(page.getByRole("heading", { name: "Recent journeys" })).toBeVisible();
    await expect(page.locator("a[href='/dashboard/settings/plan?reason=journey_map']")).toHaveCount(0);
    await page.getByRole("button", { name: /More for you/ }).click();
    await expect(page.getByText("This month", { exact: true })).toBeVisible();
    await expect(page.getByText("12.4 mi").first()).toBeVisible();
  });

  test("no trips means no journey card", async ({ page }) => {
    await open(page, newState(), "/dashboard");
    await expect(page.getByText("Recent journeys")).toHaveCount(0);
  });
});
