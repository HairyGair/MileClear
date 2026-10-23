import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NZ_ON_PORT } from "./playwright.config";

// The New Zealand landing page (/nz) and the homepage redirect for NZ
// visitors. The main server has the redirect switched off (the default); a
// second server runs with NZ_HOME_REDIRECT=on.

const ON = `http://localhost:${NZ_ON_PORT}`;
const NZ_IP = "203.97.0.1";
const GB_IP = "81.2.69.160";
const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

/** IRD's rates as the shared table holds them (packages/shared/src/tax/nz.ts),
 *  read from the source so the page is checked against the same numbers. */
function sharedLatestRates(): Array<[string, number, number]> {
  const src = readFileSync(resolve(__dirname, "../../../packages/shared/src/tax/nz.ts"), "utf8");
  const years = [...src.matchAll(/"(\d{4}-\d{2})": \{\n([\s\S]*?)\n {2}\}/g)];
  const [, , body] = years[years.length - 1];
  const rows: Array<[string, number, number]> = [];
  for (const m of body.matchAll(/(\w+): \{ tier1: (\d+), tier2: (\d+) \}/g)) {
    rows.push([m[1], Number(m[2]), Number(m[3])]);
  }
  return rows;
}

const LABELS: Record<string, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  petrol_hybrid: "Petrol hybrid",
  electric: "Electric",
};
const rate = (c: number) => (c >= 100 ? `$${(c / 100).toFixed(2)}` : `${c}c`);

test.describe("/nz landing page", () => {
  test("renders the hero, IRD's rates from the shared table, prices and the disclaimer", async ({ page }) => {
    await page.goto("/nz");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The mileage tracker for New Zealand drivers");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const expected = sharedLatestRates();
    expect(expected).toHaveLength(4);
    const rows = page.getByTestId("nz-rate-table").locator("tbody tr");
    await expect(rows).toHaveCount(expected.length);
    for (let i = 0; i < expected.length; i++) {
      const [cls, t1, t2] = expected[i];
      await expect(rows.nth(i)).toHaveText(`${LABELS[cls]}${rate(t1)}${rate(t2)}`);
    }

    await expect(page.getByTestId("nz-pro-price")).toHaveText("NZ$9.99 a month or NZ$99.99 a year, in the App Store.");
    await expect(page.getByTestId("nz-disclaimer")).toHaveText(
      "MileClear isn't affiliated with Inland Revenue. Check your claim with IRD or your accountant.",
    );
    await expect(page.getByTestId("nz-uk-link")).toHaveAttribute("href", "/region/uk");
  });

  test("is held: noindex, not in the sitemap, no UK tax wording or pounds", async ({ page, request }) => {
    await page.goto("/nz");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // Switch off: no hreflang pairing yet.
    await expect(page.locator('link[rel="alternate"][hreflang="en-NZ"]')).toHaveCount(0);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/HMRC/);
    expect(text).not.toMatch(/£/);
    expect(text).not.toMatch(/Self Assessment/);
    expect(text).not.toMatch(/—/);

    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("/nz");
  });

  test("Go to the UK site remembers the choice for a year", async ({ request }) => {
    const res = await request.get("/region/uk", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toBe("/");
    const cookie = res.headers()["set-cookie"] ?? "";
    expect(cookie).toMatch(/mc_region=uk/);
    expect(cookie).toMatch(/Max-Age=31536000/i);
  });
});

test.describe("homepage redirect, switch off (default)", () => {
  test("an NZ visitor stays on the UK homepage, with no NZ footer link", async ({ request }) => {
    const res = await request.get("/", {
      maxRedirects: 0,
      headers: { "x-forwarded-for": NZ_IP, "user-agent": BROWSER_UA },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("In New Zealand? See MileClear for NZ");
    expect(html).not.toContain('hrefLang="en-NZ"');
    expect(html).not.toMatch(/hreflang="en-NZ"/i);
  });
});

test.describe("homepage redirect, switch on", () => {
  const get = (path: string, headers: Record<string, string>) =>
    fetch(`${ON}${path}`, { redirect: "manual", headers });

  test("an NZ visitor gets a 307 to /nz", async () => {
    const res = await get("/", { "x-forwarded-for": `${NZ_IP}, 10.0.0.1`, "user-agent": BROWSER_UA });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/nz");
  });

  test("behind the proxy the redirect stays relative, never the internal host", async () => {
    // Apache's [P] proxy can pass Host as the internal port, with the public
    // host in X-Forwarded-Host. The Location must not name localhost.
    const res = await get("/", {
      "x-forwarded-for": NZ_IP,
      "x-forwarded-host": "mileclear.com",
      "user-agent": BROWSER_UA,
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/nz");
  });

  test("the query comes along", async () => {
    const res = await get("/?utm_source=fb", { "x-forwarded-for": NZ_IP, "user-agent": BROWSER_UA });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/nz?utm_source=fb");
  });

  test("a GB visitor stays, and sees the NZ footer link and hreflang", async () => {
    const res = await get("/", { "x-forwarded-for": GB_IP, "user-agent": BROWSER_UA });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("In New Zealand? See MileClear for NZ");
    expect(html).toMatch(/hreflang="en-NZ"[^>]*href="https:\/\/mileclear\.com\/nz"|href="https:\/\/mileclear\.com\/nz"[^>]*hreflang="en-NZ"/i);
  });

  test("Googlebot from an NZ address is not redirected", async () => {
    const res = await get("/", { "x-forwarded-for": NZ_IP, "user-agent": GOOGLEBOT_UA });
    expect(res.status).toBe(200);
  });

  test("the UK choice cookie stops the redirect", async () => {
    const res = await get("/", { "x-forwarded-for": NZ_IP, "user-agent": BROWSER_UA, cookie: "mc_region=uk" });
    expect(res.status).toBe(200);
  });

  test("?region=uk stops the redirect", async () => {
    const res = await get("/?region=uk", { "x-forwarded-for": NZ_IP, "user-agent": BROWSER_UA });
    expect(res.status).toBe(200);
  });

  test("the NZ choice cookie sends any visitor to /nz", async () => {
    const res = await get("/", { "x-forwarded-for": GB_IP, "user-agent": BROWSER_UA, cookie: "mc_region=nz" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/nz");
  });

  test("deep links never redirect", async () => {
    for (const path of ["/pricing", "/mileage-tracker-uk", "/nz"]) {
      const res = await get(path, { "x-forwarded-for": NZ_IP, "user-agent": BROWSER_UA });
      expect(res.status, path).toBe(200);
    }
  });

  test("/nz pairs itself with the homepage in hreflang", async () => {
    const html = await (await get("/nz", { "user-agent": BROWSER_UA })).text();
    expect(html).toMatch(/hreflang="en-NZ"/i);
    expect(html).toMatch(/hreflang="x-default"/i);
  });
});
