import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { API } from "./fixtures/api";
import { mockApi } from "./fixtures/insightsMoney";

const earning = (id: string, over: Record<string, unknown> = {}) => ({
  id, userId: "u-test", platform: "uber", amountPence: 12550, periodStart: "2026-10-02T00:00:00.000Z", periodEnd: "2026-10-02T00:00:00.000Z",
  source: "manual", externalId: null, projectLabel: null, ...over,
});

const earningsList = (rows: unknown[], total = 12550) => ({ data: rows, total: rows.length, totalAmountPence: total, page: 1, pageSize: 20, totalPages: 1 });

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Earnings", () => {
  test("lists earnings with a total, filters by platform and tax year, and has one amber button", async ({ page }) => {
    await mockSession(page);
    const calls = await mockApi(page, { "GET /earnings": earningsList([earning("e1"), earning("e2", { source: "open_banking", platform: "deliveroo", amountPence: 3000 })], 15550) });
    await page.goto("/dashboard/earnings");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Earnings");
    await expect(page.getByText("£155.50").first()).toBeVisible();
    await expect(page.getByText("Bank", { exact: true })).toBeVisible();
    await expect(page.getByText("Snap a statement in the MileClear app and it lands here.")).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);

    await page.getByLabel("Platform").selectOption("deliveroo");
    await expect.poll(() => calls.find("GET", "/earnings").some((c) => c.search.includes("platform=deliveroo"))).toBe(true);
    await page.getByLabel("Tax year").selectOption({ index: 1 });
    await expect.poll(() => calls.find("GET", "/earnings").some((c) => c.search.includes("from=") && c.search.includes("to="))).toBe(true);
  });

  test("free account: CSV import and bank are Pro and point at the plan page", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, { "GET /earnings": earningsList([earning("e1")]) });
    await page.goto("/dashboard/earnings");
    const csv = page.getByRole("link", { name: /Import from CSV/ });
    await expect(csv).toHaveAttribute("href", "/dashboard/settings/plan?reason=csv_import");
    await expect(csv.getByText("PRO")).toBeVisible();
    await page.goto("/dashboard/earnings/import");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Import earnings");
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/dashboard/settings/plan?reason=csv_import");
  });

  test("empty state, then add: validates, then saves in pence", async ({ page }) => {
    await mockSession(page);
    const calls = await mockApi(page, {
      "GET /earnings": earningsList([], 0),
      "POST /earnings": { status: 201, body: { data: earning("new") } },
    });
    await page.goto("/dashboard/earnings");
    await expect(page.getByRole("heading", { name: "No earnings yet" })).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
    await page.getByRole("button", { name: "Add earning" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Enter an amount above £0.")).toBeVisible();
    expect(calls.find("POST", "/earnings")).toHaveLength(0);
    await dialog.getByLabel("Amount").fill("42.5");
    await dialog.getByLabel("Platform").selectOption("deliveroo");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => calls.find("POST", "/earnings").length).toBe(1);
    const sent = calls.find("POST", "/earnings")[0].body as Record<string, unknown>;
    expect(sent.amountPence).toBe(4250);
    expect(sent.platform).toBe("deliveroo");
    expect(typeof sent.periodStart).toBe("string");
  });

  test("edit saves with PATCH and delete asks first", async ({ page }) => {
    await mockSession(page);
    const calls = await mockApi(page, {
      "GET /earnings": earningsList([earning("e1")]),
      "PATCH /earnings/e1": { data: earning("e1", { amountPence: 20000 }) },
      "DELETE /earnings/e1": { message: "ok" },
    });
    await page.goto("/dashboard/earnings");
    await page.getByRole("row", { name: /Uber/ }).click();
    const dialog = page.getByRole("dialog", { name: "Edit earning" });
    await expect(dialog.getByLabel("Amount")).toHaveValue("125.50");
    await dialog.getByLabel("Amount").fill("200");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => calls.find("PATCH", "/earnings/e1").length).toBe(1);
    expect((calls.find("PATCH", "/earnings/e1")[0].body as Record<string, unknown>).amountPence).toBe(20000);

    await page.getByRole("row", { name: /Uber/ }).click();
    await page.getByRole("dialog", { name: "Edit earning" }).getByRole("button", { name: "Delete" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this earning?" });
    await expect(confirm).toBeVisible();
    expect(calls.find("DELETE", "/earnings/e1")).toHaveLength(0);
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect.poll(() => calls.find("DELETE", "/earnings/e1").length).toBe(1);
  });

  test("company drivers are told their company handles this", async ({ page }) => {
    await mockSession(page, { team: { orgId: "o1", orgName: "Acme", role: "driver" } });
    await mockApi(page, {});
    await page.goto("/dashboard/earnings");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Earnings");
    await expect(page.getByRole("heading", { name: "Your company handles this" })).toBeVisible();
    await expect(page.getByText("Earnings are for self-employed driving.")).toBeVisible();
  });

  test("CSV import (Pro): preview then import posts rows and filename", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const rows = [
      { platform: "uber", amountPence: 4000, periodStart: "2026-09-01", periodEnd: "2026-09-07", externalId: "a", isDuplicate: false },
      { platform: "uber", amountPence: 3000, periodStart: "2026-09-08", periodEnd: "2026-09-14", externalId: "b", isDuplicate: true },
    ];
    const calls = await mockApi(page, {
      "POST /earnings/csv/preview": { data: { platform: "uber", rows, totalAmountPence: 7000, duplicateCount: 1 } },
      "POST /earnings/csv/confirm": { data: { imported: 1, skipped: 1 } },
      "GET /earnings": earningsList([]),
    });
    await page.goto("/dashboard/earnings/import");
    await page.setInputFiles("#earnings-csv", { name: "uber.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Amount\n2026-09-01,40\n") });
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText("1 new earning worth")).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
    await page.getByRole("button", { name: "Import 1 earning" }).click();
    await expect.poll(() => calls.find("POST", "/earnings/csv/confirm").length).toBe(1);
    const sent = calls.find("POST", "/earnings/csv/confirm")[0].body as { rows: unknown[]; filename: string };
    expect(sent.rows).toHaveLength(2);
    expect(sent.filename).toBe("uber.csv");
  });
});

const expensesList = (rows: unknown[]) => ({ data: rows, total: rows.length, page: 1, pageSize: 100, totalPages: 1 });
const expense = (id: string, over: Record<string, unknown> = {}) => ({ id, userId: "u", vehicleId: null, category: "parking", amountPence: 350, date: "2026-10-03T00:00:00.000Z", description: null, vendor: "NCP", notes: null, createdAt: "2026-10-03T00:00:00.000Z", ...over });

test.describe("Expenses", () => {
  test("shows the tax year the API returns, never the stale 2025-26 wording", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, {
      "GET /expenses": expensesList([expense("x1"), expense("x2", { category: "insurance", vendor: "Admiral", amountPence: 9900, date: "2026-09-12T00:00:00.000Z" })]),
      "GET /expenses/summary": { data: [{ category: "parking", totalPence: 350, count: 1, deductibleWithMileage: true }, { category: "insurance", totalPence: 9900, count: 1, deductibleWithMileage: false }], taxYear: "2026-27" },
      "GET /expenses/tax-estimate": { data: { taxYear: "2026-27", grossEarningsPence: 500000, mileageDeductionPence: 100000, allowableExpensesPence: 350, vehicleExpensesPence: 9900, taxableProfitPence: 399650, incomeTaxPence: 0, class2NiPence: 0, class4NiPence: 0, totalTaxOwedPence: 31000, effectiveRatePercent: 6, expensesByCategory: [] } },
    });
    await page.goto("/dashboard/expenses");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Expenses");
    await expect(page.getByRole("heading", { name: "Tax estimate, 2026-27" })).toBeVisible();
    await expect(page.getByText("October 2026")).toBeVisible();
    await expect(page.getByText("September 2026")).toBeVisible();
    await expect(page.getByText("Scan a receipt in the MileClear app and it fills this in.")).toBeVisible();
    const text = await page.locator("body").innerText();
    for (const b of BANNED_COPY) expect(text).not.toMatch(b);
    expect(text).not.toContain("2025-26");
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  });

  test("the form lists the SA103S categories and validates category, amount and date", async ({ page }) => {
    await mockSession(page);
    const calls = await mockApi(page, {
      "GET /expenses": expensesList([expense("x1")]),
      "GET /expenses/summary": { data: [], taxYear: "2026-27" },
      "GET /expenses/tax-estimate": { data: { taxYear: "2026-27", grossEarningsPence: 0, mileageDeductionPence: 0, allowableExpensesPence: 0, vehicleExpensesPence: 0, taxableProfitPence: 0, incomeTaxPence: 0, class2NiPence: 0, class4NiPence: 0, totalTaxOwedPence: 0, effectiveRatePercent: 0, expensesByCategory: [] } },
      "GET /vehicles": { data: [{ id: "v1", make: "Ford", model: "Transit" }] },
      "POST /expenses": { status: 201, body: { data: expense("new") } },
    });
    await page.goto("/dashboard/expenses");
    await page.getByRole("button", { name: "Add expense" }).click();
    const dialog = page.getByRole("dialog", { name: "Add expense" });
    const options = await dialog.getByLabel("Category").locator("option").allTextContents();
    // Every SA103S-mapped category in @mileclear/shared (15 when the spec was written, 16 now).
    expect(options.length - 1).toBeGreaterThanOrEqual(15);
    expect(options).toContain("Parking");
    expect(options).toContain("Professional Fees");
    await dialog.getByLabel("Date").fill("");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Pick a category.")).toBeVisible();
    await expect(dialog.getByText("Enter an amount above £0.")).toBeVisible();
    await expect(dialog.getByText("Pick a date.")).toBeVisible();
    expect(calls.find("POST", "/expenses")).toHaveLength(0);

    await dialog.getByLabel("Category").selectOption("insurance");
    await expect(dialog.getByText(/the rate already covers it/)).toBeVisible();
    await dialog.getByLabel("Amount").fill("12.34");
    await dialog.getByLabel("Date").fill("2026-10-05");
    await dialog.getByLabel("Vehicle").selectOption("v1");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => calls.find("POST", "/expenses").length).toBe(1);
    const sent = calls.find("POST", "/expenses")[0].body as Record<string, unknown>;
    expect(sent).toMatchObject({ category: "insurance", amountPence: 1234, date: "2026-10-05", vehicleId: "v1" });
  });

  test("empty state", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, { "GET /expenses": expensesList([]), "GET /expenses/summary": { data: [], taxYear: "2026-27" } });
    await page.goto("/dashboard/expenses");
    await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible();
    await expect(page.getByText("Add parking, tolls and other work costs to lower your tax.")).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  });
});

const invoice = (id: string, over: Record<string, unknown> = {}) => ({
  id, company: "Acme Ltd", clientId: null, clientEmail: "a@acme.test", reference: null, invoiceNumber: 1, amountPence: 40000, subtotalPence: null, vatRate: null, vatPence: null,
  sentAt: new Date().toISOString(), dueAt: new Date(Date.now() + 30 * 864e5).toISOString(), paidAt: null, status: "sent", notes: null, emailedAt: null, autoChaseEnabled: false, nextChaseAt: null, ...over,
});
const summary = { sent: { count: 0, totalPence: 0 }, paid: { count: 0, totalPence: 0 }, overdue: { count: 0, totalPence: 0 }, written_off: { count: 0, totalPence: 0 } };
const invList = (rows: unknown[]) => ({ data: rows, total: rows.length, summary });

test.describe("Invoices and clients", () => {
  test("free counter shows 2 of 3 used and the New invoice button works", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, { "GET /invoices": invList([invoice("i1"), invoice("i2", { invoiceNumber: 2 })]) });
    await page.goto("/dashboard/invoices");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Invoices");
    await expect(page.getByText("2 of 3")).toBeVisible();
    await expect(page.getByText("used this month")).toBeVisible();
    await expect(page.getByRole("link", { name: "New invoice" })).toHaveAttribute("href", "/dashboard/invoices/new");
    await expect(page.getByText("You've used your 3 free invoices")).toHaveCount(0);
  });

  test("at the free limit the primary is disabled and the line points at the plan page", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, { "GET /invoices": invList([invoice("i1"), invoice("i2", { invoiceNumber: 2 }), invoice("i3", { invoiceNumber: 3 })]) });
    await page.goto("/dashboard/invoices");
    await expect(page.getByText("3 of 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "New invoice" })).toBeDisabled();
    await expect(page.getByText("You've used your 3 free invoices this month.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to Pro for unlimited." })).toHaveAttribute("href", "/dashboard/settings/plan?reason=invoices");
    const text = await page.locator("body").innerText();
    expect(text).not.toContain("/pricing");
  });

  test("Pro has no counter, and older invoices do not count towards this month", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, { "GET /invoices": invList([invoice("i1")]) });
    await page.goto("/dashboard/invoices");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Invoices");
    await expect(page.getByText("used this month")).toHaveCount(0);
    await expect(page.getByText("PRO", { exact: true })).toHaveCount(0);
  });

  test("no invoices: the empty state is the only amber action", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, { "GET /invoices": invList([]) });
    await page.goto("/dashboard/invoices");
    await expect(page.getByRole("heading", { name: "No invoices yet" })).toBeVisible();
    await expect(page.getByText("Bill a client in a minute. The first 3 each month are free.")).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  });

  test("new invoice validates, then posts line items", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockApi(page, {
      "GET /clients": { data: [] },
      "POST /invoices": { status: 201, body: { data: invoice("inew") } },
      "GET /invoices/inew": { data: invoice("inew") },
      "GET /invoices/inew/emails": { data: [] },
    });
    await page.goto("/dashboard/invoices/new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New invoice");
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByText("Who is the invoice to? Pick a client or enter a name.")).toBeVisible();
    await expect(page.getByText("Enter an amount or add at least one line.")).toBeVisible();
    expect(calls.find("POST", "/invoices")).toHaveLength(0);

    await page.getByLabel("Name or company").fill("Acme Ltd");
    await page.getByRole("button", { name: "Add a line" }).click();
    await page.getByLabel("Description").fill("Delivery day");
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel("Price each").fill("50");
    await page.getByLabel("VAT").selectOption("20");
    await expect(page.getByText("Total £120.00")).toBeVisible();
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect.poll(() => calls.find("POST", "/invoices").length).toBe(1);
    const sent = calls.find("POST", "/invoices")[0].body as Record<string, unknown>;
    expect(sent.lineItems).toEqual([{ description: "Delivery day", quantity: 2, unitPricePence: 5000 }]);
    expect(sent.vatRate).toBe(20);
    await expect(page).toHaveURL(/\/dashboard\/invoices\/inew$/);
  });

  test("a 402 from the API turns into the plain free-limit line", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, {
      "GET /clients": { data: [] },
      "POST /invoices": { status: 402, body: { error: { code: "PREMIUM_REQUIRED", message: "Free plan tracks 3 invoices per month.", retryable: false } } },
    });
    await page.goto("/dashboard/invoices/new");
    await page.getByLabel("Name or company").fill("Acme");
    await page.getByLabel("Amount").fill("100");
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByText("You've used your 3 free invoices this month.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/dashboard/settings/plan?reason=invoices");
  });

  test("invoice page: free PDF/email/chase point at the plan page; mark paid offers to link the payment", async ({ page }) => {
    await mockSession(page);
    const calls = await mockApi(page, {
      "GET /invoices/i1": { data: invoice("i1", { lineItems: [{ description: "Day rate", quantity: "1", unitPricePence: 40000 }] }) },
      "PATCH /invoices/i1": { data: invoice("i1", { status: "paid", paidAt: new Date().toISOString() }), potentialEarningMatches: [{ id: "e9", platform: "uber", amountPence: 40000, periodStart: "2026-10-01T00:00:00.000Z", notes: null, daysFromAnchor: 1 }] },
      "POST /invoices/i1/link-earning": { data: { invoiceId: "i1", linkedEarningIds: ["e9"] } },
    });
    await page.goto("/dashboard/invoices/i1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("INV-0001");
    for (const name of [/Download PDF/, /Email to client/]) {
      await expect(page.getByRole("link", { name })).toHaveAttribute("href", "/dashboard/settings/plan?reason=invoices");
    }
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
    await page.getByRole("button", { name: "Mark as paid" }).click();
    const dialog = page.getByRole("dialog", { name: "Is one of these the same payment?" });
    await expect(dialog.getByText("Uber / Uber Eats, £400.00")).toBeVisible();
    await dialog.getByRole("button", { name: "Link" }).click();
    await expect.poll(() => calls.find("POST", "/invoices/i1/link-earning").length).toBe(1);
    expect(calls.find("POST", "/invoices/i1/link-earning")[0].body).toEqual({ earningId: "e9" });
  });

  test("Pro invoice page can email the client and shows email history", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockApi(page, {
      "GET /invoices/i1": { data: invoice("i1") },
      "GET /invoices/i1/emails": { data: [{ id: "m1", kind: "invoice", toEmail: "a@acme.test", subject: "Invoice", status: "sent", createdAt: "2026-10-02T10:00:00Z" }] },
      "POST /invoices/i1/send": { data: { toEmail: "a@acme.test" } },
    });
    await page.goto("/dashboard/invoices/i1");
    await expect(page.getByRole("heading", { name: "Emails sent" })).toBeVisible();
    await page.getByRole("button", { name: "Email to client" }).click();
    await page.getByRole("dialog", { name: "Email this invoice?" }).getByRole("button", { name: "Send" }).click();
    await expect.poll(() => calls.find("POST", "/invoices/i1/send").length).toBe(1);
    await expect(page.getByRole("switch", { name: "Chase automatically" })).toBeVisible();
  });

  test("clients: empty state, add with validation", async ({ page }) => {
    await mockSession(page);
    const calls = await mockApi(page, { "GET /clients": { data: [] }, "POST /clients": { status: 201, body: { data: { id: "c1", name: "Acme" } } } });
    await page.goto("/dashboard/invoices/clients");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clients");
    await expect(page.getByRole("heading", { name: "No clients yet" })).toBeVisible();
    await page.getByRole("button", { name: "Add client" }).click();
    const dialog = page.getByRole("dialog", { name: "Add client" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Enter a name.")).toBeVisible();
    await dialog.getByLabel("Name").fill("Acme");
    await dialog.getByLabel("Email").fill("nope");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("That doesn't look like an email address.")).toBeVisible();
    await dialog.getByLabel("Email").fill("hi@acme.test");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => calls.find("POST", "/clients").length).toBe(1);
    expect(calls.find("POST", "/clients")[0].body).toMatchObject({ name: "Acme", email: "hi@acme.test", phone: null });
  });
});

const connection = { id: "c1", institutionName: "Monzo", lastSynced: "2026-10-07T09:00:00Z", status: "active", createdAt: "2026-09-01T00:00:00Z" };
const txn = (id: string, over: Record<string, unknown> = {}) => ({ id, merchant: "UBER BV", descriptionRaw: null, amountPence: 8450, transactionDate: "2026-10-05T00:00:00Z", suggestedKind: "earning", suggestedCategory: "uber", ...over });

test.describe("Bank", () => {
  test("free account sees the gate for the bank and the inbox", async ({ page }) => {
    await mockSession(page);
    const calls = await mockApi(page, {});
    for (const [url, title] of [["/dashboard/bank", "Link a bank"], ["/dashboard/bank/inbox", "Bank inbox"]] as const) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/dashboard/settings/plan?reason=bank");
    }
    expect(calls.all.filter((c) => c.path.startsWith("/inbox") || c.path.includes("open-banking"))).toHaveLength(0);
  });

  test("Pro: lists the linked bank, syncs, and disconnects after a confirm", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockApi(page, {
      "GET /earnings/open-banking/connections": { data: [connection] },
      "POST /earnings/open-banking/sync": { data: { imported: 2 } },
      "DELETE /earnings/open-banking/connections/c1": { message: "Bank disconnected" },
    });
    await page.goto("/dashboard/bank");
    await expect(page.getByRole("heading", { name: "Monzo" })).toBeVisible();
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect.poll(() => calls.find("POST", "/earnings/open-banking/sync").length).toBe(1);
    expect(calls.find("POST", "/earnings/open-banking/sync")[0].body).toEqual({ connectionId: "c1" });
    await page.getByRole("button", { name: "Disconnect" }).click();
    expect(calls.find("DELETE", "/earnings/open-banking/connections/c1")).toHaveLength(0);
    await page.getByRole("dialog", { name: "Disconnect this bank?" }).getByRole("button", { name: "Disconnect" }).click();
    await expect.poll(() => calls.find("DELETE", "/earnings/open-banking/connections/c1").length).toBe(1);
  });

  test("Pro: Link a bank opens the API link page in a new tab asking to return to the website", async ({ page, context }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockApi(page, {
      "GET /earnings/open-banking/connections": { data: [connection] },
      "POST /earnings/open-banking/link-token": { data: { authLink: "https://auth.truelayer.example/?state=abc" } },
    });
    // The new tab is its own page, so catch its request on the context.
    const seen: string[] = [];
    await context.route(`${API}/earnings/open-banking/link**`, (route) => {
      seen.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>ok</body></html>" });
    });
    await page.goto("/dashboard/bank");
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Link a bank" }).click();
    const tab = await popup;
    expect(calls.find("POST", "/earnings/open-banking/link-token")).toHaveLength(1);
    await expect.poll(() => seen.length).toBe(1);
    const q = new URL(seen[0]).searchParams;
    expect(q.get("return")).toBe("web");
    expect(q.get("authLink")).toBe("https://auth.truelayer.example/?state=abc");
    expect(q.get("token")).toBe("test-token");
    await tab.close();
    await expect(page.getByText("Finish in the new tab. Come back here when your bank says you're done.")).toBeVisible();
  });

  test("Pro with no bank: the page offers one amber Link a bank", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, { "GET /earnings/open-banking/connections": { data: [] } });
    await page.goto("/dashboard/bank");
    await expect(page.getByRole("heading", { name: "No bank linked" })).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  });

  test("inbox: accept as an expense, accept an invoice payment, ignore", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockApi(page, {
      "GET /inbox": { data: [txn("t1"), txn("t2", { merchant: "SHELL", amountPence: -4500, suggestedKind: "expense", suggestedCategory: "fuel" }), txn("t3", { merchant: "ACME LTD", suggestedKind: "invoice_payment", suggestedCategory: "11111111-1111-1111-1111-111111111111" })], total: 3 },
      "GET /earnings/open-banking/connections": { data: [connection] },
      "POST /inbox/t1/ignore": { data: { ok: true } },
      "POST /inbox/t2/accept": { data: {} },
      "POST /inbox/t3/accept": { data: {} },
    });
    await page.goto("/dashboard/bank/inbox");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bank inbox");
    await expect(page.getByText("UBER BV")).toBeVisible();

    // Expense: the dialog needs a category before it saves
    const shell = page.locator(".mc-card", { hasText: "SHELL" });
    await shell.getByRole("button", { name: "Expense" }).click();
    const dialog = page.getByRole("dialog", { name: "Add as an expense" });
    await dialog.getByLabel("Category").selectOption("");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Pick a category.")).toBeVisible();
    await dialog.getByLabel("Category").selectOption("parking");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => calls.find("POST", "/inbox/t2/accept").length).toBe(1);
    expect(calls.find("POST", "/inbox/t2/accept")[0].body).toEqual({ kind: "expense", category: "parking" });
    await expect(page.getByText("SHELL")).toHaveCount(0);

    // Invoice payment goes straight through
    await page.locator(".mc-card", { hasText: "ACME LTD" }).getByRole("button", { name: "Invoice payment" }).click();
    await expect.poll(() => calls.find("POST", "/inbox/t3/accept").length).toBe(1);
    expect(calls.find("POST", "/inbox/t3/accept")[0].body).toEqual({ kind: "invoice_payment", invoiceId: "11111111-1111-1111-1111-111111111111" });

    // Ignore
    await page.locator(".mc-card", { hasText: "UBER BV" }).getByRole("button", { name: "Ignore" }).click();
    await expect.poll(() => calls.find("POST", "/inbox/t1/ignore").length).toBe(1);
    await expect(page.getByRole("heading", { name: "All sorted" })).toBeVisible();
  });

  test("inbox: accept as an earning sends the platform", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    const calls = await mockApi(page, {
      "GET /inbox": { data: [txn("t1")], total: 1 },
      "GET /earnings/open-banking/connections": { data: [connection] },
      "POST /inbox/t1/accept": { data: {} },
    });
    await page.goto("/dashboard/bank/inbox");
    await page.getByRole("button", { name: "Earning" }).click();
    const dialog = page.getByRole("dialog", { name: "Add as an earning" });
    await expect(dialog.getByLabel("Platform")).toHaveValue("uber");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => calls.find("POST", "/inbox/t1/accept").length).toBe(1);
    expect(calls.find("POST", "/inbox/t1/accept")[0].body).toEqual({ kind: "earning", platform: "uber" });
  });

  test("inbox empty states: no bank, and nothing waiting", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, { "GET /inbox": { data: [], total: 0 }, "GET /earnings/open-banking/connections": { data: [] } });
    await page.goto("/dashboard/bank/inbox");
    await expect(page.getByRole("heading", { name: "Link a bank first" })).toBeVisible();
    const p2 = await page.context().newPage();
    await mockSession(p2, { profile: profile({ isPremium: true }) });
    await mockApi(p2, { "GET /inbox": { data: [], total: 0 }, "GET /earnings/open-banking/connections": { data: [connection] } });
    await p2.goto("/dashboard/bank/inbox");
    await expect(p2.getByRole("heading", { name: "All sorted" })).toBeVisible();
    await expect(p2.getByText("No payments waiting.")).toBeVisible();
  });
});

test.describe("phone 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("money pages have no horizontal scroll and the earnings rows are list rows", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockApi(page, {
      "GET /earnings": earningsList([earning("e1"), earning("e2", { periodEnd: "2026-10-09T00:00:00.000Z" })]),
      "GET /expenses": expensesList([expense("x1")]),
      "GET /expenses/summary": { data: [{ category: "parking", totalPence: 350, count: 1, deductibleWithMileage: true }], taxYear: "2026-27" },
      "GET /expenses/tax-estimate": { data: { taxYear: "2026-27", grossEarningsPence: 500000, mileageDeductionPence: 100000, allowableExpensesPence: 350, vehicleExpensesPence: 0, taxableProfitPence: 399650, incomeTaxPence: 0, class2NiPence: 0, class4NiPence: 0, totalTaxOwedPence: 31000, effectiveRatePercent: 6, expensesByCategory: [] } },
      "GET /invoices": invList([invoice("i1")]),
      "GET /clients": { data: [{ id: "c1", name: "Acme", email: null, phone: null, addressLine1: null, addressLine2: null, city: null, postcode: null, archivedAt: null, _count: { invoices: 2 } }] },
      "GET /earnings/open-banking/connections": { data: [connection] },
      "GET /inbox": { data: [txn("t1")], total: 1 },
    });
    for (const url of ["/dashboard/earnings", "/dashboard/expenses", "/dashboard/invoices", "/dashboard/invoices/clients", "/dashboard/bank", "/dashboard/bank/inbox", "/dashboard/invoices/new"]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noHorizontalScroll(page);
    }
    await page.goto("/dashboard/earnings");
    await expect(page.locator("table")).toHaveCount(0);
    await expect(page.locator(".mc-list__row").first()).toBeVisible();
  });

  test("dialogs become full-width sheets and still fit", async ({ page }) => {
    await mockSession(page);
    await mockApi(page, { "GET /earnings": earningsList([earning("e1")]) });
    await page.goto("/dashboard/earnings");
    await page.getByRole("button", { name: "Add earning" }).click();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    await noHorizontalScroll(page);
  });
});
