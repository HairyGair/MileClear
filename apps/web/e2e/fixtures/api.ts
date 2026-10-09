import type { Page, Route } from "@playwright/test";

// The API origin the test server is pointed at (see playwright.config.ts).
export const API = "http://127.0.0.1:3999";

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  fullName: string | null;
  avatarId: string | null;
  workType: "gig" | "employee" | "both" | null;
  dashboardMode: "work" | "personal" | "both";
  isPremium: boolean;
  isAdmin: boolean;
  premiumSource: "subscription" | "referral" | "team" | "none";
  [key: string]: unknown;
}

export function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: "u-test",
    email: "sam@example.test",
    displayName: "Sam Tester",
    fullName: null,
    avatarId: null,
    userIntent: "work",
    workType: "gig",
    employerMileageRatePence: null,
    employerMileageRatePenceAfter10k: null,
    otherAnnualIncomePence: null,
    dashboardMode: "work",
    weeklyEarningsGoalPence: null,
    marketingEmailsEnabled: true,
    emailVerified: true,
    isPremium: false,
    isAdmin: false,
    premiumExpiresAt: null,
    premiumSource: "none",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export interface MockOptions {
  profile?: Profile;
  unclassified?: number;
  team?: { orgId: string; orgName: string; role: string } | null;
}

/** Logged-in session with a fake token and every API call answered from fixtures. */
export async function mockSession(page: Page, opts: MockOptions = {}): Promise<{ hosts: string[] }> {
  const hosts: string[] = [];
  page.on("request", (r) => {
    try {
      hosts.push(new URL(r.url()).host);
    } catch {
      // ignore
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("mc_access_token", "test-token");
    window.localStorage.setItem("mc_refresh_token", "test-refresh");
  });

  await page.route(`${API}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    }
    switch (url.pathname) {
      case "/user/profile":
        return json({ data: opts.profile ?? profile() });
      case "/team/me":
        return json({ data: opts.team ?? null });
      case "/trips/unclassified/count":
        return json({ count: opts.unclassified ?? 3 });
      case "/assistant/status":
        return json({ available: false, dailyLimit: 20, monthlyLimit: 200 });
      case "/user/data-quality-improvement":
        return json({ data: { improvedTripCount: 0, milesGained: 0, firstImprovementAt: null, lastImprovementAt: null } });
      case "/vehicles":
        return json({ data: [{ id: "v1" }] });
      case "/trips":
        return json({ data: [{ id: "t1" }], total: 1, page: 1, pageSize: 1, totalPages: 1 });
      case "/gamification/stats":
        return json({ data: { totalTrips: 2, businessMiles: 0, deductionPence: 0 } });
      default:
        return json({ error: "Not mocked in tests" }, 404);
    }
  });
  return { hosts };
}

/** Texts that must never appear anywhere in the dashboard. */
export const BANNED_COPY: RegExp[] = [
  /—/, // em dash
  /HMRC[- ]ready/i,
  /HMRC[- ]approved/i,
  /HMRC[- ]compliant/i,
  /HMRC compliant/i,
  /Premium/,
  /Coming soon/i,
  /2025-26 rates/,
];
