import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { CERT_ONE, SA_EMPTY, mockTax } from "./fixtures/tax";

// The Self Assessment wizard and the other Tax pages, with every API call mocked.

test.describe("Self Assessment", () => {
  test("renders the boxes and figures from the summary payload", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockTax(page);
    await page.goto("/dashboard/tax/self-assessment");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Self Assessment");
    const boxes = page.locator("ul.mc-tax-boxes");
    await expect(boxes.getByText("Box 9", { exact: true })).toBeVisible();
    await expect(boxes.getByText("£18,400.00").first()).toBeVisible(); // box 9
    await expect(boxes.getByText("Box 12", { exact: true })).toBeVisible();
    await expect(boxes.getByText("£2,927.00").first()).toBeVisible(); // box 12: mileage plus parking
    await expect(boxes.getByText("£15,473.00").first()).toBeVisible(); // box 21 / 31

    // "Where this comes from" opens the plain explanation and the server's breakdown.
    await boxes.getByText("Where this comes from").first().click();
    await expect(page.getByText("Uber and Uber Eats")).toBeVisible();

    // Estimated tax by band, from the summary.
    await expect(page.getByText("Basic Rate (20%)")).toBeVisible();
    await expect(page.getByText("£1,240.00").first()).toBeVisible();

    // Vehicles: the motorbike and the provided van come from the server's rows.
    await expect(page.getByText("Honda PCX (Motorbike)")).toBeVisible();
    await expect(page.getByText("£170.40")).toBeVisible();
    await expect(page.getByText(/Someone else pays for this vehicle, so no claim/)).toBeVisible();

    expect(calls.find((c) => c.path === "/self-assessment/summary")?.search).toContain("taxYear=");
    expect(calls.some((c) => c.path === "/trips")).toBe(false);
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
  });

  test("changing the tax year asks the server for that year", async ({ page }) => {
    await mockSession(page);
    const calls = await mockTax(page);
    await page.goto("/dashboard/tax/self-assessment");
    await expect(page.getByText("Your SA103 boxes")).toBeVisible();
    await page.getByLabel("Tax year").selectOption("2025-26");
    await expect.poll(() => calls.some((c) => c.path === "/self-assessment/summary" && c.search.includes("taxYear=2025-26"))).toBe(true);
  });

  test("free: Download PDF carries a PRO chip and leads to the plan page", async ({ page }) => {
    await mockSession(page);
    await mockTax(page);
    await page.goto("/dashboard/tax/self-assessment");
    const btn = page.getByRole("link", { name: /Download PDF/ });
    await expect(btn).toBeVisible();
    await expect(btn.getByText("PRO")).toBeVisible();
    await expect(btn).toHaveAttribute("href", "/dashboard/settings/plan?reason=sa_pdf");
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  });

  test("Pro: the PDF downloads", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockTax(page, { download: { "/exports/self-assessment": { status: 200, body: "%PDF-1.4 sa", contentType: "application/pdf" } } });
    await page.goto("/dashboard/tax/self-assessment");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download PDF/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^mileclear-self-assessment-\d{4}-\d{2}-\d{8}\.pdf$/);
  });

  test("Pro: a failed download shows the API's message inline", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockTax(page, {
      download: { "/exports/self-assessment": { status: 400, body: JSON.stringify({ error: "There are no trips or earnings in the 2026-27 tax year yet, so this export would come out empty." }) } },
    });
    await page.goto("/dashboard/tax/self-assessment");
    await page.getByRole("button", { name: /Download PDF/ }).click();
    await expect(page.locator("p.mc-tax-error")).toContainText("There are no trips or earnings in the 2026-27 tax year yet");
  });

  test("empty year says so and offers no PDF", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockTax(page, { summary: SA_EMPTY });
    await page.goto("/dashboard/tax/self-assessment");
    await expect(page.getByText(/No records for \d{4}-\d{2} yet/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Download PDF/ })).toHaveCount(0);
  });

  test.describe("390px", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("fits the phone", async ({ page }) => {
      await mockSession(page, { profile: profile({ isPremium: true }) });
      await mockTax(page);
      await page.goto("/dashboard/tax/self-assessment");
      await expect(page.getByText("Your SA103 boxes")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});

test.describe("Checklist, payment plan, first return, reconciliation", () => {
  test("checklist: ticks only for done items, progress line, fix links", async ({ page }) => {
    await mockSession(page);
    await mockTax(page);
    await page.goto("/dashboard/tax/checklist");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ready for 31 January?");
    await expect(page.getByText("4 of 7 done")).toBeVisible();
    await expect(page.getByText("Done", { exact: true })).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Sort trips" })).toHaveAttribute("href", "/dashboard/trips?view=inbox");
    await expect(page.getByRole("link", { name: "Add name" })).toHaveAttribute("href", "/dashboard/profile");
    await expect(page.getByRole("link", { name: "Open Self Assessment" })).toHaveAttribute("href", "/dashboard/tax/self-assessment");
  });

  test("payment plan: dates, set-aside, and the answers save", async ({ page }) => {
    await mockSession(page);
    const calls = await mockTax(page);
    await page.goto("/dashboard/tax/payment-plan");
    await expect(page.locator(".mc-tax-pay__date", { hasText: "31 January 2027" })).toBeVisible();
    await expect(page.getByText("£2,250.00").first()).toBeVisible();
    await expect(page.getByText("This is the big one.")).toBeVisible();
    await expect(page.getByText("£42.00").first()).toBeVisible();
    await expect(page.locator(".mc-tax-pay__date", { hasText: "31 July 2027" })).toBeVisible();

    await page.getByLabel("Last tax year (2025-26)").check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => calls.find((c) => c.method === "PATCH" && c.path === "/tax-planner/settings")?.body).toMatchObject({
      firstSelfEmployedTaxYear: "2025-26",
    });
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  });

  test("first return guide is static, with links that open a new tab", async ({ page }) => {
    await mockSession(page);
    await mockTax(page);
    await page.goto("/dashboard/tax/first-return");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("First Self Assessment?");
    await expect(page.getByText("Get a UTR (Unique Taxpayer Reference)")).toBeVisible();
    const link = page.getByRole("link", { name: /Register on GOV.UK/ }).first();
    await expect(link).toHaveAttribute("target", "_blank");
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
  });

  test("reconciliation: enter a figure, Compare posts it and shows the difference", async ({ page }) => {
    await mockSession(page);
    const calls = await mockTax(page);
    await page.goto("/dashboard/tax/reconciliation");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check against HMRC's figures");
    await page.getByLabel("Uber").fill("12500");
    await page.getByRole("button", { name: "Compare" }).click();
    await expect.poll(() => calls.find((c) => c.method === "POST" && c.path === "/hmrc-reconciliation")?.body).toMatchObject({
      platform: "uber",
      hmrcReportedPence: 1250000,
    });
    await expect(page.getByText("£500.00 more than your records. Check you have added all your earnings.")).toBeVisible();
  });
});

test.describe("Mileage Allowance Relief", () => {
  test("employee with a rate sees the gap and how it was worked out", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "employee", employerMileageRatePence: 25 }) });
    await mockTax(page);
    await page.goto("/dashboard/tax/mileage-relief");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mileage Allowance Relief");
    // 2,000 miles at 55p = £1,100 approved, less 2,000 x 25p = £500 paid: £600 gap.
    await expect(page.getByText("The gap you can claim for 2026-27")).toBeVisible();
    await expect(page.getByText("£600.00").first()).toBeVisible();
    await expect(page.getByText(/12 mi tagged as commuting are left out/)).toBeVisible();
  });

  test("no employer rate: asks for it", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "employee" }) });
    await mockTax(page, {
      mar: { workType: "employee", employerMileageRatePence: null, employerMileageRatePenceAfter10k: null, joinedAt: "2026-01-01T00:00:00.000Z", firstTripAt: null, years: [] },
    });
    await page.goto("/dashboard/tax/mileage-relief");
    await expect(page.getByText("Add your employer's rate")).toBeVisible();
    await expect(page.getByRole("link", { name: "Set it in Work and tax" })).toHaveAttribute("href", "/dashboard/settings/work-tax");
  });

  test("not an employee: explains who it is for", async ({ page }) => {
    await mockSession(page, { profile: profile({ workType: "gig" }) });
    await mockTax(page);
    await page.goto("/dashboard/tax/mileage-relief");
    await expect(page.getByText("This is for employees")).toBeVisible();
    await expect(page.getByText("It's for people paid a mileage allowance by an employer.")).toBeVisible();
  });
});

test.describe("Accountant", () => {
  test("details save through the profile; free sees the sharing card gated", async ({ page }) => {
    await mockSession(page, { profile: profile({ accountantName: "Pat", accountantContact: "pat@example.test", accountantAnnualFeePence: 30000 }) });
    const calls = await mockTax(page);
    await page.goto("/dashboard/tax/accountant");
    await expect(page.getByLabel("Name")).toHaveValue("Pat");
    await page.getByLabel("Name").fill("Pat Smith");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect.poll(() => calls.find((c) => c.method === "PATCH" && c.path === "/user/profile")?.body).toMatchObject({
      accountantName: "Pat Smith",
      accountantAnnualFeePence: 30000,
    });
    await expect(page.getByText("Share your records with your accountant")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/dashboard/settings/plan?reason=accountant_share");
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  });

  test("Pro can invite and revoke", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockTax(page);
    await page.goto("/dashboard/tax/accountant");
    await expect(page.getByText("Your accountant gets a read-only view of your records for 12 months.")).toBeVisible();
    await page.getByLabel("Accountant's email").fill("Pat@Example.test");
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText("pat@example.test")).toBeVisible();
    expect(calls.find((c) => c.method === "POST" && c.path === "/accountant/invite")?.body).toEqual({ email: "pat@example.test" });
    await page.getByRole("button", { name: "Revoke access for pat@example.test" }).click();
    await page.getByRole("button", { name: "Revoke", exact: true }).last().click();
    await expect(page.getByText("Nobody has access yet")).toBeVisible();
  });
});

test.describe("Quarterly Self Assessment", () => {
  test("sandbox wording, honest and without buttons other than Disconnect", async ({ page }) => {
    await mockSession(page);
    await mockTax(page, { hmrcStatus: { connected: true, environment: "sandbox", connectedAt: "2026-09-01T00:00:00.000Z", hasNino: true, hasBusinessId: false } });
    await page.goto("/dashboard/tax/mtd");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quarterly Self Assessment");
    await expect(page.getByText("This is a test version connected to HMRC's test service.")).toBeVisible();
    await expect(page.getByText("Nothing here is sent to HMRC for real.")).toBeVisible();
    await expect(page.getByText("Sending quarterly updates is in the MileClear app for now.")).toBeVisible();
    await expect(page.getByText("Added", { exact: true })).toBeVisible();
    await expect(page.getByText("Not added", { exact: true })).toBeVisible();
    await expect(page.getByText("5 Nov 2026").or(page.getByText("5 November 2026"))).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(0);
    const text = await page.locator("body").innerText();
    for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
    expect(text).not.toMatch(/approved|compliant|HMRC[- ]ready|recognised/i);
  });
});

test.describe("Every tax route passes the copy sweep", () => {
  const ROUTES: Array<[string, string]> = [
    ["/dashboard/tax", "Tax"],
    ["/dashboard/tax/self-assessment", "Self Assessment"],
    ["/dashboard/tax/checklist", "Ready for 31 January?"],
    ["/dashboard/tax/payment-plan", "Tax payment plan"],
    ["/dashboard/tax/first-return", "First Self Assessment?"],
    ["/dashboard/tax/reconciliation", "Check against HMRC's figures"],
    ["/dashboard/tax/mileage-relief", "Mileage Allowance Relief"],
    ["/dashboard/tax/exports", "Tax exports"],
    ["/dashboard/tax/certificate", "Mileage certificate"],
    ["/dashboard/tax/accountant", "Your accountant"],
    ["/dashboard/tax/mtd", "Quarterly Self Assessment"],
  ];
  for (const pro of [false, true]) {
    for (const [path, title] of ROUTES) {
      test(`${path} (${pro ? "Pro" : "free"})`, async ({ page }) => {
        await mockSession(page, { profile: profile({ isPremium: pro, workType: "both" }) });
        await mockTax(page, { certs: [CERT_ONE], hmrcStatus: { connected: true, environment: "sandbox", hasNino: true, hasBusinessId: true } });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await page.waitForLoadState("networkidle");
        expect(await page.locator(".mc-btn--primary").count()).toBeLessThanOrEqual(1);
        const text = await page.locator("body").innerText();
        for (const banned of BANNED_COPY) expect(text, `${path} contains ${banned}`).not.toMatch(banned);
      });
    }
  }
});
