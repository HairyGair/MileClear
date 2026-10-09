import { test, expect } from "@playwright/test";
import { mockSession, profile } from "./fixtures/api";

test("signed-out visitors go to /login and keep ?next", async ({ page }) => {
  await page.goto("/dashboard/trips?view=inbox");
  await expect(page).toHaveURL(/\/login\?next=/);
  const next = new URL(page.url()).searchParams.get("next");
  expect(next).toBe("/dashboard/trips?view=inbox");
});

test.describe("desktop 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("rail shows four items in Work mode and the page title", async ({ page }) => {
    await mockSession(page);
    await page.goto("/dashboard");
    const rail = page.getByRole("navigation", { name: "Main" }).first();
    await expect(rail.getByRole("link", { name: /^Home/ })).toBeVisible();
    await expect(rail.getByRole("link", { name: /^Trips/ })).toBeVisible();
    await expect(rail.getByRole("link", { name: /^Tax/ })).toBeVisible();
    await expect(rail.getByRole("link", { name: /^More/ })).toBeVisible();
    await expect(rail.getByRole("link")).toHaveCount(5); // four items plus the wordmark
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sam");
    await expect(page.getByRole("link", { name: "Trips, 3 to classify" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });

  test("Personal mode swaps Tax for Insights", async ({ page }) => {
    await mockSession(page, { profile: profile({ dashboardMode: "personal" }) });
    await page.goto("/dashboard");
    const rail = page.getByRole("navigation", { name: "Main" }).first();
    await expect(rail.getByRole("link", { name: /^Insights/ })).toBeVisible();
    await expect(rail.getByRole("link", { name: /^Tax/ })).toHaveCount(0);
  });

  test("Both mode shows the toggle on Home and remembers the choice", async ({ page }) => {
    await mockSession(page, { profile: profile({ dashboardMode: "both" }) });
    await page.goto("/dashboard");
    const rail = page.getByRole("navigation", { name: "Main" }).first();
    await expect(rail.getByRole("link", { name: /^Tax/ })).toBeVisible();
    await page.getByRole("radio", { name: "Personal" }).click();
    await expect(rail.getByRole("link", { name: /^Insights/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: /^Insights/ })).toBeVisible();
  });

  test("admins get Admin in the rail", async ({ page }) => {
    await mockSession(page, { profile: profile({ isAdmin: true }) });
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Admin" })).toBeVisible();
  });

  test("navigation works and More highlights for pages reached from it", async ({ page }) => {
    await mockSession(page);
    await page.goto("/dashboard");
    const rail = page.getByRole("navigation", { name: "Main" }).first();
    await rail.getByRole("link", { name: /^More/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/more$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("More");
    await page.getByRole("link", { name: /Vehicles/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/vehicles/);
    await expect(rail.getByRole("link", { name: /^More/ })).toHaveAttribute("aria-current", "page");
  });

  test("profile menu opens, traps Tab and closes with Escape", async ({ page }) => {
    await mockSession(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Your account" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText(["Your profile", "Your plan", "Settings", "Get the app", "Log out"]);
    for (let i = 0; i < 7; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="menu"]'))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Your account" })).toBeFocused();
  });
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("bottom tab bar replaces the rail and nothing scrolls sideways", async ({ page }) => {
    await mockSession(page);
    await page.goto("/dashboard");
    const bar = page.locator("nav.mc-tabbar");
    await expect(bar).toBeVisible();
    await expect(page.locator("nav.mc-rail")).toBeHidden();
    await expect(bar.getByRole("link")).toHaveCount(4);
    await bar.getByRole("link", { name: /^More/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/more$/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("badge reads 9+ above nine", async ({ page }) => {
    await mockSession(page, { unclassified: 14 });
    await page.goto("/dashboard");
    await expect(page.locator("nav.mc-tabbar .mc-tabbar__badge")).toHaveText("9+");
  });
});
