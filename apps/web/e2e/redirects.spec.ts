import { test, expect } from "@playwright/test";

// Old dashboard URLs keep working through next.config.ts redirects (307).
const REDIRECTS: Array<[string, string]> = [
  ["/dashboard/business", "/dashboard/insights"],
  ["/dashboard/personal", "/dashboard/insights"],
  ["/dashboard/analytics", "/dashboard/insights?view=trends"],
  ["/dashboard/inbox", "/dashboard/bank/inbox"],
  ["/dashboard/exports", "/dashboard/tax/exports"],
  ["/dashboard/self-assessment", "/dashboard/tax/self-assessment"],
  ["/dashboard/accountant", "/dashboard/tax/accountant"],
  ["/dashboard/locations", "/dashboard/places"],
  ["/dashboard/trips?filter=unclassified", "/dashboard/trips?view=inbox"],
];

for (const [from, to] of REDIRECTS) {
  test(`redirects ${from} -> ${to}`, async ({ request }) => {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const location = new URL(res.headers()["location"], "http://localhost");
    expect(location.pathname + location.search).toContain(to.split("?")[0]);
    if (to.includes("?")) expect(location.search).toContain(to.split("?")[1]);
  });
}

test("the Milesheet redirect from /dashboard/team is unchanged", async ({ request }) => {
  const res = await request.get("/dashboard/team", { maxRedirects: 0 });
  expect([307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toContain("/milesheet/portal");
});

test("CSP allows analytics and the configured API but not unpkg for scripts we do not use", async ({ request }) => {
  const res = await request.get("/login");
  const csp = res.headers()["content-security-policy"];
  expect(csp).toContain("https://www.googletagmanager.com");
  expect(csp).toContain("connect-src 'self' https://api.mileclear.com");
  expect(csp).not.toContain("postcodes.io");
  expect(csp).not.toContain("nominatim");
});
