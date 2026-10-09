import { test, expect } from "@playwright/test";
import { BANNED_COPY, mockSession, profile } from "./fixtures/api";
import { EMPTY_HERO_STATS, RICH_STATS, VARIANTS, backBtn, count, dialog, next, openTour, stateOf, waitForTour } from "./fixtures/tour";

// First-use tour: behaviour (SPEC-TOUR.md section 5). Copy and placement of each
// stop are in tour-steps.spec.ts.

const gig = { profile: profile({ workType: "gig" }), stats: RICH_STATS, tour: "unseen" as const };
const title = (page: import("@playwright/test").Page) => page.locator(".mc-tour__title-text");

test.describe("when it shows", () => {
  test("first visit, existing and new accounts", async ({ page }) => {
    await openTour(page, gig);
    await waitForTour(page, 6);
    await expect(title(page)).toHaveText("Your dashboard has a new look");
  });
  test("new account gets the welcome", async ({ page }) => {
    await openTour(page, { ...gig, profile: profile({ createdAt: "2027-01-01T00:00:00.000Z" }) });
    await waitForTour(page, 6);
    await expect(title(page)).toHaveText("Welcome to MileClear on the web");
  });
  test("not on other pages, then starts when Home is reached", async ({ page }) => {
    await mockSession(page, gig);
    await page.goto("/dashboard/tax");
    await page.waitForTimeout(3500);
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
    await page.goto("/dashboard/more");
    await page.waitForTimeout(3500);
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
    await page.locator('.mc-rail [data-tour="nav-home"]').click();
    await waitForTour(page, 6);
  });
  test("not on admin", async ({ page }) => {
    await mockSession(page, { ...gig, profile: profile({ isAdmin: true }) });
    await page.goto("/dashboard/admin");
    await page.waitForTimeout(3500);
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
  });
  test("waits while the avatar menu is open", async ({ page }) => {
    await mockSession(page, gig);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Your account" }).click();
    await page.waitForTimeout(3200);
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await waitForTour(page, 6);
  });
  test("auto start stops after two interrupted starts; Help replay still works", async ({ page }) => {
    await mockSession(page, gig);
    await page.goto("/dashboard");
    await waitForTour(page, 6);
    await page.goto("/dashboard");
    await waitForTour(page, 6);
    expect((await stateOf(page)).autoStarts).toBe(2);
    await page.goto("/dashboard");
    await page.waitForTimeout(4000);
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
    await page.goto("/dashboard/help");
    await page.getByRole("link", { name: "Take the tour again" }).click();
    await waitForTour(page, 6);
  });
});

test.describe("finishing", () => {
  test("Done is remembered", async ({ page }) => {
    await openTour(page, gig);
    await waitForTour(page, 6);
    for (let i = 1; i < 6; i++) await next(page).click();
    await expect(next(page)).toHaveText("Done");
    await next(page).click();
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
    expect((await stateOf(page)).state).toBe("done");
    await page.reload();
    await page.waitForTimeout(4000);
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
  });
  test("Skip is remembered", async ({ page }) => {
    await openTour(page, gig);
    await waitForTour(page, 6);
    await next(page).click();
    await page.getByRole("button", { name: "Skip tour" }).click();
    expect((await stateOf(page)).state).toBe("skipped");
    await page.reload();
    await page.waitForTimeout(4000);
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
  });
  test("Esc skips and focus lands on the page", async ({ page }) => {
    await openTour(page, gig);
    await waitForTour(page, 6);
    await next(page).click();
    await next(page).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
    expect((await stateOf(page)).state).toBe("skipped");
    await expect(page.locator("#main-content")).toBeFocused();
  });
});

test.describe("keyboard and focus", () => {
  test("arrow keys move between stops", async ({ page }) => {
    await openTour(page, gig);
    await waitForTour(page, 6);
    await page.keyboard.press("ArrowRight");
    await expect(count(page, 2, 6)).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(count(page, 1, 6)).toBeVisible();
  });
  test("focus is trapped, and returns to the avatar after a menu replay", async ({ page }) => {
    await mockSession(page, { ...gig, tour: "seen" });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Your account" }).click();
    await page.getByRole("menuitem", { name: "Take the tour" }).click();
    await waitForTour(page, 6);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("dialog.mc-tour"))).toBe(true);
    }
    for (let i = 1; i < 6; i++) await next(page).click();
    await next(page).click();
    await expect(page.getByRole("button", { name: "Your account" })).toBeFocused();
  });
  test("dialog has an accessible name and a polite announcement on close", async ({ page }) => {
    await openTour(page, gig);
    await waitForTour(page, 6);
    await expect(dialog(page)).toHaveAccessibleName(/^Step 1 of 6/);
    await page.keyboard.press("Escape");
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Tour closed." })).toHaveCount(1);
  });
  test("reduced motion removes the ring transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openTour(page, gig);
    await waitForTour(page, 6);
    // The kit's global reduced-motion rule leaves 0.01ms, which reads back as 0.01s.
    const dur = await page.locator(".mc-tour__ring").evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(parseFloat(dur)).toBeLessThanOrEqual(0.01);
  });
});

test.describe("replay", () => {
  test("from Help", async ({ page }) => {
    await mockSession(page, { ...gig, tour: "seen" });
    await page.goto("/dashboard/help");
    await page.getByRole("link", { name: "Take the tour again" }).click();
    await waitForTour(page, 6);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.keyboard.press("Escape");
    expect((await stateOf(page)).state).toBe("done");
  });
  test("from the avatar menu on another page", async ({ page }) => {
    await mockSession(page, { ...gig, tour: "seen" });
    await page.goto("/dashboard/vehicles");
    await page.getByRole("button", { name: "Your account" }).click();
    await page.getByRole("menuitem", { name: "Take the tour" }).click();
    await waitForTour(page, 6);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("adapts", () => {
  test("Trips count in the copy", async ({ page }) => {
    await openTour(page, { ...gig, unclassified: 0 });
    await waitForTour(page, 6);
    await next(page).click();
    await next(page).click();
    await expect(page.locator(".mc-tour__body-text")).not.toContainText("waiting");
  });
  test("no profile hero and a setup card: A couple of things first", async ({ page }) => {
    await openTour(page, { ...gig, stats: { totalTrips: 0, businessMiles: 0, deductionPence: 0 }, vehicles: [], trips: [] });
    await waitForTour(page, 6);
    await next(page).click();
    await expect(title(page)).toHaveText("A couple of things first");
  });
  test("no hero and no setup card drops the Home stop", async ({ page }) => {
    await openTour(page, { ...gig, stats: { totalTrips: 0, businessMiles: 0, deductionPence: 0 } });
    await waitForTour(page, 5);
  });
  test("empty-hero variant still has a hero stop", async ({ page }) => {
    await openTour(page, { ...gig, stats: EMPTY_HERO_STATS });
    await waitForTour(page, 6);
  });
  test("steps never contain banned copy", async ({ page }) => {
    for (const v of VARIANTS) {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.context().clearCookies();
      await openTour(page, v.options);
      await waitForTour(page, v.steps.length);
      for (let i = 1; i < v.steps.length; i++) {
        const text = await page.locator("dialog.mc-tour").innerText();
        for (const re of BANNED_COPY) expect(text).not.toMatch(re);
        expect(text).not.toMatch(/HMRC/);
        await next(page).click();
      }
      await page.keyboard.press("Escape");
      await page.evaluate(() => localStorage.clear());
    }
  });
});

test.describe("analytics", () => {
  test("started then completed", async ({ page }) => {
    const { events } = await openTour(page, gig);
    await waitForTour(page, 6);
    for (let i = 1; i < 6; i++) await next(page).click();
    await next(page).click();
    await expect.poll(() => events.map((e) => e.type)).toEqual(["web_tour.started", "web_tour.completed"]);
    expect(events[0].metadata).toMatchObject({ trigger: "auto", variant: "existing", mode: "work", steps: 6 });
  });
  test("skipped records where", async ({ page }) => {
    const { events } = await openTour(page, gig);
    await waitForTour(page, 6);
    await next(page).click();
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect.poll(() => events.map((e) => e.type)).toEqual(["web_tour.started", "web_tour.skipped"]);
    expect(events[1].metadata).toMatchObject({ atStep: 2, stepId: "home" });
  });
  test("a failing event call does not stop the tour", async ({ page }) => {
    await openTour(page, { ...gig, eventStatus: 500 });
    await waitForTour(page, 6);
    for (let i = 1; i < 6; i++) await next(page).click();
    await next(page).click();
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
    expect((await stateOf(page)).state).toBe("done");
  });
});

test.describe("no layout shift", () => {
  test("same boxes with the tour seen and closed", async ({ page }) => {
    await mockSession(page, gig);
    await page.goto("/dashboard");
    await waitForTour(page, 6);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
    const boxes = () =>
      page.evaluate(() =>
        [".mc-topbar__right", ".mc-rail__list", ".mc-home__hero"].map((s) => {
          const r = document.querySelector(s)?.getBoundingClientRect();
          return r ? [r.x, r.y, r.width, r.height].map(Math.round) : null;
        })
      );
    const afterTour = await boxes();
    const seenPage = await page.context().newPage();
    await mockSession(seenPage, { ...gig, tour: "seen" });
    await seenPage.goto("/dashboard");
    await seenPage.locator(".mc-home__hero").waitFor();
    const seen = await seenPage.evaluate(() =>
      [".mc-topbar__right", ".mc-rail__list", ".mc-home__hero"].map((s) => {
        const r = document.querySelector(s)?.getBoundingClientRect();
        return r ? [r.x, r.y, r.width, r.height].map(Math.round) : null;
      })
    );
    expect(afterTour).toEqual(seen);
  });
});
