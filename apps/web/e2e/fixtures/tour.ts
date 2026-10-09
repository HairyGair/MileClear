import { expect, type Page } from "@playwright/test";
import { mockSession, profile, type MockOptions } from "./api";

// Fixtures and expected copy for the first-use tour specs. The copy is written
// out here on purpose: if steps.ts changes, these tests say so.

export const RICH_STATS = {
  totalTrips: 40,
  businessMiles: 1200,
  deductionPence: 54000,
  taxYear: "2026-27",
  todayMiles: 5,
  todayTrips: 1,
  weekMiles: 40,
  currentStreakDays: 3,
};
export const EMPTY_HERO_STATS = { ...RICH_STATS, totalTrips: 5, businessMiles: 0, deductionPence: 0 };

export const OPENING_EXISTING = {
  title: "Your dashboard has a new look",
  body: "It now works like the app: the same four places and the same figures. Your phone still records your trips. This is where you check and sort them.",
};
export const OPENING_NEW = {
  title: "Welcome to MileClear on the web",
  body: "Your phone records your trips. This is where you check them, sort them and see what they are worth, on a bigger screen.",
};
export const HOME_FIGURE = {
  title: "Your business miles",
  body: "Business miles this tax year and roughly what they are worth, from the trips your phone recorded. It updates as you sort trips.",
  target: "home-hero",
};
export const HOME_EMPTY = {
  title: "Your business miles",
  body: "Once you mark trips as Business, your miles and what they are worth show up here.",
  target: "home-hero",
};
export const HOME_PERSONAL = {
  title: "Your driving at a glance",
  body: "Miles and trips from what your phone recorded, kept up to date for you.",
  target: "home-hero",
};
export const TRIPS_WORK = {
  title: "Sort your trips here",
  body: "New trips wait in the Inbox until you mark them Business or Personal. 3 waiting now.",
  target: "nav-trips",
};
export const TRIPS_PERSONAL = {
  title: "All your trips",
  body: "Every trip your phone recorded, newest first. Fix one, or add a trip you made without the app.",
  target: "nav-trips",
};
const slot3 = (title: string, body: string) => ({ title, body, target: "nav-slot3" });
export const TAX_GIG = slot3("Tax", "What you may owe, what to put by each week, your Self Assessment figures and downloads.");
export const TAX_EMPLOYEE = slot3("Tax", "Your mileage claim, Mileage Allowance Relief and downloads for the tax year.");
export const TAX_COMPANY = slot3("Tax", "Your business miles and downloads for the tax year.");
export const INSIGHTS = slot3("Insights", "Your driving over time: monthly miles, patterns and how you compare with drivers near you.");
export const MORE_WORK = {
  title: "Everything else",
  body: "Vehicles, earnings, expenses, invoices, fuel, saved places, help and settings.",
  target: "nav-more",
};
export const MORE_COMPANY = {
  title: "Everything else",
  body: "Vehicles, fuel, saved places, your odometer log, help and settings.",
  target: "nav-more",
};
export const MORE_PERSONAL = {
  title: "Everything else",
  body: "Vehicles, fuel, saved places, achievements, help and settings. Tax is in here too.",
  target: "nav-more",
};
export const MODE_SWITCH = {
  title: "Work or Personal",
  body: "Switch what Home shows. Work puts tax first, Personal shows your everyday driving. Your trips stay the same.",
  target: "mode-toggle",
};
export const ACCOUNT = {
  title: "Your account",
  body: "Your profile, your plan, settings and a link to get the app. You can take this tour again from Help.",
  target: "avatar",
};

export interface ExpectedStep {
  title: string;
  body: string;
  /** `data-tour` value the ring must sit on. Absent for the opening stop. */
  target?: string;
}

export interface Variant {
  name: string;
  options: MockOptions;
  steps: ExpectedStep[];
}

const open = (o: { title: string; body: string }): ExpectedStep => o;

export const VARIANTS: Variant[] = [
  {
    name: "work-gig",
    options: { profile: profile({ workType: "gig", dashboardMode: "work" }), stats: RICH_STATS, tour: "unseen" },
    steps: [open(OPENING_EXISTING), HOME_FIGURE, TRIPS_WORK, TAX_GIG, MORE_WORK, ACCOUNT],
  },
  {
    name: "work-employee",
    options: { profile: profile({ workType: "employee", dashboardMode: "work" }), stats: EMPTY_HERO_STATS, tour: "unseen" },
    steps: [open(OPENING_EXISTING), HOME_EMPTY, TRIPS_WORK, TAX_EMPLOYEE, MORE_WORK, ACCOUNT],
  },
  {
    name: "personal",
    options: { profile: profile({ workType: null, dashboardMode: "personal" }), stats: RICH_STATS, tour: "unseen" },
    steps: [open(OPENING_EXISTING), HOME_PERSONAL, TRIPS_PERSONAL, INSIGHTS, MORE_PERSONAL, ACCOUNT],
  },
  {
    name: "company-driver",
    options: {
      profile: profile({ workType: "gig", dashboardMode: "work" }),
      team: { orgId: "o1", orgName: "Acme Couriers", role: "driver" },
      stats: RICH_STATS,
      tour: "unseen",
    },
    steps: [open(OPENING_EXISTING), HOME_FIGURE, TRIPS_WORK, TAX_COMPANY, MORE_COMPANY, ACCOUNT],
  },
  {
    name: "mode-switch",
    options: { profile: profile({ workType: "gig", dashboardMode: "both" }), stats: RICH_STATS, tour: "unseen" },
    steps: [open(OPENING_EXISTING), HOME_FIGURE, TRIPS_WORK, TAX_GIG, MORE_WORK, MODE_SWITCH, ACCOUNT],
  },
];

export async function openTour(page: Page, options: MockOptions, path = "/dashboard") {
  const session = await mockSession(page, options);
  await page.goto(path);
  return session;
}

export const dialog = (page: Page) => page.getByRole("dialog");
export const count = (page: Page, n: number, total: number) => page.locator(".mc-tour__count").filter({ hasText: new RegExp(`^${n} of ${total}$`) });

export async function waitForTour(page: Page, total?: number) {
  await expect(page.locator("dialog.mc-tour[open]")).toBeVisible({ timeout: 20_000 });
  if (total) await expect(count(page, 1, total)).toBeVisible();
}

export async function stateOf(page: Page, userId = "u-test") {
  return page.evaluate((id) => JSON.parse(localStorage.getItem(`mc_web_tour_v1:${id}`) ?? "null"), userId);
}

export const next = (page: Page) => page.locator(".mc-tour__foot .mc-btn--primary");
export const backBtn = (page: Page) => page.locator(".mc-tour__foot .mc-btn--ghost");
