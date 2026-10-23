import { test, expect } from "@playwright/test";
import { mockSession, profile } from "./fixtures/api";
import { mockTax } from "./fixtures/tax";

// Downloads for a New Zealand driver (23 Oct 2026): IRD's 90-day logbook as a
// PDF or CSV for one vehicle, from a chosen first day. A UK driver never sees it.

const DOWNLOADS = {
  "/exports/logbook-pdf": { status: 200, body: "%PDF-1.4 logbook", contentType: "application/pdf" },
  "/exports/logbook-csv": { status: 200, body: "Date,Time\n", contentType: "text/csv" },
};
const VEHICLES = [
  { id: "v1", make: "Toyota", model: "Aqua", isPrimary: false },
  { id: "v2", make: "Mazda", model: "Demio", isPrimary: true },
];

test("a New Zealand driver downloads the 90-day logbook for the chosen vehicle and first day", async ({ page }) => {
  await mockSession(page, { profile: profile({ isPremium: true, country: "NZ", countrySettingEnabled: true }) });
  const calls = await mockTax(page, { download: DOWNLOADS, vehicles: VEHICLES });
  await page.goto("/dashboard/tax/exports");

  const card = page.locator(".mc-card", { hasText: "90-day logbook (IRD)" });
  await expect(card).toBeVisible();
  await card.getByLabel("First day").fill("2026-06-01");
  await expect(card).toContainText("01/06/2026 to 29/08/2026");

  const [pdf] = await Promise.all([page.waitForEvent("download"), card.getByRole("button", { name: "Download: Logbook (PDF)" }).click()]);
  expect(pdf.suggestedFilename()).toBe("mileclear-logbook-2026-06-01-to-2026-08-29.pdf");
  const asked = calls.find((c) => c.path === "/exports/logbook-pdf");
  expect(asked?.search).toContain("from=2026-06-01");
  expect(asked?.search).toContain("to=2026-08-29");
  // The main vehicle unless another is chosen.
  expect(asked?.search).toContain("vehicleId=v2");

  await card.getByLabel("Vehicle").selectOption("v1");
  const [csv] = await Promise.all([page.waitForEvent("download"), card.getByRole("button", { name: "Download: Logbook (CSV)" }).click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  expect(calls.find((c) => c.path === "/exports/logbook-csv")?.search).toContain("vehicleId=v1");
  await expect(card).not.toContainText("HMRC");
});

test("a first day whose 90 days aren't over yet can't be downloaded", async ({ page }) => {
  await mockSession(page, { profile: profile({ isPremium: true, country: "NZ", countrySettingEnabled: true }) });
  await mockTax(page, { download: DOWNLOADS, vehicles: VEHICLES });
  await page.goto("/dashboard/tax/exports");
  const card = page.locator(".mc-card", { hasText: "90-day logbook (IRD)" });
  await card.getByLabel("First day").fill("2099-01-01");
  await expect(card).toContainText("has to end by yesterday");
  await expect(card.getByRole("button", { name: "Download: Logbook (PDF)" })).toBeDisabled();
});

test("a UK driver never sees the logbook", async ({ page }) => {
  await mockSession(page, { profile: profile({ isPremium: true, country: "GB", countrySettingEnabled: true }) });
  await mockTax(page, { download: DOWNLOADS, vehicles: VEHICLES });
  await page.goto("/dashboard/tax/exports");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tax exports");
  await expect(page.getByText("90-day logbook (IRD)")).toHaveCount(0);
});
