// The first-run tour (Oct 2026, docs/tutorial-oct2026/PROPOSALS.md, direction
// A "Set up and go"): who sees it, which steps they get, and the words that
// change per driver. Pure (type-only imports), so it runs under vitest.
//
// Who sees it is decided from the ACCOUNT, not the phone (PROPOSALS 0.1): an
// account under a week old with no trips is new and gets the tour; anyone
// else is an existing driver and gets one "What's new" sheet instead. A
// reinstall or a second phone with trips on the account never replays it.

import type { DriveFor } from "@mileclear/shared";

/** An account this young with no trips is a new driver. */
export const NEW_ACCOUNT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The tour starts by itself at most this many times (an app killed mid-tour starts it again). */
export const MAX_AUTO_STARTS = 2;

/** Bump to show existing drivers a new What's new sheet. */
export const WHATS_NEW_VERSION = "2026-10-simpler";

/** What this phone remembers for the signed-in account. */
export type FirstRunStored = "pending" | "done" | "skipped" | "existing";

export function parseStored(raw: string | null | undefined): FirstRunStored | null {
  return raw === "pending" || raw === "done" || raw === "skipped" || raw === "existing" ? raw : null;
}

/**
 * True for a new account, false for an existing one, null when it can't be
 * told yet (the trip count didn't load). An account with no readable creation
 * date counts as existing: showing a long-time driver the tour is the worse
 * mistake.
 */
export function isNewAccount(args: {
  createdAt: string | null | undefined;
  tripCount: number | null;
  now: number;
}): boolean | null {
  const created = args.createdAt ? Date.parse(args.createdAt) : NaN;
  if (!Number.isFinite(created)) return false;
  if (args.now - created > NEW_ACCOUNT_DAYS * DAY_MS) return false;
  if (args.tripCount === null) return null;
  return args.tripCount === 0;
}

export interface FirstRunDecision {
  show: "tour" | "home";
  /** What to remember on this phone, or null to leave it and decide again next open. */
  store: FirstRunStored | null;
}

export function decideFirstRun(args: {
  stored: FirstRunStored | null;
  autoStarts: number;
  isNew: boolean | null;
}): FirstRunDecision {
  switch (args.stored) {
    case "done":
    case "skipped":
    case "existing":
      return { show: "home", store: null };
    case "pending":
      return args.autoStarts < MAX_AUTO_STARTS
        ? { show: "tour", store: null }
        : { show: "home", store: "skipped" };
  }
  if (args.isNew === true) return { show: "tour", store: "pending" };
  if (args.isNew === false) return { show: "home", store: "existing" };
  return { show: "home", store: null };
}

export type LocationTier = "none" | "foreground" | "always";

/**
 * Existing drivers: one What's new sheet, once (decision E). Skipped for a
 * driver whose location isn't Always: the location pop-up and the red or
 * amber status line already speak to them, and two sheets in a row is what
 * the prompt gate exists to stop.
 */
export function whatsNewDecision(args: {
  stored: FirstRunStored | null;
  seenVersion: string | null;
  tier: LocationTier;
}): "show" | "skip_not_always" | "none" {
  if (args.stored !== "existing") return "none";
  if (args.seenVersion === WHATS_NEW_VERSION) return "none";
  if (args.tier !== "always") return "skip_not_always";
  return "show";
}

// ── Steps ─────────────────────────────────────────────────────────────────

export type TourSource = "auto" | "help" | "whats_new";

/** The five dots, plus the screens that branch off them. */
export type StepId =
  | "how"
  | "drive_for"
  | "employer_rate"
  | "location"
  | "not_always"
  | "start_trip_only"
  | "check"
  | "your_app";

/** Which dot a screen sits under. */
export function dotStep(step: StepId): StepId {
  if (step === "employer_rate") return "drive_for";
  if (step === "not_always" || step === "start_trip_only") return "location";
  return step;
}

export interface PhoneSnapshot {
  tier: LocationTier;
  motion: "granted" | "denied" | "undetermined" | "unavailable";
  bgRefreshOff: boolean;
  notifications: "granted" | "denied" | "undetermined";
}

/** Something the check screen would ask the driver to fix. */
export function phoneNeedsSomething(p: PhoneSnapshot): boolean {
  return (
    p.tier !== "always" ||
    p.bgRefreshOff ||
    p.motion === "undetermined" ||
    p.motion === "denied" ||
    p.notifications !== "granted"
  );
}

/**
 * The dotted steps for a run. The first run does the setup; a replay from
 * Help shows the teaching steps, and the check only when something on the
 * phone still needs the driver (it then shows live state, not a fresh ask).
 */
export function tourSteps(source: TourSource, phone: PhoneSnapshot | null): StepId[] {
  if (source === "auto") return ["how", "drive_for", "location", "check", "your_app"];
  const check = phone !== null && phoneNeedsSomething(phone);
  return check ? ["how", "check", "your_app"] : ["how", "your_app"];
}

// ── The check screen ──────────────────────────────────────────────────────

export type CheckFix = "location" | "motion" | "settings" | "notifications";

export interface TourCheckRow {
  id: "location" | "motion" | "background_refresh" | "notifications";
  ok: boolean;
  title: string;
  hint: string;
  /** The button on the right ("Fix", "Allow", "Settings"), or null. */
  action: string | null;
  fix: CheckFix | null;
}

export function tourCheckRows(i: PhoneSnapshot & { platform: "ios" | "android"; startTripOnly: boolean }): TourCheckRow[] {
  const ios = i.platform === "ios";
  const rows: TourCheckRow[] = [];

  if (i.tier === "always") {
    rows.push({
      id: "location",
      ok: true,
      title: `Location: ${ios ? "Always" : "Allow all the time"}`,
      hint: "Drives record with the app closed",
      action: null,
      fix: null,
    });
  } else {
    const title = i.tier === "foreground" ? `Location: ${ios ? "While Using" : "Only while using the app"}` : "Location: Off";
    const hint = i.startTripOnly
      ? i.tier === "foreground"
        ? "Only Start Trip records. You can switch later"
        : "Start Trip asks for it the first time you use it"
      : i.tier === "foreground"
        ? "Trips only record with the app open"
        : "MileClear can't record trips without it";
    // "Use Start Trip only" is a choice: the tour doesn't ask again (0.5).
    rows.push({ id: "location", ok: false, title, hint, action: i.startTripOnly ? null : "Fix", fix: i.startTripOnly ? null : "location" });
  }

  if (i.motion !== "unavailable") {
    const name = ios ? "Motion and fitness" : "Physical activity";
    if (i.motion === "granted") {
      rows.push({ id: "motion", ok: true, title: name, hint: "Helps spot the start of a drive", action: null, fix: null });
    } else if (i.motion === "undetermined") {
      rows.push({ id: "motion", ok: false, title: name, hint: "Helps spot the start of a drive", action: "Allow", fix: "motion" });
    } else {
      rows.push({ id: "motion", ok: false, title: `${name}: Not allowed`, hint: "Short drives may be missed", action: "Settings", fix: "settings" });
    }
  }

  if (ios) {
    rows.push(
      i.bgRefreshOff
        ? {
            id: "background_refresh",
            ok: false,
            title: "Background App Refresh: Off",
            hint: "Trips can't save while you drive",
            action: "Fix",
            fix: "settings",
          }
        : { id: "background_refresh", ok: true, title: "Background App Refresh", hint: "Lets trips save while you drive", action: null, fix: null }
    );
  }

  if (i.notifications === "granted") {
    rows.push({ id: "notifications", ok: true, title: "Notifications", hint: "So we can tell you a trip is saved", action: null, fix: null });
  } else if (i.notifications === "undetermined") {
    rows.push({ id: "notifications", ok: false, title: "Notifications", hint: "So we can tell you a trip is saved", action: "Allow", fix: "notifications" });
  } else {
    rows.push({
      id: "notifications",
      ok: false,
      title: "Notifications: Off",
      hint: "You can allow them in your phone's Settings",
      action: "Settings",
      fix: "settings",
    });
  }
  return rows;
}

// ── Words per driver (PROPOSALS 0.3) ──────────────────────────────────────

export interface Rates {
  /** Pence a mile for a car or van, first 10,000 business miles. */
  first: number;
  /** After 10,000. */
  after: number;
  /** Motorbike, flat. */
  motorbike: number;
}

/** "Set up for: ..." on the last screen. */
export function setUpForText(d: DriveFor): string {
  switch (d) {
    case "gig":
      return "deliveries and gig work";
    case "employee":
      return "work for an employer, in your own car";
    case "both":
      return "gig work and an employer";
    case "company":
      return "a company car";
    case "personal":
      return "your own driving";
  }
}

export interface AppPlace {
  id: "home" | "trips" | "tax" | "insights" | "more";
  title: string;
  body: string;
}

/** The four places on the last screen, in this driver's words. */
export function appPlaces(args: {
  driveFor: DriveFor;
  motorbike: boolean;
  employerRatePence: number | null;
  rates: Rates;
}): AppPlace[] {
  const { driveFor: d, rates } = args;
  const first = args.motorbike ? rates.motorbike : rates.first;
  const more: AppPlace = { id: "more", title: "More", body: "Your car, Settings, Help and the tour" };

  if (d === "personal") {
    return [
      { id: "home", title: "Home", body: "Is it recording, your week, your last trip" },
      { id: "trips", title: "Trips", body: "Every drive, in one list" },
      { id: "insights", title: "Insights", body: "Your miles, records and running costs" },
      more,
    ];
  }

  const home: AppPlace =
    d === "company"
      ? { id: "home", title: "Home", body: "Is it recording, your work miles, your last trip" }
      : { id: "home", title: "Home", body: "Is it recording, your claim, your last trip" };

  let tripsLine: string;
  let tax: AppPlace;
  if (d === "company") {
    tripsLine = "Business trips go in the log for your employer";
    tax = { id: "tax", title: "Tax", body: "Your mileage log, ready to share with your employer" };
  } else if (d === "employee") {
    tripsLine = "Business trips are what your employer pays for";
    const pays = args.employerRatePence
      ? `Your employer pays ${args.employerRatePence}p. If it's under ${first}p, you can claim the rest from HMRC`
      : `If your employer pays under ${first}p a mile, you can claim the rest from HMRC`;
    tax = { id: "tax", title: "Tax", body: pays };
  } else {
    tripsLine = "Only Business trips count towards your claim";
    const money = args.motorbike
      ? `Every Business mile adds ${rates.motorbike}p`
      : `Every Business mile adds ${rates.first}p, up to 10,000 miles, then ${rates.after}p`;
    tax = { id: "tax", title: "Tax", body: `Your mileage claim. ${money}` };
  }

  return [
    home,
    { id: "trips", title: "Trips", body: `Every drive. Tap Business or Personal. ${tripsLine}` },
    tax,
    more,
  ];
}

/** One line about the Work | Personal pill, for drivers who have both kinds of driving. */
export function modePillLine(d: DriveFor): string | null {
  if (d === "both" || d === "employee" || d === "company") {
    return "The Work | Personal switch at the top of Home keeps your two kinds of driving apart.";
  }
  return null;
}

/** The one Pro line on the last screen (decision J). None for drivers Pro means nothing to. */
export function proLine(args: { isPremium: boolean; driveFor: DriveFor; isCompanyDriver: boolean }): string | null {
  if (args.isPremium || args.isCompanyDriver) return null;
  if (args.driveFor === "company" || args.driveFor === "personal") return null;
  return "Pro adds downloads for your return, CSV import and more. You don't need it to start.";
}

/**
 * The note on the Last trip card for a driver's very first trip (borrowed
 * from direction B, mark 2), worded for who they drive for. Null where
 * Business and Personal aren't taught ("Just me").
 */
export function firstSortHint(persona: "gig" | "both" | "employee" | "company" | "personal"): string | null {
  switch (persona) {
    case "gig":
    case "both":
      return "Tap Business if it was for work. Only Business trips count towards your mileage claim. You can change it later.";
    case "employee":
      return "Tap Business if it was for work. Business trips are what your employer pays for. You can change it later.";
    case "company":
      return "Tap Business if it was for work. Business trips go in the log for your employer. You can change it later.";
    case "personal":
      return null;
  }
}

/** Parse the employer's rate as typed. Null for blank or out of range. */
export function parseEmployerRate(text: string): number | null {
  const t = text.trim().replace(/p$/i, "").trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 1 && n <= 100 ? n : null;
}
