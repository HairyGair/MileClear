import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { SNAPSHOT_EMPLOYEE, SNAPSHOT_EMPTY, mockTax } from "./fixtures/tax";

// Tax hub: the readiness card comes from the server, and the rows follow the driver's situation.

test.describe("Tax hub", () => {
  test("gig driver (free): estimate, workings, rows, PRO chips, no amber button", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "gig" }) });
    const calls = await mockTax(page);
    await page.goto("/dashboard/tax");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tax");
    await expect(page.getByText("You may owe about")).toBeVisible();
    await expect(page.getByText("£1,240.00").first()).toBeVisible();
    await expect(page.getByText("Put by about")).toBeVisible();
    await expect(page.getByText("£31.00")).toBeVisible();
    await expect(page.getByText(/return due 31 Jan 2028/)).toBeVisible();

    // Workings are the server's words, shown on demand.
    await page.getByText("How we worked this out").click();
    await expect(page.getByText("Business trips this tax year at the approved mileage rates.")).toBeVisible();
    await expect(page.getByText("Business trips in tax year 2026-27: 188")).toBeVisible();

    // Rows for a gig driver.
    for (const name of [/Self Assessment/, /Tax payment plan/, /First Self Assessment\?/, /Ready for 31 January\?/, /Check against HMRC's figures/, /Your accountant/]) {
      await expect(page.getByRole("link", { name }).first()).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /Mileage Allowance Relief/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Quarterly Self Assessment/ })).toHaveCount(0);
    // PRO chips for a free driver on the two Pro rows only.
    await expect(page.getByRole("link", { name: /Tax exports/ }).getByText("PRO")).toBeVisible();
    await expect(page.getByRole("link", { name: /Mileage certificate/ }).getByText("PRO")).toBeVisible();
    await expect(page.getByRole("link", { name: /Your accountant/ }).getByText("PRO")).toHaveCount(0);

    await expect(page.locator(".mc-btn--primary")).toHaveCount(0);
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);

    // The figures were requested from the server, never built from a trips page.
    expect(calls.some((c) => c.path === "/business-insights/tax-snapshot")).toBe(true);
    expect(calls.some((c) => c.path === "/trips")).toBe(false);
  });

  test("Pro drivers see no PRO chips", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "gig", isPremium: true }) });
    await mockTax(page);
    await page.goto("/dashboard/tax");
    await expect(page.getByRole("link", { name: /Tax exports/ })).toBeVisible();
    await expect(page.getByText("PRO", { exact: true })).toHaveCount(0);
  });

  test("employee: mileage claim headline, Mileage Allowance Relief, no gig rows", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "employee" }) });
    await mockTax(page, { snapshot: SNAPSHOT_EMPLOYEE });
    await page.goto("/dashboard/tax");

    await expect(page.getByText(/Your mileage claim so far, 2026-27/)).toBeVisible();
    await expect(page.getByText("You may owe about")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Mileage Allowance Relief/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tax payment plan/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /First Self Assessment\?/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Ready for 31 January\?/ })).toHaveCount(0);
  });

  test("both: gig rows and Mileage Allowance Relief", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "both" }) });
    await mockTax(page);
    await page.goto("/dashboard/tax");
    await expect(page.getByRole("link", { name: /First Self Assessment\?/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ready for 31 January\?/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Mileage Allowance Relief/ })).toBeVisible();
  });

  test("company driver: no payment plan row, and the page explains if visited", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "gig" }), team: { orgId: "o1", orgName: "Acme", role: "driver" } });
    await mockTax(page, { snapshot: SNAPSHOT_EMPLOYEE });
    await page.goto("/dashboard/tax");
    await expect(page.getByRole("link", { name: /Self Assessment/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Tax payment plan/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /First Self Assessment\?/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Ready for 31 January\?/ })).toHaveCount(0);

    await page.goto("/dashboard/tax/payment-plan");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tax payment plan");
    await expect(page.getByText("Not needed for company drivers")).toBeVisible();
    await expect(page.getByText("Your employer handles tax on your pay.")).toBeVisible();
  });

  test("no trips yet: the empty state, not £0.00", async ({ page }) => {
    await mockSession(page);
    await mockTax(page, { snapshot: SNAPSHOT_EMPTY });
    await page.goto("/dashboard/tax");
    await expect(page.getByText("Nothing to claim yet")).toBeVisible();
    await expect(page.getByText("Mark trips as Business and your tax figures show up here.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to trips" })).toBeVisible();
    await expect(page.getByText("£0.00")).toHaveCount(0);
  });

  test("quarterly row only when connected", async ({ page }) => {
    await mockSession(page);
    await mockTax(page, { hmrcStatus: { connected: true, environment: "sandbox", hasNino: true, hasBusinessId: true } });
    await page.goto("/dashboard/tax");
    await expect(page.getByRole("link", { name: /Quarterly Self Assessment/ })).toBeVisible();

    const other = await page.context().newPage();
    await mockSession(other);
    await mockTax(other, { hmrcStatus: null });
    await other.goto("/dashboard/tax");
    await expect(other.getByRole("link", { name: /Your accountant/ })).toBeVisible();
    await expect(other.getByRole("link", { name: /Quarterly Self Assessment/ })).toHaveCount(0);
  });

  test("a failed snapshot shows a retry, not zeros", async ({ page }) => {
    await mockSession(page);
    await page.route("**/business-insights/tax-snapshot", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "boom" }) })
    );
    await page.goto("/dashboard/tax");
    await expect(page.getByText("Couldn't load your tax figures")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test.describe("390px", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("hub fits the phone and rows are 44px tall at least", async ({ page }) => {
      await mockSession(page, { profile: profile({ workType: "both" }) });
      await mockTax(page);
      await page.goto("/dashboard/tax");
      await expect(page.getByText("You may owe about")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await page.getByRole("link", { name: /Tax payment plan/ }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });
  });
});
