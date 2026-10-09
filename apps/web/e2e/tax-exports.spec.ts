import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { CERT_ONE, mockTax } from "./fixtures/tax";

const DOWNLOADS = {
  "/exports/self-assessment": { status: 200, body: "%PDF-1.4 sa", contentType: "application/pdf" },
  "/exports/pdf": { status: 200, body: "%PDF-1.4 trips", contentType: "application/pdf" },
  "/exports/csv": { status: 200, body: "date,miles\n", contentType: "text/csv" },
  "/exports/odometer-log": { status: 200, body: "day,start,end\n", contentType: "text/csv" },
};

test.describe("Tax exports", () => {
  test("free: the whole page is a Pro gate with teaser rows", async ({ page }) => {
    await mockSession(page);
    const calls = await mockTax(page);
    await page.goto("/dashboard/tax/exports");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tax exports");
    await expect(page.getByRole("heading", { name: "Download your records" })).toBeVisible();
    await expect(page.getByText("Odometer log (CSV)")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/dashboard/settings/plan?reason=exports");
    await expect(page.getByRole("button", { name: /Download/ })).toHaveCount(0);
    expect(calls.some((c) => c.path.startsWith("/exports"))).toBe(false);
  });

  test("Pro: every row downloads for a tax year, business only by default", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockTax(page, { download: DOWNLOADS });
    await page.goto("/dashboard/tax/exports");

    const rows: Array<[RegExp, RegExp]> = [
      [/Self Assessment summary/, /\.pdf$/],
      [/Trip report/, /\.pdf$/],
      [/Trips \(CSV\)/, /\.csv$/],
      [/Odometer log/, /\.csv$/],
    ];
    for (const [name, ext] of rows) {
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
      expect(download.suggestedFilename()).toMatch(ext);
    }
    const pdf = calls.find((c) => c.path === "/exports/pdf");
    expect(pdf?.search).toMatch(/taxYear=\d{4}-\d{2}/);
    expect(pdf?.search).toContain("classification=business");
    expect(calls.find((c) => c.path === "/exports/csv")?.search).toContain("classification=business");
    expect(calls.find((c) => c.path === "/exports/odometer-log")?.search).toMatch(/taxYear=/);

    // One honest line about accounting software, no "coming soon" tiles.
    await expect(page.getByText("Using Xero, QuickBooks or FreeAgent? Download the CSV and import it there.")).toBeVisible();
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
    await expect(page.locator(".mc-btn--primary")).toHaveCount(0);
  });

  test("Pro: Choose dates sends from and to, and personal trips can be included", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockTax(page, { download: DOWNLOADS });
    await page.goto("/dashboard/tax/exports");
    await page.getByRole("radio", { name: "Choose dates" }).click();
    await page.getByLabel("From", { exact: true }).fill("2026-05-01");
    await page.getByLabel("To", { exact: true }).fill("2026-05-31");
    await expect(page.getByText("This one is by tax year. Switch to Tax year above.")).toBeVisible();
    await page.getByLabel("Business trips only").uncheck();

    await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Trips \(CSV\)/ }).click()]);
    const csv = calls.find((c) => c.path === "/exports/csv");
    // Local (UK) day edges, as instants. The browser and this runner share a time zone.
    expect(csv?.search).toContain(`from=${new Date("2026-05-01T00:00:00").toISOString()}`);
    expect(csv?.search).toContain(`to=${new Date("2026-05-31T23:59:59.999").toISOString()}`);
    expect(csv?.search).not.toContain("classification");

    await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Odometer log/ }).click()]);
    const odo = calls.find((c) => c.path === "/exports/odometer-log");
    expect(odo?.search).toContain("from=2026-05-01");
    expect(odo?.search).toContain("to=2026-05-31");
    expect(odo?.search).not.toContain("taxYear");
  });

  test("Pro: the API's empty-export sentence appears under the row", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockTax(page, {
      download: {
        ...DOWNLOADS,
        "/exports/csv": { status: 400, body: JSON.stringify({ error: "There are no trips in the 2026-27 tax year yet, so this export would come out empty." }) },
      },
    });
    await page.goto("/dashboard/tax/exports");
    await page.getByRole("button", { name: /Trips \(CSV\)/ }).click();
    await expect(page.locator("p.mc-tax-error")).toContainText("There are no trips in the 2026-27 tax year yet");
  });

  test("Pro with two vehicles: pick the vehicle for the odometer log", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockTax(page, {
      download: DOWNLOADS,
      vehicles: [
        { id: "v1", make: "Ford", model: "Fiesta" },
        { id: "v2", make: "Honda", model: "PCX" },
      ],
    });
    await page.goto("/dashboard/tax/exports");
    await page.getByLabel("Vehicle for the odometer log").selectOption("v2");
    await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Odometer log/ }).click()]);
    expect(calls.find((c) => c.path === "/exports/odometer-log")?.search).toContain("vehicleId=v2");
  });

  test.describe("390px", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("fits the phone", async ({ page }) => {
      await mockSession(page, { profile: profile({ isPremium: true }) });
      await mockTax(page, { download: DOWNLOADS });
      await page.goto("/dashboard/tax/exports");
      await expect(page.getByRole("button", { name: /Trips \(CSV\)/ })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});

test.describe("Mileage certificate", () => {
  test("free: gated, nothing is created", async ({ page }) => {
    await mockSession(page);
    const calls = await mockTax(page);
    await page.goto("/dashboard/tax/certificate");
    await expect(page.getByRole("heading", { name: "Share a mileage certificate" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/dashboard/settings/plan?reason=certificate");
    await expect(page.getByRole("button", { name: "Create certificate" })).toHaveCount(0);
    expect(calls.some((c) => c.path.startsWith("/certificates"))).toBe(false);
  });

  test("Pro: preview, create, then revoke", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockTax(page, { certs: [] });
    await page.goto("/dashboard/tax/certificate");
    await expect(page.getByText("No certificates yet")).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);

    await page.getByLabel("From", { exact: true }).fill("2026-04-06");
    await page.getByLabel("To", { exact: true }).fill("2026-09-30");
    await page.getByLabel("Who is it for?").selectOption("insurer");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("list", { name: "Certificate preview" })).toContainText("3,100.4 mi");
    await expect(page.getByText(/not an official document/)).toBeVisible();
    expect(calls.find((c) => c.path === "/certificates/preview")?.body).toMatchObject({ periodStart: "2026-04-06", periodEnd: "2026-09-30" });

    await page.getByRole("button", { name: "Create certificate" }).click();
    const created = calls.find((c) => c.method === "POST" && c.path === "/certificates");
    expect(created?.body).toMatchObject({ periodStart: "2026-04-06", periodEnd: "2026-09-30", purpose: "insurer" });
    await expect(page.getByText("Valid", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /mileclear\.com\/verify\// })).toHaveAttribute("target", "_blank");

    await page.getByRole("button", { name: "Revoke" }).first().click();
    await expect(page.getByText("Anyone with the link will see it's no longer valid.")).toBeVisible();
    await page.getByRole("button", { name: "Revoke", exact: true }).last().click();
    await expect(page.getByText("Withdrawn", { exact: true })).toBeVisible();
    expect(calls.some((c) => c.method === "POST" && /\/certificates\/.+\/revoke/.test(c.path))).toBe(true);
    await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
  });

  test("Pro: Download PDF and Copy link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockTax(page, { certs: [CERT_ONE] });
    await page.goto("/dashboard/tax/certificate");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
    expect(download.suggestedFilename()).toBe("mileclear-mileage-record-ABCDEFGH.pdf");
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText(/Link copied|Couldn't copy/)).toBeVisible();
  });
});
