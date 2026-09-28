/**
 * Weekly classify nudge: who gets it, when, and what it says. Pure functions,
 * no mocks.
 */
import { describe, it, expect } from "vitest";

import {
  buildClassifyNudgeBody,
  classifyNudgeEnabled,
  countUnansweredNudges,
  decideClassifyNudge,
  inClassifyNudgeWindow,
  weekClock,
  CLASSIFY_NUDGE_COOLDOWN_MS,
  CLASSIFY_NUDGE_RESPONSE_MS,
  type ClassifyNudgeCandidate,
} from "../../jobs/classifyNudge.js";

const NOW = new Date("2026-10-04T18:15:00Z"); // Sunday 19:15 BST
const DAY = 24 * 60 * 60 * 1000;

function candidate(over: Partial<ClassifyNudgeCandidate> = {}): ClassifyNudgeCandidate {
  return {
    hasPushToken: true,
    pushPrefs: null,
    dashboardMode: "both",
    hasBusinessTrips: false,
    unclassifiedThisWeek: 12,
    lastNudgeAt: null,
    unansweredInARow: 0,
    classifiedSinceLastNudge: false,
    ...over,
  };
}

describe("decideClassifyNudge", () => {
  it("sends to a both-mode driver with a week's backlog", () => {
    expect(decideClassifyNudge(candidate(), NOW)).toEqual({ send: true });
  });

  it("sends to a work-mode driver", () => {
    expect(decideClassifyNudge(candidate({ dashboardMode: "work" }), NOW)).toEqual({ send: true });
  });

  it("needs at least 3 unclassified trips this week", () => {
    expect(decideClassifyNudge(candidate({ unclassifiedThisWeek: 2 }), NOW)).toEqual({ send: false, reason: "too_few" });
    expect(decideClassifyNudge(candidate({ unclassifiedThisWeek: 0 }), NOW)).toEqual({ send: false, reason: "too_few" });
    expect(decideClassifyNudge(candidate({ unclassifiedThisWeek: 3 }), NOW)).toEqual({ send: true });
  });

  it("leaves personal-only drivers alone", () => {
    expect(decideClassifyNudge(candidate({ dashboardMode: "personal" }), NOW)).toEqual({
      send: false,
      reason: "personal_only",
    });
  });

  it("still asks a personal-mode driver who has business trips", () => {
    expect(decideClassifyNudge(candidate({ dashboardMode: "personal", hasBusinessTrips: true }), NOW)).toEqual({
      send: true,
    });
  });

  it("needs a push token", () => {
    expect(decideClassifyNudge(candidate({ hasPushToken: false }), NOW)).toEqual({ send: false, reason: "no_token" });
  });

  it("honours the unclassifiedNudge preference, and only that key", () => {
    expect(decideClassifyNudge(candidate({ pushPrefs: { unclassifiedNudge: false } }), NOW)).toEqual({
      send: false,
      reason: "pref_off",
    });
    expect(decideClassifyNudge(candidate({ pushPrefs: { eveningDigest: false } }), NOW)).toEqual({ send: true });
  });

  it("never more than weekly", () => {
    const lastNudgeAt = new Date(NOW.getTime() - CLASSIFY_NUDGE_COOLDOWN_MS + 60_000);
    expect(decideClassifyNudge(candidate({ lastNudgeAt }), NOW)).toEqual({ send: false, reason: "cooldown" });
    // Exactly a week later it goes again.
    expect(decideClassifyNudge(candidate({ lastNudgeAt: new Date(NOW.getTime() - 7 * DAY) }), NOW)).toEqual({
      send: true,
    });
  });

  it("stops after three unanswered nudges in a row", () => {
    const lastNudgeAt = new Date(NOW.getTime() - 7 * DAY);
    expect(decideClassifyNudge(candidate({ lastNudgeAt, unansweredInARow: 2 }), NOW)).toEqual({ send: true });
    expect(decideClassifyNudge(candidate({ lastNudgeAt, unansweredInARow: 3 }), NOW)).toEqual({
      send: false,
      reason: "backed_off",
    });
  });

  it("starts again once a backed-off driver classifies anything", () => {
    const lastNudgeAt = new Date(NOW.getTime() - 7 * DAY);
    expect(
      decideClassifyNudge(candidate({ lastNudgeAt, unansweredInARow: 3, classifiedSinceLastNudge: true }), NOW)
    ).toEqual({ send: true });
  });
});

describe("countUnansweredNudges", () => {
  const t0 = Date.UTC(2026, 8, 6, 18);
  const w = 7 * DAY;

  it("zero with no nudges", () => {
    expect(countUnansweredNudges([], [t0])).toBe(0);
  });

  it("counts back from the newest until one got a response", () => {
    const nudges = [t0, t0 + w, t0 + 2 * w, t0 + 3 * w];
    // Responded to the first only.
    expect(countUnansweredNudges(nudges, [t0 + 60_000])).toBe(3);
    // Responded to the newest.
    expect(countUnansweredNudges(nudges, [t0 + 3 * w + DAY])).toBe(0);
  });

  it("a classification outside the response window does not count", () => {
    const nudges = [t0];
    expect(countUnansweredNudges(nudges, [t0 + CLASSIFY_NUDGE_RESPONSE_MS])).toBe(1);
    expect(countUnansweredNudges(nudges, [t0 - 1])).toBe(1);
  });

  it("order of input does not matter", () => {
    expect(countUnansweredNudges([t0 + 2 * w, t0, t0 + w], [t0 + 1000])).toBe(2);
  });
});

describe("window and clock", () => {
  it("Sunday 19:xx UK only, across BST and GMT", () => {
    expect(inClassifyNudgeWindow(weekClock(new Date("2026-10-04T18:15:00Z")))).toBe(true); // BST 19:15
    expect(inClassifyNudgeWindow(weekClock(new Date("2026-10-04T19:15:00Z")))).toBe(false); // BST 20:15
    expect(inClassifyNudgeWindow(weekClock(new Date("2026-11-01T19:05:00Z")))).toBe(true); // GMT 19:05
    expect(inClassifyNudgeWindow(weekClock(new Date("2026-10-05T18:15:00Z")))).toBe(false); // Monday
  });

  it("day key is the local date", () => {
    expect(weekClock(new Date("2026-10-04T18:15:00Z")).dayKey).toBe("2026-10-04");
  });
});

describe("copy", () => {
  it("names the week's count and keeps the time claim honest", () => {
    expect(buildClassifyNudgeBody(23)).toBe(
      "You've got 23 trips from this week to sort. Two minutes now keeps your tax figure right."
    );
    expect(buildClassifyNudgeBody(52)).toBe(
      "You've got 52 trips from this week to sort. A few minutes now keeps your tax figure right."
    );
  });

  it("no em dashes and no HMRC", () => {
    for (const n of [3, 30, 31, 200]) {
      const body = buildClassifyNudgeBody(n);
      expect(body).not.toMatch(/—/);
      expect(body).not.toMatch(/HMRC/i);
    }
  });
});

describe("gate", () => {
  it("sends only when CLASSIFY_NUDGE is exactly 1", () => {
    expect(classifyNudgeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(classifyNudgeEnabled({ CLASSIFY_NUDGE: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(classifyNudgeEnabled({ CLASSIFY_NUDGE: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(classifyNudgeEnabled({ CLASSIFY_NUDGE: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });
});
