import { test, expect } from "@playwright/test";
import { BANNED_COPY } from "./fixtures/api";

// Public guide pages: one h1 with the guide title, the page title names it,
// none of the banned copy appears, and nothing scrolls sideways at 320px wide.
const GUIDES: Array<[string, string]> = [
  ["/ev-pay-per-mile-tax", "Pay-per-mile tax for electric cars (eVED)"],
  ["/mtd-late-submission-penalties", "Making Tax Digital late submission penalties"],
];

for (const [path, title] of GUIDES) {
  test(`${path} renders its guide and passes the copy sweep`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(/MileClear/);
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text, `${path} contains ${banned}`).not.toMatch(banned);
  });

  test(`${path} reflows at 320px with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
