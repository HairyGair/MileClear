import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { VARIANTS, backBtn, count, next, openTour, waitForTour } from "./fixtures/tour";

// One test per stop, per driver variant, at desktop and phone width: the copy,
// the ring on the right element, the card inside the screen, and Next / Back
// landing on the right neighbour. Every stop is also saved as a screenshot.

const SHOTS = "/tmp/claude-501/tour-shots";
const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];

async function goToStep(page: Page, n: number, total: number) {
  await waitForTour(page, total);
  for (let i = 1; i < n; i++) {
    await next(page).click();
    await expect(count(page, i + 1, total)).toBeVisible();
  }
}

for (const v of VARIANTS) {
  for (const { w, h } of WIDTHS) {
    test.describe(`${v.name} @${w}`, () => {
      test.use({ viewport: { width: w, height: h } });
      v.steps.forEach((step, i) => {
        const n = i + 1;
        const total = v.steps.length;
        test(`step ${n} of ${total}: ${step.title}`, async ({ page }) => {
          fs.mkdirSync(SHOTS, { recursive: true });
          await openTour(page, v.options);
          await goToStep(page, n, total);

          // Copy.
          await expect(page.locator(".mc-tour__title-text")).toHaveText(step.title);
          await expect(page.locator(".mc-tour__body-text")).toHaveText(step.body);
          await expect(page.locator(".mc-tour__title")).toBeFocused();
          const name = await page.getByRole("dialog").getAttribute("aria-labelledby");
          expect(name).toBe("mc-tour-title");
          await expect(page.locator(".mc-tour__title")).toContainText(`Step ${n} of ${total}:`);

          // Let the ring and any scroll settle.
          await page.waitForTimeout(600);

          // Card fully on screen, clear of the tab bar on a phone.
          const card = (await page.locator(".mc-tour__card").boundingBox())!;
          expect(card.x).toBeGreaterThanOrEqual(15);
          expect(card.y).toBeGreaterThanOrEqual(0);
          expect(card.x + card.width).toBeLessThanOrEqual(w - 15);
          expect(card.y + card.height).toBeLessThanOrEqual(h);
          if (w < 768) {
            const tab = (await page.locator(".mc-tabbar").boundingBox())!;
            expect(card.y + card.height).toBeLessThanOrEqual(tab.y);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

          // Spotlight sits on the right element.
          if (step.target) {
            const ring = (await page.locator(".mc-tour__ring").boundingBox())!;
            const t = await page.evaluate((name) => {
              const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
              const el = els.find((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden");
              const r = el?.getBoundingClientRect();
              return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
            }, step.target);
            expect(t, `target ${step.target} is visible`).not.toBeNull();
            expect(t!.y + t!.height, "target is on screen").toBeGreaterThan(0);
            expect(t!.y, "target is on screen").toBeLessThan(h);
            const ox = Math.min(ring.x + ring.width, t!.x + t!.width) - Math.max(ring.x, t!.x);
            const oy = Math.min(ring.y + ring.height, t!.y + t!.height) - Math.max(ring.y, t!.y);
            expect(ox).toBeGreaterThan(0);
            expect(oy).toBeGreaterThan(0);
            const pageTarget = step.target === "home-hero" || step.target === "home-setup";
            if (!pageTarget) {
              // Ring hugs the target: within its padding.
              expect(Math.abs(ring.x - t!.x)).toBeLessThanOrEqual(8);
              expect(Math.abs(ring.y - t!.y)).toBeLessThanOrEqual(8);
              expect(Math.abs(ring.width - t!.width)).toBeLessThanOrEqual(16);
              expect(Math.abs(ring.height - t!.height)).toBeLessThanOrEqual(16);
            } else {
              // Page card: most of what is visible of it is inside the ring.
              expect(ox * oy).toBeGreaterThan(0.5 * Math.min(ring.width * ring.height, t!.width * t!.height));
            }
            if (w >= 768) {
              // Desktop: card does not cover the ring by more than 8 px.
              const ix = Math.min(ring.x + ring.width, card.x + card.width) - Math.max(ring.x, card.x);
              const iy = Math.min(ring.y + ring.height, card.y + card.height) - Math.max(ring.y, card.y);
              if (ix > 0 && iy > 0) expect(Math.min(ix, iy)).toBeLessThanOrEqual(8);
            }
          } else {
            const ring = (await page.locator(".mc-tour__ring").boundingBox())!;
            expect(ring.width).toBe(0);
          }

          await page.screenshot({ path: `${SHOTS}/${v.name}-${w}-step${n}.png` });

          // Neighbours: Back lands on the previous stop, Next on the following one.
          if (i === 0) {
            await expect(next(page)).toHaveText("Show me around");
            await expect(backBtn(page)).toBeHidden();
          } else {
            await backBtn(page).click();
            await expect(count(page, n - 1, total)).toBeVisible();
            await expect(page.locator(".mc-tour__title-text")).toHaveText(v.steps[i - 1].title);
            await next(page).click();
            await expect(count(page, n, total)).toBeVisible();
            await expect(page.locator(".mc-tour__title-text")).toHaveText(step.title);
          }
          if (i < total - 1) {
            await next(page).click();
            await expect(count(page, n + 1, total)).toBeVisible();
            await expect(page.locator(".mc-tour__title-text")).toHaveText(v.steps[i + 1].title);
          } else {
            await expect(next(page)).toHaveText("Done");
            await expect(page.locator(".mc-tour__skip")).toHaveCount(0);
            await next(page).click();
            await expect(page.locator("dialog.mc-tour")).toHaveCount(0);
          }
        });
      });
    });
  }
}
