import { test, expect, type Page } from "@playwright/test";
import { API, mockSession, profile } from "./fixtures/api";

// Home (Work) for a driver outside the UK (23 Oct 2026): a New Zealand driver
// sees the claim at IRD kilometre rates, in dollars; a UK driver never asks
// for it and keeps the HMRC cards.

const NZ_SUMMARY = {
  regime: "nz-ird",
  authority: "IRD",
  country: "NZ",
  currency: "NZD",
  distanceBasis: "km",
  taxYear: "2026-27",
  taxYearDescription: "1 April to 31 March",
  start: "2026-03-31T11:00:00.000Z",
  end: "2027-03-31T10:59:59.999Z",
  totalAmountMinor: 600_000,
  businessDistance: 5_000,
  totalDistance: 8_000,
  unclassifiedDistance: 120,
  ratesYear: "2025-26",
  provisional: true,
  someWithoutFigure: false,
  vehicles: [
    {
      vehicleId: "v1",
      name: "Toyota Corolla",
      fuelType: "petrol",
      businessDistance: 5_000,
      totalDistance: 8_000,
      noClaimReason: null,
      claim: {
        amountMinor: 600_000,
        currency: "NZD",
        ratesYear: "2025-26",
        provisional: true,
        tiers: [
          { label: "Tier 1", distance: 5_000, rateMinor: 120, amountMinor: 600_000 },
          { label: "Tier 2", distance: 0, rateMinor: 37, amountMinor: 0 },
        ],
      },
    },
  ],
};

async function openHome(page: Page, country: string) {
  const asked: string[] = [];
  await mockSession(page, { profile: profile({ country, countrySettingEnabled: true }) });
  await page.route(`${API}/tax/regime-summary*`, (route) => {
    asked.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ data: NZ_SUMMARY }),
    });
  });
  await page.goto("/dashboard");
  return asked;
}

test("a New Zealand driver sees the claim at IRD kilometre rates in dollars", async ({ page }) => {
  await openHome(page, "NZ");
  const card = page.locator(".mc-card", { hasText: "Your claim at IRD kilometre rates" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("$6,000.00");
  await expect(card).toContainText("5,000 km of business driving this tax year");
  await expect(card).toContainText("Using 2025-26 rates, the 2026-27 rates aren't out yet.");
  await expect(card).toContainText("120 km not yet marked Business or Personal.");
  await expect(card).not.toContainText("£");
  await expect(card).not.toContainText("HMRC");
  await card.getByText("How it's worked out").click();
  await expect(card).toContainText("Tier 1: 5,000 km at $1.20 = $6,000.00");
});

test("a UK driver never asks for it", async ({ page }) => {
  const asked = await openHome(page, "GB");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  expect(asked).toHaveLength(0);
  await expect(page.getByText("Your claim at IRD kilometre rates")).toHaveCount(0);
});
