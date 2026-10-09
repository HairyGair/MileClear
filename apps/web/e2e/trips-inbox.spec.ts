import { test, expect, type Page } from "@playwright/test";
import { mockSession, profile } from "./fixtures/api";
import { at, calls, mockTrips, newState, proposal, trip, type TripsState } from "./fixtures/tripsApi";

// Inbox view (package B): grouped batch classify, suggestions, missed journeys.

async function open(page: Page, state: TripsState) {
  await mockSession(page, { profile: profile(), unclassified: state.trips.filter((t) => t.classification === "unclassified").length });
  await mockTrips(page, state);
  await page.goto("/dashboard/trips?view=inbox");
}

const sameRoute = (n: number, over = {}) =>
  Array.from({ length: n }, (_, i) =>
    trip({
      classification: "unclassified",
      startedAt: at(i, "08:00"),
      endedAt: at(i, "08:25"),
      startLat: 51.5 + i * 0.0003,
      startLng: -0.12,
      endLat: 51.52,
      endLng: -0.1 + i * 0.0003,
      ...over,
    })
  );

test("same-route trips are grouped and one tap sorts the whole group", async ({ page }) => {
  const group = sameRoute(3, {
    suggestion: { classification: "business", platformTag: null, businessPurpose: null, category: null, confidence: 80, matchCount: 5 },
  });
  const other = trip({
    classification: "unclassified",
    startedAt: at(0, "17:00"),
    endedAt: at(0, "17:20"),
    startLat: 52.2,
    startLng: -1.5,
    endLat: 52.3,
    endLng: -1.4,
    startAddress: "9 Depot Lane, Coventry, CV1 1AA",
    endAddress: "Retail Park, Coventry, CV2 2BB",
    distanceMiles: 4.2,
  });
  const state = newState({ trips: [...group, other] });
  await open(page, state);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trips");
  const groups = page.getByTestId("route-group");
  await expect(groups).toHaveCount(2);
  const first = groups.filter({ hasText: "Home Road" });
  await expect(first).toContainText("3 trips, 37.2 mi");
  await expect(first).toContainText("Last time you made this trip it was Business.");
  await expect(page.getByRole("radio", { name: /^Inbox/ })).toContainText("4");

  await first.getByRole("button", { name: "Business", exact: true }).click();
  await expect(page.getByText("Saved as Business")).toBeVisible();
  await expect(groups).toHaveCount(1);
  const patches = calls(state, "PATCH", /^\/trips\/[0-9a-f-]{36}$/);
  expect(patches).toHaveLength(3);
  for (const p of patches) expect(p.body).toEqual({ classification: "business" });
  // The badge on the Inbox segment drops with it.
  await expect(page.getByRole("radio", { name: /^Inbox/ })).toContainText("1");
});

test("a group can be sorted trip by trip", async ({ page }) => {
  const state = newState({ trips: sameRoute(2) });
  await open(page, state);
  const g = page.getByTestId("route-group");
  await g.getByRole("button", { name: "Show trips" }).click();
  const lines = g.locator(".mc-routegroup__tripline");
  await expect(lines).toHaveCount(2);
  await lines.first().getByRole("button", { name: "Personal" }).click();
  await expect.poll(() => calls(state, "PATCH", /^\/trips\//).length).toBe(1);
  expect(calls(state, "PATCH", /^\/trips\//)[0].body).toEqual({ classification: "personal" });
  await expect(lines).toHaveCount(1);
});

test("a failed sort shows the message and keeps the group", async ({ page }) => {
  const trips = sameRoute(2);
  const state = newState({ trips });
  state.fail[`PATCH /trips/${trips[0].id}`] = 500;
  await open(page, state);
  const g = page.getByTestId("route-group");
  await g.getByRole("button", { name: "Business", exact: true }).click();
  await expect(g.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("route-group")).toHaveCount(1);
});

test("journeys to check: Add trip opens the prefilled form, Not a trip dismisses", async ({ page }) => {
  const gap = proposal({ id: "gap-1" });
  const start = proposal({ id: "start-1", source: "trip_start", fromAddress: "Yard, Leeds", toAddress: "Mill Road, Leeds", estimatedMiles: 1.1 });
  const state = newState({ missed: [gap, start] });
  await open(page, state);

  await expect(page.getByRole("heading", { name: "Journeys to check" })).toBeVisible();
  const cards = page.getByTestId("missed-journey");
  await expect(cards).toHaveCount(2);
  const gapCard = cards.filter({ hasText: "Depot Way" });
  await expect(gapCard).toContainText("Sometime between");
  await expect(gapCard).toContainText("Station Road");
  const add = gapCard.getByRole("link", { name: "Add trip" });
  const href = (await add.getAttribute("href"))!;
  expect(href).toContain("/dashboard/trips/new?missedId=gap-1");
  expect(href).toContain("gap=1");
  expect(href).toContain("fromAddress=Depot+Way%2C+London");

  const startCard = cards.filter({ hasText: "Yard" });
  await expect(startCard.getByRole("link", { name: "Add trip" })).toHaveCount(0);
  await startCard.getByRole("button", { name: "Add to the next trip" }).click();
  await expect(cards).toHaveCount(1);
  expect(calls(state, "POST", "/trips/missed-journeys/start-1/resolve")[0].body).toEqual({ action: "extend" });

  await gapCard.getByRole("button", { name: "Not a trip" }).click();
  await expect.poll(() => calls(state, "POST", "/trips/missed-journeys/gap-1/resolve").length).toBe(1);
  expect(calls(state, "POST", "/trips/missed-journeys/gap-1/resolve")[0].body).toEqual({ action: "dismiss" });
  await expect(page.getByRole("heading", { name: "All sorted" })).toBeVisible();
});

test("nothing waiting shows All sorted", async ({ page }) => {
  await open(page, newState({ trips: [trip({ classification: "business" })] }));
  await expect(page.getByRole("heading", { name: "All sorted" })).toBeVisible();
  await expect(page.getByText("Nothing waiting. New trips land here until you mark them Business or Personal.")).toBeVisible();
});

test("an unsorted-trips failure shows the error state", async ({ page }) => {
  const state = newState({ trips: sameRoute(1) });
  state.fail["GET /trips"] = 500;
  await open(page, state);
  await expect(page.getByRole("heading", { name: "Couldn't load your trips" })).toBeVisible();
});

test.describe("390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the Inbox fits the phone", async ({ page }) => {
    const state = newState({ trips: sameRoute(3), missed: [proposal()] });
    await open(page, state);
    await expect(page.getByTestId("route-group")).toHaveCount(1);
    await expect(page.getByTestId("missed-journey")).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
