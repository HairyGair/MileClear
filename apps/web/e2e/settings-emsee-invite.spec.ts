import { test, expect } from "@playwright/test";
import { mockSession, profile } from "./fixtures/api";
import { mockRoutes, reply } from "./fixtures/settingsApi";

const ON = { "GET /assistant/status": () => ({ available: true, dailyLimit: 20, monthlyLimit: 200 }) };

test.describe("EmSee", () => {
  test("hidden in More and an empty state on the page when it is not available", async ({ page }) => {
    await mockSession(page); // the shared fixture says available: false
    await page.goto("/dashboard/more");
    await expect(page.getByRole("link", { name: /Vehicles/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /EmSee/ })).toHaveCount(0);
    await page.goto("/dashboard/emsee");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("EmSee");
    await expect(page.getByText("EmSee isn't available yet")).toBeVisible();
    await expect(page.getByLabel("Your question")).toHaveCount(0);
  });

  test("free drivers see the Pro gate when it is available", async ({ page }) => {
    await mockSession(page);
    await mockRoutes(page, ON);
    await page.goto("/dashboard/emsee");
    await expect(page.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/dashboard/settings/plan?reason=emsee");
    await expect(page.getByLabel("Your question")).toHaveCount(0);
  });

  test("Pro can ask, sends the last turns as history, and errors show in the thread", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    let n = 0;
    const seen = await mockRoutes(page, {
      ...ON,
      "POST /assistant/ask": (req) => {
        n += 1;
        if (n === 3) return reply(503, { error: "EmSee is busy right now. Please try again in a minute." });
        return { data: { answer: `Answer ${n} to: ${req.body?.question}`, periods: [], remainingToday: 19, remainingThisMonth: 199 } };
      },
    });
    await page.goto("/dashboard/emsee");
    await expect(page.getByText(/EmSee only answers questions about MileClear/)).toBeVisible();
    await expect(page.getByText(/20 questions a day/)).toBeVisible();
    const ask = page.getByRole("button", { name: "Ask EmSee" });
    await expect(ask).toBeDisabled();
    await page.getByLabel("Your question").fill("How many miles last month?");
    await expect(page.getByText("26/500")).toBeVisible();
    await ask.click();
    await expect(page.getByText("Answer 1 to: How many miles last month?")).toBeVisible();
    await page.getByLabel("Your question").fill("And the month before?");
    await ask.click();
    await expect(page.getByText("Answer 2 to: And the month before?")).toBeVisible();
    await page.getByLabel("Your question").fill("Third");
    await ask.click();
    await expect(page.getByText("EmSee is busy right now. Please try again in a minute.")).toBeVisible();

    const asks = seen.filter((r) => r.path === "/assistant/ask");
    expect(asks[0].body).toEqual({ question: "How many miles last month?", history: [] });
    expect(asks[1].body?.history).toEqual([
      { role: "user", text: "How many miles last month?" },
      { role: "assistant", text: "Answer 1 to: How many miles last month?" },
    ]);
    expect((asks[2].body?.history as unknown[]).length).toBe(4);
  });

  test("the question box stops at 500 characters", async ({ page }) => {
    await mockSession(page, { profile: profile({ isPremium: true }) });
    await mockRoutes(page, ON);
    await page.goto("/dashboard/emsee");
    await page.getByLabel("Your question").fill("a".repeat(600));
    await expect(page.getByLabel("Your question")).toHaveValue("a".repeat(500));
    await expect(page.getByText("500/500")).toBeVisible();
  });
});

test.describe("Invite a friend", () => {
  const SUMMARY = { data: { code: "SAM4821", shareUrl: "https://mileclear.com/r/SAM4821", maxRewards: 12, earnedMonths: 2, pendingCount: 1, referralProUntil: null, referrals: [] } };

  test("shows the code and counts, and Copy link toasts", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockSession(page);
    await mockRoutes(page, { "GET /referrals": () => SUMMARY });
    await page.goto("/dashboard/invite");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Invite a friend");
    await expect(page.getByText("You both get a month of Pro free when a friend records their first trip.")).toBeVisible();
    await expect(page.getByText("SAM4821", { exact: true })).toBeVisible();
    await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://mileclear.com/r/SAM4821");
  });

  test("an invalid friend's code shows the API's sentence; a good one applies", async ({ page }) => {
    await mockSession(page);
    const seen = await mockRoutes(page, {
      "GET /referrals": () => SUMMARY,
      "POST /referrals/apply": (req) => (req.body?.code === "GOOD1" ? { data: { ok: true } } : reply(400, { error: "That referral code isn't valid.", reason: "invalid" })),
    });
    await page.goto("/dashboard/invite");
    await page.getByLabel("Code").fill("nope");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("That referral code isn't valid.")).toBeVisible();
    expect(seen.find((r) => r.path === "/referrals/apply")?.body).toEqual({ code: "NOPE" });
    await page.getByLabel("Code").fill("good1");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Code applied")).toBeVisible();
  });

  test.describe("phone 390", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("fits the screen", async ({ page }) => {
      await mockSession(page);
      await mockRoutes(page, { "GET /referrals": () => SUMMARY });
      await page.goto("/dashboard/invite");
      await expect(page.getByText("SAM4821", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  });
});
