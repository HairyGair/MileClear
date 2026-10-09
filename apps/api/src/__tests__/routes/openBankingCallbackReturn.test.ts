/**
 * Open Banking pages: a link started from the website returns to the website.
 *
 * GET /earnings/open-banking/link?return=web remembers where the driver came
 * from, and the callback page then points them back to the website dashboard
 * instead of telling them to return to the app. App links (no flag) keep the
 * app wording.
 */
import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../helpers/build-app.js";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../middleware/idempotency.js", () => ({ attachIdempotency: vi.fn() }));

import { earningRoutes } from "../../routes/earnings/index.js";

async function app() {
  const a = await buildApp();
  await a.register(earningRoutes, { prefix: "/earnings" });
  await a.ready();
  return a;
}

describe("Open Banking return target", () => {
  it("link page stores return=web when the website started the link", async () => {
    const a = await app();
    const res = await a.inject({
      method: "GET",
      url: "/earnings/open-banking/link?authLink=https%3A%2F%2Fauth.example.test%2F&token=abc&return=web",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('sessionStorage.setItem("mc_ob_return", "web")');
    await a.close();
  });

  it("link page stores nothing for app-started links or unknown values", async () => {
    const a = await app();
    for (const q of ["", "&return=evil"]) {
      const res = await a.inject({
        method: "GET",
        url: `/earnings/open-banking/link?authLink=https%3A%2F%2Fauth.example.test%2F&token=abc${q}`,
      });
      expect(res.body).toContain('sessionStorage.setItem("mc_ob_return", "")');
    }
    await a.close();
  });

  it("callback page has the website wording and link, and keeps the app wording", async () => {
    const a = await app();
    const res = await a.inject({ method: "GET", url: "/earnings/open-banking/callback?code=xyz" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("You can close this tab and go back to MileClear.");
    expect(res.body).toContain("https://mileclear.com/dashboard/bank");
    expect(res.body).toContain('sessionStorage.getItem("mc_ob_return") === "web"');
    expect(res.body).toContain("return to the MileClear app");
    await a.close();
  });
});
