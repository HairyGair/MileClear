import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession } from "./fixtures/api";

test("Help: search filters the topics and shows a friendly empty state", async ({ page }) => {
  await mockSession(page);
  await page.goto("/dashboard/help");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help and tutorials");
  const all = await page.locator("details").count();
  expect(all).toBeGreaterThan(20);

  await page.getByLabel("Search help").fill("55p");
  const filtered = await page.locator("details").count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(all);

  await page.getByLabel("Search help").fill("zzzz-nothing-matches");
  await expect(page.getByText("Nothing found")).toBeVisible();
  await expect(page.locator("details")).toHaveCount(0);
});

test("Help: a topic opens in place and phone topics carry the In the app tag", async ({ page }) => {
  await mockSession(page);
  await page.goto("/dashboard/help");
  const first = page.locator("details").first();
  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
  await expect(first.locator("div").first()).toBeVisible();
  await expect(page.getByText("In the app", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Tell us" }).last()).toHaveAttribute("href", "/dashboard/feedback");
});

test("Help: no banned copy, even inside closed topics", async ({ page }) => {
  await mockSession(page);
  await page.goto("/dashboard/help");
  await expect(page.locator("details").first()).toBeVisible();
  const text = (await page.locator("body").textContent()) ?? "";
  for (const banned of BANNED_COPY) expect(text, `help contains ${banned}`).not.toMatch(banned);
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("Help fits the screen", async ({ page }) => {
    await mockSession(page);
    await page.goto("/dashboard/help");
    await page.locator("details").first().locator("summary").click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
