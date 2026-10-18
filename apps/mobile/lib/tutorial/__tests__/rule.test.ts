import { describe, expect, it } from "vitest";
import {
  MAX_AUTO_STARTS,
  WHATS_NEW_VERSION,
  appPlaces,
  decideFirstRun,
  dotStep,
  firstSortHint,
  isNewAccount,
  modePillLine,
  parseEmployerRate,
  parseStored,
  phoneNeedsSomething,
  proLine,
  tourCheckRows,
  tourSteps,
  whatsNewDecision,
  type PhoneSnapshot,
} from "../rule";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const RATES = { first: 55, after: 25, motorbike: 24 };
const ALL_GOOD: PhoneSnapshot = { tier: "always", motion: "granted", bgRefreshOff: false, notifications: "granted" };

describe("who is new", () => {
  it("is an account under a week old with no trips", () => {
    expect(isNewAccount({ createdAt: "2026-10-20T11:00:00Z", tripCount: 0, now: NOW })).toBe(true);
    expect(isNewAccount({ createdAt: "2026-10-14T12:00:00Z", tripCount: 0, now: NOW })).toBe(true);
  });

  it("is not an account with trips, even a day old (a second phone)", () => {
    expect(isNewAccount({ createdAt: "2026-10-19T12:00:00Z", tripCount: 3, now: NOW })).toBe(false);
  });

  it("is not an account over a week old, whatever the trips", () => {
    expect(isNewAccount({ createdAt: "2026-10-01T12:00:00Z", tripCount: 0, now: NOW })).toBe(false);
    expect(isNewAccount({ createdAt: "2026-10-01T12:00:00Z", tripCount: null, now: NOW })).toBe(false);
  });

  it("can't tell a young account whose trip count didn't load", () => {
    expect(isNewAccount({ createdAt: "2026-10-19T12:00:00Z", tripCount: null, now: NOW })).toBeNull();
  });

  it("treats an unreadable creation date as existing", () => {
    expect(isNewAccount({ createdAt: null, tripCount: 0, now: NOW })).toBe(false);
    expect(isNewAccount({ createdAt: "not a date", tripCount: 0, now: NOW })).toBe(false);
  });
});

describe("decideFirstRun", () => {
  it("starts the tour for a new account and remembers it is pending", () => {
    expect(decideFirstRun({ stored: null, autoStarts: 0, isNew: true })).toEqual({ show: "tour", store: "pending" });
  });

  it("marks an existing account so it is never asked again", () => {
    expect(decideFirstRun({ stored: null, autoStarts: 0, isNew: false })).toEqual({ show: "home", store: "existing" });
  });

  it("goes to Home without remembering anything when it can't tell", () => {
    expect(decideFirstRun({ stored: null, autoStarts: 0, isNew: null })).toEqual({ show: "home", store: null });
  });

  it("never replays a finished or skipped tour", () => {
    for (const stored of ["done", "skipped", "existing"] as const) {
      expect(decideFirstRun({ stored, autoStarts: 0, isNew: true }).show).toBe("home");
    }
  });

  it("restarts a tour the app was closed in, up to the cap", () => {
    expect(decideFirstRun({ stored: "pending", autoStarts: 1, isNew: null })).toEqual({ show: "tour", store: null });
    expect(decideFirstRun({ stored: "pending", autoStarts: MAX_AUTO_STARTS, isNew: null })).toEqual({
      show: "home",
      store: "skipped",
    });
  });

  it("reads only known stored values", () => {
    expect(parseStored("done")).toBe("done");
    expect(parseStored("true")).toBeNull();
    expect(parseStored(null)).toBeNull();
  });
});

describe("What's new", () => {
  it("shows once to an existing driver with Always", () => {
    expect(whatsNewDecision({ stored: "existing", seenVersion: null, tier: "always" })).toBe("show");
    expect(whatsNewDecision({ stored: "existing", seenVersion: WHATS_NEW_VERSION, tier: "always" })).toBe("none");
  });

  it("is skipped when location isn't Always", () => {
    expect(whatsNewDecision({ stored: "existing", seenVersion: null, tier: "foreground" })).toBe("skip_not_always");
    expect(whatsNewDecision({ stored: "existing", seenVersion: null, tier: "none" })).toBe("skip_not_always");
  });

  it("never shows to a new driver, who had the tour", () => {
    for (const stored of ["pending", "done", "skipped", null] as const) {
      expect(whatsNewDecision({ stored, seenVersion: null, tier: "always" })).toBe("none");
    }
  });
});

describe("steps", () => {
  it("runs the five setup steps on the first run", () => {
    expect(tourSteps("auto", null)).toEqual(["how", "drive_for", "location", "check", "your_app"]);
  });

  it("replays only the teaching steps when the phone is fine", () => {
    expect(tourSteps("help", ALL_GOOD)).toEqual(["how", "your_app"]);
    expect(tourSteps("whats_new", ALL_GOOD)).toEqual(["how", "your_app"]);
  });

  it("adds the check to a replay when something is missing", () => {
    expect(tourSteps("help", { ...ALL_GOOD, tier: "foreground" })).toEqual(["how", "check", "your_app"]);
    expect(tourSteps("help", { ...ALL_GOOD, notifications: "undetermined" })).toEqual(["how", "check", "your_app"]);
    expect(phoneNeedsSomething({ ...ALL_GOOD, motion: "unavailable" })).toBe(false);
  });

  it("keeps the branch screens under their parent's dot", () => {
    expect(dotStep("employer_rate")).toBe("drive_for");
    expect(dotStep("not_always")).toBe("location");
    expect(dotStep("start_trip_only")).toBe("location");
    expect(dotStep("check")).toBe("check");
  });
});

describe("check rows", () => {
  it("ticks everything on a working iPhone", () => {
    const rows = tourCheckRows({ ...ALL_GOOD, platform: "ios", startTripOnly: false });
    expect(rows.map((r) => r.id)).toEqual(["location", "motion", "background_refresh", "notifications"]);
    expect(rows.every((r) => r.ok && r.action === null)).toBe(true);
    expect(rows[0].title).toBe("Location: Always");
  });

  it("uses Android's words and has no Background App Refresh row", () => {
    const rows = tourCheckRows({ ...ALL_GOOD, platform: "android", startTripOnly: false });
    expect(rows.map((r) => r.id)).toEqual(["location", "motion", "notifications"]);
    expect(rows[0].title).toBe("Location: Allow all the time");
    expect(rows[1].title).toBe("Physical activity");
  });

  it("offers a fix for While Using, but not after Use Start Trip only", () => {
    const fix = tourCheckRows({ ...ALL_GOOD, tier: "foreground", platform: "ios", startTripOnly: false })[0];
    expect(fix).toMatchObject({ ok: false, title: "Location: While Using", action: "Fix", fix: "location" });
    const chosen = tourCheckRows({ ...ALL_GOOD, tier: "foreground", platform: "ios", startTripOnly: true })[0];
    expect(chosen).toMatchObject({ ok: false, action: null, fix: null });
    expect(chosen.hint).toMatch(/Only Start Trip records/);
  });

  it("asks for notifications once, then points to Settings", () => {
    const ask = tourCheckRows({ ...ALL_GOOD, notifications: "undetermined", platform: "ios", startTripOnly: false });
    expect(ask[3]).toMatchObject({ action: "Allow", fix: "notifications" });
    const denied = tourCheckRows({ ...ALL_GOOD, notifications: "denied", platform: "ios", startTripOnly: false });
    expect(denied[3]).toMatchObject({ action: "Settings", fix: "settings" });
  });

  it("leaves out motion when the phone can't say", () => {
    const rows = tourCheckRows({ ...ALL_GOOD, motion: "unavailable", platform: "ios", startTripOnly: false });
    expect(rows.find((r) => r.id === "motion")).toBeUndefined();
  });
});

describe("words per driver", () => {
  it("teaches the claim at 55p then 25p for gig drivers", () => {
    const places = appPlaces({ driveFor: "gig", motorbike: false, employerRatePence: null, rates: RATES });
    expect(places.map((p) => p.id)).toEqual(["home", "trips", "tax", "more"]);
    expect(places[2].body).toMatch(/55p, up to 10,000 miles, then 25p/);
    expect(places[1].body).toMatch(/Only Business trips count/);
  });

  it("says 24p for a motorbike", () => {
    const places = appPlaces({ driveFor: "gig", motorbike: true, employerRatePence: null, rates: RATES });
    expect(places[2].body).toMatch(/24p/);
    expect(places[2].body).not.toMatch(/55p/);
  });

  it("talks about the employer's rate for employees", () => {
    const known = appPlaces({ driveFor: "employee", motorbike: false, employerRatePence: 45, rates: RATES });
    expect(known[2].body).toBe("Your employer pays 45p. If it's under 55p, you can claim the rest from HMRC");
    const unknown = appPlaces({ driveFor: "employee", motorbike: false, employerRatePence: null, rates: RATES });
    expect(unknown[2].body).toMatch(/If your employer pays under 55p a mile/);
  });

  it("gives gig-and-employer drivers their employer's rate, not 55p for every mile", () => {
    const known = appPlaces({ driveFor: "both", motorbike: false, employerRatePence: 40, rates: RATES });
    expect(known[2].body).toBe(
      "Your mileage claim. Gig app trips add 55p a mile. Your employer pays 40p. If it's under 55p, you can claim the rest from HMRC"
    );
    expect(known[2].body).not.toMatch(/Every Business mile/);
    const bike = appPlaces({ driveFor: "both", motorbike: true, employerRatePence: 20, rates: RATES });
    expect(bike[2].body).toMatch(/Gig app trips add 24p a mile. Your employer pays 20p. If it's under 24p/);
    const unknown = appPlaces({ driveFor: "both", motorbike: false, employerRatePence: null, rates: RATES });
    expect(unknown[2].body).toMatch(/55p, up to 10,000 miles, then 25p/);
  });

  it("has no money line for a company car, and calls Tax the mileage log", () => {
    const places = appPlaces({ driveFor: "company", motorbike: false, employerRatePence: null, rates: RATES });
    expect(places[2].body).toMatch(/mileage log/);
    expect(places.map((p) => p.body).join(" ")).not.toMatch(/\d+p/);
  });

  it("shows Insights, not Tax, for Just me", () => {
    const places = appPlaces({ driveFor: "personal", motorbike: false, employerRatePence: null, rates: RATES });
    expect(places.map((p) => p.id)).toEqual(["home", "trips", "insights", "more"]);
    expect(places.map((p) => p.body).join(" ")).not.toMatch(/Business/);
  });

  it("mentions the mode switch only to drivers with two kinds of driving", () => {
    expect(modePillLine("both")).not.toBeNull();
    expect(modePillLine("employee")).not.toBeNull();
    expect(modePillLine("gig")).toBeNull();
    expect(modePillLine("personal")).toBeNull();
  });

  it("names Pro once, never to Pro, company car or Just me drivers", () => {
    expect(proLine({ isPremium: false, driveFor: "gig", isCompanyDriver: false })).toMatch(/You don't need it to start/);
    expect(proLine({ isPremium: true, driveFor: "gig", isCompanyDriver: false })).toBeNull();
    expect(proLine({ isPremium: false, driveFor: "company", isCompanyDriver: false })).toBeNull();
    expect(proLine({ isPremium: false, driveFor: "personal", isCompanyDriver: false })).toBeNull();
    expect(proLine({ isPremium: false, driveFor: "employee", isCompanyDriver: true })).toBeNull();
  });

  it("words the first-trip note per driver, and has none for Just me", () => {
    expect(firstSortHint("gig")).toMatch(/^Tap Business if it was for work/);
    expect(firstSortHint("company")).toMatch(/log for your employer/);
    expect(firstSortHint("personal")).toBeNull();
  });

  it("never pairs HMRC with an adjective, and has no em dashes", () => {
    const all = (["gig", "employee", "both", "company", "personal"] as const)
      .flatMap((d) => [true, false].flatMap((m) => appPlaces({ driveFor: d, motorbike: m, employerRatePence: 40, rates: RATES })))
      .map((p) => p.body)
      .join(" ");
    expect(all).not.toMatch(/—/);
    expect(all).not.toMatch(/HMRC[- ](ready|approved|compliant)/i);
  });
});

describe("employer rate input", () => {
  it("takes whole pence from 1 to 100", () => {
    expect(parseEmployerRate("45")).toBe(45);
    expect(parseEmployerRate(" 45p ")).toBe(45);
    expect(parseEmployerRate("0")).toBeNull();
    expect(parseEmployerRate("101")).toBeNull();
    expect(parseEmployerRate("4.5")).toBeNull();
    expect(parseEmployerRate("")).toBeNull();
  });
});
