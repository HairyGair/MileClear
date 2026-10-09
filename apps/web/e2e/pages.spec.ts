import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";

// Every new route renders exactly one h1 with its title, under a free and a Pro profile,
// and none of the copy we ban appears. (Pages other packages are still building show
// the placeholder, which is also checked.)
const ROUTES: Array<[string, string]> = [
  ["/dashboard/more", "More"],
  ["/dashboard/work-schedule", "Work schedule"],
  ["/dashboard/settings/tracking", "Tracking"],
  ["/dashboard/trips/new", "Add a trip"],
  ["/dashboard/tax/exports", "Tax exports"],
  ["/dashboard/insights", "Insights"],
  ["/dashboard/bank", "Link a bank"],
  ["/dashboard/odometer", "Odometer log"],
  ["/dashboard/places", "Saved places"],
  ["/dashboard/achievements", "Achievements"],
  ["/dashboard/road-alerts", "Road alerts"],
  ["/dashboard/ticket-defender", "Ticket defender"],
  ["/dashboard/profile", "Your profile"],
  ["/dashboard/settings/plan", "Your plan"],
  ["/dashboard/help", "Help and tutorials"],
  ["/dashboard/invite", "Invite a friend"],
];

for (const pro of [false, true]) {
  test.describe(pro ? "Pro profile" : "free profile", () => {
    for (const [path, title] of ROUTES) {
      test(`${path} renders "${title}" and passes the copy sweep`, async ({ page }) => {
        const session = await mockSession(page, { profile: profile({ isPremium: pro }) });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(page).toHaveTitle(`${title} · MileClear`);
        const text = await page.locator("body").innerText();
        for (const banned of BANNED_COPY) expect(text, `${path} contains ${banned}`).not.toMatch(banned);
        for (const host of session.hosts) {
          expect(host).not.toMatch(/postcodes\.io|nominatim|unpkg\.com/);
        }
      });
    }
  });
}

test("Home has one amber button and the copy sweep passes (work and personal)", async ({ page }) => {
  await mockSession(page, { profile: profile({ dashboardMode: "both" }) });
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Add a trip" })).toBeVisible();
  await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
  const text = await page.locator("body").innerText();
  for (const banned of BANNED_COPY) expect(text).not.toMatch(banned);
  await page.getByRole("radio", { name: "Personal" }).click();
  await expect(page.locator(".mc-btn--primary")).toHaveCount(1);
});

test("More hides company-driver and gig rows correctly and shows PRO chips only to free drivers", async ({ page }) => {
  await mockSession(page);
  await page.goto("/dashboard/more");
  await expect(page.getByRole("link", { name: /Link a bank/ }).getByText("PRO")).toBeVisible();
  await expect(page.getByRole("link", { name: /Earnings/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /EmSee/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Milesheet/ })).toHaveCount(0);

  const pro = await page.context().newPage();
  await mockSession(pro, { profile: profile({ isPremium: true }), team: { orgId: "o1", orgName: "Acme", role: "admin" } });
  await pro.goto("/dashboard/more");
  await expect(pro.getByRole("link", { name: /Milesheet/ })).toBeVisible();
  await expect(pro.getByRole("link", { name: /Earnings/ })).toHaveCount(0);
  await expect(pro.getByText("PRO", { exact: true })).toHaveCount(0);
});
