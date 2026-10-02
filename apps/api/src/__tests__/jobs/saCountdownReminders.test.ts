/**
 * "Ready for 31 January?" reminder pushes: when, who, and what they say.
 * Pure functions, no mocks.
 */
import { describe, it, expect } from "vitest";
import { ukDateParts } from "@mileclear/shared";
import {
  buildSaCountdownBody,
  buildSaCountdownTitle,
  decideSaCountdownPush,
  dueStage,
  pickGap,
  saCountdownPushEnabled,
  stageKey,
  SA_COUNTDOWN_ACTION,
  type SaPushCandidate,
} from "../../jobs/saCountdownReminders.js";

function candidate(over: Partial<SaPushCandidate> = {}): SaPushCandidate {
  return {
    hasPushToken: true,
    pushPrefs: null,
    dashboardMode: "work",
    workType: "gig",
    unclassifiedTrips: 37,
    businessMiles: 2_000,
    earningsCount: 10,
    hasFullName: true,
    walkthroughOpened: false,
    alreadySent: false,
    ...over,
  };
}

describe("schedule", () => {
  it("fires at 18:00 UK on 1 Dec, 2 Jan, 20 Jan and 29 Jan only", () => {
    expect(dueStage(ukDateParts(new Date("2026-12-01T18:10:00Z")))).toBe("dec01");
    expect(dueStage(ukDateParts(new Date("2027-01-02T18:40:00Z")))).toBe("jan02");
    expect(dueStage(ukDateParts(new Date("2027-01-20T18:00:00Z")))).toBe("jan20");
    expect(dueStage(ukDateParts(new Date("2027-01-29T18:59:00Z")))).toBe("jan29");
    expect(dueStage(ukDateParts(new Date("2026-12-01T17:59:00Z")))).toBeNull();
    expect(dueStage(ukDateParts(new Date("2026-12-01T19:00:00Z")))).toBeNull();
    expect(dueStage(ukDateParts(new Date("2027-01-01T18:00:00Z")))).toBeNull();
    expect(dueStage(ukDateParts(new Date("2027-01-31T18:00:00Z")))).toBeNull();
  });

  it("keys sends by tax year so next season starts fresh", () => {
    expect(stageKey("2025-26", "dec01")).toBe("2025-26:dec01");
    expect(stageKey("2025-26", "dec01")).not.toBe(stageKey("2026-27", "dec01"));
  });

  it("is a dry run unless SA_COUNTDOWN_PUSH is exactly 1", () => {
    expect(saCountdownPushEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(saCountdownPushEnabled({ SA_COUNTDOWN_PUSH: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(saCountdownPushEnabled({ SA_COUNTDOWN_PUSH: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("routes to the checklist", () => {
    expect(SA_COUNTDOWN_ACTION).toBe("open_sa_checklist");
  });
});

describe("decideSaCountdownPush", () => {
  it("sends to a work-mode driver with unsorted trips", () => {
    expect(decideSaCountdownPush(candidate())).toEqual({ send: true, gap: { kind: "unclassified", trips: 37 } });
  });

  it("never sends to personal-mode drivers or employees", () => {
    expect(decideSaCountdownPush(candidate({ dashboardMode: "personal" }))).toEqual({ send: false, reason: "personal_mode" });
    expect(decideSaCountdownPush(candidate({ workType: "employee" }))).toEqual({ send: false, reason: "employee" });
  });

  it("respects the tax deadline push preference", () => {
    expect(decideSaCountdownPush(candidate({ pushPrefs: { taxDeadline: false } }))).toEqual({ send: false, reason: "pref_off" });
    expect(decideSaCountdownPush(candidate({ pushPrefs: { unclassifiedNudge: false } })).send).toBe(true);
  });

  it("skips drivers with nothing in that tax year, a finished list, or a send already made", () => {
    expect(decideSaCountdownPush(candidate({ unclassifiedTrips: 0, businessMiles: 0 }))).toEqual({ send: false, reason: "nothing_logged" });
    expect(
      decideSaCountdownPush(candidate({ unclassifiedTrips: 0, walkthroughOpened: true }))
    ).toEqual({ send: false, reason: "all_done" });
    expect(decideSaCountdownPush(candidate({ alreadySent: true }))).toEqual({ send: false, reason: "already_sent" });
    expect(decideSaCountdownPush(candidate({ hasPushToken: false }))).toEqual({ send: false, reason: "no_token" });
  });
});

describe("pickGap", () => {
  it("names the biggest gap first", () => {
    const base = { unclassifiedTrips: 0, earningsCount: 5, hasFullName: true, walkthroughOpened: true };
    expect(pickGap({ ...base, unclassifiedTrips: 4, earningsCount: 0 })).toEqual({ kind: "unclassified", trips: 4 });
    expect(pickGap({ ...base, earningsCount: 0, hasFullName: false })).toEqual({ kind: "no_earnings" });
    expect(pickGap({ ...base, hasFullName: false, walkthroughOpened: false })).toEqual({ kind: "full_name" });
    expect(pickGap({ ...base, walkthroughOpened: false })).toEqual({ kind: "walkthrough" });
    expect(pickGap(base)).toBeNull();
  });
});

describe("copy", () => {
  it("names the actual gap", () => {
    expect(buildSaCountdownBody({ kind: "unclassified", trips: 37 }, "2025-26")).toBe(
      "You've 37 trips from last tax year still unclassified. Sort them so every business mile counts before 31 January."
    );
    expect(buildSaCountdownBody({ kind: "unclassified", trips: 1 }, "2025-26")).toContain("1 trip from last tax year");
    expect(buildSaCountdownBody({ kind: "no_earnings" }, "2025-26")).toContain("2025-26 earnings");
  });

  it("counts the days in the title", () => {
    expect(buildSaCountdownTitle(61)).toBe("Self Assessment: 61 days to go");
    expect(buildSaCountdownTitle(1)).toBe("Self Assessment: 1 day to go");
    expect(buildSaCountdownTitle(0)).toBe("Self Assessment: deadline today");
  });

  it("has no em dashes, no MTD and no endorsement wording next to HMRC", () => {
    const bodies = [
      buildSaCountdownBody({ kind: "unclassified", trips: 3 }, "2025-26"),
      buildSaCountdownBody({ kind: "no_earnings" }, "2025-26"),
      buildSaCountdownBody({ kind: "full_name" }, "2025-26"),
      buildSaCountdownBody({ kind: "walkthrough" }, "2025-26"),
      buildSaCountdownTitle(29),
    ];
    for (const b of bodies) {
      expect(b).not.toMatch(/—/);
      expect(b).not.toMatch(/\bMTD\b|HMRC[- ]?(ready|compliant|approved)/i);
    }
  });
});
